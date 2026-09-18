import express from 'express';
import { queryOne, queryAll } from '../db/connection.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Audit Logs
router.get('/', requirePermission('audit', 'view'), async (req, res) => {
  try {
    const { module, user_id, action, limit = 100 } = req.query;

    let sql = `
      SELECT al.*, u.username AS user_name, u.full_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (module) {
      sql += ` AND al.module = ?`;
      params.push(module);
    }

    if (user_id) {
      sql += ` AND al.user_id = ?`;
      params.push(user_id);
    }

    if (action) {
      sql += ` AND al.action = ?`;
      params.push(action);
    }

    sql += ` ORDER BY al.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));

    const logs = await queryAll(sql, params);
    return res.json({ success: true, logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
