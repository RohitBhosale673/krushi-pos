import React, { useState, useEffect } from 'react';
import { RotateCcw, Search, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../api';

export default function SalesReturns({ showToast }) {
  const [returns, setReturns] = useState([]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [returnItems, setReturnItems] = useState({});
  const [refundMethod, setRefundMethod] = useState('Credit Adjustment');

  const fetchReturns = async () => {
    try {
      const res = await apiRequest('/returns/sales');
      if (res.success) setReturns(res.returns || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!invoiceNo.trim()) return;

    try {
      const res = await apiRequest(`/pos/invoice/${encodeURIComponent(invoiceNo.trim())}`);
      if (res.success) {
        setInvoiceDetails(res);
        const initialMap = {};
        res.items.forEach(it => {
          initialMap[`${it.product_id}_${it.batch_id}`] = { qty: 0, condition_type: 'Restockable' };
        });
        setReturnItems(initialMap);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleProcessReturn = async () => {
    const selectedItems = [];
    Object.entries(returnItems).forEach(([key, val]) => {
      if (val.qty > 0) {
        const [product_id, batch_id] = key.split('_');
        selectedItems.push({
          product_id: parseInt(product_id),
          batch_id: parseInt(batch_id),
          qty: parseFloat(val.qty),
          condition_type: val.condition_type
        });
      }
    });

    if (selectedItems.length === 0) {
      showToast('Specify return quantity for at least one product.', 'warning');
      return;
    }

    try {
      const res = await apiRequest('/returns/sales', {
        method: 'POST',
        body: JSON.stringify({
          original_invoice_no: invoiceDetails.sale.invoice_no,
          items: selectedItems,
          refund_method: refundMethod
        })
      });

      if (res.success) {
        showToast(`Return ${res.return_no} processed successfully!`, 'success');
        setInvoiceDetails(null);
        setInvoiceNo('');
        fetchReturns();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Customer Sales Returns</h1>
        <p className="text-xs text-slate-500">Lookup original invoice, restore restockable batch stock, and adjust customer credit balance</p>
      </div>

      {/* Invoice Lookup Header */}
      <form onSubmit={handleLookup} className="card-panel p-4 flex gap-3 items-center bg-slate-50">
        <input
          type="text"
          value={invoiceNo}
          onChange={e => setInvoiceNo(e.target.value)}
          placeholder="Enter Original Sales Invoice No (e.g. KSK/2026/0001)..."
          className="bg-white border rounded-lg px-3 py-2 text-xs font-mono font-bold flex-1"
        />
        <button type="submit" className="btn-primary">
          <Search className="w-4 h-4" /> Lookup Invoice
        </button>
      </form>

      {/* Lookup Result Box */}
      {invoiceDetails && (
        <div className="card-panel p-5 space-y-4 border-emerald-300 bg-emerald-50/20">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Invoice #{invoiceDetails.sale.invoice_no}</h2>
              <p className="text-xs text-slate-600">Customer: {invoiceDetails.sale.customer_name || 'Walk-in'} | Date: {new Date(invoiceDetails.sale.sale_date).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Refund Method:</span>
              <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)} className="border rounded p-1 text-xs">
                <option value="Credit Adjustment">Credit Adjustment</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
          </div>

          <table className="data-table text-xs">
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th className="text-right">Sold Qty</th>
                <th className="text-right">Unit Price</th>
                <th className="text-center">Return Qty</th>
                <th>Condition</th>
              </tr>
            </thead>
            <tbody>
              {invoiceDetails.items.map((it) => {
                const key = `${it.product_id}_${it.batch_id}`;
                return (
                  <tr key={key}>
                    <td className="font-bold text-slate-900">{it.product_name}</td>
                    <td className="font-mono text-slate-700">{it.batch_no}</td>
                    <td className="text-right font-semibold">{it.qty}</td>
                    <td className="text-right">Rs.{it.unit_price}</td>
                    <td className="text-center">
                      <input
                        type="number"
                        max={it.qty}
                        min="0"
                        value={returnItems[key]?.qty || 0}
                        onChange={(e) => {
                          setReturnItems({
                            ...returnItems,
                            [key]: { ...returnItems[key], qty: e.target.value }
                          });
                        }}
                        className="w-16 border rounded p-1 text-center font-bold"
                      />
                    </td>
                    <td>
                      <select
                        value={returnItems[key]?.condition_type || 'Restockable'}
                        onChange={(e) => {
                          setReturnItems({
                            ...returnItems,
                            [key]: { ...returnItems[key], condition_type: e.target.value }
                          });
                        }}
                        className="border rounded p-1 text-xs"
                      >
                        <option value="Restockable">Restockable (Add Stock Back)</option>
                        <option value="Damaged">Damaged</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end pt-2">
            <button onClick={handleProcessReturn} className="btn-success py-2.5 px-5">
              <CheckCircle2 className="w-4 h-4" /> Confirm Sales Return
            </button>
          </div>
        </div>
      )}

      {/* Return History Table */}
      <div className="card-panel overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Return No</th>
              <th>Original Invoice</th>
              <th>Customer</th>
              <th>Date</th>
              <th className="text-right">Return Total (Rs)</th>
              <th>Refund Method</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {returns.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-6 text-slate-400">No sales return records.</td></tr>
            ) : (
              returns.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono font-bold text-xs text-slate-900">{r.return_no}</td>
                  <td className="font-mono text-xs text-slate-600">{r.original_invoice_no}</td>
                  <td className="text-xs text-slate-800 font-semibold">{r.customer_name || 'Walk-in'}</td>
                  <td className="text-xs text-slate-500">{new Date(r.return_date).toLocaleDateString()}</td>
                  <td className="text-right font-extrabold text-xs text-red-600">Rs.{r.total_amount}</td>
                  <td className="text-xs font-semibold text-slate-700">{r.refund_method}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
