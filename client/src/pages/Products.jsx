import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Edit2, Package, Tag, Filter, AlertTriangle, CheckCircle2,
  Boxes, RefreshCw, X, ArrowUpDown, Layers, Calendar
} from 'lucide-react';
import { apiRequest } from '../api';

export default function Products({ showToast }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Quick Stock Adjustment Modal State
  const [stockAdjustProduct, setStockAdjustProduct] = useState(null);
  const [adjustFormData, setAdjustFormData] = useState({
    new_stock: '',
    adjustment_type: 'set', // 'set' or 'delta'
    qty_change: '',
    notes: 'Physical inventory audit'
  });
  const [isAdjusting, setIsAdjusting] = useState(false);

  const [formData, setFormData] = useState({
    name: '', product_code: '', sku: '', barcode: '', category_id: '', brand_id: '',
    product_type: 'Fertilizer', primary_unit_id: '1', purchase_price: 0, selling_price: 0,
    mrp: 0, gst_rate: 5, hsn_code: '', min_stock: 10, reorder_level: 20, description: '',
    opening_stock: 0, batch_no: '', exp_date: '', current_stock: 0, stock_notes: ''
  });

  const fetchData = async () => {
    try {
      let query = `?search=${encodeURIComponent(search)}`;
      if (selectedCat) query += `&category_id=${selectedCat}`;

      const [pRes, mRes] = await Promise.all([
        apiRequest(`/products${query}`),
        apiRequest('/products/masters/all')
      ]);

      if (pRes.success) setProducts(pRes.products || []);
      if (mRes.success) {
        setCategories(mRes.categories || []);
        setBrands(mRes.brands || []);
        setUnits(mRes.units || []);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, selectedCat]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const method = editingId ? 'PUT' : 'POST';
      const endpoint = editingId ? `/products/${editingId}` : '/products';

      const res = await apiRequest(endpoint, {
        method,
        body: JSON.stringify(formData)
      });

      if (res.success) {
        showToast(res.message, 'success');
        setShowModal(false);
        setEditingId(null);
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openAdd = () => {
    setEditingId(null);
    const defaultExp = new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFormData({
      name: '',
      product_code: `PRD-${Date.now().toString().slice(-6)}`,
      sku: '',
      barcode: '',
      category_id: categories[0]?.id || '',
      brand_id: brands[0]?.id || '',
      product_type: 'Fertilizer',
      primary_unit_id: units[0]?.id || '1',
      purchase_price: 0,
      selling_price: 0,
      mrp: 0,
      gst_rate: 5,
      hsn_code: '',
      min_stock: 10,
      reorder_level: 20,
      description: '',
      opening_stock: 0,
      batch_no: `BATCH-${Date.now().toString().slice(-4)}`,
      exp_date: defaultExp,
      current_stock: 0,
      stock_notes: ''
    });
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setFormData({
      name: p.name,
      product_code: p.product_code,
      sku: p.sku || '',
      barcode: p.barcode || '',
      category_id: p.category_id || '',
      brand_id: p.brand_id || '',
      product_type: p.product_type,
      primary_unit_id: p.primary_unit_id,
      purchase_price: p.purchase_price,
      selling_price: p.selling_price,
      mrp: p.mrp,
      gst_rate: p.gst_rate,
      hsn_code: p.hsn_code || '',
      min_stock: p.min_stock,
      reorder_level: p.reorder_level,
      description: p.description || '',
      opening_stock: 0,
      batch_no: '',
      exp_date: '',
      current_stock: p.total_available_qty || 0,
      stock_notes: 'Stock updated via Product Master'
    });
    setShowModal(true);
  };

  const openQuickAdjust = (p) => {
    setStockAdjustProduct(p);
    setAdjustFormData({
      new_stock: p.total_available_qty || 0,
      adjustment_type: 'set',
      qty_change: '',
      notes: 'Physical inventory audit'
    });
  };

  const handleQuickAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!stockAdjustProduct) return;

    setIsAdjusting(true);
    try {
      const res = await apiRequest(`/products/${stockAdjustProduct.id}/adjust-stock`, {
        method: 'POST',
        body: JSON.stringify(adjustFormData)
      });

      if (res.success) {
        showToast(res.message, 'success');
        setStockAdjustProduct(null);
        fetchData();
      }
    } catch (err) {
      showToast(err.message || 'Failed to adjust stock', 'error');
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <div className="p-5 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Product Master Catalog</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
              {products.length} Products
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Manage seed, fertilizer, pesticide items, rates, and on-hand inventory stock</p>
        </div>

        <button
          onClick={openAdd}
          className="btn-primary cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Filter Header */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product by Name, Code, Barcode, SKU..."
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
          />
        </div>
        <select
          value={selectedCat}
          onChange={(e) => setSelectedCat(e.target.value)}
          className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Product Table */}
      <div className="card-panel overflow-hidden shadow-sm">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product Code / Name</th>
              <th>Category & Brand</th>
              <th>Type</th>
              <th className="text-right">Available Stock</th>
              <th className="text-right">Purchase Price</th>
              <th className="text-right">Selling Price</th>
              <th>HSN / GST</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-8 text-slate-400 font-medium">No products found.</td></tr>
            ) : (
              products.map((p) => {
                const isLowStock = p.total_available_qty <= p.min_stock;
                const isOutOfStock = p.total_available_qty === 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition">
                    <td>
                      <p className="font-bold text-slate-900 text-xs">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">Code: {p.product_code} | Barcode: {p.barcode || 'N/A'}</p>
                    </td>
                    <td>
                      <p className="text-xs font-semibold text-slate-700">{p.category_name || 'Unassigned'}</p>
                      <p className="text-[10px] text-slate-500">{p.brand_name || 'Generic'}</p>
                    </td>
                    <td>
                      <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                        {p.product_type}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`font-mono text-xs font-bold ${
                          isOutOfStock ? 'text-red-600 font-black' : isLowStock ? 'text-amber-700 font-black' : 'text-slate-900'
                        }`}>
                          {p.total_available_qty} {p.unit_symbol}
                        </span>
                        <button
                          onClick={() => openQuickAdjust(p)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 border border-slate-200 transition cursor-pointer"
                          title="Quick Adjust Stock"
                        >
                          ± Stock
                        </button>
                      </div>
                      {isLowStock && (
                        <p className="text-[9px] text-red-600 font-bold uppercase mt-0.5">
                          {isOutOfStock ? 'Out of Stock' : 'Low Stock Alert'}
                        </p>
                      )}
                    </td>
                    <td className="text-right font-mono text-xs text-slate-600">₹{p.purchase_price}</td>
                    <td className="text-right font-mono font-bold text-xs text-emerald-800">₹{p.selling_price}</td>
                    <td className="text-xs">
                      <p className="text-slate-700 font-mono text-[11px]">{p.hsn_code || '-'}</p>
                      <p className="text-[10px] text-slate-400">GST: {p.gst_rate}%</p>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition cursor-pointer"
                          title="Edit Product Details & Stock"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ADD / EDIT PRODUCT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 border border-slate-300 animate-in fade-in zoom-in-95 duration-150 max-h-[95vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3 shrink-0">
              <div>
                <h2 className="font-extrabold text-base text-slate-900">
                  {editingId ? 'Edit Product & Stock' : 'Add New Product Master'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {editingId ? 'Modify product parameters, pricing, and on-hand inventory' : 'Enter product catalog details and initial opening stock'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
              {/* Basic Details Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Product Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Urea 46% Nitrogen (50kg)"
                    required
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Product Code *</label>
                  <input
                    type="text"
                    value={formData.product_code}
                    onChange={e => setFormData({...formData, product_code: e.target.value})}
                    required
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Product Type *</label>
                  <select
                    value={formData.product_type}
                    onChange={e => setFormData({...formData, product_type: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    {['Fertilizer', 'Seed', 'Pesticide', 'Insecticide', 'Fungicide', 'Herbicide', 'Plant Growth Promoter', 'Agricultural Tool', 'Equipment', 'Other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Primary Unit *</label>
                  <select
                    value={formData.primary_unit_id}
                    onChange={e => setFormData({...formData, primary_unit_id: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Category</label>
                  <select
                    value={formData.category_id}
                    onChange={e => setFormData({...formData, category_id: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Brand / Manufacturer</label>
                  <select
                    value={formData.brand_id}
                    onChange={e => setFormData({...formData, brand_id: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="">Select Brand</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Pricing Grid */}
              <div className="border-t border-slate-200 pt-3">
                <p className="font-bold text-slate-800 mb-2 uppercase tracking-wider text-[11px]">Pricing & Taxation</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold block mb-1 text-slate-700">Purchase Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.purchase_price}
                      onChange={e => setFormData({...formData, purchase_price: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1 text-slate-700">Selling Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.selling_price}
                      onChange={e => setFormData({...formData, selling_price: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-emerald-800"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1 text-slate-700">MRP (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.mrp}
                      onChange={e => setFormData({...formData, mrp: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1 text-slate-700">GST Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.gst_rate}
                      onChange={e => setFormData({...formData, gst_rate: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1 text-slate-700">HSN Code</label>
                    <input
                      type="text"
                      value={formData.hsn_code}
                      onChange={e => setFormData({...formData, hsn_code: e.target.value})}
                      placeholder="e.g. 3102"
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1 text-slate-700">Min Stock Alert</label>
                    <input
                      type="number"
                      value={formData.min_stock}
                      onChange={e => setFormData({...formData, min_stock: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* INVENTORY & STOCK MANAGEMENT SECTION */}
              <div className="border-t border-slate-200 pt-3 bg-emerald-50/50 p-3 rounded-xl border border-emerald-200/80">
                <div className="flex items-center gap-2 mb-2">
                  <Boxes className="w-4 h-4 text-emerald-700" />
                  <p className="font-black text-emerald-950 uppercase tracking-wider text-[11px]">
                    {editingId ? 'Edit On-Hand Stock' : 'Initial Opening Stock & Batch'}
                  </p>
                </div>

                {!editingId ? (
                  /* When Creating: Add Opening Stock & Batch Details */
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold block mb-1 text-slate-700">Opening Stock (Qty)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.opening_stock}
                        onChange={e => setFormData({...formData, opening_stock: e.target.value})}
                        placeholder="0"
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-sm"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Initial stock available in store</p>
                    </div>
                    <div>
                      <label className="font-bold block mb-1 text-slate-700">Batch Number</label>
                      <input
                        type="text"
                        value={formData.batch_no}
                        onChange={e => setFormData({...formData, batch_no: e.target.value})}
                        placeholder="BATCH-01"
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1 text-slate-700">Expiry Date</label>
                      <input
                        type="date"
                        value={formData.exp_date}
                        onChange={e => setFormData({...formData, exp_date: e.target.value})}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  /* When Editing: Update Current Stock */
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold block mb-1 text-slate-700">Total Available Stock (Qty)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.current_stock}
                        onChange={e => setFormData({...formData, current_stock: e.target.value})}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-sm text-emerald-900"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">Updating this changes the active batch stock and logs audit movement</p>
                    </div>
                    <div>
                      <label className="font-bold block mb-1 text-slate-700">Adjustment Reason / Notes</label>
                      <input
                        type="text"
                        value={formData.stock_notes}
                        onChange={e => setFormData({...formData, stock_notes: e.target.value})}
                        placeholder="e.g. Stock count audit correction"
                        className="w-full bg-white border border-slate-300 rounded-lg p-2"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editingId ? 'Update Product & Stock' : 'Save Product with Stock'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK STOCK ADJUSTMENT MODAL */}
      {stockAdjustProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <ArrowUpDown className="w-4 h-4 text-emerald-600" />
                  <span>Quick Stock Adjustment</span>
                </h3>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">{stockAdjustProduct.name}</p>
              </div>
              <button
                onClick={() => setStockAdjustProduct(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAdjustSubmit} className="space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                <span className="text-slate-600 font-semibold">Current Available Stock:</span>
                <span className="font-mono font-black text-sm text-slate-900">
                  {stockAdjustProduct.total_available_qty} {stockAdjustProduct.unit_symbol}
                </span>
              </div>

              <div>
                <label className="font-bold block mb-1 text-slate-700">Adjustment Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustFormData({...adjustFormData, adjustment_type: 'set'})}
                    className={`p-2 rounded-lg font-bold border transition cursor-pointer ${
                      adjustFormData.adjustment_type === 'set'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Set New Total
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustFormData({...adjustFormData, adjustment_type: 'delta'})}
                    className={`p-2 rounded-lg font-bold border transition cursor-pointer ${
                      adjustFormData.adjustment_type === 'delta'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Add / Deduct (+ / -)
                  </button>
                </div>
              </div>

              {adjustFormData.adjustment_type === 'set' ? (
                <div>
                  <label className="font-bold block mb-1 text-slate-700">
                    New Exact Stock ({stockAdjustProduct.unit_symbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjustFormData.new_stock}
                    onChange={e => setAdjustFormData({...adjustFormData, new_stock: e.target.value})}
                    placeholder="Enter new stock count"
                    required
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono font-bold text-sm text-emerald-950 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="font-bold block mb-1 text-slate-700">
                    Quantity Change (+ to add, - to deduct)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjustFormData.qty_change}
                    onChange={e => setAdjustFormData({...adjustFormData, qty_change: e.target.value})}
                    placeholder="e.g. 10 or -5"
                    required
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono font-bold text-sm text-emerald-950 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="font-bold block mb-1 text-slate-700">Adjustment Note / Reason</label>
                <input
                  type="text"
                  value={adjustFormData.notes}
                  onChange={e => setAdjustFormData({...adjustFormData, notes: e.target.value})}
                  placeholder="e.g. Physical inventory count audit"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setStockAdjustProduct(null)}
                  className="btn-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className="btn-primary cursor-pointer"
                >
                  {isAdjusting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Save Stock Adjustment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
