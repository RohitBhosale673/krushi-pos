import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// Udhar Dashboard Summary & Aging Buckets
router.get('/summary', requirePermission('udhar', 'view'), (req, res) => {
  const summary = queryOne(`
    SELECT 
      COUNT(id) AS total_debtors,
      COALESCE(SUM(current_balance), 0) AS total_outstanding_udhari,
      COALESCE(SUM(credit_limit), 0) AS total_credit_limit
    FROM customers
    WHERE current_balance > 0
  `);

  // Calculate Aging Buckets using customer transaction dates
  const customers = queryAll(`
    SELECT c.id, c.name, c.mobile, c.village, c.taluka, c.customer_type, c.current_balance, c.credit_limit,
           (SELECT MAX(created_at) FROM customer_transactions WHERE customer_id = c.id AND txn_type = 'SALE') AS last_sale_date,
           CAST((JULIANDAY('now') - JULIANDAY(COALESCE((SELECT MAX(created_at) FROM customer_transactions WHERE customer_id = c.id AND txn_type = 'SALE'), c.created_at))) AS INTEGER) AS days_outstanding
    FROM customers c
    WHERE c.current_balance > 0
    ORDER BY c.current_balance DESC
  `);

  const agingBuckets = {
    current: 0,
    days_1_7: 0,
    days_8_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0
  };

  const categorizedCustomers = customers.map(c => {
    const days = c.days_outstanding || 0;
    let bucket = 'Current';

    if (days >= 90) {
      bucket = '90+ Days Overdue';
      agingBuckets.days_90_plus += c.current_balance;
    } else if (days >= 61) {
      bucket = '61-90 Days Overdue';
      agingBuckets.days_61_90 += c.current_balance;
    } else if (days >= 31) {
      bucket = '31-60 Days Overdue';
      agingBuckets.days_31_60 += c.current_balance;
    } else if (days >= 8) {
      bucket = '8-30 Days Overdue';
      agingBuckets.days_8_30 += c.current_balance;
    } else if (days >= 1) {
      bucket = '1-7 Days Overdue';
      agingBuckets.days_1_7 += c.current_balance;
    } else {
      agingBuckets.current += c.current_balance;
    }

    return { ...c, aging_bucket: bucket };
  });

  return res.json({ success: true, summary, agingBuckets, customers: categorizedCustomers });
});

// Receive Udhar Payment Collection
router.post('/collect', requirePermission('udhar', 'collect'), (req, res) => {
  const { customer_id, amount, payment_method, txn_ref, notes } = req.body;

  if (!customer_id || !amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Valid Customer ID and Payment Amount are required.' });
  }

  const customer = queryOne('SELECT * FROM customers WHERE id = ?', [customer_id]);
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Customer not found.' });
  }

  const payAmount = parseFloat(amount);

  try {
    let newBalance;
    transaction(() => {
      newBalance = Math.max(0, customer.current_balance - payAmount);
      run('UPDATE customers SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, customer_id]);

      run(`
        INSERT INTO customer_transactions (
          customer_id, txn_type, amount, balance_after, payment_method, ref_type, ref_id, notes, user_id
        ) VALUES (?, 'PAYMENT', ?, ?, ?, 'receipt', ?, ?, ?)
      `, [
        customer_id, payAmount, newBalance, payment_method || 'Cash', txn_ref || null,
        notes || 'Udhar collection payment', req.user.id
      ]);

      // Allocate payment to unpaid/partial sales invoices
      const unpaidSales = queryAll(`
        SELECT id, due_amount, paid_amount 
        FROM sales 
        WHERE customer_id = ? AND due_amount > 0 
        ORDER BY sale_date ASC
      `, [customer_id]);

      let remainingPayment = payAmount;
      for (const sale of unpaidSales) {
        if (remainingPayment <= 0) break;
        const offset = Math.min(sale.due_amount, remainingPayment);
        const newPaid = sale.paid_amount + offset;
        const newDue = sale.due_amount - offset;
        const newStatus = newDue === 0 ? 'PAID' : 'PARTIAL';

        run('UPDATE sales SET paid_amount = ?, due_amount = ?, payment_status = ? WHERE id = ?', [newPaid, newDue, newStatus, sale.id]);
        remainingPayment -= offset;
      }
    });

    logAuditAction(req.user.id, 'COLLECT_UDHAR', 'udhar', customer_id, { prevBal: customer.current_balance }, { payAmount, newBalance }, req);

    return res.json({
      success: true,
      message: `Payment of Rs.${payAmount} collected successfully. Remaining balance: Rs.${newBalance}`,
      newBalance
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
