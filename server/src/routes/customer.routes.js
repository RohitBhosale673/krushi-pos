import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List / Search Customers
router.get('/', requirePermission('customers', 'view'), async (req, res) => {
  try {
    const { search, village, taluka, customer_type } = req.query;

    let sql = `
      SELECT c.*,
             (SELECT COUNT(*) FROM sales WHERE customer_id = c.id) AS total_sales_count
      FROM customers c
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ` AND (c.name LIKE ? OR c.mobile LIKE ? OR c.village LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (village) {
      sql += ` AND c.village = ?`;
      params.push(village);
    }

    if (taluka) {
      sql += ` AND c.taluka = ?`;
      params.push(taluka);
    }

    if (customer_type) {
      sql += ` AND c.customer_type = ?`;
      params.push(customer_type);
    }

    sql += ` ORDER BY c.name ASC`;

    const customers = await queryAll(sql, params);
    return res.json({ success: true, customers });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Single Customer Details + Ledger History
router.get('/:id', requirePermission('customers', 'view'), async (req, res) => {
  try {
    const custId = req.params.id;
    const customer = await queryOne('SELECT * FROM customers WHERE id = ?', [custId]);

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const transactions = await queryAll(`
      SELECT ct.*, u.username AS user_name
      FROM customer_transactions ct
      LEFT JOIN users u ON ct.user_id = u.id
      WHERE ct.customer_id = ?
      ORDER BY ct.created_at DESC
    `, [custId]);

    const sales = await queryAll(`
      SELECT id, invoice_no, sale_date, grand_total, paid_amount, due_amount, payment_status
      FROM sales
      WHERE customer_id = ?
      ORDER BY sale_date DESC LIMIT 20
    `, [custId]);

    return res.json({ success: true, customer, transactions, sales });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create Customer
router.post('/', requirePermission('customers', 'manage'), async (req, res) => {
  const {
    name, mobile, alt_mobile, address, village, taluka, district, state,
    gstin, customer_type, opening_balance, credit_limit, notes
  } = req.body;

  if (!name || !mobile) {
    return res.status(400).json({ success: false, message: 'Customer Name and Mobile Number are required.' });
  }

  try {
    const existing = await queryOne('SELECT id FROM customers WHERE mobile = ?', [mobile]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Customer with this mobile number already exists.' });
    }

    let newCustId;
    await transaction(async () => {
      const openBal = parseFloat(opening_balance) || 0;
      const resCust = await run(`
        INSERT INTO customers (
          name, mobile, alt_mobile, address, village, taluka, district, state,
          gstin, customer_type, opening_balance, current_balance, credit_limit, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name, mobile, alt_mobile || null, address || null, village || null, taluka || null,
        district || 'Nashik', state || 'Maharashtra', gstin || null,
        customer_type || 'Farmer', openBal, openBal, parseFloat(credit_limit) || 50000, notes || null
      ]);

      newCustId = resCust.lastInsertRowid;

      if (openBal > 0) {
        await run(`
          INSERT INTO customer_transactions (customer_id, txn_type, amount, balance_after, payment_method, notes, user_id)
          VALUES (?, 'SALE', ?, ?, 'Credit', 'Opening udhari balance', ?)
        `, [newCustId, openBal, openBal, req.user.id]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_CUSTOMER', 'customers', newCustId, null, { name, mobile, openBal }, req);

    return res.json({ success: true, message: 'Customer added successfully', customerId: newCustId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update Customer
router.put('/:id', requirePermission('customers', 'manage'), async (req, res) => {
  const custId = req.params.id;
  try {
    const oldCust = await queryOne('SELECT * FROM customers WHERE id = ?', [custId]);

    if (!oldCust) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const {
      name, mobile, alt_mobile, address, village, taluka, district, state,
      gstin, customer_type, credit_limit, notes, is_active
    } = req.body;

    await run(`
      UPDATE customers SET
        name = COALESCE(?, name),
        mobile = COALESCE(?, mobile),
        alt_mobile = COALESCE(?, alt_mobile),
        address = COALESCE(?, address),
        village = COALESCE(?, village),
        taluka = COALESCE(?, taluka),
        district = COALESCE(?, district),
        state = COALESCE(?, state),
        gstin = COALESCE(?, gstin),
        customer_type = COALESCE(?, customer_type),
        credit_limit = COALESCE(?, credit_limit),
        notes = COALESCE(?, notes),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name, mobile, alt_mobile, address, village, taluka, district, state,
      gstin, customer_type, credit_limit, notes, is_active, custId
    ]);

    logAuditAction(req.user.id, 'UPDATE_CUSTOMER', 'customers', custId, oldCust, req.body, req);

    return res.json({ success: true, message: 'Customer updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
