import React, { useState, useEffect } from 'react';
import { Undo2, Plus } from 'lucide-react';
import { apiRequest } from '../api';

export default function PurchaseReturns({ showToast }) {
  const [returns, setReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [reason, setReason] = useState('');

  const fetchReturns = async () => {
    try {
      const [rRes, sRes, bRes] = await Promise.all([
        apiRequest('/returns/purchase'),
        apiRequest('/suppliers'),
        apiRequest('/batches')
      ]);
      if (rRes.success) setReturns(rRes.returns || []);
      if (sRes.success) setSuppliers(sRes.suppliers || []);
      if (bRes.success) setBatches(bRes.batches || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!supplierId || !selectedBatchId || !returnQty) {
      showToast('Supplier, Batch, and Return Qty are required.', 'warning');
      return;
    }

    const batch = batches.find(b => String(b.id) === String(selectedBatchId));
    if (!batch) return;

    try {
      const res = await apiRequest('/returns/purchase', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: supplierId,
          items: [{
            product_id: batch.product_id,
            batch_id: batch.id,
            qty: returnQty,
            unit_price: batch.purchase_rate
          }],
          reason
        })
      });

      if (res.success) {
        showToast(`Purchase return debit note ${res.return_no} created!`, 'success');
        setShowModal(false);
        fetchReturns();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Supplier Purchase Returns</h1>
          <p className="text-xs text-slate-500">Return damaged/expired stock to distributors and issue Debit Notes</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Issue Purchase Return
        </button>
      </div>

      <div className="card-panel overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Return No</th>
              <th>Debit Note #</th>
              <th>Supplier Name</th>
              <th>Date</th>
              <th className="text-right">Debit Amount (Rs)</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {returns.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-6 text-slate-400">No purchase return records.</td></tr>
            ) : (
              returns.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono font-bold text-xs text-slate-900">{r.return_no}</td>
                  <td className="font-mono text-xs font-bold text-emerald-800">{r.debit_note_no}</td>
                  <td className="font-bold text-xs text-slate-800">{r.supplier_name}</td>
                  <td className="text-xs text-slate-500">{new Date(r.return_date).toLocaleDateString()}</td>
                  <td className="text-right font-extrabold text-xs text-slate-900">Rs.{r.total_amount}</td>
                  <td className="text-xs text-slate-600">{r.reason || 'N/A'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">Create Purchase Return & Debit Note</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Supplier *</label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required className="w-full border rounded p-2">
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Select Batch to Return *</label>
                <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} required className="w-full border rounded p-2">
                  <option value="">-- Choose Stock Batch --</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.product_name} - Batch {b.batch_no} (Avail: {b.available_qty})</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Return Quantity *</label>
                <input type="number" value={returnQty} onChange={e => setReturnQty(e.target.value)} required className="w-full border rounded p-2 font-bold" />
              </div>
              <div>
                <label className="font-semibold block mb-1">Return Reason</label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Expired batch replacement" className="w-full border rounded p-2" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Generate Debit Note</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
