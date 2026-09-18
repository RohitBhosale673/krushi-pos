import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Suppliers
router.get('/', requirePermission('suppliers', 'view'), async (req, res) => {
  try {
    const { search } = req.query;
    const tenantScope = getTenantScope(req);

    let sql = `SELECT * FROM suppliers WHERE 1=1`;
    const params = [];

    if (tenantScope !== null) {
      sql += ` AND tenant_id = ?`;
      params.push(tenantScope);
    }

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
    const tenantScope = getTenantScope(req);

    let sql = 'SELECT * FROM suppliers WHERE id = ?';
    const params = [suppId];
    if (tenantScope !== null) {
      sql += ' AND tenant_id = ?';
      params.push(tenantScope);
    }

    const supplier = await queryOne(sql, params);

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
    name, company_name, mobile, alt_mobile, email, address,
    gstin, state, opening_balance, credit_limit, payment_terms, notes
  } = req.body;

  if (!name || !company_name || !mobile) {
    return res.status(400).json({ success: false, message: 'Supplier Name, Company Name, and Mobile Number are required.' });
  }

  try {
    const tenantScope = getTenantScope(req);
    const assignedTenantId = tenantScope !== null ? tenantScope : (req.body.tenant_id || 1);

    let newSuppId;
    await transaction(async () => {
      const openBal = parseFloat(opening_balance) || 0;
      const resSupp = await run(`
        INSERT INTO suppliers (
          tenant_id, name, company_name, mobile, alt_mobile, email, address,
          gstin, state, opening_balance, current_balance, credit_limit, payment_terms, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        assignedTenantId, name, company_name, mobile, alt_mobile || null, email || null, address || null,
        gstin || null, state || 'Maharashtra', openBal, openBal, parseFloat(credit_limit) || 500000,
        payment_terms || null, notes || null
      ]);

      newSuppId = resSupp.lastInsertRowid;

      if (openBal > 0) {
        await run(`
          INSERT INTO supplier_transactions (tenant_id, supplier_id, txn_type, amount, balance_after, notes, user_id)
          VALUES (?, ?, 'PURCHASE', ?, ?, 'Opening Payable Balance', ?)
        `, [assignedTenantId, newSuppId, openBal, openBal, req.user.id]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_SUPPLIER', 'suppliers', newSuppId, null, { name, company_name }, req);

    return res.json({ success: true, message: 'Supplier created successfully', supplierId: newSuppId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update Supplier
router.put('/:id', requirePermission('suppliers', 'manage'), async (req, res) => {
  const suppId = req.params.id;
  const tenantScope = getTenantScope(req);

  try {
    let checkSql = 'SELECT * FROM suppliers WHERE id = ?';
    const checkParams = [suppId];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const oldSupp = await queryOne(checkSql, checkParams);
    if (!oldSupp) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    const {
      name, company_name, mobile, alt_mobile, email, address,
      gstin, state, credit_limit, payment_terms, notes, is_active
    } = req.body;

    await run(`
      UPDATE suppliers SET
        name = COALESCE(?, name),
        company_name = COALESCE(?, company_name),
        mobile = COALESCE(?, mobile),
        alt_mobile = COALESCE(?, alt_mobile),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        gstin = COALESCE(?, gstin),
        state = COALESCE(?, state),
        credit_limit = COALESCE(?, credit_limit),
        payment_terms = COALESCE(?, payment_terms),
        notes = COALESCE(?, notes),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name, company_name, mobile, alt_mobile, email, address,
      gstin, state, credit_limit, payment_terms, notes, is_active, suppId
    ]);

    logAuditAction(req.user.id, 'UPDATE_SUPPLIER', 'suppliers', suppId, oldSupp, req.body, req);

    return res.json({ success: true, message: 'Supplier updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Record Supplier Payment
router.post('/:id/payment', requirePermission('suppliers', 'manage'), async (req, res) => {
  const suppId = req.params.id;
  const { amount, payment_method = 'Cash', notes, ref_id } = req.body;
  const tenantScope = getTenantScope(req);

  const payAmt = parseFloat(amount);
  if (isNaN(payAmt) || payAmt <= 0) {
    return res.status(400).json({ success: false, message: 'Valid payment amount required.' });
  }

  try {
    let checkSql = 'SELECT * FROM suppliers WHERE id = ?';
    const checkParams = [suppId];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const supplier = await queryOne(checkSql, checkParams);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    let newBal = 0;
    await transaction(async () => {
      newBal = supplier.current_balance - payAmt;
      await run('UPDATE suppliers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBal, suppId]);

      await run(`
        INSERT INTO supplier_transactions (tenant_id, supplier_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id)
        VALUES (?, ?, 'PAYMENT', ?, ?, ?, 'manual_payment', ?, ?, ?)
      `, [supplier.tenant_id, suppId, payAmt, newBal, payment_method, ref_id || null, notes || null, req.user.id]);
    });

    logAuditAction(req.user.id, 'PAY_SUPPLIER', 'suppliers', suppId, null, { amount: payAmt, newBal }, req);

    return res.json({
      success: true,
      message: `Payment of Rs.${payAmt} recorded. Remaining balance: Rs.${newBal}`,
      balance: newBal
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
