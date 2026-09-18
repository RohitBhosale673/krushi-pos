import express from 'express';
import { queryOne, queryAll } from '../db/connection.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// Executive Dashboard Analytics & KPIs
router.get('/dashboard', requirePermission('reports', 'view'), async (req, res) => {
  try {
    const { date_filter = 'today', start_date, end_date } = req.query;

    let dateCondition = "DATE(sale_date) = DATE('now')";
    let purchaseDateCondition = "DATE(purchase_date) = DATE('now')";
    let expenseDateCondition = "DATE(expense_date) = DATE('now')";

    if (date_filter === 'yesterday') {
      dateCondition = "DATE(sale_date) = DATE('now', '-1 day')";
      purchaseDateCondition = "DATE(purchase_date) = DATE('now', '-1 day')";
      expenseDateCondition = "DATE(expense_date) = DATE('now', '-1 day')";
    } else if (date_filter === 'week') {
      dateCondition = "sale_date >= DATE('now', '-7 days')";
      purchaseDateCondition = "purchase_date >= DATE('now', '-7 days')";
      expenseDateCondition = "expense_date >= DATE('now', '-7 days')";
    } else if (date_filter === 'month') {
      dateCondition = "sale_date >= DATE('now', '-30 days')";
      purchaseDateCondition = "purchase_date >= DATE('now', '-30 days')";
      expenseDateCondition = "expense_date >= DATE('now', '-30 days')";
    } else if (date_filter === 'custom' && start_date && end_date) {
      dateCondition = `DATE(sale_date) BETWEEN ? AND ?`;
    }

    const queryParams = (date_filter === 'custom' && start_date && end_date) ? [start_date, end_date] : [];

    // Sales Summary KPIs
    const salesKpi = await queryOne(`
      SELECT 
        COUNT(id) AS total_bills,
        COALESCE(SUM(grand_total), 0) AS total_sales,
        COALESCE(SUM(total_taxable), 0) AS total_taxable,
        COALESCE(SUM(total_tax), 0) AS total_tax,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(SUM(due_amount), 0) AS total_credit_sales
      FROM sales
      WHERE status = 'COMPLETED' AND ${dateCondition}
    `, queryParams);

    // Breakdown by Payment Method
    const paymentBreakdown = await queryAll(`
      SELECT sp.payment_method, COALESCE(SUM(sp.amount), 0) AS amount
      FROM sale_payments sp
      JOIN sales s ON sp.sale_id = s.id
      WHERE s.status = 'COMPLETED' AND ${dateCondition}
      GROUP BY sp.payment_method
    `, queryParams);

    let cashSales = 0;
    let upiSales = 0;
    paymentBreakdown.forEach(p => {
      if (p.payment_method === 'Cash') cashSales += p.amount;
      if (p.payment_method === 'UPI') upiSales += p.amount;
    });

    const udhRow = await queryOne("SELECT COALESCE(SUM(current_balance), 0) AS val FROM customers WHERE current_balance > 0");
    const totalUdhari = udhRow?.val || 0;

    const inventoryValuation = await queryOne(`
      SELECT 
        COALESCE(SUM(available_qty * purchase_rate), 0) AS purchase_value,
        COALESCE(SUM(available_qty * selling_rate), 0) AS selling_value
      FROM product_batches
      WHERE available_qty > 0 AND status != 'Blocked'
    `);

    const lowStockRow = await queryOne(`
      SELECT COUNT(DISTINCT p.id) AS cnt
      FROM products p
      LEFT JOIN product_batches pb ON p.id = pb.product_id AND pb.status != 'Blocked'
      GROUP BY p.id
      HAVING COALESCE(SUM(pb.available_qty), 0) <= p.min_stock
    `);
    const lowStockCount = lowStockRow?.cnt || 0;

    const expiringRow = await queryOne(`
      SELECT COUNT(*) AS cnt FROM product_batches 
      WHERE available_qty > 0 AND exp_date >= DATE('now') AND exp_date <= DATE('now', '+30 days')
    `);
    const expiringCount = expiringRow?.cnt || 0;

    const expiredRow = await queryOne(`
      SELECT COUNT(*) AS cnt FROM product_batches 
      WHERE available_qty > 0 AND exp_date < DATE('now')
    `);
    const expiredCount = expiredRow?.cnt || 0;

    const purchRow = await queryOne(`SELECT COALESCE(SUM(grand_total), 0) AS val FROM purchases WHERE ${purchaseDateCondition}`, queryParams);
    const totalPurchases = purchRow?.val || 0;

    const expRow = await queryOne(`SELECT COALESCE(SUM(amount), 0) AS val FROM expenses WHERE ${expenseDateCondition}`, queryParams);
    const totalExpenses = expRow?.val || 0;

    const topProducts = await queryAll(`
      SELECT p.name, SUM(si.qty) AS total_qty_sold, SUM(si.total_amount) AS total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.status = 'COMPLETED' AND ${dateCondition}
      GROUP BY p.id
      ORDER BY total_revenue DESC LIMIT 5
    `, queryParams);

    const recentSales = await queryAll(`
      SELECT s.id, s.invoice_no, s.sale_date, s.grand_total, s.payment_status, c.name AS customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      ORDER BY s.sale_date DESC LIMIT 10
    `);

    return res.json({
      success: true,
      dashboard: {
        sales: {
          total_sales: salesKpi?.total_sales || 0,
          total_bills: salesKpi?.total_bills || 0,
          total_taxable: salesKpi?.total_taxable || 0,
          total_tax: salesKpi?.total_tax || 0,
          cash_sales: cashSales,
          upi_sales: upiSales,
          credit_sales: salesKpi?.total_credit_sales || 0
        },
        udhari: {
          total_outstanding: totalUdhari
        },
        inventory: {
          purchase_value: inventoryValuation?.purchase_value || 0,
          selling_value: inventoryValuation?.selling_value || 0,
          low_stock_count: lowStockCount,
          expiring_count: expiringCount,
          expired_count: expiredCount
        },
        financials: {
          purchases: totalPurchases,
          expenses: totalExpenses,
          net_sales: (salesKpi?.total_sales || 0) - totalExpenses
        },
        topProducts,
        recentSales,
        paymentBreakdown
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Today's Sales Specific Detailed Report
router.get('/todays-sales', requirePermission('reports', 'view'), async (req, res) => {
  try {
    const sales = await queryAll(`
      SELECT s.*, c.name AS customer_name, c.mobile AS customer_mobile, u.full_name AS cashier_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE DATE(s.sale_date) = DATE('now')
      ORDER BY s.sale_date DESC
    `);

    const summary = await queryOne(`
      SELECT 
        COUNT(id) AS total_bills,
        COALESCE(SUM(grand_total), 0) AS total_sales,
        COALESCE(SUM(total_taxable), 0) AS total_taxable,
        COALESCE(SUM(total_tax), 0) AS total_tax,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(SUM(due_amount), 0) AS total_due
      FROM sales
      WHERE DATE(sale_date) = DATE('now') AND status = 'COMPLETED'
    `);

    const paymentBreakdown = await queryAll(`
      SELECT sp.payment_method, COALESCE(SUM(sp.amount), 0) AS total_amount
      FROM sale_payments sp
      JOIN sales s ON sp.sale_id = s.id
      WHERE DATE(s.sale_date) = DATE('now') AND s.status = 'COMPLETED'
      GROUP BY sp.payment_method
    `);

    const cashierBreakdown = await queryAll(`
      SELECT u.full_name AS cashier_name, COUNT(s.id) AS bill_count, COALESCE(SUM(s.grand_total), 0) AS total_sales
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE DATE(s.sale_date) = DATE('now') AND s.status = 'COMPLETED'
      GROUP BY s.cashier_id
    `);

    return res.json({ success: true, summary, sales, paymentBreakdown, cashierBreakdown });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// All Sales Report with Date & Status Filters
router.get('/sales', requirePermission('reports', 'view'), async (req, res) => {
  try {
    const { start_date, end_date, payment_status, customer_id, search } = req.query;

    let sql = `
      SELECT s.*, c.name AS customer_name, c.mobile AS customer_mobile, u.full_name AS cashier_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      sql += ` AND DATE(s.sale_date) >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      sql += ` AND DATE(s.sale_date) <= ?`;
      params.push(end_date);
    }

    if (payment_status) {
      sql += ` AND s.payment_status = ?`;
      params.push(payment_status);
    }

    if (customer_id) {
      sql += ` AND s.customer_id = ?`;
      params.push(customer_id);
    }

    if (search) {
      sql += ` AND (s.invoice_no LIKE ? OR c.name LIKE ? OR c.mobile LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ` ORDER BY s.sale_date DESC`;

    const sales = await queryAll(sql, params);

    let totSql = `
      SELECT 
        COUNT(s.id) AS total_bills,
        COALESCE(SUM(s.grand_total), 0) AS total_sales,
        COALESCE(SUM(s.total_tax), 0) AS total_tax,
        COALESCE(SUM(s.paid_amount), 0) AS total_paid,
        COALESCE(SUM(s.due_amount), 0) AS total_due
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE 1=1
    `;
    const totParams = [];
    if (start_date) {
      totSql += ' AND DATE(s.sale_date) >= ?';
      totParams.push(start_date);
    }
    if (end_date) {
      totSql += ' AND DATE(s.sale_date) <= ?';
      totParams.push(end_date);
    }

    const totals = await queryOne(totSql, totParams);

    return res.json({ success: true, totals, sales });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Profit & Loss Estimate Report
router.get('/profit-loss', requirePermission('reports', 'view'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateCondSales = "s.status = 'COMPLETED'";
    let dateCondExp = "1=1";
    const paramsSales = [];
    const paramsExp = [];

    if (start_date) {
      dateCondSales += " AND DATE(s.sale_date) >= ?";
      dateCondExp += " AND DATE(expense_date) >= ?";
      paramsSales.push(start_date);
      paramsExp.push(start_date);
    }

    if (end_date) {
      dateCondSales += " AND DATE(s.sale_date) <= ?";
      dateCondExp += " AND DATE(expense_date) <= ?";
      paramsSales.push(end_date);
      paramsExp.push(end_date);
    }

    const revenueData = await queryOne(`
      SELECT COALESCE(SUM(grand_total), 0) AS total_revenue,
             COALESCE(SUM(total_tax), 0) AS total_tax
      FROM sales s WHERE ${dateCondSales}
    `, paramsSales);

    // Estimate COGS (Cost of Goods Sold) based on batch purchase rates
    const cogsData = await queryOne(`
      SELECT COALESCE(SUM(si.qty * pb.purchase_rate), 0) AS total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN product_batches pb ON si.batch_id = pb.id
      WHERE ${dateCondSales}
    `, paramsSales);

    const expensesData = await queryOne(`
      SELECT COALESCE(SUM(amount), 0) AS total_expenses
      FROM expenses WHERE ${dateCondExp}
    `, paramsExp);

    const totalRevenue = revenueData?.total_revenue || 0;
    const totalCogs = cogsData?.total_cogs || 0;
    const totalExpenses = expensesData?.total_expenses || 0;

    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;

    return res.json({
      success: true,
      profitReport: {
        total_revenue: totalRevenue,
        total_cogs: totalCogs,
        gross_profit: grossProfit,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        margin_percent: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// CSV Export Helper Endpoint
router.get('/export/:type', requirePermission('reports', 'export'), async (req, res) => {
  try {
    const type = req.params.type;

    let filename = `KrushiPOS_${type}_${new Date().toISOString().split('T')[0]}.csv`;
    let csvContent = '';

    if (type === 'todays_sales') {
      const rows = await queryAll(`
        SELECT s.invoice_no, s.sale_date, COALESCE(c.name, 'Walk-in') AS customer, s.grand_total, s.total_tax, s.paid_amount, s.due_amount, s.payment_status
        FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE DATE(s.sale_date) = DATE('now') ORDER BY s.sale_date DESC
      `);
      csvContent = 'Invoice No,Sale Date,Customer,Grand Total (Rs),Tax (Rs),Paid Amount (Rs),Due Amount (Rs),Payment Status\n';
      rows.forEach(r => {
        csvContent += `"${r.invoice_no}","${r.sale_date}","${r.customer}",${r.grand_total},${r.total_tax},${r.paid_amount},${r.due_amount},"${r.payment_status}"\n`;
      });
    } else if (type === 'sales') {
      const rows = await queryAll(`
        SELECT s.invoice_no, s.sale_date, COALESCE(c.name, 'Walk-in') AS customer, s.grand_total, s.total_tax, s.paid_amount, s.due_amount, s.payment_status
        FROM sales s LEFT JOIN customers c ON s.customer_id = c.id ORDER BY s.sale_date DESC
      `);
      csvContent = 'Invoice No,Sale Date,Customer,Grand Total (Rs),Tax (Rs),Paid Amount (Rs),Due Amount (Rs),Payment Status\n';
      rows.forEach(r => {
        csvContent += `"${r.invoice_no}","${r.sale_date}","${r.customer}",${r.grand_total},${r.total_tax},${r.paid_amount},${r.due_amount},"${r.payment_status}"\n`;
      });
    } else if (type === 'inventory') {
      const rows = await queryAll(`
        SELECT p.product_code, p.name, c.name AS category, pb.batch_no, pb.exp_date, pb.available_qty, u.symbol AS unit, pb.purchase_rate, pb.selling_rate
        FROM products p
        JOIN product_batches pb ON p.id = pb.product_id
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN units u ON p.primary_unit_id = u.id
        ORDER BY p.name ASC, pb.exp_date ASC
      `);
      csvContent = 'Product Code,Product Name,Category,Batch No,Expiry Date,Available Qty,Unit,Purchase Rate (Rs),Selling Rate (Rs)\n';
      rows.forEach(r => {
        csvContent += `"${r.product_code}","${r.name}","${r.category || ''}","${r.batch_no}","${r.exp_date}",${r.available_qty},"${r.unit || ''}",${r.purchase_rate},${r.selling_rate}\n`;
      });
    } else if (type === 'udhar') {
      const rows = await queryAll(`
        SELECT name, mobile, village, taluka, customer_type, current_balance, credit_limit
        FROM customers WHERE current_balance > 0 ORDER BY current_balance DESC
      `);
      csvContent = 'Customer Name,Mobile,Village,Taluka,Type,Outstanding Balance (Rs),Credit Limit (Rs)\n';
      rows.forEach(r => {
        csvContent += `"${r.name}","${r.mobile}","${r.village || ''}","${r.taluka || ''}","${r.customer_type}",${r.current_balance},${r.credit_limit}\n`;
      });
    } else if (type === 'purchases') {
      const rows = await queryAll(`
        SELECT p.invoice_no, p.supplier_invoice_no, s.company_name AS supplier, p.purchase_date, p.grand_total, p.paid_amount, p.due_amount, p.payment_status
        FROM purchases p JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.purchase_date DESC
      `);
      csvContent = 'Purchase Inv,Supplier Inv,Supplier Name,Date,Grand Total (Rs),Paid Amount (Rs),Due Amount (Rs),Payment Status\n';
      rows.forEach(r => {
        csvContent += `"${r.invoice_no}","${r.supplier_invoice_no || ''}","${r.supplier}","${r.purchase_date}",${r.grand_total},${r.paid_amount},${r.due_amount},"${r.payment_status}"\n`;
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid export type specified.' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
