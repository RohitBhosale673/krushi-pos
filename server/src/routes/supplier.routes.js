import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Suppliers
router.get('/', requirePermission('suppliers', 'view'), async (req, res) => {
  try {
    const { search } = req.query;

    let sql = `SELECT * FROM suppliers WHERE 1=1`;
    const params = [];

    if (search) {
      sql += ` AND (name LIKE ? OR company_name LIKE ? OR mobile LIKE ? OR gstin LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ` ORDER BY company_name ASC`;

    const suppliers = await queryAll(sql, params);
    return res.json({ success: true, suppliers });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Single Supplier Details + Ledger
router.get('/:id', requirePermission('suppliers', 'view'), async (req, res) => {
  try {
    const suppId = req.params.id;
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [suppId]);

    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    const transactions = await queryAll(`
      SELECT st.*, u.username AS user_name
      FROM supplier_transactions st
      LEFT JOIN users u ON st.user_id = u.id
      WHERE st.supplier_id = ?
      ORDER BY st.created_at DESC
    `, [suppId]);

    const purchases = await queryAll(`
      SELECT id, invoice_no, purchase_date, grand_total, paid_amount, due_amount, payment_status
      FROM purchases
      WHERE supplier_id = ?
      ORDER BY purchase_date DESC LIMIT 20
    `, [suppId]);

    return res.json({ success: true, supplier, transactions, purchases });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create Supplier
router.post('/', requirePermission('suppliers', 'manage'), async (req, res) => {
  const {
    name, company_name, mobile, alt_mobile, email, address, gstin, state,
    opening_balance, credit_limit, payment_terms, notes
  } = req.body;

  if (!name || !company_name || !mobile) {
    return res.status(400).json({ success: false, message: 'Contact Name, Company Name, and Mobile are required.' });
  }

  try {
    let newSuppId;
    await transaction(async () => {
      const openBal = parseFloat(opening_balance) || 0;
      const resSupp = await run(`
        INSERT INTO suppliers (
          name, company_name, mobile, alt_mobile, email, address, gstin, state,
          opening_balance, current_balance, credit_limit, payment_terms, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name, company_name, mobile, alt_mobile || null, email || null, address || null,
        gstin || null, state || 'Maharashtra', openBal, openBal,
        parseFloat(credit_limit) || 500000, payment_terms || null, notes || null
      ]);

      newSuppId = resSupp.lastInsertRowid;

      if (openBal > 0) {
        await run(`
          INSERT INTO supplier_transactions (supplier_id, txn_type, amount, balance_after, payment_method, notes, user_id)
          VALUES (?, 'PURCHASE', ?, ?, 'Credit Note', 'Opening payable balance', ?)
        `, [newSuppId, openBal, openBal, req.user.id]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_SUPPLIER', 'suppliers', newSuppId, null, { name, company_name, mobile }, req);

    return res.json({ success: true, message: 'Supplier registered successfully', supplierId: newSuppId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Record Supplier Payment
router.post('/:id/pay', requirePermission('suppliers', 'manage'), async (req, res) => {
  const suppId = req.params.id;
  const { amount, payment_method, notes } = req.body;

  try {
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [suppId]);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive payment amount is required.' });
    }

    let newBalance;
    await transaction(async () => {
      newBalance = supplier.current_balance - payAmount;
      await run('UPDATE suppliers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, suppId]);

      await run(`
        INSERT INTO supplier_transactions (supplier_id, txn_type, amount, balance_after, payment_method, notes, user_id)
        VALUES (?, 'PAYMENT', ?, ?, ?, ?, ?)
      `, [suppId, payAmount, newBalance, payment_method || 'Cash', notes || 'Supplier payment', req.user.id]);
    });

    logAuditAction(req.user.id, 'PAY_SUPPLIER', 'suppliers', suppId, { prev: supplier.current_balance }, { amount: payAmount, newBalance }, req);

    return res.json({ success: true, message: 'Payment recorded successfully', newBalance });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
