import React, { useState, useEffect } from 'react';
import { Plus, Search, Truck, FileText, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../api';

export default function Purchases({ showToast }) {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);

  // New Purchase Form
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [items, setItems] = useState([]);

  // Item row helper
  const [currentItem, setCurrentItem] = useState({
    product_id: '', batch_no: '', mfg_date: '', exp_date: '',
    qty: 1, unit: 'Bag', purchase_rate: 0, selling_rate: 0, mrp: 0, gst_rate: 5
  });

  const fetchData = async () => {
    try {
      const [pRes, sRes, prdRes] = await Promise.all([
        apiRequest('/purchases'),
        apiRequest('/suppliers'),
        apiRequest('/products')
      ]);
      if (pRes.success) setPurchases(pRes.purchases || []);
      if (sRes.success) setSuppliers(sRes.suppliers || []);
      if (prdRes.success) setProducts(prdRes.products || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const addItemToPurchase = () => {
    if (!currentItem.product_id || !currentItem.batch_no || !currentItem.exp_date || !currentItem.purchase_rate) {
      showToast('Product, Batch No, Expiry Date, and Purchase Rate are required for line item.', 'warning');
      return;
    }

    const prd = products.find(p => String(p.id) === String(currentItem.product_id));
    setItems([...items, {
      ...currentItem,
      product_name: prd?.name || 'Product',
      total_amount: currentItem.qty * currentItem.purchase_rate * (1 + currentItem.gst_rate / 100)
    }]);

    setCurrentItem({
      product_id: '', batch_no: '', mfg_date: '', exp_date: '',
      qty: 1, unit: 'Bag', purchase_rate: 0, selling_rate: 0, mrp: 0, gst_rate: 5
    });
  };

  const handleSavePurchase = async (e) => {
    e.preventDefault();
    if (!supplierId || items.length === 0) {
      showToast('Supplier and at least one item are required.', 'warning');
      return;
    }

    try {
      const res = await apiRequest('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: supplierId,
          supplier_invoice_no: supplierInvoiceNo,
          purchase_date: purchaseDate,
          paid_amount: paidAmount,
          items
        })
      });

      if (res.success) {
        showToast(`Purchase invoice ${res.invoice_no} recorded successfully!`, 'success');
        setShowModal(false);
        setItems([]);
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const grandTotal = items.reduce((acc, it) => acc + (it.qty * it.purchase_rate * (1 + it.gst_rate / 100)), 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Purchase Invoices</h1>
          <p className="text-xs text-slate-500">Record inventory purchases from seed & fertilizer distributors</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Create Purchase Invoice
        </button>
      </div>

      {/* Purchase List Table */}
      <div className="card-panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Purchase Inv #</th>
              <th>Supplier Invoice #</th>
              <th>Supplier Name</th>
              <th>Date</th>
              <th className="text-right">Grand Total (Rs)</th>
              <th className="text-right">Paid (Rs)</th>
              <th className="text-right">Due (Rs)</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {purchases.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-6 text-slate-400">No purchase invoices recorded.</td></tr>
            ) : (
              purchases.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono font-bold text-xs text-slate-900">{p.invoice_no}</td>
                  <td className="font-mono text-xs text-slate-600">{p.supplier_invoice_no || '-'}</td>
                  <td className="font-bold text-xs text-slate-800">{p.supplier_name}</td>
                  <td className="text-xs text-slate-600">{p.purchase_date}</td>
                  <td className="text-right font-extrabold text-xs text-slate-900">Rs.{p.grand_total}</td>
                  <td className="text-right text-xs text-emerald-700 font-semibold">Rs.{p.paid_amount}</td>
                  <td className="text-right text-xs text-red-600 font-bold">Rs.{p.due_amount}</td>
                  <td className="text-center">
                    <span className={p.payment_status === 'PAID' ? 'badge-active' : 'badge-warning'}>
                      {p.payment_status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Purchase Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">Record Supplier Purchase Invoice</h2>

            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border">
              <div>
                <label className="font-semibold block mb-1">Select Supplier *</label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required className="w-full border rounded p-2">
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name} ({s.mobile})</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Supplier Invoice #</label>
                <input type="text" value={supplierInvoiceNo} onChange={e => setSupplierInvoiceNo(e.target.value)} placeholder="e.g. INV-9901" className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="font-semibold block mb-1">Purchase Date *</label>
                <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required className="w-full border rounded p-2" />
              </div>
            </div>

            {/* Add Line Item Box */}
            <div className="border p-3 rounded-lg space-y-2 bg-emerald-50/40">
              <p className="font-bold text-slate-800">Add Purchase Line Item</p>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block mb-0.5 font-semibold">Product *</label>
                  <select
                    value={currentItem.product_id}
                    onChange={e => {
                      const prd = products.find(p => String(p.id) === e.target.value);
                      setCurrentItem({
                        ...currentItem,
                        product_id: e.target.value,
                        purchase_rate: prd?.purchase_price || 0,
                        selling_rate: prd?.selling_price || 0,
                        mrp: prd?.mrp || 0,
                        gst_rate: prd?.gst_rate || 5
                      });
                    }}
                    className="w-full border rounded p-1.5"
                  >
                    <option value="">-- Select --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-0.5 font-semibold">Batch No *</label>
                  <input type="text" value={currentItem.batch_no} onChange={e => setCurrentItem({...currentItem, batch_no: e.target.value})} placeholder="e.g. B2026-009" className="w-full border rounded p-1.5" />
                </div>
                <div>
                  <label className="block mb-0.5 font-semibold">Mfg Date</label>
                  <input type="date" value={currentItem.mfg_date} onChange={e => setCurrentItem({...currentItem, mfg_date: e.target.value})} className="w-full border rounded p-1.5" />
                </div>
                <div>
                  <label className="block mb-0.5 font-semibold">Expiry Date *</label>
                  <input type="date" value={currentItem.exp_date} onChange={e => setCurrentItem({...currentItem, exp_date: e.target.value})} className="w-full border rounded p-1.5" />
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 items-end">
                <div>
                  <label className="block mb-0.5 font-semibold">Qty</label>
                  <input type="number" value={currentItem.qty} onChange={e => setCurrentItem({...currentItem, qty: e.target.value})} className="w-full border rounded p-1.5" />
                </div>
                <div>
                  <label className="block mb-0.5 font-semibold">Buy Rate (Rs)</label>
                  <input type="number" step="0.01" value={currentItem.purchase_rate} onChange={e => setCurrentItem({...currentItem, purchase_rate: e.target.value})} className="w-full border rounded p-1.5" />
                </div>
                <div>
                  <label className="block mb-0.5 font-semibold">Sell Rate (Rs)</label>
                  <input type="number" step="0.01" value={currentItem.selling_rate} onChange={e => setCurrentItem({...currentItem, selling_rate: e.target.value})} className="w-full border rounded p-1.5" />
                </div>
                <div>
                  <label className="block mb-0.5 font-semibold">GST %</label>
                  <input type="number" value={currentItem.gst_rate} onChange={e => setCurrentItem({...currentItem, gst_rate: e.target.value})} className="w-full border rounded p-1.5" />
                </div>
                <button type="button" onClick={addItemToPurchase} className="btn-success h-8 justify-center">
                  + Add Item
                </button>
              </div>
            </div>

            {/* Added Items Table */}
            <div className="flex-1 overflow-y-auto border rounded">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Exp</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">GST</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="font-bold">{it.product_name}</td>
                      <td className="font-mono">{it.batch_no}</td>
                      <td>{it.exp_date}</td>
                      <td className="text-right font-bold">{it.qty}</td>
                      <td className="text-right">Rs.{it.purchase_rate}</td>
                      <td className="text-right">{it.gst_rate}%</td>
                      <td className="text-right font-bold">Rs.{it.total_amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Calculation */}
            <div className="flex justify-between items-center border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Paid Amount (Rs):</span>
                <input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} className="w-24 border rounded p-1 font-bold text-emerald-800" />
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Grand Total Inc. Tax</p>
                <h3 className="text-xl font-black text-slate-900">Rs.{grandTotal.toFixed(2)}</h3>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSavePurchase} className="btn-primary">Confirm Purchase</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
