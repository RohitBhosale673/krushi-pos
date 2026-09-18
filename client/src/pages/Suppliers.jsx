import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, DollarSign, FileText } from 'lucide-react';
import { apiRequest } from '../api';

export default function Suppliers({ showToast }) {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [payModalSupp, setPayModalSupp] = useState(null);

  const [formData, setFormData] = useState({
    name: '', company_name: '', mobile: '', alt_mobile: '', email: '',
    address: '', gstin: '', opening_balance: 0, credit_limit: 500000
  });

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('UPI');

  const fetchSuppliers = async () => {
    try {
      const res = await apiRequest(`/suppliers?search=${encodeURIComponent(search)}`);
      if (res.success) setSuppliers(res.suppliers || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/suppliers', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (res.success) {
        showToast(res.message, 'success');
        setShowModal(false);
        fetchSuppliers();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payModalSupp || !payAmount) return;

    try {
      const res = await apiRequest(`/suppliers/${payModalSupp.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount: payAmount, payment_method: payMethod })
      });
      if (res.success) {
        showToast('Payment recorded successfully', 'success');
        setPayModalSupp(null);
        setPayAmount('');
        fetchSuppliers();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Suppliers & Distributors</h1>
          <p className="text-xs text-slate-500">Manage seed companies, pesticide distributors, and payable ledgers</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Register New Supplier
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by Supplier Name, Company, Mobile, GSTIN..."
        className="w-full bg-white border rounded-lg p-2 text-xs"
      />

      {/* Suppliers Table */}
      <div className="card-panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Company Name</th>
              <th>Contact Person</th>
              <th>Mobile</th>
              <th>GSTIN</th>
              <th className="text-right">Outstanding Payable (Rs)</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {suppliers.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-6 text-slate-400">No suppliers found.</td></tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="font-bold text-slate-900 text-xs">{s.company_name}</td>
                  <td className="text-xs text-slate-700">{s.name}</td>
                  <td className="text-xs text-slate-600 font-mono">{s.mobile}</td>
                  <td className="text-xs font-mono text-slate-600">{s.gstin || 'N/A'}</td>
                  <td className="text-right font-extrabold text-xs text-red-600">
                    Rs.{s.current_balance?.toLocaleString('en-IN')}
                  </td>
                  <td className="text-center">
                    <button onClick={() => setPayModalSupp(s)} className="btn-secondary text-xs py-1 px-2">
                      Record Payment
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Register Supplier Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">Register Supplier / Distributor</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Company Name *</label>
                <input type="text" value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} required className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="font-semibold block mb-1">Contact Person Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required className="w-full border rounded p-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Mobile Number *</label>
                  <input type="text" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} required className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">GSTIN</label>
                  <input type="text" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value})} className="w-full border rounded p-2" />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Opening Payable Balance (Rs)</label>
                <input type="number" value={formData.opening_balance} onChange={e => setFormData({...formData, opening_balance: e.target.value})} className="w-full border rounded p-2" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Supplier</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Supplier Modal */}
      {payModalSupp && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">Record Payment to {payModalSupp.company_name}</h2>
            <p className="text-slate-600">Current Balance Payable: <span className="font-bold text-red-600">Rs.{payModalSupp.current_balance}</span></p>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Payment Amount (Rs) *</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} required placeholder="Enter amount" className="w-full border rounded p-2 font-bold text-emerald-800" />
              </div>
              <div>
                <label className="font-semibold block mb-1">Payment Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full border rounded p-2">
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setPayModalSupp(null)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-success">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
