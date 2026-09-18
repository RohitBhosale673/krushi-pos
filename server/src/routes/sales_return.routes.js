import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Sales Returns
router.get('/', requirePermission('returns', 'sales_return'), async (req, res) => {
  try {
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT sr.*, s.invoice_no AS original_invoice_no, c.name AS customer_name, u.username AS user_name
      FROM sales_returns sr
      LEFT JOIN sales s ON sr.original_sale_id = s.id
      LEFT JOIN customers c ON sr.customer_id = c.id
      LEFT JOIN users u ON sr.user_id = u.id
    `;
    const params = [];

    if (tenantScope !== null) {
      sql += ` WHERE sr.tenant_id = ?`;
      params.push(tenantScope);
    }

    sql += ` ORDER BY sr.return_date DESC`;

    const returns = await queryAll(sql, params);
    return res.json({ success: true, returns });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Process Sales Return
router.post('/', requirePermission('returns', 'sales_return'), async (req, res) => {
  const { original_invoice_no, items, refund_method, reason } = req.body;
  const tenantScope = getTenantScope(req);

  if (!original_invoice_no || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Original Invoice No and Return Items are required.' });
  }

  try {
    let checkSql = 'SELECT * FROM sales WHERE invoice_no = ?';
    const checkParams = [original_invoice_no];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const sale = await queryOne(checkSql, checkParams);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Original sales invoice not found in your organization.' });
    }

    let returnId;
    let newReturnNo;

    await transaction(async () => {
      let totalReturnAmt = 0;
      const processedReturnItems = [];

      for (const item of items) {
        if (!item.product_id || !item.batch_id || !item.qty) continue;

        const saleItem = await queryOne('SELECT * FROM sale_items WHERE sale_id = ? AND product_id = ? AND batch_id = ?', [sale.id, item.product_id, item.batch_id]);
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

      const countRow = await queryOne('SELECT COUNT(*) AS total FROM sales_returns WHERE tenant_id = ?', [sale.tenant_id]);
      newReturnNo = `RET/SL/${new Date().getFullYear()}/${String((countRow?.total || 0) + 1).padStart(4, '0')}`;

      // Insert Return Record
      const resRet = await run(`
        INSERT INTO sales_returns (
          tenant_id, return_no, original_sale_id, customer_id, user_id, total_amount,
          refund_method, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
      `, [
        sale.tenant_id, newReturnNo, sale.id, sale.customer_id, req.user.id,
        totalReturnAmt, refund_method || 'Credit Adjustment', reason || null
      ]);

      returnId = resRet.lastInsertRowid;

      // Restock Items if condition is Restockable
      for (const item of processedReturnItems) {
        await run(`
          INSERT INTO sales_return_items (
            tenant_id, return_id, product_id, batch_id, qty, unit_price, gst_rate, total_amount, condition_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sale.tenant_id, returnId, item.product_id, item.batch_id, item.qty, item.unit_price,
          item.gst_rate, item.total_amount, item.condition_type
        ]);

        if (item.condition_type === 'Restockable') {
          const batch = await queryOne('SELECT available_qty FROM product_batches WHERE id = ?', [item.batch_id]);
          if (batch) {
            const newQty = batch.available_qty + item.qty;
            await run('UPDATE product_batches SET available_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, item.batch_id]);

            await run(`
              INSERT INTO stock_movements (
                tenant_id, product_id, batch_id, movement_type, qty_change, previous_qty, new_qty,
                reference_type, reference_id, notes, user_id
              ) VALUES (?, ?, ?, 'sale_return', ?, ?, ?, 'sales_return', ?, 'Customer sales return restocked', ?)
            `, [sale.tenant_id, item.product_id, item.batch_id, item.qty, batch.available_qty, newQty, newReturnNo, req.user.id]);
          }
        }
      }

      // If credit adjustment and customer exists, reduce udhari balance
      if (sale.customer_id && (refund_method === 'Credit Adjustment' || refund_method === 'Credit')) {
        const cust = await queryOne('SELECT current_balance FROM customers WHERE id = ?', [sale.customer_id]);
        if (cust) {
          const newBal = Math.max(0, cust.current_balance - totalReturnAmt);
          await run('UPDATE customers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBal, sale.customer_id]);

          await run(`
            INSERT INTO customer_transactions (
              tenant_id, customer_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id
            ) VALUES (?, ?, 'SALE_RETURN', ?, ?, 'Credit Note', 'sales_return', ?, ?, ?)
          `, [sale.tenant_id, sale.customer_id, totalReturnAmt, newBal, newReturnNo, `Credit Note for Return ${newReturnNo}`, req.user.id]);
        }
      }
    });

    logAuditAction(req.user.id, 'PROCESS_SALES_RETURN', 'returns', returnId, null, { return_no: newReturnNo }, req);

    return res.json({
      success: true,
      message: 'Sales return processed successfully.',
      return_no: newReturnNo
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
