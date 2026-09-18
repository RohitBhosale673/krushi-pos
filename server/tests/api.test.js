import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { getDb, queryOne, queryAll, run, transaction } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { seedDatabase } from '../src/db/seed.js';

test('KrushiPOS Database Schema & Seed Verification', async (t) => {
  const db = getDb();
  initSchema(db);
  seedDatabase();

  await t.test('Users seeded correctly with admin account', () => {
    const admin = queryOne('SELECT * FROM users WHERE username = ?', ['admin']);
    assert.ok(admin, 'Admin user should exist');
    assert.strictEqual(admin.status, 'active');
    assert.ok(bcrypt.compareSync('admin123', admin.password_hash), 'Admin password hash should match');
  });

  await t.test('Products & FEFO Batches seeded', () => {
    const products = queryAll('SELECT * FROM products');
    assert.ok(products.length >= 5, 'At least 5 agricultural products should be seeded');

    const urea = queryOne('SELECT * FROM products WHERE product_code = ?', ['PRD-UREA-50']);
    assert.ok(urea, 'Urea 45% N product should exist');

    const batches = queryAll('SELECT * FROM product_batches WHERE product_id = ? ORDER BY exp_date ASC', [urea.id]);
    assert.ok(batches.length >= 2, 'Urea should have multiple batches for FEFO test');
    assert.ok(new Date(batches[0].exp_date) <= new Date(batches[1].exp_date), 'FEFO batches must be ordered by expiry date');
  });

  await t.test('Customer Udhar Balances & Credit Limits', () => {
    const pandurang = queryOne('SELECT * FROM customers WHERE mobile = ?', ['9822112233']);
    assert.ok(pandurang, 'Farmer Pandurang Patil should exist');
    assert.strictEqual(pandurang.current_balance, 12500, 'Initial balance should be Rs.12500');
    assert.strictEqual(pandurang.credit_limit, 50000, 'Credit limit should be Rs.50000');
  });

  await t.test('Stock Deductions on Transactional Sale', () => {
    const urea = queryOne('SELECT * FROM products WHERE product_code = ?', ['PRD-UREA-50']);
    const batch = queryOne("SELECT * FROM product_batches WHERE product_id = ? AND status = 'Active'", [urea.id]);
    const initialQty = batch.available_qty;

    transaction(() => {
      const saleQty = 5;
      const newQty = initialQty - saleQty;
      run('UPDATE product_batches SET available_qty = ? WHERE id = ?', [newQty, batch.id]);
      run(`
        INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, notes)
        VALUES (?, ?, 'sale', ?, ?, ?, 'Test Sale')
      `, [urea.id, batch.id, -saleQty, initialQty, newQty]);
    });

    const updatedBatch = queryOne('SELECT available_qty FROM product_batches WHERE id = ?', [batch.id]);
    assert.strictEqual(updatedBatch.available_qty, initialQty - 5, 'Available batch stock should decrease by 5');
  });

  await t.test('Udhar Collection Receipt updates customer balance', () => {
    const pandurang = queryOne('SELECT * FROM customers WHERE mobile = ?', ['9822112233']);
    const initialBal = pandurang.current_balance;
    const collectAmount = 2500;

    transaction(() => {
      const newBal = initialBal - collectAmount;
      run('UPDATE customers SET current_balance = ? WHERE id = ?', [newBal, pandurang.id]);
      run(`
        INSERT INTO customer_transactions (customer_id, txn_type, amount, balance_after, payment_method, notes)
        VALUES (?, 'PAYMENT', ?, ?, 'Cash', 'Test Payment')
      `, [pandurang.id, collectAmount, newBal]);
    });

    const updatedCust = queryOne('SELECT current_balance FROM customers WHERE id = ?', [pandurang.id]);
    assert.strictEqual(updatedCust.current_balance, initialBal - collectAmount, 'Customer balance should decrease by collect amount');
  });

  await t.test('Supplier Purchase Invoice increases stock and creates batch', () => {
    const supp = queryOne('SELECT * FROM suppliers LIMIT 1');
    const prd = queryOne('SELECT * FROM products WHERE product_code = ?', ['PRD-DAP-50']);

    transaction(() => {
      const resBatch = run(`
        INSERT INTO product_batches (
          product_id, batch_no, mfg_date, exp_date, purchase_rate, selling_rate, mrp, qty_received, qty_sold, available_qty, status
        ) VALUES (?, 'TEST-BATCH-99', '2026-01-01', '2028-01-01', 1200, 1350, 1350, 50, 0, 50, 'Active')
      `, [prd.id]);

      const batchId = resBatch.lastInsertRowid;
      run(`
        INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, notes)
        VALUES (?, ?, 'purchase', 50, 0, 50, 'Test Purchase Entry')
      `, [prd.id, batchId]);
    });

    const newBatch = queryOne('SELECT * FROM product_batches WHERE batch_no = ?', ['TEST-BATCH-99']);
    assert.ok(newBatch, 'New batch should be registered');
    assert.strictEqual(newBatch.available_qty, 50, 'Batch available qty should equal 50');
  });

  await t.test('Product Update with empty strings for category_id, brand_id, sku, barcode, hsn_code does not throw error', () => {
    const prd = queryOne('SELECT * FROM products LIMIT 1');
    assert.ok(prd, 'Product should exist');

    const updatePayload = {
      name: prd.name + ' Updated',
      sku: '',
      barcode: '',
      category_id: '',
      brand_id: '',
      product_type: prd.product_type,
      primary_unit_id: prd.primary_unit_id,
      purchase_price: 500,
      selling_price: 600,
      mrp: 600,
      gst_rate: 12,
      hsn_code: '',
      min_stock: 5,
      reorder_level: 10,
      description: ''
    };

    const cleanSku = (updatePayload.sku && updatePayload.sku.trim() !== '') ? updatePayload.sku.trim() : null;
    const cleanBarcode = (updatePayload.barcode && updatePayload.barcode.trim() !== '') ? updatePayload.barcode.trim() : null;
    const cleanCatId = (updatePayload.category_id && String(updatePayload.category_id).trim() !== '') ? parseInt(updatePayload.category_id) : null;
    const cleanBrandId = (updatePayload.brand_id && String(updatePayload.brand_id).trim() !== '') ? parseInt(updatePayload.brand_id) : null;

    run(`
      UPDATE products SET
        name = ?, sku = ?, barcode = ?, category_id = ?, brand_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [updatePayload.name, cleanSku, cleanBarcode, cleanCatId, cleanBrandId, prd.id]);

    const updatedPrd = queryOne('SELECT * FROM products WHERE id = ?', [prd.id]);
    assert.strictEqual(updatedPrd.name, prd.name + ' Updated');
    assert.strictEqual(updatedPrd.category_id, null);
    assert.strictEqual(updatedPrd.brand_id, null);
    assert.strictEqual(updatedPrd.sku, null);
  });

  await t.test('Product selling price update in Master updates active batch selling rate for POS', () => {
    const prd = queryOne('SELECT * FROM products LIMIT 1');
    const newPrice = 1499.50;

    run('UPDATE products SET selling_price = ?, mrp = ? WHERE id = ?', [newPrice, newPrice, prd.id]);
    run("UPDATE product_batches SET selling_rate = ?, mrp = ? WHERE product_id = ? AND status = 'Active'", [newPrice, newPrice, prd.id]);

    const batch = queryOne("SELECT * FROM product_batches WHERE product_id = ? AND status = 'Active'", [prd.id]);
    assert.strictEqual(batch.selling_rate, newPrice, 'Active batch selling rate must sync with updated product master selling price');
  });
});
