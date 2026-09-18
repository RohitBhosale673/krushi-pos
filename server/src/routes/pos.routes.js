import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// POS Search & Filter Endpoint: Barcode, SKU, Code, Name, Batch Number, Category, Product Type
router.get('/search', requirePermission('pos', 'create'), async (req, res) => {
  try {
    const { q, category_id, product_type } = req.query;

    let sql = `
      SELECT pb.id AS batch_id, pb.batch_no, pb.exp_date, pb.mfg_date,
             COALESCE(NULLIF(pb.purchase_rate, 0), p.purchase_price, 0) AS purchase_rate,
             COALESCE(NULLIF(pb.selling_rate, 0), p.selling_price, 0) AS selling_rate,
             COALESCE(NULLIF(pb.mrp, 0), p.mrp, p.selling_price, 0) AS mrp,
             pb.available_qty, pb.status AS batch_status,
             p.id AS product_id, p.name AS product_name, p.product_code, p.sku, p.barcode,
             p.gst_rate, p.hsn_code, p.product_type, p.category_id,
             u.symbol AS unit_symbol, u.allow_decimal,
             CAST((JULIANDAY(pb.exp_date) - JULIANDAY('now')) AS INTEGER) AS days_until_expiry
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      WHERE pb.available_qty > 0 AND pb.status != 'Blocked'
    `;

    const params = [];

    if (q && q.trim() !== '') {
      const term = `%${q.trim()}%`;
      const exact = q.trim();
      sql += ` AND (p.barcode = ? OR p.sku = ? OR p.product_code = ? OR pb.batch_no = ? OR p.name LIKE ? OR p.barcode LIKE ?)`;
      params.push(exact, exact, exact, exact, term, term);
    }

    if (category_id && String(category_id).trim() !== '') {
      sql += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (product_type && String(product_type).trim() !== '' && product_type !== 'All Items' && product_type !== 'all') {
      const raw = String(product_type).trim();
      const singular = raw.endsWith('s') ? raw.slice(0, -1) : raw;
      const plural = raw.endsWith('s') ? raw : `${raw}s`;

      sql += ` AND (p.product_type = ? OR p.product_type = ? OR p.product_type = ? OR p.category_id IN (SELECT id FROM categories WHERE name LIKE ?))`;
      params.push(raw, singular, plural, `%${singular}%`);
    }

    if (q && q.trim() !== '') {
      const exact = q.trim();
      sql += ` ORDER BY (p.barcode = ? OR p.sku = ? OR p.product_code = ?) DESC, pb.exp_date ASC LIMIT 50`;
      params.push(exact, exact, exact);
    } else {
      sql += ` ORDER BY p.name ASC, pb.exp_date ASC LIMIT 60`;
    }

    const items = await queryAll(sql, params);
    return res.json({ success: true, items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Process POS Sale Bill
router.post('/sale', requirePermission('pos', 'create'), async (req, res) => {
  const {
    customer_id, items, payments, bill_discount = 0, round_off = 0,
    override_expiry = false, notes
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart items cannot be empty.' });
  }

  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one payment method is required.' });
  }

  try {
    let newInvoiceNo;
    let saleId;
    let computedGrandTotal = 0;
    let totalTaxable = 0;
    let totalTax = 0;

    await transaction(async () => {
      const today = new Date().toISOString().split('T')[0];

      // 1. Validate items & stock
      const processedItems = [];
      let totalItemSubtotal = 0;

      for (const item of items) {
        const batch = await queryOne(`
          SELECT pb.*, p.name AS product_name, p.gst_rate, p.primary_unit_id, u.symbol AS unit_symbol
          FROM product_batches pb
          JOIN products p ON pb.product_id = p.id
          LEFT JOIN units u ON p.primary_unit_id = u.id
          WHERE pb.id = ?
        `, [item.batch_id]);

        if (!batch) {
          throw new Error(`Batch ID ${item.batch_id} not found.`);
        }

        if (batch.available_qty < item.qty) {
          throw new Error(`Insufficient stock for ${batch.product_name} (Batch: ${batch.batch_no}). Available: ${batch.available_qty}, Requested: ${item.qty}`);
        }

        // Expired batch check
        if (batch.exp_date < today && !override_expiry) {
          throw new Error(`Cannot sell expired stock (${batch.product_name} Batch: ${batch.batch_no}, Expiry: ${batch.exp_date}). Authorization override required.`);
        }

        const unitPrice = item.unit_price || batch.selling_rate;
        const discountAmt = item.discount_amount || (unitPrice * item.qty * ((item.discount_percent || 0) / 100));
        const lineTotalRaw = (unitPrice * item.qty) - discountAmt;

        // GST calculation (Tax-inclusive logic)
        const gstRate = batch.gst_rate || 0;
        const taxable = gstRate > 0 ? (lineTotalRaw / (1 + gstRate / 100)) : lineTotalRaw;
        const taxAmt = lineTotalRaw - taxable;

        totalTaxable += taxable;
        totalTax += taxAmt;
        totalItemSubtotal += lineTotalRaw;

        processedItems.push({
          product_id: batch.product_id,
          batch_id: batch.id,
          qty: item.qty,
          unit: batch.unit_symbol || 'Pcs',
          unit_price: unitPrice,
          mrp: batch.mrp,
          discount_percent: item.discount_percent || 0,
          discount_amount: discountAmt,
          gst_rate: gstRate,
          taxable_amount: taxable,
          cgst_amount: taxAmt / 2,
          sgst_amount: taxAmt / 2,
          total_amount: lineTotalRaw
        });
      }

      // 2. Bill level discount & Grand Total calculation
      const finalDiscount = (parseFloat(bill_discount) || 0);
      const subTotalAfterDiscount = Math.max(0, totalItemSubtotal - finalDiscount);
      const roundedOff = parseFloat(round_off) || 0;
      computedGrandTotal = Math.round((subTotalAfterDiscount + roundedOff) * 100) / 100;

      // 3. Payment calculations (handling split payments)
      let totalPaid = 0;
      let udharAmount = 0;

      for (const p of payments) {
        const amt = parseFloat(p.amount) || 0;
        if (p.payment_method === 'Credit / Udhar') {
          udharAmount += amt;
        } else {
          totalPaid += amt;
        }
      }

      const dueAmount = Math.max(0, computedGrandTotal - totalPaid);

      // Customer credit check if udhar amount > 0
      let cust = null;
      if (udharAmount > 0 || dueAmount > 0) {
        if (!customer_id) {
          throw new Error('Customer selection is required for Credit / Udhar sales.');
        }

        cust = await queryOne('SELECT * FROM customers WHERE id = ?', [customer_id]);
        if (!cust) {
          throw new Error('Selected customer not found.');
        }

        const newBal = cust.current_balance + (udharAmount > 0 ? udharAmount : dueAmount);
        if (newBal > cust.credit_limit) {
          throw new Error(`Credit limit exceeded for ${cust.name}. Limit: Rs.${cust.credit_limit}, Current Balance + Sale: Rs.${newBal}`);
        }
      }

      // Generate invoice number
      const prefixRow = await queryOne("SELECT setting_value FROM business_settings WHERE setting_key = 'invoice_prefix'");
      const prefixSetting = prefixRow?.setting_value || 'KSK/';
      const maxIdRow = await queryOne('SELECT COALESCE(MAX(id), 0) + 1 AS next_seq FROM sales');
      const nextSeq = String(maxIdRow?.next_seq || 1).padStart(4, '0');
      const yearStr = new Date().getFullYear();
      newInvoiceNo = `${prefixSetting}${yearStr}/${nextSeq}`;

      // Payment Status
      let paymentStatus = 'PAID';
      if (totalPaid === 0 && (udharAmount > 0 || dueAmount > 0)) {
        paymentStatus = 'CREDIT';
      } else if (dueAmount > 0 || udharAmount > 0) {
        paymentStatus = 'PARTIAL';
      }

      // 4. Insert Sale Record
      const resSale = await run(`
        INSERT INTO sales (
          invoice_no, customer_id, cashier_id, total_taxable, total_tax, total_discount,
          round_off, grand_total, paid_amount, due_amount, payment_status, sale_type, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newInvoiceNo, customer_id || null, req.user.id, totalTaxable, totalTax, finalDiscount,
        roundedOff, computedGrandTotal, totalPaid, dueAmount > 0 ? dueAmount : udharAmount,
        paymentStatus, (udharAmount > 0 || dueAmount > 0) ? 'CREDIT' : 'RETAIL', notes || null
      ]);

      saleId = resSale.lastInsertRowid;

      // 5. Insert Sale Items & Deduct Stock
      for (const item of processedItems) {
        await run(`
          INSERT INTO sale_items (
            sale_id, product_id, batch_id, qty, unit, unit_price, mrp,
            discount_percent, discount_amount, gst_rate, taxable_amount,
            cgst_amount, sgst_amount, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          saleId, item.product_id, item.batch_id, item.qty, item.unit, item.unit_price, item.mrp,
          item.discount_percent, item.discount_amount, item.gst_rate, item.taxable_amount,
          item.cgst_amount, item.sgst_amount, item.total_amount
        ]);

        // Update Batch Available Qty & Sold Qty
        const bRow = await queryOne('SELECT available_qty, qty_sold, status FROM product_batches WHERE id = ?', [item.batch_id]);
        const newAvail = bRow.available_qty - item.qty;
        const newSold = bRow.qty_sold + item.qty;
        const newStatus = newAvail === 0 ? 'Out of Stock' : bRow.status;

        await run(`
          UPDATE product_batches 
          SET available_qty = ?, qty_sold = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [newAvail, newSold, newStatus, item.batch_id]);

        // Record stock movement
        await run(`
          INSERT INTO stock_movements (
            product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, reference_type, reference_id, notes, user_id
          ) VALUES (?, ?, 'sale', ?, ?, ?, 'sale', ?, 'POS Bill Sale', ?)
        `, [item.product_id, item.batch_id, -item.qty, bRow.available_qty, newAvail, newInvoiceNo, req.user.id]);
      }

      // 6. Record Split Payments
      for (const p of payments) {
        await run(`
          INSERT INTO sale_payments (sale_id, payment_method, amount, txn_ref, notes)
          VALUES (?, ?, ?, ?, ?)
        `, [saleId, p.payment_method, p.amount, p.txn_ref || null, p.notes || null]);
      }

      // 7. Record Customer Ledger Transaction if credit/due
      const totalCreditDue = udharAmount > 0 ? udharAmount : dueAmount;
      if (customer_id && totalCreditDue > 0) {
        const newBal = cust.current_balance + totalCreditDue;
        await run('UPDATE customers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBal, customer_id]);

        await run(`
          INSERT INTO customer_transactions (customer_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id)
          VALUES (?, 'SALE', ?, ?, 'Credit', 'sale', ?, ?, ?)
        `, [customer_id, totalCreditDue, newBal, newInvoiceNo, `Credit sale ${newInvoiceNo}`, req.user.id]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_POS_SALE', 'pos', saleId, null, { invoice_no: newInvoiceNo, grand_total: computedGrandTotal }, req);

    return res.json({
      success: true,
      message: 'Sale completed successfully!',
      saleId,
      invoice_no: newInvoiceNo,
      grand_total: computedGrandTotal
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// Hold / Draft Bills
let heldBillsStore = [];

router.post('/hold', requirePermission('pos', 'hold'), (req, res) => {
  const { customer_name, items, notes } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart items empty.' });
  }

  const holdRecord = {
    id: Date.now(),
    customer_name: customer_name || 'Walk-in Customer',
    items,
    notes,
    time: new Date().toISOString()
  };

  heldBillsStore.push(holdRecord);
  return res.json({ success: true, message: 'Bill held successfully', holdId: holdRecord.id });
});

router.get('/held', requirePermission('pos', 'hold'), (req, res) => {
  return res.json({ success: true, heldBills: heldBillsStore });
});

router.delete('/held/:id', requirePermission('pos', 'hold'), (req, res) => {
  const holdId = parseInt(req.params.id);
  heldBillsStore = heldBillsStore.filter(h => h.id !== holdId);
  return res.json({ success: true, message: 'Held bill removed' });
});

// Reprint / View Past Invoices
router.get('/invoice/:invoice_no', requirePermission('pos', 'reprint'), async (req, res) => {
  try {
    const invoiceNo = req.params.invoice_no;

    const sale = await queryOne(`
      SELECT s.*, c.name AS customer_name, c.mobile AS customer_mobile, c.address AS customer_address, c.village AS customer_village, c.current_balance AS customer_current_balance,
             u.full_name AS cashier_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.invoice_no = ?
    `, [invoiceNo]);

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }

    const items = await queryAll(`
      SELECT si.*, p.name AS product_name, p.product_code, p.sku, p.barcode, pb.batch_no, pb.exp_date
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN product_batches pb ON si.batch_id = pb.id
      WHERE si.sale_id = ?
    `, [sale.id]);

    const payments = await queryAll('SELECT * FROM sale_payments WHERE sale_id = ?', [sale.id]);
    const settings = await queryAll('SELECT setting_key, setting_value FROM business_settings');
    const storeSettings = {};
    settings.forEach(s => { storeSettings[s.setting_key] = s.setting_value; });

    return res.json({ success: true, sale, items, payments, storeSettings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
