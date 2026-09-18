import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List / Filter Batches with FEFO sorting & Expiry status
router.get('/', requirePermission('batches', 'view'), async (req, res) => {
  try {
    const { product_id, expiry_filter, status, search } = req.query;
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT pb.*, 
             p.name AS product_name, 
             p.product_code, 
             p.sku, 
             p.barcode,
             u.symbol AS unit_symbol,
             CAST((JULIANDAY(pb.exp_date) - JULIANDAY('now')) AS INTEGER) AS days_until_expiry
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      WHERE 1=1
    `;

    const params = [];

    if (tenantScope !== null) {
      sql += ` AND pb.tenant_id = ?`;
      params.push(tenantScope);
    }

    if (product_id) {
      sql += ` AND pb.product_id = ?`;
      params.push(product_id);
    }

    if (status) {
      sql += ` AND pb.status = ?`;
      params.push(status);
    }

    if (search) {
      sql += ` AND (p.name LIKE ? OR pb.batch_no LIKE ? OR p.product_code LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (expiry_filter === 'expired') {
      sql += ` AND pb.exp_date < DATE('now')`;
    } else if (expiry_filter === '7_days') {
      sql += ` AND pb.exp_date >= DATE('now') AND pb.exp_date <= DATE('now', '+7 days')`;
    } else if (expiry_filter === '30_days') {
      sql += ` AND pb.exp_date >= DATE('now') AND pb.exp_date <= DATE('now', '+30 days')`;
    } else if (expiry_filter === '60_days') {
      sql += ` AND pb.exp_date >= DATE('now') AND pb.exp_date <= DATE('now', '+60 days')`;
    } else if (expiry_filter === '90_days') {
      sql += ` AND pb.exp_date >= DATE('now') AND pb.exp_date <= DATE('now', '+90 days')`;
    }

    sql += ` ORDER BY pb.exp_date ASC`;

    const batches = await queryAll(sql, params);
    return res.json({ success: true, batches });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Single Batch Details & Movement History
router.get('/:id', requirePermission('batches', 'view'), async (req, res) => {
  try {
    const batchId = req.params.id;
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT pb.*, p.name AS product_name, p.product_code, u.symbol AS unit_symbol
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      WHERE pb.id = ?
    `;
    const params = [batchId];

    if (tenantScope !== null) {
      sql += ` AND pb.tenant_id = ?`;
      params.push(tenantScope);
    }

    const batch = await queryOne(sql, params);

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }

    const movements = await queryAll(`
      SELECT sm.*, u.username
      FROM stock_movements sm
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.batch_id = ?
      ORDER BY sm.created_at DESC
    `, [batchId]);

    return res.json({ success: true, batch, movements });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Change Batch Status (Active / Near Expiry / Expired / Out of Stock / Blocked)
router.put('/:id/status', requirePermission('batches', 'manage'), async (req, res) => {
  const batchId = req.params.id;
  const { status, notes } = req.body;
  const tenantScope = getTenantScope(req);

  const allowedStatuses = ['Active', 'Near Expiry', 'Expired', 'Out of Stock', 'Blocked'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid batch status.' });
  }

  try {
    let checkSql = 'SELECT * FROM product_batches WHERE id = ?';
    const checkParams = [batchId];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const oldBatch = await queryOne(checkSql, checkParams);
    if (!oldBatch) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }

    await run('UPDATE product_batches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, batchId]);

    logAuditAction(req.user.id, 'UPDATE_BATCH_STATUS', 'batches', batchId, oldBatch, { status, notes }, req);

    return res.json({ success: true, message: `Batch status changed to ${status}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Manual Stock Adjustment for a specific batch (damaged, expiry disposal, correction)
router.post('/:id/adjust', requirePermission('inventory', 'adjust'), async (req, res) => {
  const batchId = req.params.id;
  const { adjustment_type, qty, reason } = req.body;
  const tenantScope = getTenantScope(req);

  const validTypes = ['stock_adjustment', 'damaged', 'expiry_disposal'];
  if (!validTypes.includes(adjustment_type)) {
    return res.status(400).json({ success: false, message: 'Invalid adjustment type.' });
  }

  const adjustQty = parseFloat(qty);
  if (isNaN(adjustQty) || adjustQty === 0) {
    return res.status(400).json({ success: false, message: 'Valid non-zero quantity is required.' });
  }

  try {
    let checkSql = 'SELECT * FROM product_batches WHERE id = ?';
    const checkParams = [batchId];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const batch = await queryOne(checkSql, checkParams);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }

    const prevQty = batch.available_qty;
    const newQty = prevQty + adjustQty;

    if (newQty < 0) {
      return res.status(400).json({
        success: false,
        message: `Adjustment exceeds available quantity (${prevQty} available).`
      });
    }

    let damagedInc = 0;
    if (adjustment_type === 'damaged') {
      damagedInc = Math.abs(adjustQty);
    }

    const newStatus = newQty === 0 ? 'Out of Stock' : (adjustment_type === 'expiry_disposal' ? 'Expired' : batch.status);

    await transaction(async () => {
      await run(`
        UPDATE product_batches 
        SET available_qty = ?, 
            damaged_qty = damaged_qty + ?, 
            status = ?, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newQty, damagedInc, newStatus, batchId]);

      await run(`
        INSERT INTO stock_movements (
          tenant_id, product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, notes, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [batch.tenant_id, batch.product_id, batchId, adjustment_type, adjustQty, prevQty, newQty, reason || 'Manual adjustment', req.user.id]);
    });

    logAuditAction(req.user.id, 'ADJUST_BATCH_STOCK', 'batches', batchId, { available_qty: prevQty }, { available_qty: newQty, reason }, req);

    return res.json({
      success: true,
      message: 'Stock adjusted successfully',
      previous_qty: prevQty,
      new_qty: newQty
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
