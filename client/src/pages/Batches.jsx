import React, { useState, useEffect } from 'react';
import { Layers, Calendar, AlertCircle, Plus, Edit3 } from 'lucide-react';
import { apiRequest } from '../api';

export default function Batches({ showToast }) {
  const [batches, setBatches] = useState([]);
  const [expiryFilter, setExpiryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [products, setProducts] = useState([]);

  const [formData, setFormData] = useState({
    product_id: '', batch_no: '', mfg_date: '', exp_date: '',
    purchase_rate: 0, selling_rate: 0, mrp: 0, qty_received: 10
  });

  const fetchBatches = async () => {
    try {
      let query = `?search=${encodeURIComponent(search)}`;
      if (expiryFilter) query += `&expiry_filter=${expiryFilter}`;
      const res = await apiRequest(`/batches${query}`);
      if (res.success) setBatches(res.batches || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [search, expiryFilter]);

  const loadProducts = async () => {
    try {
      const res = await apiRequest('/products');
      if (res.success) setProducts(res.products || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/batches', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (res.success) {
        showToast(res.message, 'success');
        setShowModal(false);
        fetchBatches();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Batch & Expiry Management (FEFO)</h1>
          <p className="text-xs text-slate-500">Track FEFO (First Expiry First Out) batches and expiry date thresholds</p>
        </div>
        <button
          onClick={() => {
            loadProducts();
            setShowModal(true);
          }}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Add New Batch
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Product Name or Batch Number..."
          className="bg-white border rounded-lg px-3 py-2 text-xs flex-1"
        />
        <div className="flex gap-2">
          {['', '7_days', '30_days', '60_days', 'expired'].map((f) => (
            <button
              key={f}
              onClick={() => setExpiryFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                expiryFilter === f ? 'bg-slate-900 text-white' : 'bg-white border text-slate-700 hover:bg-slate-50'
              }`}
            >
              {f === '' ? 'All Batches' : f === '7_days' ? 'Expiring in 7 Days' : f === '30_days' ? 'Expiring in 30 Days' : f === '60_days' ? 'Expiring in 60 Days' : 'Expired'}
            </button>
          ))}
        </div>
      </div>

      {/* Batches Table */}
      <div className="card-panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Batch Number</th>
              <th>Mfg Date</th>
              <th>Expiry Date</th>
              <th className="text-right">Available Qty</th>
              <th className="text-right">Purchase / Selling Rate</th>
              <th className="text-center">FEFO Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {batches.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-6 text-slate-400">No batches found for this criteria.</td></tr>
            ) : (
              batches.map((b) => {
                const isExpired = b.days_until_expiry < 0;
                const isNearExpiry = b.days_until_expiry >= 0 && b.days_until_expiry <= 30;
                return (
                  <tr key={b.id} className={isExpired ? 'bg-red-50/50' : isNearExpiry ? 'bg-amber-50/50' : ''}>
                    <td>
                      <p className="font-bold text-slate-900 text-xs">{b.product_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{b.product_code}</p>
                    </td>
                    <td>
                      <span className="font-mono font-bold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        {b.batch_no}
                      </span>
                    </td>
                    <td className="text-xs text-slate-600">{b.mfg_date || 'N/A'}</td>
                    <td className="text-xs font-semibold">
                      <span className={isExpired ? 'text-red-600 font-bold' : isNearExpiry ? 'text-amber-700 font-bold' : 'text-slate-800'}>
                        {b.exp_date} ({b.days_until_expiry} days)
                      </span>
                    </td>
                    <td className="text-right font-extrabold text-xs text-slate-900">
                      {b.available_qty} {b.unit_symbol}
                    </td>
                    <td className="text-right text-xs">
                      <p className="text-slate-500">Buy: Rs.{b.purchase_rate}</p>
                      <p className="font-bold text-emerald-800">Sell: Rs.{b.selling_rate}</p>
                    </td>
                    <td className="text-center">
                      <span className={isExpired ? 'badge-danger' : isNearExpiry ? 'badge-warning' : 'badge-active'}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Batch Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">Create Stock Batch</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Select Product *</label>
                <select value={formData.product_id} onChange={e => setFormData({...formData, product_id: e.target.value})} required className="w-full border rounded p-2">
                  <option value="">-- Choose Product --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.product_code})</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Batch Number *</label>
                <input type="text" value={formData.batch_no} onChange={e => setFormData({...formData, batch_no: e.target.value})} required placeholder="e.g. B2026-001" className="w-full border rounded p-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Mfg Date</label>
                  <input type="date" value={formData.mfg_date} onChange={e => setFormData({...formData, mfg_date: e.target.value})} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Expiry Date *</label>
                  <input type="date" value={formData.exp_date} onChange={e => setFormData({...formData, exp_date: e.target.value})} required className="w-full border rounded p-2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Purchase Rate (Rs) *</label>
                  <input type="number" step="0.01" value={formData.purchase_rate} onChange={e => setFormData({...formData, purchase_rate: e.target.value})} required className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Selling Rate (Rs) *</label>
                  <input type="number" step="0.01" value={formData.selling_rate} onChange={e => setFormData({...formData, selling_rate: e.target.value})} required className="w-full border rounded p-2" />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Initial Quantity Received *</label>
                <input type="number" value={formData.qty_received} onChange={e => setFormData({...formData, qty_received: e.target.value})} required className="w-full border rounded p-2" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Batch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
