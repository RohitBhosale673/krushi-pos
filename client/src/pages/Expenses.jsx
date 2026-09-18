import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Trash2, Calendar } from 'lucide-react';
import { apiRequest } from '../api';

export default function Expenses({ showToast }) {
  const [expenses, setExpenses] = useState([]);
  const [totalExpense, setTotalExpense] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    category: 'Rent', title: '', amount: '', expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'Cash', recipient: '', description: ''
  });

  const categories = [
    'Rent', 'Electricity', 'Salary', 'Transport', 'Internet',
    'Maintenance', 'Packaging', 'Marketing', 'Miscellaneous', 'Other'
  ];

  const fetchExpenses = async () => {
    try {
      let query = '';
      if (categoryFilter) query += `?category=${categoryFilter}`;
      const res = await apiRequest(`/expenses${query}`);
      if (res.success) {
        setExpenses(res.expenses || []);
        setTotalExpense(res.totalExpense || 0);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [categoryFilter]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/expenses', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (res.success) {
        showToast('Expense record logged successfully', 'success');
        setShowModal(false);
        setFormData({
          category: 'Rent', title: '', amount: '', expense_date: new Date().toISOString().split('T')[0],
          payment_method: 'Cash', recipient: '', description: ''
        });
        fetchExpenses();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense record?')) return;
    try {
      const res = await apiRequest(`/expenses/${id}`, { method: 'DELETE' });
      if (res.success) {
        showToast('Expense deleted', 'info');
        fetchExpenses();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Store Operational Expenses</h1>
          <p className="text-xs text-slate-500">Track rent, electricity, transport freight, and staff salaries</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Expense Entry
        </button>
      </div>

      {/* Summary Box */}
      <div className="card-panel p-5 bg-amber-50 border-amber-200 flex justify-between items-center">
        <div>
          <p className="text-xs font-semibold text-amber-800 uppercase">Filtered Expenses Total</p>
          <h2 className="text-3xl font-black text-amber-950 mt-1">Rs.{totalExpense?.toLocaleString('en-IN')}</h2>
        </div>
        <div className="flex gap-1.5 text-xs">
          <button onClick={() => setCategoryFilter('')} className={`px-3 py-1.5 rounded font-bold ${categoryFilter === '' ? 'bg-amber-800 text-white' : 'bg-white text-slate-700 border'}`}>
            All Categories
          </button>
          {categories.slice(0, 5).map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)} className={`px-3 py-1.5 rounded font-bold ${categoryFilter === c ? 'bg-amber-800 text-white' : 'bg-white text-slate-700 border'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Expenses Table */}
      <div className="card-panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Expense Date</th>
              <th>Category</th>
              <th>Expense Title</th>
              <th>Payment Method</th>
              <th className="text-right">Amount (Rs)</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {expenses.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-6 text-slate-400">No expense records found.</td></tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id}>
                  <td className="text-xs text-slate-600 font-mono">{e.expense_date}</td>
                  <td>
                    <span className="bg-slate-100 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded border">
                      {e.category}
                    </span>
                  </td>
                  <td className="font-bold text-slate-900 text-xs">{e.title}</td>
                  <td className="text-xs text-slate-600">{e.payment_method}</td>
                  <td className="text-right font-extrabold text-xs text-amber-900">
                    Rs.{e.amount?.toLocaleString('en-IN')}
                  </td>
                  <td className="text-center">
                    <button onClick={() => handleDelete(e.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">Add Expense Entry</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Expense Category *</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full border rounded p-2">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Expense Title / Reason *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required placeholder="e.g. Shop Electricity Bill" className="w-full border rounded p-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Amount (Rs) *</label>
                  <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required className="w-full border rounded p-2 font-bold" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Expense Date *</label>
                  <input type="date" value={formData.expense_date} onChange={e => setFormData({...formData, expense_date: e.target.value})} required className="w-full border rounded p-2" />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Payment Method</label>
                <select value={formData.payment_method} onChange={e => setFormData({...formData, payment_method: e.target.value})} className="w-full border rounded p-2">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
