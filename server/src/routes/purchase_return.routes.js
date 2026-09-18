import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Purchase Returns
router.get('/', requirePermission('returns', 'purchase_return'), async (req, res) => {
  try {
    const returns = await queryAll(`
      SELECT pr.*, s.company_name AS supplier_name, p.invoice_no AS purchase_invoice_no, u.username AS user_name
      FROM purchase_returns pr
      JOIN suppliers s ON pr.supplier_id = s.id
      LEFT JOIN purchases p ON pr.original_purchase_id = p.id
      LEFT JOIN users u ON pr.user_id = u.id
      ORDER BY pr.return_date DESC
    `);
    return res.json({ success: true, returns });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create Purchase Return
router.post('/', requirePermission('returns', 'purchase_return'), async (req, res) => {
  const { supplier_id, original_purchase_id, items, reason } = req.body;

  if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Supplier and Return Items list are required.' });
  }

  try {
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [supplier_id]);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    let returnId;
    let newReturnNo;

    await transaction(async () => {
      let totalReturnAmt = 0;
      const processedItems = [];

      for (const item of items) {
        if (!item.product_id || !item.batch_id || !item.qty) continue;

        const batch = await queryOne('SELECT * FROM product_batches WHERE id = ?', [item.batch_id]);
        if (!batch) {
          throw new Error(`Batch ID ${item.batch_id} not found.`);
        }

        const qty = parseFloat(item.qty);
        if (batch.available_qty < qty) {
          throw new Error(`Insufficient batch stock for return. Available: ${batch.available_qty}, Return: ${qty}`);
        }

        const unitPrice = item.unit_price || batch.purchase_rate;
        const lineTotal = qty * unitPrice;
        totalReturnAmt += lineTotal;

        processedItems.push({
          product_id: item.product_id,
          batch_id: item.batch_id,
          qty,
          unit_price: unitPrice,
          gst_rate: batch.gst_rate || 0,
          total_amount: lineTotal
        });
      }

      const countRow = await queryOne('SELECT COUNT(*) AS total FROM purchase_returns');
      newReturnNo = `PR/${new Date().getFullYear()}/${String((countRow?.total || 0) + 1).padStart(4, '0')}`;
      const debitNoteNo = `DN/${new Date().getFullYear()}/${String((countRow?.total || 0) + 1).padStart(4, '0')}`;

      const resRet = await run(`
        INSERT INTO purchase_returns (
          return_no, original_purchase_id, supplier_id, user_id, return_date, total_amount, reason, debit_note_no, status
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'COMPLETED')
      `, [newReturnNo, original_purchase_id || null, supplier_id, req.user.id, totalReturnAmt, reason || null, debitNoteNo]);

      returnId = resRet.lastInsertRowid;

      // Reduce batch stock & log movement
      for (const item of processedItems) {
        await run(`
          INSERT INTO purchase_return_items (return_id, product_id, batch_id, qty, unit_price, gst_rate, total_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [returnId, item.product_id, item.batch_id, item.qty, item.unit_price, item.gst_rate, item.total_amount]);

        const batch = await queryOne('SELECT available_qty FROM product_batches WHERE id = ?', [item.batch_id]);
        const newAvail = Math.max(0, batch.available_qty - item.qty);

        await run('UPDATE product_batches SET available_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newAvail, item.batch_id]);

        await run(`
          INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, reference_type, reference_id, notes, user_id)
          VALUES (?, ?, 'purchase_return', ?, ?, ?, 'purchase_return', ?, 'Supplier purchase return', ?)
        `, [item.product_id, item.batch_id, -item.qty, batch.available_qty, newAvail, newReturnNo, req.user.id]);
      }

      // Update supplier ledger (Reduce payable balance)
      const newSuppBal = Math.max(0, supplier.current_balance - totalReturnAmt);
      await run('UPDATE suppliers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newSuppBal, supplier_id]);

      await run(`
        INSERT INTO supplier_transactions (supplier_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id)
        VALUES (?, 'PURCHASE_RETURN', ?, ?, 'Debit Note', 'purchase_return', ?, ?, ?)
      `, [supplier_id, totalReturnAmt, newSuppBal, debitNoteNo, `Supplier purchase return debit note ${debitNoteNo}`, req.user.id]);
    });

    logAuditAction(req.user.id, 'CREATE_PURCHASE_RETURN', 'returns', returnId, null, { return_no: newReturnNo }, req);

    return res.json({ success: true, message: 'Purchase return recorded successfully', returnId, return_no: newReturnNo });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
