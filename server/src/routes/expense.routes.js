import express from 'express';
import { queryOne, queryAll, run } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Expenses with category & date filters
router.get('/', requirePermission('expenses', 'manage'), (req, res) => {
  const { category, start_date, end_date } = req.query;

  let sql = `
    SELECT e.*, u.username AS user_name
    FROM expenses e
    LEFT JOIN users u ON e.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

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

  const expenses = queryAll(sql, params);

  const totalExpense = queryOne(`
    SELECT COALESCE(SUM(amount), 0) AS grand_total FROM expenses WHERE 1=1 ${category ? "AND category = '" + category + "'" : ""}
  `)?.grand_total || 0;

  return res.json({ success: true, expenses, totalExpense });
});

// Create Expense
router.post('/', requirePermission('expenses', 'manage'), (req, res) => {
  const { category, title, amount, expense_date, payment_method, recipient, reference_no, description } = req.body;

  if (!category || !title || !amount || !expense_date) {
    return res.status(400).json({ success: false, message: 'Category, Title, Amount, and Expense Date are required.' });
  }

  try {
    const resExp = run(`
      INSERT INTO expenses (
        category, title, amount, expense_date, payment_method, recipient, reference_no, description, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      category, title, parseFloat(amount), expense_date, payment_method || 'Cash',
      recipient || null, reference_no || null, description || null, req.user.id
    ]);

    logAuditAction(req.user.id, 'CREATE_EXPENSE', 'expenses', resExp.lastInsertRowid, null, { title, amount, category }, req);

    return res.json({ success: true, message: 'Expense logged successfully', expenseId: resExp.lastInsertRowid });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Expense
router.delete('/:id', requirePermission('expenses', 'manage'), (req, res) => {
  const expenseId = req.params.id;
  const old = queryOne('SELECT * FROM expenses WHERE id = ?', [expenseId]);

  if (!old) {
    return res.status(404).json({ success: false, message: 'Expense record not found.' });
  }

  run('DELETE FROM expenses WHERE id = ?', [expenseId]);
  logAuditAction(req.user.id, 'DELETE_EXPENSE', 'expenses', expenseId, old, null, req);

  return res.json({ success: true, message: 'Expense record deleted successfully.' });
});

export default router;
