import React, { useState, useEffect } from 'react';
import {
  TrendingUp, ShoppingBag, CreditCard, Wallet, AlertTriangle, Clock,
  Package, DollarSign, Calendar, ArrowUpRight, ArrowDownRight, RefreshCw,
  Zap, Plus, FileText, Users, ChevronRight, CheckCircle2
} from 'lucide-react';
import { apiRequest } from '../api';

export default function Dashboard({ onNavigate, showToast }) {
  const [dateFilter, setDateFilter] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      let query = `?date_filter=${dateFilter}`;
      if (dateFilter === 'custom' && startDate && endDate) {
        query += `&start_date=${startDate}&end_date=${endDate}`;
      }

      const res = await apiRequest(`/reports/dashboard${query}`);
      if (res.success) {
        setData(res.dashboard);
      }
    } catch (err) {
      showToast(err.message || 'Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [dateFilter, startDate, endDate]);

  if (loading && !data) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="font-semibold text-xs text-slate-600">Loading Enterprise Analytics...</span>
      </div>
    );
  }

  const { sales, udhari, inventory, financials, topProducts = [], recentSales = [] } = data || {};

  return (
    <div className="p-5 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* 1. Header Bar & Date Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Executive Dashboard</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
              Live Feed
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Real-time revenue, stock valuation, and farmer credit overview</p>
        </div>

        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
          {['today', 'yesterday', 'week', 'month', 'custom'].map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition cursor-pointer ${
                dateFilter === f
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : f}
            </button>
          ))}

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 pl-2 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. Quick Cashier Action Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => onNavigate('pos')}
          className="p-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl shadow-sm flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
            <div className="text-left">
              <p className="font-extrabold text-xs">New Billing Sale</p>
              <p className="text-[10px] text-emerald-200">Open Cashier Terminal</p>
            </div>
          </div>
          <kbd className="kbd-chip kbd-chip-dark text-[10px] bg-emerald-900 border-emerald-700 text-white">F2</kbd>
        </button>

        <button
          onClick={() => onNavigate('purchases')}
          className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-2xs flex items-center gap-2.5 transition cursor-pointer"
        >
          <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
            <Package className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="font-bold text-xs text-slate-800">New Purchase</p>
            <p className="text-[10px] text-slate-400">Add Stock & Batches</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate('udhar')}
          className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-2xs flex items-center gap-2.5 transition cursor-pointer"
        >
          <div className="p-2 bg-red-50 text-red-700 rounded-lg">
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="font-bold text-xs text-slate-800">Udhar Collection</p>
            <p className="text-[10px] text-slate-400">Farmer Credit Ledger</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate('reports')}
          className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-2xs flex items-center gap-2.5 transition cursor-pointer"
        >
          <div className="p-2 bg-purple-50 text-purple-700 rounded-lg">
            <FileText className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="font-bold text-xs text-slate-800">GST Reports</p>
            <p className="text-[10px] text-slate-400">GSTR-1 & Financials</p>
          </div>
        </button>
      </div>

      {/* 3. Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="card-panel p-4.5 flex items-center justify-between border-t-4 border-t-emerald-600 shadow-sm">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gross Period Sales</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1 font-mono tracking-tight">
              ₹{sales?.total_sales?.toLocaleString('en-IN') || 0}
            </h3>
            <p className="text-xs text-emerald-700 font-semibold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{sales?.total_bills || 0} Invoices Generated</span>
            </p>
          </div>
          <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl border border-emerald-200/80">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Outstanding Udhari */}
        <div className="card-panel p-4.5 flex items-center justify-between border-t-4 border-t-red-600 shadow-sm">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Farmer Udhar</p>
            <h3 className="text-2xl font-black text-red-600 mt-1 font-mono tracking-tight">
              ₹{udhari?.total_outstanding?.toLocaleString('en-IN') || 0}
            </h3>
            <button
              onClick={() => onNavigate('udhar')}
              className="text-xs text-red-600 font-bold hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View Aging Ledger</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="bg-red-50 text-red-700 p-3 rounded-xl border border-red-200/80">
            <CreditCard className="w-6 h-6" />
          </div>
        </div>

        {/* Stock Valuation */}
        <div className="card-panel p-4.5 flex items-center justify-between border-t-4 border-t-blue-600 shadow-sm">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Stock Valuation (Retail)</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1 font-mono tracking-tight">
              ₹{inventory?.selling_value?.toLocaleString('en-IN') || 0}
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Cost: ₹{inventory?.purchase_value?.toLocaleString('en-IN') || 0}
            </p>
          </div>
          <div className="bg-blue-50 text-blue-700 p-3 rounded-xl border border-blue-200/80">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Expenses & Net Period Margin */}
        <div className="card-panel p-4.5 flex items-center justify-between border-t-4 border-t-amber-600 shadow-sm">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Period Expenses</p>
            <h3 className="text-2xl font-black text-amber-700 mt-1 font-mono tracking-tight">
              ₹{financials?.expenses?.toLocaleString('en-IN') || 0}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Net Margin: <strong className="text-slate-900 font-mono">₹{financials?.net_sales?.toLocaleString('en-IN') || 0}</strong>
            </p>
          </div>
          <div className="bg-amber-50 text-amber-700 p-3 rounded-xl border border-amber-200/80">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 4. Payment Collection Breakdown & Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Collection Cards */}
        <div className="card-panel p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <span>Tender Collection Breakdown</span>
            </h2>
            <span className="text-[10px] font-mono text-slate-400">POS Receipts</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Cash Tender:
              </span>
              <span className="font-bold font-mono text-slate-900 text-sm">
                ₹{sales?.cash_sales?.toLocaleString('en-IN') || 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> UPI / QR Code:
              </span>
              <span className="font-bold font-mono text-slate-900 text-sm">
                ₹{sales?.upi_sales?.toLocaleString('en-IN') || 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-3 bg-amber-50/70 rounded-xl border border-amber-200">
              <span className="font-semibold text-amber-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Credit / Udhar Sale:
              </span>
              <span className="font-bold font-mono text-amber-950 text-sm">
                ₹{sales?.credit_sales?.toLocaleString('en-IN') || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Stock Alerts & FEFO Warning Panel */}
        <div className="card-panel p-5 space-y-4 lg:col-span-2">
          <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Critical Inventory & Expiry Alerts</span>
            </h2>
            <button onClick={() => onNavigate('batches')} className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer">
              FEFO Console →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div
              onClick={() => onNavigate('products')}
              className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/80 transition"
            >
              <p className="text-xs font-bold text-amber-800">Low Stock Reorder</p>
              <h4 className="text-2xl font-black text-amber-900 mt-1 font-mono">{inventory?.low_stock_count || 0} Items</h4>
              <p className="text-[10px] text-amber-700 mt-1">Below minimum threshold</p>
            </div>

            <div
              onClick={() => onNavigate('batches')}
              className="p-4 bg-orange-50/70 border border-orange-200 rounded-xl cursor-pointer hover:bg-orange-100/80 transition"
            >
              <p className="text-xs font-bold text-orange-800">Near Expiry (&lt;30d)</p>
              <h4 className="text-2xl font-black text-orange-900 mt-1 font-mono">{inventory?.expiring_count || 0} Batches</h4>
              <p className="text-[10px] text-orange-700 mt-1">Prioritize in POS checkout</p>
            </div>

            <div
              onClick={() => onNavigate('batches')}
              className="p-4 bg-red-50/70 border border-red-200 rounded-xl cursor-pointer hover:bg-red-100/80 transition"
            >
              <p className="text-xs font-bold text-red-800">Expired Batches</p>
              <h4 className="text-2xl font-black text-red-900 mt-1 font-mono">{inventory?.expired_count || 0} Batches</h4>
              <p className="text-[10px] text-red-700 mt-1">Blocked from cashier sale</p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Top Products & Recent Invoices Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <div className="card-panel p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
            <h2 className="font-bold text-slate-900 text-sm">Top Selling Products</h2>
            <span className="text-[10px] text-slate-400 font-mono">By Revenue</span>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Product Description</th>
                <th className="text-right">Qty Sold</th>
                <th className="text-right">Revenue (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProducts.length === 0 ? (
                <tr><td colSpan="3" className="text-center py-6 text-slate-400">No product sales in this period.</td></tr>
              ) : (
                topProducts.map((p, idx) => (
                  <tr key={idx}>
                    <td className="font-semibold text-slate-900 text-xs">{p.name}</td>
                    <td className="text-right font-mono font-semibold text-emerald-700 text-xs">{p.total_qty_sold}</td>
                    <td className="text-right font-mono font-bold text-slate-900 text-xs">₹{p.total_revenue?.toLocaleString('en-IN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Recent Invoices */}
        <div className="card-panel p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-200/80 pb-3">
            <h2 className="font-bold text-slate-900 text-sm">Recent POS Invoices</h2>
            <button onClick={() => onNavigate('pos')} className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer">
              Open POS Billing →
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Farmer / Customer</th>
                <th className="text-right">Total (₹)</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentSales.length === 0 ? (
                <tr><td colSpan="4" className="text-center py-6 text-slate-400">No recent transactions.</td></tr>
              ) : (
                recentSales.map((s) => (
                  <tr key={s.id}>
                    <td className="font-mono font-bold text-slate-900 text-xs">{s.invoice_no}</td>
                    <td className="text-slate-600 text-xs font-medium">{s.customer_name || 'Walk-in'}</td>
                    <td className="text-right font-mono font-bold text-xs text-slate-900">₹{s.grand_total}</td>
                    <td className="text-center">
                      <span className={s.payment_status === 'PAID' ? 'badge-paid' : s.payment_status === 'PARTIAL' ? 'badge-partial' : 'badge-unpaid'}>
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
  );
}
