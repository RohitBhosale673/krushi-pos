import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Minus, Trash2, User, CreditCard, DollarSign, QrCode,
  Printer, Pause, Play, CheckCircle2, AlertCircle, AlertTriangle, ShieldAlert,
  Barcode, RefreshCw, X, ArrowRight, Sparkles, Tag, ShoppingBag, Layers, Calculator
} from 'lucide-react';
import { apiRequest } from '../api';

export default function POS({ showToast, onSaleComplete }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Discount & Round-off
  const [billDiscount, setBillDiscount] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [autoRoundOff, setAutoRoundOff] = useState(true);

  // Cash Tender Calculator
  const [cashTendered, setCashTendered] = useState('');

  // Payment Method Inputs
  const [paymentMethod, setPaymentMethod] = useState('Cash'); // 'Cash', 'UPI', 'Credit / Udhar', 'Split'
  const [splitPayments, setSplitPayments] = useState([
    { payment_method: 'Cash', amount: '' },
    { payment_method: 'UPI', amount: '' }
  ]);

  // Hold Bills
  const [heldBills, setHeldBills] = useState([]);
  const [showHoldDrawer, setShowHoldDrawer] = useState(false);

  // Expiry Override Flag
  const [overrideExpiry, setOverrideExpiry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search Input Ref for quick focus
  const searchInputRef = useRef(null);

  const FILTER_TYPES = [
    'All Items',
    'Fertilizers',
    'Pesticides',
    'Seeds',
    'Insecticides',
    'Fungicides',
    'Herbicides',
    'Plant Growth Promoters',
    'Agricultural Tools'
  ];

  // Load Categories & Customers on mount
  useEffect(() => {
    fetchInitialData();
    fetchHeldBills();
  }, []);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleCompleteSale();
      } else if (e.key === 'F4') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (searchQuery) {
          setSearchQuery('');
          setSearchResults([]);
        } else if (cart.length > 0) {
          setCart([]);
          setCashTendered('');
          showToast('Cart cleared', 'info');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, paymentMethod, splitPayments, selectedCustomer, billDiscount, roundOff, overrideExpiry, searchQuery]);

  const fetchInitialData = async () => {
    try {
      const [catRes, custRes, searchRes] = await Promise.all([
        apiRequest('/products/masters/all'),
        apiRequest('/customers'),
        apiRequest('/pos/search')
      ]);
      if (catRes.success) setCategories(catRes.categories || []);
      if (custRes.success) setCustomers(custRes.customers || []);
      if (searchRes.success) setCatalogItems(searchRes.items || []);
    } catch (err) {
      console.error('Error loading POS masters:', err);
    }
  };

  const fetchHeldBills = async () => {
    try {
      const res = await apiRequest('/pos/held');
      if (res.success) setHeldBills(res.heldBills || []);
    } catch (err) {
      console.error('Held bills fetch error:', err);
    }
  };

  // Product Search & Category Filter Execution
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const queryParams = [];
        if (searchQuery.trim()) queryParams.push(`q=${encodeURIComponent(searchQuery.trim())}`);
        if (selectedCategory && selectedCategory !== 'All Items') queryParams.push(`product_type=${encodeURIComponent(selectedCategory)}`);

        const res = await apiRequest(`/pos/search?${queryParams.join('&')}`);
        if (res.success) {
          setSearchResults(searchQuery.trim() ? (res.items || []) : []);
          setCatalogItems(res.items || []);
        }
      } catch (err) {
        console.error('POS search error:', err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory]);

  // Barcode / Enter key scanner listener on search input
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        addToCart(searchResults[0]);
      } else if (catalogItems.length > 0 && searchQuery.trim()) {
        const exactMatch = catalogItems.find(it =>
          (it.barcode && it.barcode.toLowerCase() === searchQuery.trim().toLowerCase()) ||
          (it.sku && it.sku.toLowerCase() === searchQuery.trim().toLowerCase()) ||
          it.product_name.toLowerCase().includes(searchQuery.trim().toLowerCase())
        );
        if (exactMatch) {
          addToCart(exactMatch);
        }
      }
    }
  };

  // Add Item to Cart (FEFO Auto-selection if searched by product)
  const addToCart = (item) => {
    const today = new Date().toISOString().split('T')[0];
    if (item.exp_date < today && !overrideExpiry) {
      showToast(`Cannot add expired stock (${item.product_name} Exp: ${item.exp_date}). Enable Expiry Override if authorized.`, 'error');
      return;
    }

    const existingIndex = cart.findIndex(c => c.batch_id === item.batch_id);

    if (existingIndex > -1) {
      const existingItem = cart[existingIndex];
      if (existingItem.qty + 1 > item.available_qty) {
        showToast(`Stock limit reached for batch ${item.batch_no}. Max available: ${item.available_qty}`, 'warning');
        return;
      }
      const newCart = [...cart];
      newCart[existingIndex].qty += 1;
      setCart(newCart);
    } else {
      setCart([...cart, {
        batch_id: item.batch_id,
        product_id: item.product_id,
        product_name: item.product_name,
        batch_no: item.batch_no,
        exp_date: item.exp_date,
        unit_price: item.selling_rate,
        mrp: item.mrp,
        unit: item.unit_symbol || 'Pcs',
        gst_rate: item.gst_rate || 0,
        available_qty: item.available_qty,
        qty: 1,
        discount_percent: 0,
        discount_amount: 0
      }]);
    }

    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  // Update Cart Quantity / Discount
  const updateCartItem = (batchId, field, val) => {
    const newCart = cart.map(item => {
      if (item.batch_id === batchId) {
        let updatedVal = parseFloat(val) || 0;
        if (field === 'qty') {
          updatedVal = Math.min(item.available_qty, Math.max(1, updatedVal));
        }
        return { ...item, [field]: updatedVal };
      }
      return item;
    });
    setCart(newCart);
  };

  const removeFromCart = (batchId) => {
    setCart(cart.filter(c => c.batch_id !== batchId));
  };

  // Cart Calculations
  const rawSubtotal = cart.reduce((acc, it) => acc + (it.qty * it.unit_price) - (it.discount_amount || 0), 0);
  const totalTax = cart.reduce((acc, it) => {
    const lineTotal = (it.qty * it.unit_price) - (it.discount_amount || 0);
    const taxable = it.gst_rate > 0 ? (lineTotal / (1 + it.gst_rate / 100)) : lineTotal;
    return acc + (lineTotal - taxable);
  }, 0);

  const subtotalAfterDiscount = Math.max(0, rawSubtotal - (parseFloat(billDiscount) || 0));

  // Calculate Auto Round-Off
  const calculatedRoundOff = autoRoundOff
    ? Math.round(subtotalAfterDiscount) - subtotalAfterDiscount
    : (parseFloat(roundOff) || 0);

  const grandTotal = Math.max(0, Math.round((subtotalAfterDiscount + calculatedRoundOff) * 100) / 100);

  // Cash Change Calculation
  const numericCashTendered = parseFloat(cashTendered) || 0;
  const changeToReturn = numericCashTendered > 0 ? numericCashTendered - grandTotal : 0;

  // Complete Sale Execution
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      showToast('Cart is empty. Add products to generate bill.', 'warning');
      return;
    }

    let paymentPayload = [];

    if (paymentMethod === 'Cash') {
      paymentPayload = [{ payment_method: 'Cash', amount: grandTotal }];
    } else if (paymentMethod === 'UPI') {
      paymentPayload = [{ payment_method: 'UPI', amount: grandTotal }];
    } else if (paymentMethod === 'Credit / Udhar') {
      if (!selectedCustomer) {
        showToast('Please select a customer for Udhar / Credit billing.', 'warning');
        return;
      }
      paymentPayload = [{ payment_method: 'Credit / Udhar', amount: grandTotal }];
    } else if (paymentMethod === 'Split') {
      const validSplits = splitPayments.filter(p => parseFloat(p.amount) > 0);
      const splitSum = validSplits.reduce((acc, p) => acc + parseFloat(p.amount), 0);

      if (Math.abs(splitSum - grandTotal) > 0.01) {
        showToast(`Split payment total (Rs.${splitSum}) must equal Grand Total (Rs.${grandTotal}).`, 'error');
        return;
      }

      const hasCredit = validSplits.some(p => p.payment_method === 'Credit / Udhar');
      if (hasCredit && !selectedCustomer) {
        showToast('Please select a customer for credit portion.', 'warning');
        return;
      }
      paymentPayload = validSplits;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest('/pos/sale', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: selectedCustomer?.id || null,
          items: cart,
          payments: paymentPayload,
          bill_discount: parseFloat(billDiscount) || 0,
          round_off: calculatedRoundOff,
          override_expiry: overrideExpiry
        })
      });

      if (res.success) {
        showToast(`Tax Invoice #${res.invoice_no} completed successfully!`, 'success');
        setCart([]);
        setBillDiscount(0);
        setCashTendered('');
        setSelectedCustomer(null);

        // Fetch printable invoice details and trigger print modal callback
        const invRes = await apiRequest(`/pos/invoice/${encodeURIComponent(res.invoice_no)}`);
        if (invRes.success && onSaleComplete) {
          onSaleComplete(invRes);
        }
      }
    } catch (err) {
      showToast(err.message || 'Failed to complete sale.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hold Bill Action
  const handleHoldBill = async () => {
    if (cart.length === 0) return;
    try {
      const res = await apiRequest('/pos/hold', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: selectedCustomer?.name || 'Walk-in',
          items: cart
        })
      });
      if (res.success) {
        showToast('Bill successfully placed in Held queue', 'info');
        setCart([]);
        setCashTendered('');
        fetchHeldBills();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const resumeHeldBill = (held) => {
    setCart(held.items);
    setShowHoldDrawer(false);
    showToast('Held bill resumed to cart', 'success');
  };

  // Helper for FEFO expiry pill
  const getExpiryBadge = (expDate) => {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (expDate < today) {
      return <span className="badge-danger text-[10px] py-0 px-1.5">Expired</span>;
    }
    if (expDate <= thirtyDays) {
      return <span className="badge-warning text-[10px] py-0 px-1.5">&lt;30d Exp</span>;
    }
    return <span className="badge-active text-[10px] py-0 px-1.5">Fresh</span>;
  };

  return (
    <div className="h-[calc(100vh-53px)] flex flex-col overflow-hidden bg-slate-100 font-sans">
      {/* 1. TOP CASHIER COMMAND STRIP */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-1.5 flex items-center justify-between text-xs text-slate-300 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-emerald-400">
            <Barcode className="w-4 h-4 text-emerald-400" />
            <span className="uppercase tracking-wider text-[11px]">POS Terminal Counter</span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
            <span>Shortcut Commands:</span>
            <span className="flex items-center gap-1"><kbd className="kbd-chip kbd-chip-dark text-emerald-300">F2</kbd> Checkout</span>
            <span className="flex items-center gap-1"><kbd className="kbd-chip kbd-chip-dark">F4</kbd> Search/Scan</span>
            <span className="flex items-center gap-1"><kbd className="kbd-chip kbd-chip-dark">F8</kbd> Hold Bill</span>
            <span className="flex items-center gap-1"><kbd className="kbd-chip kbd-chip-dark">ESC</kbd> Clear Cart</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {heldBills.length > 0 && (
            <button
              onClick={() => setShowHoldDrawer(true)}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Pause className="w-3 h-3 text-amber-400" />
              <span>Held Bills ({heldBills.length})</span>
            </button>
          )}

          <div className="flex items-center gap-1 text-[11px] font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 text-slate-300">
            <span className="text-slate-400">Cart Items:</span>
            <span className="font-bold text-emerald-400">{cart.length}</span>
          </div>
        </div>
      </div>

      {/* 2. MAIN POS WORKSPACE: 2-COLUMN LAYOUT */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* LEFT PANEL: Barcode Scan / Catalog & Billing Cart (68% width) */}
        <div className="flex-1 flex flex-col p-3.5 space-y-3 overflow-hidden border-r border-slate-200/80">
          {/* Barcode & Search Station Bar */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center gap-2 pointer-events-none text-slate-400">
                <Barcode className="w-5 h-5 text-emerald-600" />
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Barcode Scanner Ready"></span>
              </div>

              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Scan Barcode or Search Agricultural Product by Name, Batch, HSN... [F4]"
                className="w-full bg-white border-2 border-slate-200 rounded-xl pl-13 pr-24 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-600 focus:ring-3 focus:ring-emerald-600/15 transition placeholder:text-slate-400"
              />

              <div className="absolute right-3 flex items-center gap-1.5">
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <kbd className="kbd-chip text-[10px] text-slate-500 bg-slate-100">F4 Focus</kbd>
              </div>

              {/* Instant Search Dropdown Popover */}
              {searchResults.length > 0 && (
                <div className="absolute top-full z-30 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-2xl max-h-80 overflow-y-auto divide-y divide-slate-100">
                  <div className="bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                    <span>Search Matches ({searchResults.length})</span>
                    <span className="text-emerald-700">Press Enter or Click to Add</span>
                  </div>
                  {searchResults.map((item) => (
                    <div
                      key={item.batch_id}
                      onClick={() => addToCart(item)}
                      className="p-3 hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition group"
                    >
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-900 text-xs group-hover:text-emerald-800">
                          {item.product_name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                          <span>Batch: <strong className="text-slate-700">{item.batch_no}</strong></span>
                          <span>•</span>
                          <span>Exp: <strong className="text-slate-700">{item.exp_date}</strong></span>
                          <span>•</span>
                          <span>GST: {item.gst_rate}%</span>
                          {getExpiryBadge(item.exp_date)}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-emerald-700 text-sm">₹{item.selling_rate}</p>
                        <p className="text-[10px] text-slate-500">
                          Stock: <strong className="text-slate-800 font-mono">{item.available_qty} {item.unit_symbol}</strong>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Category Quick Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              {FILTER_TYPES.map((type) => {
                const isActive = (type === 'All Items' && (!selectedCategory || selectedCategory === 'All Items')) || selectedCategory === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedCategory(type === 'All Items' ? '' : type)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold tracking-tight transition shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick-Pick Product Tiles (Shows when search is empty) */}
          {!searchQuery && catalogItems.length > 0 && (
            <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 shadow-2xs space-y-1.5 shrink-0">
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Quick Item Pick ({selectedCategory || 'Popular Items'} • {catalogItems.length})
                </span>
                {selectedCategory && (
                  <button onClick={() => setSelectedCategory('')} className="text-[11px] text-emerald-700 hover:underline font-semibold">
                    Reset Filter
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
                {catalogItems.slice(0, 12).map((item) => (
                  <button
                    key={item.batch_id}
                    onClick={() => addToCart(item)}
                    className="text-left bg-slate-50 hover:bg-emerald-50/80 border border-slate-200/80 hover:border-emerald-500/50 rounded-lg p-2 transition group flex flex-col justify-between cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-xs text-slate-900 group-hover:text-emerald-900 line-clamp-1">
                        {item.product_name}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                        <span className="font-mono">#{item.batch_no}</span>
                        {getExpiryBadge(item.exp_date)}
                      </div>
                    </div>
                    <div className="mt-1.5 flex justify-between items-baseline pt-1 border-t border-slate-200/60">
                      <span className="text-xs font-black text-emerald-700 tabular-nums">₹{item.selling_rate}</span>
                      <span className="text-[10px] text-slate-500 font-mono font-medium">{item.available_qty} {item.unit_symbol}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cart Table Panel */}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-2 flex justify-between items-center text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                <span className="uppercase tracking-wider">Billing Cart Table ({cart.length} Items)</span>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={() => {
                      setCart([]);
                      showToast('Cart cleared', 'info');
                    }}
                    className="text-red-600 hover:text-red-800 text-xs font-semibold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear [ESC]
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                    <Barcode className="w-8 h-8 stroke-1 text-slate-400" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-700 text-sm">Billing Cart is Empty</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Scan product barcode or use Quick Pick above to add items to the bill
                    </p>
                  </div>
                  <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <kbd className="kbd-chip">F4</kbd> Focus Barcode Scanner
                  </div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Product Description</th>
                      <th>Batch & FEFO</th>
                      <th className="text-center w-28">Quantity</th>
                      <th className="text-right">Unit Rate</th>
                      <th className="text-right w-24">Disc (₹)</th>
                      <th className="text-right">Net Amount</th>
                      <th className="text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map((item, idx) => {
                      const lineTotal = (item.qty * item.unit_price) - (item.discount_amount || 0);
                      return (
                        <tr key={item.batch_id} className="hover:bg-slate-50/70 transition">
                          <td className="font-mono text-[11px] text-slate-400 font-semibold">{idx + 1}</td>
                          <td>
                            <p className="font-bold text-slate-900 text-xs">{item.product_name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              GST: {item.gst_rate}% | MRP: ₹{item.mrp}
                            </p>
                          </td>
                          <td>
                            <div className="space-y-0.5">
                              <span className="font-mono text-xs font-semibold text-slate-800">{item.batch_no}</span>
                              <div className="text-[10px] flex items-center gap-1.5">
                                <span className="text-slate-400">Exp: {item.exp_date}</span>
                                {getExpiryBadge(item.exp_date)}
                              </div>
                            </div>
                          </td>
                          <td className="text-center">
                            <div className="inline-flex items-center border border-slate-300 rounded-lg bg-white shadow-2xs">
                              <button
                                onClick={() => updateCartItem(item.batch_id, 'qty', item.qty - 1)}
                                className="p-1 text-slate-500 hover:bg-slate-100 rounded-l transition cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={item.available_qty}
                                value={item.qty}
                                onChange={(e) => updateCartItem(item.batch_id, 'qty', e.target.value)}
                                className="w-11 text-center text-xs font-bold font-mono bg-transparent border-0 focus:outline-none"
                              />
                              <button
                                onClick={() => updateCartItem(item.batch_id, 'qty', item.qty + 1)}
                                className="p-1 text-slate-500 hover:bg-slate-100 rounded-r transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">Avail: {item.available_qty}</p>
                          </td>
                          <td className="text-right font-mono font-semibold text-xs text-slate-800">
                            ₹{item.unit_price}
                          </td>
                          <td className="text-right">
                            <input
                              type="number"
                              min="0"
                              value={item.discount_amount || ''}
                              onChange={(e) => updateCartItem(item.batch_id, 'discount_amount', e.target.value)}
                              placeholder="0"
                              className="w-16 text-right text-xs font-mono border border-slate-300 rounded px-1.5 py-0.5 focus:border-emerald-600 focus:outline-none"
                            />
                          </td>
                          <td className="text-right font-mono font-bold text-xs text-slate-900">
                            ₹{lineTotal.toFixed(2)}
                          </td>
                          <td className="text-center">
                            <button
                              onClick={() => removeFromCart(item.batch_id)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Remove Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Cash Register & Payment Checkout (32% width) */}
        <div className="w-full md:w-[380px] bg-white border-l border-slate-200 p-4 flex flex-col justify-between overflow-y-auto select-none">
          <div className="space-y-3.5">
            {/* 1. Customer Selection Card */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-600" /> Farmer / Customer
                </label>
                {selectedCustomer && (
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-[10px] text-red-600 font-bold hover:underline cursor-pointer"
                  >
                    Reset Walk-in
                  </button>
                )}
              </div>

              <select
                value={selectedCustomer?.id || ''}
                onChange={(e) => {
                  const cust = customers.find(c => String(c.id) === e.target.value);
                  setSelectedCustomer(cust || null);
                }}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600"
              >
                <option value="">-- Walk-in Customer (General) --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mobile}) - {c.village || 'Local'}
                  </option>
                ))}
              </select>

              {selectedCustomer && (
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between items-baseline">
                    <p className="font-bold text-emerald-950">{selectedCustomer.name}</p>
                    <span className="text-[10px] font-mono text-emerald-800">{selectedCustomer.mobile}</span>
                  </div>
                  <p className="text-[10px] text-emerald-800">{selectedCustomer.village || 'Local Farmer'}</p>
                  <div className="flex justify-between text-[11px] pt-1.5 border-t border-emerald-200/80 font-semibold">
                    <span className="text-slate-600">Credit Limit: ₹{selectedCustomer.credit_limit}</span>
                    <span className={selectedCustomer.current_balance > 0 ? 'text-red-600 font-bold' : 'text-emerald-700'}>
                      Udhar Bal: ₹{selectedCustomer.current_balance}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Payment Mode</span>
                <span className="text-[10px] font-mono text-slate-400 font-normal">Select Tender</span>
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'Cash', label: 'Cash Tender', icon: DollarSign },
                  { id: 'UPI', label: 'UPI / QR Pay', icon: QrCode },
                  { id: 'Credit / Udhar', label: 'Udhar / Credit', icon: CreditCard },
                  { id: 'Split', label: 'Split Payment', icon: Plus }
                ].map((m) => {
                  const Icon = m.icon;
                  const isSelected = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`p-2.5 rounded-xl border font-bold flex items-center gap-2 transition cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* CASH TENDER CHANGE CALCULATOR (When Cash is selected) */}
              {paymentMethod === 'Cash' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <Calculator className="w-3.5 h-3.5 text-emerald-600" /> Cash Tender Calculator
                    </span>
                    {cashTendered && (
                      <button onClick={() => setCashTendered('')} className="text-[10px] text-slate-400 hover:text-slate-600">
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-semibold">Received: ₹</span>
                    <input
                      type="number"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder={grandTotal.toFixed(0)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  {/* Quick Cash Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCashTendered(String(grandTotal))}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-emerald-50 text-[11px] font-bold text-slate-700 cursor-pointer"
                    >
                      Exact
                    </button>
                    {[100, 200, 500, 1000, 2000].map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        onClick={() => setCashTendered(String(denom))}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-emerald-50 text-[11px] font-mono font-semibold text-slate-700 cursor-pointer"
                      >
                        ₹{denom}
                      </button>
                    ))}
                  </div>

                  {/* Real-time Change Return Display */}
                  {numericCashTendered > 0 && (
                    <div className={`p-2 rounded-lg border flex justify-between items-center text-xs font-bold ${
                      changeToReturn >= 0
                        ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950'
                        : 'bg-amber-50 border-amber-300 text-amber-900'
                    }`}>
                      <span>{changeToReturn >= 0 ? 'Change to Return:' : 'Short Amount:'}</span>
                      <span className="font-mono text-sm">₹{Math.abs(changeToReturn).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* DYNAMIC UPI QR CODE DISPLAY (When UPI is selected) */}
              {paymentMethod === 'UPI' && (
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2 text-xs text-center">
                  <p className="font-bold text-emerald-900 flex items-center justify-center gap-1.5">
                    <QrCode className="w-4 h-4 text-emerald-700" /> Instant UPI Customer Scan
                  </p>
                  <div className="inline-block p-2 bg-white rounded-xl border border-emerald-300 shadow-xs">
                    {/* Simulated SVG High-Tech QR Code */}
                    <div className="w-28 h-28 bg-slate-950 p-2 rounded-lg flex flex-col justify-between mx-auto">
                      <div className="flex justify-between">
                        <div className="w-6 h-6 border-2 border-white p-0.5"><div className="w-full h-full bg-emerald-400"></div></div>
                        <div className="w-6 h-6 border-2 border-white p-0.5"><div className="w-full h-full bg-emerald-400"></div></div>
                      </div>
                      <div className="text-[8px] text-center font-mono text-emerald-300 font-bold">
                        ₹{grandTotal.toFixed(2)}
                      </div>
                      <div className="flex justify-between">
                        <div className="w-6 h-6 border-2 border-white p-0.5"><div className="w-full h-full bg-emerald-400"></div></div>
                        <div className="w-4 h-4 bg-white/30 rounded"></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    UPI ID: <strong className="text-slate-900 font-mono">krushiseva@icici</strong>
                  </p>
                  <p className="text-[10px] text-slate-500">Scan via PhonePe, Google Pay, or Paytm</p>
                </div>
              )}

              {/* Split Payment Drawer */}
              {paymentMethod === 'Split' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <p className="font-bold text-slate-800">Split Breakdown</p>
                  {splitPayments.map((sp, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select
                        value={sp.payment_method}
                        onChange={(e) => {
                          const newSplits = [...splitPayments];
                          newSplits[idx].payment_method = e.target.value;
                          setSplitPayments(newSplits);
                        }}
                        className="border rounded p-1 text-xs bg-white"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Credit / Udhar">Credit / Udhar</option>
                      </select>
                      <input
                        type="number"
                        value={sp.amount}
                        onChange={(e) => {
                          const newSplits = [...splitPayments];
                          newSplits[idx].amount = e.target.value;
                          setSplitPayments(newSplits);
                        }}
                        placeholder="Amount"
                        className="w-full border rounded p-1 text-xs bg-white font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expiry Override Authorization */}
            <div className="flex items-center justify-between p-2 bg-amber-50/80 border border-amber-200 rounded-lg text-xs">
              <span className="font-semibold text-amber-900 flex items-center gap-1.5 text-[11px]">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700" /> Expiry Override (Supervisor)
              </span>
              <input
                type="checkbox"
                checked={overrideExpiry}
                onChange={(e) => setOverrideExpiry(e.target.checked)}
                className="w-4 h-4 accent-amber-700 cursor-pointer"
              />
            </div>
          </div>

          {/* 3. BILL SUMMARY & GRAND TOTAL CHECKOUT */}
          <div className="border-t border-slate-200 pt-3 space-y-2.5 mt-3">
            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Items Subtotal:</span>
                <span className="font-mono font-semibold text-slate-900">₹{rawSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated GST Tax:</span>
                <span className="font-mono font-semibold text-slate-900">₹{totalTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Bill Discount (₹):</span>
                <input
                  type="number"
                  min="0"
                  value={billDiscount}
                  onChange={(e) => setBillDiscount(e.target.value)}
                  className="w-20 text-right border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRoundOff}
                    onChange={(e) => setAutoRoundOff(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  <span>Auto Round Off:</span>
                </label>
                <span className="font-mono text-slate-700">₹{calculatedRoundOff.toFixed(2)}</span>
              </div>
            </div>

            {/* High-Contrast LED Grand Total Readout */}
            <div className="bg-slate-950 text-white p-3.5 rounded-xl flex justify-between items-center shadow-lg border border-slate-800">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Net Payable</p>
                <h3 className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleHoldBill}
                disabled={cart.length === 0}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                title="Hold Bill [F8]"
              >
                <Pause className="w-3.5 h-3.5" /> Hold <kbd className="kbd-chip kbd-chip-dark text-[9px]">F8</kbd>
              </button>
            </div>

            {/* Main Action Button */}
            <button
              type="button"
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || isSubmitting}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white font-extrabold py-3 rounded-xl shadow-lg shadow-emerald-700/30 flex items-center justify-center gap-2 text-sm transition-all hover:scale-[1.01] active:scale-98 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Invoice...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>COMPLETE & PRINT SALE</span>
                  <kbd className="kbd-chip kbd-chip-dark text-white bg-emerald-800/80 border-emerald-600 text-[10px]">
                    F2
                  </kbd>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Held Bills Slide-In Drawer */}
      {showHoldDrawer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <div className="w-88 bg-white h-full p-4 space-y-4 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Held Billing Queue</h3>
                <p className="text-[11px] text-slate-500">{heldBills.length} suspended customer bills</p>
              </div>
              <button
                onClick={() => setShowHoldDrawer(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {heldBills.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No held bills currently.</p>
              ) : (
                heldBills.map((h) => (
                  <div key={h.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50 hover:bg-emerald-50/50 transition flex justify-between items-center">
                    <div>
                      <p className="font-bold text-xs text-slate-900">{h.customer_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {h.items.length} items • {new Date(h.time).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      onClick={() => resumeHeldBill(h)}
                      className="btn-primary text-xs py-1 px-2.5"
                    >
                      Resume
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
