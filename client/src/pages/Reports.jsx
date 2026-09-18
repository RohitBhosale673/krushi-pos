import React, { useState, useEffect } from 'react';
import {
  PieChart, FileSpreadsheet, Download, Calendar, DollarSign, TrendingUp,
  ShoppingBag, CreditCard, Package, Users, Truck, Filter, Printer, RefreshCw, Eye
} from 'lucide-react';
import { apiRequest, getAuthToken } from '../api';

export default function Reports({ showToast }) {
  const [activeTab, setActiveTab] = useState('todays_sales'); // 'todays_sales', 'all_sales', 'profit_loss', 'purchases', 'inventory', 'udhar'

  // Today's Sales Data
  const [todaysData, setTodaysData] = useState(null);
  const [todaysLoading, setTodaysLoading] = useState(false);

  // All Sales Data
  const [allSales, setAllSales] = useState([]);
  const [salesTotals, setSalesTotals] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [salesSearch, setSalesSearch] = useState('');
  const [salesLoading, setSalesLoading] = useState(false);

  // Profit Loss Data
  const [profitReport, setProfitReport] = useState(null);
  const [profitLoading, setProfitLoading] = useState(false);

  // CSV Export Trigger
  const handleExportCSV = (type) => {
    const token = getAuthToken();
    const url = `/api/reports/export/${type}?token=${token}`;
    window.open(url, '_blank');
    showToast(`Downloading ${type} CSV report...`, 'info');
  };

  // Fetch Today's Sales
  const fetchTodaysSales = async () => {
    setTodaysLoading(true);
    try {
      const res = await apiRequest('/reports/todays-sales');
      if (res.success) {
        setTodaysData(res);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setTodaysLoading(false);
    }
  };

  // Fetch All Sales
  const fetchAllSales = async () => {
    setSalesLoading(true);
    try {
      let query = `?search=${encodeURIComponent(salesSearch)}`;
      if (startDate) query += `&start_date=${startDate}`;
      if (endDate) query += `&end_date=${endDate}`;
      if (paymentStatus) query += `&payment_status=${paymentStatus}`;

      const res = await apiRequest(`/reports/sales${query}`);
      if (res.success) {
        setAllSales(res.sales || []);
        setSalesTotals(res.totals);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalesLoading(false);
    }
  };

  // Fetch Profit & Loss Report
  const fetchProfitLoss = async () => {
    setProfitLoading(true);
    try {
      let query = '';
      if (startDate && endDate) query = `?start_date=${startDate}&end_date=${endDate}`;
      const res = await apiRequest(`/reports/profit-loss${query}`);
      if (res.success) {
        setProfitReport(res.profitReport);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setProfitLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'todays_sales') fetchTodaysSales();
    if (activeTab === 'all_sales') fetchAllSales();
    if (activeTab === 'profit_loss') fetchProfitLoss();
  }, [activeTab]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Reports & Business Intelligence</h1>
          <p className="text-xs text-slate-500">Comprehensive sales, GST tax, profit/loss, inventory, and Udhar reports</p>
        </div>

        {/* Quick CSV Export Toolbar */}
        <div className="flex items-center gap-2">
          <button onClick={() => handleExportCSV('todays_sales')} className="btn-success text-xs py-1.5 px-3">
            <Download className="w-3.5 h-3.5" /> Today's Sales CSV
          </button>
          <button onClick={() => handleExportCSV('sales')} className="btn-primary text-xs py-1.5 px-3">
            <Download className="w-3.5 h-3.5" /> All Sales CSV
          </button>
          <button onClick={() => handleExportCSV('inventory')} className="btn-secondary text-xs py-1.5 px-3">
            <Download className="w-3.5 h-3.5" /> Inventory CSV
          </button>
        </div>
      </div>

      {/* Main Report Navigation Tabs */}
      <div className="flex items-center gap-2 border-b overflow-x-auto pb-1 text-xs">
        {[
          { id: 'todays_sales', label: "Today's Sales Report", icon: ShoppingBag },
          { id: 'all_sales', label: 'All Sales & Invoices', icon: FileSpreadsheet },
          { id: 'profit_loss', label: 'Profit & Loss Estimate', icon: TrendingUp },
          { id: 'inventory', label: 'Stock & Batch Valuation', icon: Package },
          { id: 'udhar', label: 'Udhar & Aging Ledger', icon: CreditCard }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-bold transition shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white border-b-2 border-emerald-500'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: TODAY'S SALES REPORT */}
      {activeTab === 'todays_sales' && (
        <div className="space-y-6">
          {/* Today Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-panel p-4 bg-emerald-50 border-emerald-200">
              <p className="text-xs font-semibold text-emerald-800 uppercase">Today's Total Sales</p>
              <h3 className="text-2xl font-black text-emerald-950 mt-1">
                Rs.{todaysData?.summary?.total_sales?.toLocaleString('en-IN') || 0}
              </h3>
              <p className="text-xs text-emerald-700 mt-1 font-semibold">{todaysData?.summary?.total_bills || 0} Bills Completed</p>
            </div>

            <div className="card-panel p-4 bg-blue-50 border-blue-200">
              <p className="text-xs font-semibold text-blue-800 uppercase">Total GST Tax Collected</p>
              <h3 className="text-2xl font-black text-blue-950 mt-1">
                Rs.{todaysData?.summary?.total_tax?.toLocaleString('en-IN') || 0}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Taxable: Rs.{todaysData?.summary?.total_taxable?.toLocaleString('en-IN') || 0}</p>
            </div>

            <div className="card-panel p-4 bg-slate-50 border-slate-200">
              <p className="text-xs font-semibold text-slate-600 uppercase">Cash & UPI Received</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                Rs.{todaysData?.summary?.total_paid?.toLocaleString('en-IN') || 0}
              </h3>
            </div>

            <div className="card-panel p-4 bg-amber-50 border-amber-200">
              <p className="text-xs font-semibold text-amber-800 uppercase">Today's Credit / Udhar</p>
              <h3 className="text-2xl font-black text-amber-950 mt-1">
                Rs.{todaysData?.summary?.total_due?.toLocaleString('en-IN') || 0}
              </h3>
            </div>
          </div>

          {/* Today's Sales Table */}
          <div className="card-panel p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="font-bold text-slate-900 text-sm">Today's Sales Invoice Log</h2>
              <button onClick={fetchTodaysSales} className="btn-secondary text-xs py-1 px-2.5">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer Name</th>
                  <th>Cashier</th>
                  <th className="text-right">Taxable (Rs)</th>
                  <th className="text-right">GST Tax (Rs)</th>
                  <th className="text-right">Grand Total (Rs)</th>
                  <th className="text-right">Paid (Rs)</th>
                  <th className="text-right">Due (Rs)</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!todaysData || todaysData.sales.length === 0 ? (
                  <tr><td colSpan="9" className="text-center py-6 text-slate-400">No sales completed today.</td></tr>
                ) : (
                  todaysData.sales.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono font-bold text-xs text-slate-900">{s.invoice_no}</td>
                      <td className="font-bold text-xs text-slate-800">{s.customer_name || 'Walk-in Customer'}</td>
                      <td className="text-xs text-slate-600">{s.cashier_name || 'Admin'}</td>
                      <td className="text-right text-xs">Rs.{s.total_taxable}</td>
                      <td className="text-right text-xs">Rs.{s.total_tax}</td>
                      <td className="text-right font-extrabold text-xs text-slate-900">Rs.{s.grand_total}</td>
                      <td className="text-right text-xs text-emerald-700 font-semibold">Rs.{s.paid_amount}</td>
                      <td className="text-right text-xs text-red-600 font-bold">Rs.{s.due_amount}</td>
                      <td className="text-center">
                        <span className={s.payment_status === 'PAID' ? 'badge-active' : s.payment_status === 'PARTIAL' ? 'badge-warning' : 'badge-danger'}>
                          {s.payment_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ALL SALES & INVOICES REPORT */}
      {activeTab === 'all_sales' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="card-panel p-4 bg-slate-50 flex flex-col sm:flex-row gap-3 items-center">
            <div className="flex-1 w-full">
              <input
                type="text"
                value={salesSearch}
                onChange={e => setSalesSearch(e.target.value)}
                placeholder="Search Invoice #, Customer Name, Mobile..."
                className="w-full border rounded-lg px-3 py-2 text-xs bg-white"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded px-2 py-1.5 bg-white" />
              <span>to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded px-2 py-1.5 bg-white" />
              <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="border rounded px-2 py-1.5 bg-white font-semibold">
                <option value="">All Statuses</option>
                <option value="PAID">PAID</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="CREDIT">CREDIT</option>
              </select>
              <button onClick={fetchAllSales} className="btn-primary py-1.5 px-3">
                <Filter className="w-3.5 h-3.5" /> Apply
              </button>
            </div>
          </div>

          {/* Sales Summary Grid */}
          {salesTotals && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-white border rounded-xl shadow-2xs">
                <p className="text-slate-500 font-semibold">Total Invoices</p>
                <h4 className="text-xl font-black text-slate-900 mt-1">{salesTotals.total_bills}</h4>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-emerald-800 font-semibold">Filtered Revenue</p>
                <h4 className="text-xl font-black text-emerald-950 mt-1">Rs.{salesTotals.total_sales?.toLocaleString('en-IN')}</h4>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-blue-800 font-semibold">Total GST Tax</p>
                <h4 className="text-xl font-black text-blue-950 mt-1">Rs.{salesTotals.total_tax?.toLocaleString('en-IN')}</h4>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-800 font-semibold">Outstanding Due</p>
                <h4 className="text-xl font-black text-red-950 mt-1">Rs.{salesTotals.total_due?.toLocaleString('en-IN')}</h4>
              </div>
            </div>
          )}

          {/* GST Audit Breakdown Table */}
      <div className="card-panel overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date & Time</th>
                  <th>Customer Name</th>
                  <th>Cashier</th>
                  <th className="text-right">Grand Total (Rs)</th>
                  <th className="text-right">Paid (Rs)</th>
                  <th className="text-right">Due (Rs)</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allSales.length === 0 ? (
                  <tr><td colSpan="8" className="text-center py-6 text-slate-400">No invoices match criteria.</td></tr>
                ) : (
                  allSales.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono font-bold text-xs text-slate-900">{s.invoice_no}</td>
                      <td className="text-xs text-slate-500 font-mono">{new Date(s.sale_date).toLocaleString('en-IN')}</td>
                      <td className="font-bold text-xs text-slate-800">{s.customer_name || 'Walk-in Customer'}</td>
                      <td className="text-xs text-slate-600">{s.cashier_name || 'Admin'}</td>
                      <td className="text-right font-extrabold text-xs text-slate-900">Rs.{s.grand_total}</td>
                      <td className="text-right text-xs text-emerald-700 font-semibold">Rs.{s.paid_amount}</td>
                      <td className="text-right text-xs text-red-600 font-bold">Rs.{s.due_amount}</td>
                      <td className="text-center">
                        <span className={s.payment_status === 'PAID' ? 'badge-active' : s.payment_status === 'PARTIAL' ? 'badge-warning' : 'badge-danger'}>
                          {s.payment_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PROFIT & LOSS ESTIMATE REPORT */}
      {activeTab === 'profit_loss' && (
        <div className="space-y-6">
          {profitReport && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card-panel p-6 space-y-4 bg-slate-900 text-white shadow-xl">
                <h2 className="font-bold text-lg text-emerald-400 border-b border-slate-800 pb-2">Financial Profit & Loss Statement</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Total Sales Revenue:</span>
                    <span className="font-bold text-white">Rs.{profitReport.total_revenue?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2 text-red-300">
                    <span>Estimated Cost of Goods Sold (COGS):</span>
                    <span>- Rs.{profitReport.total_cogs?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2 font-bold text-emerald-300">
                    <span>Estimated Gross Profit:</span>
                    <span>Rs.{profitReport.gross_profit?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2 text-amber-300">
                    <span>Total Operational Expenses:</span>
                    <span>- Rs.{profitReport.total_expenses?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-black text-lg pt-2 text-emerald-400">
                    <span>Estimated Net Profit:</span>
                    <span>Rs.{profitReport.net_profit?.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              <div className="card-panel p-6 space-y-4 bg-emerald-50 border border-emerald-200">
                <h2 className="font-bold text-lg text-emerald-950 border-b border-emerald-200 pb-2">Profitability Performance Metrics</h2>
                <div className="space-y-4 text-xs">
                  <div>
                    <p className="text-emerald-800 font-semibold uppercase">Net Profit Margin</p>
                    <h3 className="text-4xl font-black text-emerald-950 mt-1">{profitReport.margin_percent}%</h3>
                    <p className="text-emerald-700 mt-1">Calculated after deducting COGS and store expenses</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INVENTORY VALUATION REPORT */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="card-panel p-5 bg-blue-50 border-blue-200 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-blue-950 text-base">Inventory Valuation Summary</h2>
              <p className="text-xs text-blue-800">Export complete batch-wise stock valuation data</p>
            </div>
            <button onClick={() => handleExportCSV('inventory')} className="btn-primary">
              <Download className="w-4 h-4" /> Download Inventory CSV
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: UDHAR & AGING REPORT */}
      {activeTab === 'udhar' && (
        <div className="space-y-4">
          <div className="card-panel p-5 bg-red-50 border-red-200 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-red-950 text-base">Udhar & Debtor Ledger Summary</h2>
              <p className="text-xs text-red-800">Export active farmer debtor accounts and mobile contact lists</p>
            </div>
            <button onClick={() => handleExportCSV('udhar')} className="btn-danger">
              <Download className="w-4 h-4" /> Download Udhar CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
