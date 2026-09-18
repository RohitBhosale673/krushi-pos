import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, MapPin, Edit2 } from 'lucide-react';
import { apiRequest } from '../api';

export default function Customers({ showToast }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '', mobile: '', alt_mobile: '', village: '', taluka: '', district: 'Nashik',
    customer_type: 'Farmer', opening_balance: 0, credit_limit: 50000, notes: ''
  });

  const fetchCustomers = async () => {
    try {
      const res = await apiRequest(`/customers?search=${encodeURIComponent(search)}`);
      if (res.success) setCustomers(res.customers || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/customers', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (res.success) {
        showToast(res.message, 'success');
        setShowModal(false);
        fetchCustomers();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Customer Directory</h1>
          <p className="text-xs text-slate-500">Farmers, local agricultural buyers, and retail customers</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add New Customer
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search customer by Name, Mobile, Village, or Taluka..."
        className="w-full bg-white border rounded-lg p-2 text-xs"
      />

      <div className="card-panel overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>Mobile</th>
              <th>Village / Taluka</th>
              <th>Customer Type</th>
              <th className="text-right">Credit Limit</th>
              <th className="text-right">Udhar Balance (Rs)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {customers.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-6 text-slate-400">No customers found.</td></tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td className="font-bold text-slate-900 text-xs">{c.name}</td>
                  <td className="text-xs text-slate-600 font-mono">{c.mobile}</td>
                  <td className="text-xs text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-600" />
                      {c.village ? `${c.village}, ${c.taluka || ''}` : 'Local'}
                    </span>
                  </td>
                  <td>
                    <span className="bg-slate-100 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded border">
                      {c.customer_type}
                    </span>
                  </td>
                  <td className="text-right text-xs">Rs.{c.credit_limit}</td>
                  <td className={`text-right font-extrabold text-xs ${c.current_balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    Rs.{c.current_balance?.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">Add Customer Profile</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Customer Full Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="font-semibold block mb-1">Mobile Number *</label>
                <input type="text" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} required className="w-full border rounded p-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Village Name</label>
                  <input type="text" value={formData.village} onChange={e => setFormData({...formData, village: e.target.value})} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Taluka</label>
                  <input type="text" value={formData.taluka} onChange={e => setFormData({...formData, taluka: e.target.value})} className="w-full border rounded p-2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Customer Type</label>
                  <select value={formData.customer_type} onChange={e => setFormData({...formData, customer_type: e.target.value})} className="w-full border rounded p-2">
                    {['Farmer', 'Retail Customer', 'Dealer', 'Business Customer', 'Other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Credit Limit (Rs)</label>
                  <input type="number" value={formData.credit_limit} onChange={e => setFormData({...formData, credit_limit: e.target.value})} className="w-full border rounded p-2" />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Opening Udhar Balance (Rs)</label>
                <input type="number" value={formData.opening_balance} onChange={e => setFormData({...formData, opening_balance: e.target.value})} className="w-full border rounded p-2" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
