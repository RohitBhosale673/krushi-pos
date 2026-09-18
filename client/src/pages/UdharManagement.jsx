import React, { useState, useEffect } from 'react';
import { CreditCard, AlertCircle, DollarSign, Calendar, MessageSquare, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../api';

export default function UdharManagement({ onNavigate, showToast }) {
  const [summary, setSummary] = useState(null);
  const [buckets, setBuckets] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [collectModalCust, setCollectModalCust] = useState(null);

  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState('Cash');
  const [collectNotes, setCollectNotes] = useState('');

  const fetchUdharData = async () => {
    try {
      const res = await apiRequest('/udhar/summary');
      if (res.success) {
        setSummary(res.summary);
        setBuckets(res.agingBuckets);
        setCustomers(res.customers || []);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchUdharData();
  }, []);

  const handleCollect = async (e) => {
    e.preventDefault();
    if (!collectModalCust || !collectAmount) return;

    try {
      const res = await apiRequest('/udhar/collect', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: collectModalCust.id,
          amount: collectAmount,
          payment_method: collectMethod,
          notes: collectNotes
        })
      });

      if (res.success) {
        showToast(res.message, 'success');
        setCollectModalCust(null);
        setCollectAmount('');
        setCollectNotes('');
        fetchUdharData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Udhar & Credit Management</h1>
          <p className="text-xs text-slate-500">Aging analysis breakdown and collection receipt processing</p>
        </div>
        <button onClick={() => onNavigate('sms')} className="btn-primary">
          <MessageSquare className="w-4 h-4" /> Bulk SMS Reminders
        </button>
      </div>

      {/* Udhar Executive Metric Header */}
      <div className="card-panel p-5 bg-gradient-to-r from-red-900 to-slate-900 text-white flex justify-between items-center shadow-lg">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-red-300">Total Outstanding Store Udhari</p>
          <h2 className="text-3xl font-black text-white mt-1">
            Rs.{summary?.total_outstanding_udhari?.toLocaleString('en-IN') || 0}
          </h2>
          <p className="text-xs text-slate-300 mt-1">{summary?.total_debtors || 0} Farmer Debtors with pending dues</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Total Credit Exposure Limit</p>
          <p className="text-lg font-bold text-slate-200">Rs.{summary?.total_credit_limit?.toLocaleString('en-IN') || 0}</p>
        </div>
      </div>

      {/* Aging Buckets Grid */}
      {buckets && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-white border rounded-xl shadow-2xs">
            <p className="font-semibold text-slate-500">Current (0 Days)</p>
            <p className="font-black text-sm text-slate-900 mt-1">Rs.{buckets.current?.toLocaleString('en-IN')}</p>
          </div>
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <p className="font-semibold text-emerald-800">1-7 Days Overdue</p>
            <p className="font-black text-sm text-emerald-950 mt-1">Rs.{buckets.days_1_7?.toLocaleString('en-IN')}</p>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="font-semibold text-amber-800">8-30 Days Overdue</p>
            <p className="font-black text-sm text-amber-950 mt-1">Rs.{buckets.days_8_30?.toLocaleString('en-IN')}</p>
          </div>
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="font-semibold text-orange-800">31-60 Days Overdue</p>
            <p className="font-black text-sm text-orange-950 mt-1">Rs.{buckets.days_31_60?.toLocaleString('en-IN')}</p>
          </div>
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="font-semibold text-red-800">61-90 Days Overdue</p>
            <p className="font-black text-sm text-red-950 mt-1">Rs.{buckets.days_61_90?.toLocaleString('en-IN')}</p>
          </div>
          <div className="p-3 bg-red-100 border border-red-300 rounded-xl">
            <p className="font-bold text-red-900">90+ Days Critical</p>
            <p className="font-black text-sm text-red-950 mt-1">Rs.{buckets.days_90_plus?.toLocaleString('en-IN')}</p>
          </div>
        </div>
      )}

      {/* Customer Debtor List */}
      <div className="card-panel overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>Mobile</th>
              <th>Village</th>
              <th>Aging Category</th>
              <th className="text-right">Outstanding (Rs)</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {customers.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-6 text-slate-400">No outstanding udhar records.</td></tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td className="font-bold text-slate-900 text-xs">{c.name}</td>
                  <td className="text-xs font-mono text-slate-600">{c.mobile}</td>
                  <td className="text-xs text-slate-700">{c.village || 'Local'}</td>
                  <td>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      {c.aging_bucket} ({c.days_outstanding || 0} days)
                    </span>
                  </td>
                  <td className="text-right font-extrabold text-xs text-red-600">
                    Rs.{c.current_balance?.toLocaleString('en-IN')}
                  </td>
                  <td className="text-center">
                    <button onClick={() => setCollectModalCust(c)} className="btn-success text-xs py-1 px-2.5">
                      <DollarSign className="w-3.5 h-3.5" /> Collect Payment
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Collection Receipt Modal */}
      {collectModalCust && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">Receive Payment from {collectModalCust.name}</h2>
            <p className="text-slate-600">Total Due: <span className="font-bold text-red-600">Rs.{collectModalCust.current_balance}</span></p>

            <form onSubmit={handleCollect} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Collection Amount (Rs) *</label>
                <input
                  type="number"
                  value={collectAmount}
                  onChange={e => setCollectAmount(e.target.value)}
                  required
                  placeholder="Enter amount received"
                  className="w-full border rounded p-2 font-bold text-emerald-800 text-sm"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Payment Method</label>
                <select value={collectMethod} onChange={e => setCollectMethod(e.target.value)} className="w-full border rounded p-2">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Notes / Receipt Ref</label>
                <input type="text" value={collectNotes} onChange={e => setCollectNotes(e.target.value)} placeholder="Optional notes" className="w-full border rounded p-2" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setCollectModalCust(null)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-success">Record Collection Receipt</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
