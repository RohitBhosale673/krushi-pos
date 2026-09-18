import React, { useState, useEffect } from 'react';
import { ShieldAlert, Search, User } from 'lucide-react';
import { apiRequest } from '../api';

export default function AuditLogs({ showToast }) {
  const [logs, setLogs] = useState([]);
  const [moduleFilter, setModuleFilter] = useState('');

  const fetchLogs = async () => {
    try {
      let query = '';
      if (moduleFilter) query += `?module=${moduleFilter}`;
      const res = await apiRequest(`/audit${query}`);
      if (res.success) setLogs(res.logs || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [moduleFilter]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Security & Activity Audit Logs</h1>
        <p className="text-xs text-slate-500">Immutable record of all user actions, sales, stock adjustments, and administrative edits</p>
      </div>

      <div className="flex gap-2 text-xs">
        {['', 'auth', 'pos', 'products', 'batches', 'inventory', 'customers', 'suppliers', 'purchases', 'udhar', 'users', 'settings'].map(m => (
          <button
            key={m}
            onClick={() => setModuleFilter(m)}
            className={`px-3 py-1.5 rounded-lg font-semibold uppercase transition ${
              moduleFilter === m ? 'bg-slate-900 text-white' : 'bg-white border text-slate-700 hover:bg-slate-50'
            }`}
          >
            {m === '' ? 'All Modules' : m}
          </button>
        ))}
      </div>

       {/* Security Audit Table */}
      <div className="card-panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Module</th>
              <th>Record ID</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-6 text-slate-400">No audit logs found.</td></tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id}>
                  <td className="font-mono text-xs text-slate-500">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="font-bold text-xs text-slate-800">{l.full_name || l.user_name || 'System'}</td>
                  <td>
                    <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {l.action}
                    </span>
                  </td>
                  <td className="uppercase text-[10px] font-bold text-slate-600">{l.module}</td>
                  <td className="font-mono text-xs text-slate-700">{l.record_id || '-'}</td>
                  <td className="font-mono text-xs text-slate-500">{l.ip_address}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
