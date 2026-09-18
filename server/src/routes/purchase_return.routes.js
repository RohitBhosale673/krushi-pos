import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Purchase Returns
router.get('/', requirePermission('returns', 'purchase_return'), async (req, res) => {
  try {
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT pr.*, s.company_name AS supplier_name, p.invoice_no AS purchase_invoice_no, u.username AS user_name
      FROM purchase_returns pr
      JOIN suppliers s ON pr.supplier_id = s.id
      LEFT JOIN purchases p ON pr.original_purchase_id = p.id
      LEFT JOIN users u ON pr.user_id = u.id
    `;
    const params = [];

    if (tenantScope !== null) {
      sql += ` WHERE pr.tenant_id = ?`;
      params.push(tenantScope);
    }

    sql += ` ORDER BY pr.return_date DESC`;

    const returns = await queryAll(sql, params);
    return res.json({ success: true, returns });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create Purchase Return
router.post('/', requirePermission('returns', 'purchase_return'), async (req, res) => {
  const { supplier_id, original_purchase_id, items, reason } = req.body;
  const tenantScope = getTenantScope(req);

  if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Supplier and Return Items list are required.' });
  }

  try {
    let checkSql = 'SELECT * FROM suppliers WHERE id = ?';
    const checkParams = [supplier_id];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const supplier = await queryOne(checkSql, checkParams);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found in your organization.' });
    }

    let returnId;
    let newReturnNo;

    await transaction(async () => {
      let totalReturnAmt = 0;
      const processedItems = [];

      for (const item of items) {
        if (!item.product_id || !item.batch_id || !item.qty) continue;

        const batch = await queryOne('SELECT * FROM product_batches WHERE id = ? AND tenant_id = ?', [item.batch_id, supplier.tenant_id]);
        if (!batch) {
          throw new Error(`Batch ID ${item.batch_id} not found in your organization.`);
        }

        const qty = parseFloat(item.qty);
        if (batch.available_qty < qty) {
          throw new Error(`Insufficient batch stock for return. Available: ${batch.available_qty}, Return: ${qty}`);
        }

        const unitPrice = item.unit_price || batch.purchase_rate;
        const lineAmt = qty * unitPrice;
        totalReturnAmt += lineAmt;

        processedItems.push({
          product_id: item.product_id,
          batch_id: item.batch_id,
          qty,
          unit_price: unitPrice,
          gst_rate: batch.gst_rate || 0,
          total_amount: lineAmt
        });
      }

      const countRow = await queryOne('SELECT COUNT(*) AS total FROM purchase_returns WHERE tenant_id = ?', [supplier.tenant_id]);
      newReturnNo = `RET/PUR/${new Date().getFullYear()}/${String((countRow?.total || 0) + 1).padStart(4, '0')}`;

      // Insert Purchase Return Record
      const resRet = await run(`
        INSERT INTO purchase_returns (
          tenant_id, return_no, original_purchase_id, supplier_id, user_id,
          total_amount, reason, debit_note_no, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
      `, [
        supplier.tenant_id, newReturnNo, original_purchase_id || null, supplier_id, req.user.id,
        totalReturnAmt, reason || null, `DN-${newReturnNo}`
      ]);

      returnId = resRet.lastInsertRowid;

      // Deduct stock from batches
      for (const item of processedItems) {
        await run(`
          INSERT INTO purchase_return_items (
            tenant_id, return_id, product_id, batch_id, qty, unit_price, gst_rate, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [supplier.tenant_id, returnId, item.product_id, item.batch_id, item.qty, item.unit_price, item.gst_rate, item.total_amount]);

        const batch = await queryOne('SELECT available_qty FROM product_batches WHERE id = ?', [item.batch_id]);
        const newQty = batch.available_qty - item.qty;

        await run('UPDATE product_batches SET available_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, item.batch_id]);

        await run(`
          INSERT INTO stock_movements (
            tenant_id, product_id, batch_id, movement_type, qty_change, previous_qty, new_qty,
            reference_type, reference_id, notes, user_id
          ) VALUES (?, ?, ?, 'purchase_return', ?, ?, ?, 'purchase_return', ?, 'Debit Note purchase return outward', ?)
        `, [supplier.tenant_id, item.product_id, item.batch_id, -item.qty, batch.available_qty, newQty, newReturnNo, req.user.id]);
      }

      // Update Supplier Balance
      const newBal = Math.max(0, supplier.current_balance - totalReturnAmt);
      await run('UPDATE suppliers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBal, supplier_id]);

      await run(`
        INSERT INTO supplier_transactions (
          tenant_id, supplier_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id
        ) VALUES (?, ?, 'PURCHASE_RETURN', ?, ?, 'Credit Note', 'purchase_return', ?, ?, ?)
      `, [supplier.tenant_id, supplier_id, totalReturnAmt, newBal, newReturnNo, `Debit Note ${newReturnNo}`, req.user.id]);
    });

    logAuditAction(req.user.id, 'PROCESS_PURCHASE_RETURN', 'returns', returnId, null, { return_no: newReturnNo }, req);

    return res.json({
      success: true,
      message: 'Purchase return processed and debit note issued successfully.',
      return_no: newReturnNo
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
