import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, CheckSquare, Square, RefreshCw, Eye } from 'lucide-react';
import { apiRequest } from '../api';

export default function SmsReminder({ showToast }) {
  const [customers, setCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [template, setTemplate] = useState('');
  const [provider, setProvider] = useState('Simulated');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  const fetchData = async () => {
    try {
      const [cRes, lRes] = await Promise.all([
        apiRequest('/sms/eligible-customers'),
        apiRequest('/sms/logs')
      ]);
      if (cRes.success) {
        setCustomers(cRes.customers || []);
        setTemplate(cRes.template || '');
        setProvider(cRes.provider || 'Simulated');
      }
      if (lRes.success) {
        setLogs(lRes.logs || []);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.length === customers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(customers.map(c => c.id));
    }
  };

  const toggleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSendReminders = async () => {
    if (selectedIds.length === 0) {
      showToast('Please select at least one customer.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest('/sms/send-reminders', {
        method: 'POST',
        body: JSON.stringify({
          customer_ids: selectedIds,
          template_override: template
        })
      });

      if (res.success) {
        showToast(res.message, 'success');
        setSelectedIds([]);
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="border-b pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">One-Click SMS Reminder Hub</h1>
          <p className="text-xs text-slate-500">Send bulk automated SMS payment reminders to farmers with outstanding Udhar</p>
        </div>
        <div className="bg-emerald-100 text-emerald-900 px-3 py-1 rounded-lg text-xs font-bold border border-emerald-300">
          Provider: {provider} Mode
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customer Selection Table (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card-panel p-4 flex justify-between items-center bg-slate-50">
            <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-bold text-slate-800">
              {selectedIds.length === customers.length && customers.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-emerald-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              Select All Eligible Debtors ({customers.length})
            </button>
            <span className="text-xs font-bold text-emerald-800">
              {selectedIds.length} Customers Selected
            </span>
          </div>

          <div className="card-panel overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8">Select</th>
                  <th>Customer Name</th>
                  <th>Mobile</th>
                  <th>Village</th>
                  <th className="text-right">Outstanding (Rs)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-6 text-slate-400">No debtors with active mobile numbers.</td></tr>
                ) : (
                  customers.map((c) => {
                    const isSelected = selectedIds.includes(c.id);
                    return (
                      <tr key={c.id} onClick={() => toggleSelectOne(c.id)} className="cursor-pointer">
                        <td className="text-center">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                        </td>
                        <td className="font-bold text-slate-900 text-xs">{c.name}</td>
                        <td className="text-xs font-mono text-slate-600">{c.mobile}</td>
                        <td className="text-xs text-slate-700">{c.village || 'Local'}</td>
                        <td className="text-right font-extrabold text-xs text-red-600">
                          Rs.{c.outstanding_amount?.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Template & Dispatch Controls */}
        <div className="card-panel p-5 space-y-4 h-fit">
          <h2 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" /> SMS Message Template
          </h2>

          <div className="space-y-2 text-xs">
            <label className="font-semibold block text-slate-700">Message Content</label>
            <textarea
              rows="5"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full border rounded-lg p-2 font-mono text-xs text-slate-800 bg-slate-50 focus:outline-none focus:border-emerald-600"
            />
            <p className="text-[10px] text-slate-500">
              Variables: <span className="font-mono">{'{customer_name}'}</span>, <span className="font-mono">{'{outstanding_amount}'}</span>, <span className="font-mono">{'{store_name}'}</span>, <span className="font-mono">{'{store_phone}'}</span>
            </p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-[11px] space-y-1">
            <p className="font-bold text-emerald-900 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> Sample Preview:
            </p>
            <p className="italic text-emerald-950">
              "{template.replace('{customer_name}', 'Pandurang Patil').replace('{outstanding_amount}', '12,500').replace('{store_name}', 'Krushi Seva Kendra').replace('{store_phone}', '9822012345')}"
            </p>
          </div>

          <button
            onClick={handleSendReminders}
            disabled={loading || selectedIds.length === 0}
            className="w-full btn-primary py-3 justify-center shadow-lg disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> Send Bulk SMS ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* SMS Logs History */}
      <div className="card-panel p-5 space-y-3">
        <h2 className="font-bold text-slate-900 text-sm border-b pb-2">Recent Sent SMS Logs</h2>
        <div className="max-h-60 overflow-y-auto">
          <table className="data-table text-xs">
            <thead>
              <tr>
                <th>Time</th>
                <th>Recipient</th>
                <th>Mobile</th>
                <th>Provider Msg ID</th>
                <th>Message Content</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-4 text-slate-400">No sent SMS logs.</td></tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td className="font-mono text-slate-500">{new Date(l.sent_at).toLocaleString()}</td>
                    <td className="font-bold text-slate-800">{l.customer_name || 'Customer'}</td>
                    <td className="font-mono">{l.mobile}</td>
                    <td className="font-mono text-[10px] text-slate-500">{l.provider_msg_id}</td>
                    <td className="text-slate-700 truncate max-w-xs">{l.message}</td>
                    <td>
                      <span className={l.status === 'SENT' ? 'badge-active' : 'badge-danger'}>{l.status}</span>
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
