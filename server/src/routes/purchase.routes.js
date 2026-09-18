import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Purchase Invoices
router.get('/', requirePermission('purchases', 'view'), (req, res) => {
  const { supplier_id, search } = req.query;

  let sql = `
    SELECT p.*, s.company_name AS supplier_name, s.mobile AS supplier_mobile, u.username AS user_name
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

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

  const purchases = queryAll(sql, params);
  return res.json({ success: true, purchases });
});

// Single Purchase Invoice Details
router.get('/:id', requirePermission('purchases', 'view'), (req, res) => {
  const purchaseId = req.params.id;

  const purchase = queryOne(`
    SELECT p.*, s.company_name AS supplier_name, s.mobile AS supplier_mobile, s.gstin AS supplier_gstin, u.username AS user_name
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `, [purchaseId]);

  if (!purchase) {
    return res.status(404).json({ success: false, message: 'Purchase invoice not found.' });
  }

  const items = queryAll(`
    SELECT pi.*, prd.name AS product_name, prd.product_code, prd.sku
    FROM purchase_items pi
    JOIN products prd ON pi.product_id = prd.id
    WHERE pi.purchase_id = ?
  `, [purchaseId]);

  return res.json({ success: true, purchase, items });
});

// Create Purchase Invoice (Auto Batch & Stock creation + Supplier Payable update)
router.post('/', requirePermission('purchases', 'create'), (req, res) => {
  const {
    supplier_id, supplier_invoice_no, purchase_date, items, paid_amount = 0,
    freight_charges = 0, other_charges = 0, notes
  } = req.body;

  if (!supplier_id || !purchase_date || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Supplier, Purchase Date, and Items list are required.' });
  }

  const supplier = queryOne('SELECT * FROM suppliers WHERE id = ?', [supplier_id]);
  if (!supplier) {
    return res.status(404).json({ success: false, message: 'Supplier not found.' });
  }

  try {
    let purchaseId;
    let newInvoiceNo;

    transaction(() => {
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

      const countRow = queryOne('SELECT COUNT(*) AS total FROM purchases');
      newInvoiceNo = `PUR/${new Date().getFullYear()}/${String(countRow.total + 1).padStart(4, '0')}`;

      let pStatus = 'PAID';
      if (paid === 0 && due > 0) pStatus = 'CREDIT';
      else if (due > 0) pStatus = 'PARTIAL';

      // Insert Purchase Header
      const resPurch = run(`
        INSERT INTO purchases (
          invoice_no, supplier_invoice_no, supplier_id, user_id, purchase_date,
          total_taxable, total_tax, freight_charges, other_charges, grand_total,
          paid_amount, due_amount, payment_status, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)
      `, [
        newInvoiceNo, supplier_invoice_no || null, supplier_id, req.user.id, purchase_date,
        totalTaxable, totalTax, totalFreight, totalOther, grandTotal,
        paid, due, pStatus, notes || null
      ]);

      purchaseId = resPurch.lastInsertRowid;

      // Process Items: Create / Update Batches and Stock Movements
      for (const item of processedItems) {
        run(`
          INSERT INTO purchase_items (
            purchase_id, product_id, batch_no, mfg_date, exp_date, qty, unit,
            purchase_rate, mrp, selling_rate, gst_rate, taxable_amount, tax_amount, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          purchaseId, item.product_id, item.batch_no, item.mfg_date, item.exp_date, item.qty, item.unit,
          item.purchase_rate, item.mrp, item.selling_rate, item.gst_rate, item.taxable_amount, item.tax_amount, item.total_amount
        ]);

        // Check if batch exists
        const existingBatch = queryOne('SELECT * FROM product_batches WHERE product_id = ? AND batch_no = ?', [item.product_id, item.batch_no]);

        let batchId;
        const today = new Date().toISOString().split('T')[0];
        const status = item.exp_date < today ? 'Expired' : 'Active';

        if (existingBatch) {
          batchId = existingBatch.id;
          const newAvail = existingBatch.available_qty + item.qty;
          const newRec = existingBatch.qty_received + item.qty;
          run(`
            UPDATE product_batches 
            SET qty_received = ?, available_qty = ?, purchase_rate = ?, selling_rate = ?, mrp = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [newRec, newAvail, item.purchase_rate, item.selling_rate, item.mrp, status, batchId]);

          run(`
            INSERT INTO stock_movements (
              product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, reference_type, reference_id, notes, user_id
            ) VALUES (?, ?, 'purchase', ?, ?, ?, 'purchase', ?, 'Purchase stock update', ?)
          `, [item.product_id, batchId, item.qty, existingBatch.available_qty, newAvail, newInvoiceNo, req.user.id]);

        } else {
          const resBatch = run(`
            INSERT INTO product_batches (
              product_id, batch_no, mfg_date, exp_date, purchase_rate, selling_rate, mrp,
              qty_received, qty_sold, available_qty, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          `, [
            item.product_id, item.batch_no, item.mfg_date, item.exp_date, item.purchase_rate, item.selling_rate, item.mrp,
            item.qty, item.qty, status
          ]);

          batchId = resBatch.lastInsertRowid;

          run(`
            INSERT INTO stock_movements (
              product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, reference_type, reference_id, notes, user_id
            ) VALUES (?, ?, 'purchase', ?, 0, ?, 'purchase', ?, 'New batch purchase stock', ?)
          `, [item.product_id, batchId, item.qty, item.qty, newInvoiceNo, req.user.id]);
        }
      }

      // Update Supplier Balance & Transaction Ledger if unpaid amount remains
      if (due > 0) {
        const newSuppBal = supplier.current_balance + due;
        run('UPDATE suppliers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newSuppBal, supplier_id]);

        run(`
          INSERT INTO supplier_transactions (supplier_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id)
          VALUES (?, 'PURCHASE', ?, ?, 'Credit', 'purchase', ?, ?, ?)
        `, [supplier_id, due, newSuppBal, newInvoiceNo, `Purchase invoice ${newInvoiceNo}`, req.user.id]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_PURCHASE', 'purchases', purchaseId, null, { invoice_no: newInvoiceNo, grandTotal }, req);

    return res.json({ success: true, message: 'Purchase invoice recorded successfully', purchaseId, invoice_no: newInvoiceNo });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
