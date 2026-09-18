import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// Stock Movement Ledger List
router.get('/movements', requirePermission('batches', 'view'), (req, res) => {
  const { product_id, batch_id, movement_type, limit = 100 } = req.query;

  let sql = `
    SELECT sm.*, 
           p.name AS product_name, p.product_code,
           pb.batch_no, pb.exp_date,
           u.username AS user_name
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    LEFT JOIN product_batches pb ON sm.batch_id = pb.id
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (product_id) {
    sql += ` AND sm.product_id = ?`;
    params.push(product_id);
  }

  if (batch_id) {
    sql += ` AND sm.batch_id = ?`;
    params.push(batch_id);
  }

  if (movement_type) {
    sql += ` AND sm.movement_type = ?`;
    params.push(movement_type);
  }

  sql += ` ORDER BY sm.created_at DESC LIMIT ?`;
  params.push(parseInt(limit));

  const movements = queryAll(sql, params);
  return res.json({ success: true, movements });
});

// Inventory Valuation Summary
router.get('/valuation', requirePermission('reports', 'view'), (req, res) => {
  const summary = queryOne(`
    SELECT 
      COUNT(DISTINCT p.id) AS total_products,
      COUNT(pb.id) AS total_batches,
      COALESCE(SUM(pb.available_qty), 0) AS total_stock_quantity,
      COALESCE(SUM(pb.available_qty * pb.purchase_rate), 0) AS total_purchase_valuation,
      COALESCE(SUM(pb.available_qty * pb.selling_rate), 0) AS total_selling_valuation
    FROM products p
    JOIN product_batches pb ON p.id = pb.product_id
    WHERE pb.available_qty > 0 AND pb.status != 'Blocked'
  `);

  const categoryBreakdown = queryAll(`
    SELECT c.name AS category_name,
           COUNT(DISTINCT p.id) AS product_count,
           COALESCE(SUM(pb.available_qty), 0) AS total_qty,
           COALESCE(SUM(pb.available_qty * pb.purchase_rate), 0) AS purchase_value,
           COALESCE(SUM(pb.available_qty * pb.selling_rate), 0) AS selling_value
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id
    LEFT JOIN product_batches pb ON p.id = pb.product_id AND pb.available_qty > 0
    GROUP BY c.id
    ORDER BY selling_value DESC
  `);

  return res.json({ success: true, summary, categoryBreakdown });
});

// Manual Stock Adjustment or Damage Entry
router.post('/adjust', requirePermission('inventory', 'adjust'), (req, res) => {
  const { product_id, batch_id, type, qty_change, notes } = req.body;

  if (!product_id || !batch_id || !type || !qty_change) {
    return res.status(400).json({ success: false, message: 'Product, Batch, Adjustment Type, and Quantity change are required.' });
  }

  const batch = queryOne('SELECT * FROM product_batches WHERE id = ?', [batch_id]);
  if (!batch) {
    return res.status(404).json({ success: false, message: 'Selected batch does not exist.' });
  }

  try {
    transaction(() => {
      const prevQty = batch.available_qty;
      let newQty = prevQty;
      let qtyDelta = parseFloat(qty_change);

      if (type === 'stock_adjustment' || type === 'purchase') {
        newQty = prevQty + qtyDelta;
      } else if (type === 'damaged' || type === 'expiry_disposal') {
        newQty = Math.max(0, prevQty - Math.abs(qtyDelta));
        qtyDelta = -Math.abs(qtyDelta);

        // Update damaged_qty column on batch
        run('UPDATE product_batches SET damaged_qty = damaged_qty + ? WHERE id = ?', [Math.abs(qtyDelta), batch_id]);
      }

      // Update available_qty
      const statusUpdate = newQty === 0 ? 'Out of Stock' : (type === 'expiry_disposal' ? 'Blocked' : batch.status);
      run(`
        UPDATE product_batches 
        SET available_qty = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [newQty, statusUpdate, batch_id]);

      // Record movement
      run(`
        INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, notes, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [product_id, batch_id, type, qtyDelta, prevQty, newQty, notes || 'Manual adjustment', req.user.id]);
    });

    logAuditAction(req.user.id, 'ADJUST_STOCK', 'inventory', batch_id, { prevQty: batch.available_qty }, { type, qty_change, notes }, req);

    return res.json({ success: true, message: 'Stock adjusted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
