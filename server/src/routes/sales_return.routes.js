import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Sales Returns
router.get('/', requirePermission('returns', 'sales_return'), (req, res) => {
  const returns = queryAll(`
    SELECT sr.*, s.invoice_no AS original_invoice_no, c.name AS customer_name, u.username AS user_name
    FROM sales_returns sr
    LEFT JOIN sales s ON sr.original_sale_id = s.id
    LEFT JOIN customers c ON sr.customer_id = c.id
    LEFT JOIN users u ON sr.user_id = u.id
    ORDER BY sr.return_date DESC
  `);
  return res.json({ success: true, returns });
});

// Process Sales Return
router.post('/', requirePermission('returns', 'sales_return'), (req, res) => {
  const { original_invoice_no, items, refund_method, reason } = req.body;

  if (!original_invoice_no || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Original Invoice No and Return Items are required.' });
  }

  const sale = queryOne('SELECT * FROM sales WHERE invoice_no = ?', [original_invoice_no]);
  if (!sale) {
    return res.status(404).json({ success: false, message: 'Original sales invoice not found.' });
  }

  try {
    let returnId;
    let newReturnNo;

    transaction(() => {
      let totalReturnAmt = 0;
      const processedReturnItems = [];

      for (const item of items) {
        if (!item.product_id || !item.batch_id || !item.qty) continue;

        const saleItem = queryOne('SELECT * FROM sale_items WHERE sale_id = ? AND product_id = ? AND batch_id = ?', [sale.id, item.product_id, item.batch_id]);
        if (!saleItem) {
          throw new Error(`Product/Batch was not part of original invoice ${original_invoice_no}.`);
        }

        const qty = parseFloat(item.qty);
        if (qty > saleItem.qty) {
          throw new Error(`Return quantity (${qty}) exceeds original sold quantity (${saleItem.qty}).`);
        }

        const lineAmt = qty * saleItem.unit_price;
        totalReturnAmt += lineAmt;

        processedReturnItems.push({
          product_id: item.product_id,
          batch_id: item.batch_id,
          qty,
          unit_price: saleItem.unit_price,
          gst_rate: saleItem.gst_rate,
          total_amount: lineAmt,
          condition_type: item.condition_type || 'Restockable'
        });
      }

      const countRow = queryOne('SELECT COUNT(*) AS total FROM sales_returns');
      newReturnNo = `SR/${new Date().getFullYear()}/${String(countRow.total + 1).padStart(4, '0')}`;

      const resRet = run(`
        INSERT INTO sales_returns (
          return_no, original_sale_id, customer_id, user_id, return_date, total_amount, refund_method, reason, status
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'COMPLETED')
      `, [
        newReturnNo, sale.id, sale.customer_id, req.user.id, totalReturnAmt, refund_method || 'Credit Adjustment', reason || null
      ]);

      returnId = resRet.lastInsertRowid;

      // Restock batch if Restockable
      for (const item of processedReturnItems) {
        run(`
          INSERT INTO sales_return_items (return_id, product_id, batch_id, qty, unit_price, gst_rate, total_amount, condition_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [returnId, item.product_id, item.batch_id, item.qty, item.unit_price, item.gst_rate, item.total_amount, item.condition_type]);

        if (item.condition_type === 'Restockable') {
          const batch = queryOne('SELECT available_qty, qty_sold FROM product_batches WHERE id = ?', [item.batch_id]);
          const newAvail = batch.available_qty + item.qty;
          const newSold = Math.max(0, batch.qty_sold - item.qty);

          run('UPDATE product_batches SET available_qty = ?, qty_sold = ?, status = "Active", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newAvail, newSold, item.batch_id]);

          run(`
            INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, reference_type, reference_id, notes, user_id)
            VALUES (?, ?, 'sale_return', ?, ?, ?, 'sales_return', ?, 'Customer sales return', ?)
          `, [item.product_id, item.batch_id, item.qty, batch.available_qty, newAvail, newReturnNo, req.user.id]);
        }
      }

      // Customer Balance & Transaction Adjustment if Credit Adjustment
      if (sale.customer_id && (refund_method === 'Credit Adjustment' || sale.due_amount > 0)) {
        const cust = queryOne('SELECT current_balance FROM customers WHERE id = ?', [sale.customer_id]);
        const newBal = Math.max(0, cust.current_balance - totalReturnAmt);
        run('UPDATE customers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBal, sale.customer_id]);

        run(`
          INSERT INTO customer_transactions (customer_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id)
          VALUES (?, 'SALE_RETURN', ?, ?, ?, 'sales_return', ?, 'Sales return credit note', ?)
        `, [sale.customer_id, totalReturnAmt, newBal, refund_method, newReturnNo, req.user.id]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_SALES_RETURN', 'returns', returnId, null, { return_no: newReturnNo, original_invoice_no }, req);

    return res.json({ success: true, message: 'Sales return processed successfully', returnId, return_no: newReturnNo });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
