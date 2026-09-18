import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Purchase Invoices
router.get('/', requirePermission('purchases', 'view'), async (req, res) => {
  try {
    const { supplier_id, search } = req.query;
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT p.*, s.company_name AS supplier_name, s.mobile AS supplier_mobile, u.username AS user_name
      FROM purchases p
      JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (tenantScope !== null) {
      sql += ` AND p.tenant_id = ?`;
      params.push(tenantScope);
    }

    if (supplier_id) {
      sql += ` AND p.supplier_id = ?`;
      params.push(supplier_id);
    }

    if (search) {
      sql += ` AND (p.invoice_no LIKE ? OR p.supplier_invoice_no LIKE ? OR s.company_name LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ` ORDER BY p.purchase_date DESC, p.id DESC`;

    const purchases = await queryAll(sql, params);
    return res.json({ success: true, purchases });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Single Purchase Invoice Details
router.get('/:id', requirePermission('purchases', 'view'), async (req, res) => {
  try {
    const purchaseId = req.params.id;
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT p.*, s.company_name AS supplier_name, s.mobile AS supplier_mobile, s.gstin AS supplier_gstin, u.username AS user_name
      FROM purchases p
      JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `;
    const params = [purchaseId];

    if (tenantScope !== null) {
      sql += ` AND p.tenant_id = ?`;
      params.push(tenantScope);
    }

    const purchase = await queryOne(sql, params);

    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase invoice not found.' });
    }

    const items = await queryAll(`
      SELECT pi.*, prd.name AS product_name, prd.product_code, prd.sku
      FROM purchase_items pi
      JOIN products prd ON pi.product_id = prd.id
      WHERE pi.purchase_id = ?
    `, [purchaseId]);

    return res.json({ success: true, purchase, items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create Purchase Invoice (Auto Batch & Stock creation + Supplier Payable update)
router.post('/', requirePermission('purchases', 'create'), async (req, res) => {
  const {
    supplier_id, supplier_invoice_no, purchase_date, items, paid_amount = 0,
    freight_charges = 0, other_charges = 0, notes
  } = req.body;

  if (!supplier_id || !purchase_date || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Supplier, Purchase Date, and Items list are required.' });
  }

  try {
    const tenantScope = getTenantScope(req);
    const assignedTenantId = tenantScope !== null ? tenantScope : (req.body.tenant_id || 1);

    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?', [supplier_id, assignedTenantId]);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found in your organization.' });
    }

    let purchaseId;
    let newInvoiceNo;

    await transaction(async () => {
      let totalTaxable = 0;
      let totalTax = 0;
      let grandTotal = 0;

      const processedItems = [];

      for (const item of items) {
        if (!item.product_id || !item.batch_no || !item.exp_date || !item.qty || !item.purchase_rate) {
          throw new Error('Product, Batch No, Expiry Date, Qty, and Purchase Rate are required for all line items.');
        }

        const qty = parseFloat(item.qty);
        const pRate = parseFloat(item.purchase_rate);
        const sRate = parseFloat(item.selling_rate || pRate * 1.15);
        const mrp = parseFloat(item.mrp || sRate * 1.05);
        const gstRate = parseFloat(item.gst_rate || 0);

        const lineRaw = qty * pRate;
        const lineTax = lineRaw * (gstRate / 100);
        const lineTotal = lineRaw + lineTax;

        totalTaxable += lineRaw;
        totalTax += lineTax;

        processedItems.push({
          product_id: item.product_id,
          batch_no: item.batch_no,
          mfg_date: item.mfg_date || null,
          exp_date: item.exp_date,
          qty,
          unit: item.unit || 'Bag',
          purchase_rate: pRate,
          mrp,
          selling_rate: sRate,
          gst_rate: gstRate,
          taxable_amount: lineRaw,
          tax_amount: lineTax,
          total_amount: lineTotal
        });
      }

      const totalFreight = parseFloat(freight_charges) || 0;
      const totalOther = parseFloat(other_charges) || 0;
      grandTotal = Math.round((totalTaxable + totalTax + totalFreight + totalOther) * 100) / 100;

      const paid = parseFloat(paid_amount) || 0;
      const due = Math.max(0, grandTotal - paid);

      const countRow = await queryOne('SELECT COUNT(*) AS total FROM purchases WHERE tenant_id = ?', [assignedTenantId]);
      newInvoiceNo = `PUR/${new Date().getFullYear()}/${String((countRow?.total || 0) + 1).padStart(4, '0')}`;

      let pStatus = 'PAID';
      if (paid === 0 && due > 0) pStatus = 'CREDIT';
      else if (due > 0) pStatus = 'PARTIAL';

      // Insert Purchase Header
      const resPurch = await run(`
        INSERT INTO purchases (
          tenant_id, invoice_no, supplier_invoice_no, supplier_id, user_id, purchase_date,
          total_taxable, total_tax, freight_charges, other_charges, grand_total,
          paid_amount, due_amount, payment_status, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)
      `, [
        assignedTenantId, newInvoiceNo, supplier_invoice_no || null, supplier_id, req.user.id, purchase_date,
        totalTaxable, totalTax, totalFreight, totalOther, grandTotal,
        paid, due, pStatus, notes || null
      ]);

      purchaseId = resPurch.lastInsertRowid;

      // Process Items: Create / Update Batches and Stock Movements
      for (const item of processedItems) {
        await run(`
          INSERT INTO purchase_items (
            tenant_id, purchase_id, product_id, batch_no, mfg_date, exp_date, qty, unit,
            purchase_rate, mrp, selling_rate, gst_rate, taxable_amount, tax_amount, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          assignedTenantId, purchaseId, item.product_id, item.batch_no, item.mfg_date, item.exp_date, item.qty, item.unit,
          item.purchase_rate, item.mrp, item.selling_rate, item.gst_rate, item.taxable_amount, item.tax_amount, item.total_amount
        ]);

        // Check if batch exists in this tenant
        const existingBatch = await queryOne('SELECT * FROM product_batches WHERE product_id = ? AND batch_no = ? AND tenant_id = ?', [item.product_id, item.batch_no, assignedTenantId]);

        let batchId;
        const today = new Date().toISOString().split('T')[0];
        const status = item.exp_date < today ? 'Expired' : 'Active';

        if (existingBatch) {
          batchId = existingBatch.id;
          const newAvail = existingBatch.available_qty + item.qty;
          const newQtyRec = existingBatch.qty_received + item.qty;

          await run(`
            UPDATE product_batches 
            SET available_qty = ?, qty_received = ?, purchase_rate = ?, selling_rate = ?, mrp = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [newAvail, newQtyRec, item.purchase_rate, item.selling_rate, item.mrp, batchId]);

          await run(`
            INSERT INTO stock_movements (
              tenant_id, product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, reference_type, reference_id, notes, user_id
            ) VALUES (?, ?, ?, 'purchase', ?, ?, ?, 'purchase', ?, 'Purchase Invoice Stock Inward', ?)
          `, [assignedTenantId, item.product_id, batchId, item.qty, existingBatch.available_qty, newAvail, newInvoiceNo, req.user.id]);
        } else {
          const resBatch = await run(`
            INSERT INTO product_batches (
              tenant_id, product_id, batch_no, mfg_date, exp_date, purchase_rate, selling_rate, mrp,
              qty_received, available_qty, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            assignedTenantId, item.product_id, item.batch_no, item.mfg_date, item.exp_date,
            item.purchase_rate, item.selling_rate, item.mrp, item.qty, item.qty, status
          ]);

          batchId = resBatch.lastInsertRowid;

          await run(`
            INSERT INTO stock_movements (
              tenant_id, product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, reference_type, reference_id, notes, user_id
            ) VALUES (?, ?, ?, 'purchase', ?, 0, ?, 'purchase', ?, 'Initial Purchase Stock Inward', ?)
          `, [assignedTenantId, item.product_id, batchId, item.qty, item.qty, newInvoiceNo, req.user.id]);
        }

        // Update product purchase and selling prices
        await run(`
          UPDATE products SET purchase_price = ?, selling_price = ?, mrp = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [item.purchase_rate, item.selling_rate, item.mrp, item.product_id]);
      }

      // Update Supplier Balance & Ledger
      const newSuppBal = supplier.current_balance + due;
      await run('UPDATE suppliers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newSuppBal, supplier_id]);

      await run(`
        INSERT INTO supplier_transactions (tenant_id, supplier_id, txn_type, amount, balance_after, ref_type, ref_id, notes, user_id)
        VALUES (?, ?, 'PURCHASE', ?, ?, 'purchase', ?, ?, ?)
      `, [assignedTenantId, supplier_id, grandTotal, newSuppBal, newInvoiceNo, `Purchase Invoice ${newInvoiceNo}`, req.user.id]);

      if (paid > 0) {
        await run(`
          INSERT INTO supplier_transactions (tenant_id, supplier_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id)
          VALUES (?, ?, 'PAYMENT', ?, ?, 'Bank Transfer', 'purchase_payment', ?, ?, ?)
        `, [assignedTenantId, supplier_id, paid, newSuppBal, newInvoiceNo, `Payment against purchase ${newInvoiceNo}`, req.user.id]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_PURCHASE', 'purchases', purchaseId, null, { invoice_no: newInvoiceNo }, req);

    return res.json({
      success: true,
      message: 'Purchase invoice recorded and stock updated successfully.',
      purchaseId,
      invoice_no: newInvoiceNo
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// Cancel / Void Purchase Invoice
router.put('/:id/cancel', requirePermission('purchases', 'create'), async (req, res) => {
  const purchaseId = req.params.id;
  const tenantScope = getTenantScope(req);

  try {
    let checkSql = "SELECT * FROM purchases WHERE id = ? AND status != 'CANCELLED'";
    const checkParams = [purchaseId];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const purch = await queryOne(checkSql, checkParams);
    if (!purch) {
      return res.status(404).json({ success: false, message: 'Purchase invoice not found or already cancelled.' });
    }

    await transaction(async () => {
      await run("UPDATE purchases SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [purchaseId]);

      // Reverse supplier balance
      const supp = await queryOne('SELECT * FROM suppliers WHERE id = ?', [purch.supplier_id]);
      if (supp) {
        const newBal = Math.max(0, supp.current_balance - purch.due_amount);
        await run('UPDATE suppliers SET current_balance = ? WHERE id = ?', [newBal, supp.id]);
      }
    });

    logAuditAction(req.user.id, 'CANCEL_PURCHASE', 'purchases', purchaseId, purch, { status: 'CANCELLED' }, req);

    return res.json({ success: true, message: 'Purchase invoice cancelled.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
