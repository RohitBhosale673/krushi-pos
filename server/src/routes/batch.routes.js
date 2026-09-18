import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List / Filter Batches with FEFO sorting & Expiry status
router.get('/', requirePermission('batches', 'view'), async (req, res) => {
  try {
    const { product_id, expiry_filter, status, search } = req.query;

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

    // Expiry filters: 7, 30, 60, 90 days, expired
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

    // FEFO Sorting: First Expiry First Out
    sql += ` ORDER BY pb.exp_date ASC`;

    const batches = await queryAll(sql, params);
    return res.json({ success: true, batches });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// FEFO Query for POS auto allocation
router.get('/fefo/:product_id', requirePermission('pos', 'create'), async (req, res) => {
  try {
    const productId = req.params.product_id;

    const batches = await queryAll(`
      SELECT pb.*, u.symbol AS unit_symbol,
             CAST((JULIANDAY(pb.exp_date) - JULIANDAY('now')) AS INTEGER) AS days_until_expiry
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      WHERE pb.product_id = ? AND pb.available_qty > 0 AND pb.status != 'Blocked'
      ORDER BY pb.exp_date ASC
    `, [productId]);

    return res.json({ success: true, batches });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create Batch manually
router.post('/', requirePermission('batches', 'manage'), async (req, res) => {
  const {
    product_id, batch_no, mfg_date, exp_date, purchase_rate, selling_rate,
    mrp, qty_received
  } = req.body;

  if (!product_id || !batch_no || !exp_date || purchase_rate === undefined || selling_rate === undefined || !qty_received) {
    return res.status(400).json({ success: false, message: 'Product, Batch No, Expiry Date, Rates, and Quantity are required.' });
  }

  try {
    const existing = await queryOne('SELECT id FROM product_batches WHERE product_id = ? AND batch_no = ?', [product_id, batch_no]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Batch number already exists for this product.' });
    }

    let batchId;
    await transaction(async () => {
      // Determine initial status based on expiry date
      let status = 'Active';
      const today = new Date().toISOString().split('T')[0];
      if (exp_date < today) {
        status = 'Expired';
      }

      const resBatch = await run(`
        INSERT INTO product_batches (
          product_id, batch_no, mfg_date, exp_date, purchase_rate, selling_rate, mrp,
          qty_received, qty_sold, available_qty, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [
        product_id, batch_no, mfg_date || null, exp_date, purchase_rate, selling_rate,
        mrp || selling_rate, qty_received, qty_received, status
      ]);

      batchId = resBatch.lastInsertRowid;

      // Log stock movement
      await run(`
        INSERT INTO stock_movements (product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, notes, user_id)
        VALUES (?, ?, 'opening_stock', ?, 0, ?, 'Manual batch creation', ?)
      `, [product_id, batchId, qty_received, qty_received, req.user.id]);
    });

    logAuditAction(req.user.id, 'CREATE_BATCH', 'batches', batchId, null, { product_id, batch_no, qty_received }, req);

    return res.json({ success: true, message: 'Batch created successfully', batchId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update Batch Status or Rates
router.put('/:id', requirePermission('batches', 'manage'), async (req, res) => {
  const batchId = req.params.id;
  try {
    const oldBatch = await queryOne('SELECT * FROM product_batches WHERE id = ?', [batchId]);

    if (!oldBatch) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }

    const { status, selling_rate, mrp, notes } = req.body;

    await run(`
      UPDATE product_batches
      SET status = COALESCE(?, status),
          selling_rate = COALESCE(?, selling_rate),
          mrp = COALESCE(?, mrp),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, selling_rate, mrp, batchId]);

    logAuditAction(req.user.id, 'UPDATE_BATCH', 'batches', batchId, oldBatch, { status, selling_rate, notes }, req);

    return res.json({ success: true, message: 'Batch updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
