import express from 'express';
import { queryOne, queryAll, run } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Expenses with category & date filters
router.get('/', requirePermission('expenses', 'manage'), async (req, res) => {
  try {
    const { category, start_date, end_date } = req.query;
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT e.*, u.username AS user_name
      FROM expenses e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (tenantScope !== null) {
      sql += ` AND e.tenant_id = ?`;
      params.push(tenantScope);
    }

    if (category) {
      sql += ` AND e.category = ?`;
      params.push(category);
    }

    if (start_date) {
      sql += ` AND e.expense_date >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      sql += ` AND e.expense_date <= ?`;
      params.push(end_date);
    }

    sql += ` ORDER BY e.expense_date DESC, e.id DESC`;

    const expenses = await queryAll(sql, params);

    let totSql = 'SELECT COALESCE(SUM(amount), 0) AS grand_total FROM expenses WHERE 1=1';
    const totParams = [];

    if (tenantScope !== null) {
      totSql += ` AND tenant_id = ?`;
      totParams.push(tenantScope);
    }

    if (category) {
      totSql += ' AND category = ?';
      totParams.push(category);
    }

    const totRow = await queryOne(totSql, totParams);
    const totalExpense = totRow?.grand_total || 0;

    return res.json({ success: true, expenses, totalExpense });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create Expense
router.post('/', requirePermission('expenses', 'manage'), async (req, res) => {
  const { category, title, amount, expense_date, payment_method, recipient, reference_no, description } = req.body;

  if (!category || !title || !amount || !expense_date) {
    return res.status(400).json({ success: false, message: 'Category, Title, Amount, and Expense Date are required.' });
  }

  try {
    const tenantScope = getTenantScope(req);
    const assignedTenantId = tenantScope !== null ? tenantScope : (req.body.tenant_id || 1);

    const resExp = await run(`
      INSERT INTO expenses (
        tenant_id, category, title, amount, expense_date, payment_method, recipient, reference_no, description, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      assignedTenantId, category, title, parseFloat(amount), expense_date, payment_method || 'Cash',
      recipient || null, reference_no || null, description || null, req.user.id
    ]);

    logAuditAction(req.user.id, 'CREATE_EXPENSE', 'expenses', resExp.lastInsertRowid, null, { title, amount, category, tenant_id: assignedTenantId }, req);

    return res.json({ success: true, message: 'Expense logged successfully', expenseId: resExp.lastInsertRowid });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Expense
router.delete('/:id', requirePermission('expenses', 'manage'), async (req, res) => {
  const expenseId = req.params.id;
  const tenantScope = getTenantScope(req);

  try {
    let checkSql = 'SELECT * FROM expenses WHERE id = ?';
    const checkParams = [expenseId];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const old = await queryOne(checkSql, checkParams);
    if (!old) {
      return res.status(404).json({ success: false, message: 'Expense record not found in your organization.' });
    }

    await run('DELETE FROM expenses WHERE id = ?', [expenseId]);
    logAuditAction(req.user.id, 'DELETE_EXPENSE', 'expenses', expenseId, old, null, req);

    return res.json({ success: true, message: 'Expense record deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
