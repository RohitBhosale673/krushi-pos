import React, { useState, useEffect } from 'react';
import { BarChart3, ArrowDownRight, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../api';

export default function Inventory({ showToast }) {
  const [movements, setMovements] = useState([]);
  const [valuation, setValuation] = useState(null);
  const [movementType, setMovementType] = useState('');

  const fetchMovements = async () => {
    try {
      let query = '';
      if (movementType) query += `?movement_type=${movementType}`;
      const [mRes, vRes] = await Promise.all([
        apiRequest(`/inventory/movements${query}`),
        apiRequest('/inventory/valuation')
      ]);
      if (mRes.success) setMovements(mRes.movements || []);
      if (vRes.success) setValuation(vRes);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchMovements();
  }, [movementType]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Stock Movement & Valuation Ledger</h1>
        <p className="text-xs text-slate-500">Audit trail of all stock movements (Purchases, POS Sales, Returns, Adjustments)</p>
      </div>

      {/* Valuation KPI Summary */}
      {valuation && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-panel p-4 bg-emerald-50 border-emerald-200">
            <p className="text-xs font-semibold text-emerald-800">Total Selling Valuation</p>
            <h3 className="text-2xl font-black text-emerald-950 mt-1">
              Rs.{valuation.summary?.total_selling_valuation?.toLocaleString('en-IN') || 0}
            </h3>
            <p className="text-[10px] text-emerald-700 mt-0.5">{valuation.summary?.total_products} Products | {valuation.summary?.total_batches} Batches</p>
          </div>
          <div className="card-panel p-4 bg-slate-50">
            <p className="text-xs font-semibold text-slate-600">Total Purchase Cost Valuation</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              Rs.{valuation.summary?.total_purchase_valuation?.toLocaleString('en-IN') || 0}
            </h3>
          </div>
          <div className="card-panel p-4 bg-blue-50 border-blue-200">
            <p className="text-xs font-semibold text-blue-800">Total Units In Stock</p>
            <h3 className="text-2xl font-black text-blue-950 mt-1">
              {valuation.summary?.total_stock_quantity?.toLocaleString('en-IN') || 0}
            </h3>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex gap-2 text-xs">
        {['', 'sale', 'purchase', 'sale_return', 'purchase_return', 'stock_adjustment', 'damaged', 'expiry_disposal'].map((m) => (
          <button
            key={m}
            onClick={() => setMovementType(m)}
            className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition ${
              movementType === m ? 'bg-slate-900 text-white' : 'bg-white border text-slate-700 hover:bg-slate-50'
            }`}
          >
            {m === '' ? 'All Movements' : m.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Stock Movement Ledger Table */}
      <div className="card-panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Product / Code</th>
              <th>Batch #</th>
              <th>Movement Type</th>
              <th className="text-right">Qty Change</th>
              <th className="text-right">Previous -&gt; New Stock</th>
              <th>Reference / Notes</th>
              <th>Done By</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {movements.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-6 text-slate-400">No stock movements recorded.</td></tr>
            ) : (
              movements.map((m) => {
                const isPositive = m.qty_change > 0;
                return (
                  <tr key={m.id}>
                    <td className="text-xs text-slate-500 font-mono">{new Date(m.created_at).toLocaleString()}</td>
                    <td>
                      <p className="font-bold text-slate-900 text-xs">{m.product_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{m.product_code}</p>
                    </td>
                    <td className="font-mono text-xs text-slate-700">{m.batch_no || '-'}</td>
                    <td>
                      <span className="uppercase text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border">
                        {m.movement_type}
                      </span>
                    </td>
                    <td className={`text-right font-extrabold text-xs ${isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                      {isPositive ? `+${m.qty_change}` : m.qty_change}
                    </td>
                    <td className="text-right text-xs text-slate-600 font-mono">
                      {m.previous_qty} -&gt; <span className="font-bold text-slate-900">{m.new_qty}</span>
                    </td>
                    <td className="text-xs text-slate-600">
                      <p className="font-semibold text-slate-800">{m.reference_id}</p>
                      <p className="text-[10px] text-slate-500">{m.notes}</p>
                    </td>
                    <td className="text-xs text-slate-600">{m.user_name || 'System'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
