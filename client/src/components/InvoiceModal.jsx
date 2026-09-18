import React, { useState } from 'react';
import { Printer, Download, Share2, X, FileText, CheckCircle2, QrCode, ShieldCheck, MessageCircle, Send } from 'lucide-react';

export default function InvoiceModal({ invoiceData, onClose }) {
  const [printFormat, setPrintFormat] = useState('a4'); // 'a4' or 'thermal'

  if (!invoiceData) return null;

  const { sale, items, storeSettings = {} } = invoiceData;

  const [whatsappMobile, setWhatsappMobile] = useState(
    sale.customer_mobile ? String(sale.customer_mobile).replace(/\D/g, '').slice(-10) : ''
  );
  const [whatsappError, setWhatsappError] = useState('');

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppSend = () => {
    const rawNumber = String(whatsappMobile || '').replace(/\D/g, '');
    if (!rawNumber || rawNumber.length < 10) {
      setWhatsappError('Enter 10-digit mobile #');
      return;
    }
    setWhatsappError('');

    const cleanNumber = rawNumber.length === 12 && rawNumber.startsWith('91')
      ? rawNumber
      : `91${rawNumber.slice(-10)}`;

    const itemsList = items.map((it, idx) =>
      `${idx + 1}. *${it.product_name}*\n   Qty: ${it.qty} ${it.unit} x ₹${it.unit_price} = ₹${it.total_amount}`
    ).join('\n');

    const message = `🧾 *TAX INVOICE - ${storeSettings.store_name || 'KRUSHI SEVA KENDRA'}*
----------------------------------------
*Invoice No:* ${sale.invoice_no}
*Date:* ${new Date(sale.sale_date).toLocaleDateString('en-IN')} ${new Date(sale.sale_date).toLocaleTimeString('en-IN')}
*Customer:* ${sale.customer_name || 'Valued Farmer'}
*Payment Status:* ${sale.payment_status}

*ITEMS BILLED:*
${itemsList}

----------------------------------------
*Taxable Value:* ₹${sale.total_taxable}
*GST Tax:* ₹${sale.total_tax}
${sale.total_discount > 0 ? `*Discount:* -₹${sale.total_discount}\n` : ''}${sale.round_off !== 0 ? `*Round Off:* ₹${sale.round_off}\n` : ''}*GRAND TOTAL: ₹${sale.grand_total}*
*Paid Amount:* ₹${sale.paid_amount}
${sale.due_amount > 0 ? `*DUE BALANCE (UDHAR):* ₹${sale.due_amount}\n` : ''}----------------------------------------
GSTIN: ${storeSettings.gstin || '27AAAAA0000A1Z5'}
${storeSettings.address || 'Main Road, APMC Market Yard, Nashik'}
_Thank you for your business with us!_`;

    const url = `https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Convert numbers to Indian Rupees Words
  const numberToWords = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n) => {
      if ((n = String(n)).length > 9) return 'overflow';
      let n_arr = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
      if (!n_arr) return '';
      let str = '';
      str += (Number(n_arr[1]) !== 0) ? (a[Number(n_arr[1])] || b[n_arr[1][0]] + ' ' + a[n_arr[1][1]]) + 'Crore ' : '';
      str += (Number(n_arr[2]) !== 0) ? (a[Number(n_arr[2])] || b[n_arr[2][0]] + ' ' + a[n_arr[2][1]]) + 'Lakh ' : '';
      str += (Number(n_arr[3]) !== 0) ? (a[Number(n_arr[3])] || b[n_arr[3][0]] + ' ' + a[n_arr[3][1]]) + 'Thousand ' : '';
      str += (Number(n_arr[4]) !== 0) ? (a[Number(n_arr[4])] || b[n_arr[4][0]] + ' ' + a[n_arr[4][1]]) + 'Hundred ' : '';
      str += (Number(n_arr[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n_arr[5])] || b[n_arr[5][0]] + ' ' + a[n_arr[5][1]]) : '';
      return str;
    };

    const integerPart = Math.floor(num);
    const paise = Math.round((num - integerPart) * 100);

    let words = inWords(integerPart);
    if (!words.trim()) words = 'Zero ';
    words += 'Rupees ';
    if (paise > 0) {
      words += 'and ' + inWords(paise) + 'Paise ';
    }
    return words + 'Only';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] flex flex-col overflow-hidden border border-slate-700/50 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Toolbar Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between bg-slate-950 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600/20 p-2 rounded-lg border border-emerald-500/30 text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-sm tracking-tight text-white">GST Tax Invoice #{sale.invoice_no}</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {sale.payment_status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Issued on {new Date(sale.sale_date).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Format Switcher */}
            <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex text-xs">
              <button
                onClick={() => setPrintFormat('a4')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  printFormat === 'a4' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                A4 Standard
              </button>
              <button
                onClick={() => setPrintFormat('thermal')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  printFormat === 'thermal' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                80mm Thermal
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="btn-primary text-xs py-1.5 px-3 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Invoice</span>
            </button>

            {/* WhatsApp Direct Send Strip - ALWAYS VISIBLE */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2 py-1 rounded-xl">
              <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex items-center text-xs">
                <span className="text-slate-400 font-mono text-[11px] mr-1">+91</span>
                <input
                  type="tel"
                  maxLength={10}
                  value={whatsappMobile}
                  onChange={(e) => {
                    setWhatsappMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setWhatsappError('');
                  }}
                  placeholder="10-digit Mobile #"
                  className="w-28 bg-transparent text-white font-mono text-xs focus:outline-none placeholder:text-slate-500 font-bold"
                />
              </div>
              <button
                type="button"
                onClick={handleWhatsAppSend}
                className="bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-black px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 shadow-sm transition cursor-pointer"
                title="Send bill directly to WhatsApp number"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WhatsApp Bill</span>
              </button>
            </div>

            {whatsappError && (
              <span className="text-red-400 text-[10px] font-bold animate-pulse">{whatsappError}</span>
            )}

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center">
          {printFormat === 'a4' ? (
            /* OFFICIAL GST A4 TAX INVOICE */
            <div className="printable-area bg-white p-8 border border-slate-300 rounded-lg shadow-sm w-full max-w-3xl text-slate-900 text-xs font-sans">
              {/* Header: TAX INVOICE & Store Details */}
              <div className="border-b-2 border-slate-900 pb-3 mb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold tracking-widest text-emerald-800 uppercase bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      TAX INVOICE / CASH MEMO
                    </span>
                    <h1 className="text-xl font-black text-slate-900 mt-1 uppercase tracking-tight">
                      {storeSettings.store_name || 'KRUSHI SEVA KENDRA'}
                    </h1>
                    <p className="text-xs text-slate-600 font-medium max-w-sm mt-0.5">
                      {storeSettings.address || 'Main Road, APMC Market Yard, Nashik - 422001'}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Phone: <strong className="text-slate-900">{storeSettings.mobile || '+91 98765 43210'}</strong> | Email: {storeSettings.email || 'info@krushiseva.com'}
                    </p>
                    <div className="mt-1 flex gap-3 text-[11px] font-semibold text-slate-800">
                      <span>GSTIN: <strong className="font-mono text-emerald-900">{storeSettings.gstin || '27AAAAA0000A1Z5'}</strong></span>
                      <span>•</span>
                      <span>State: <strong className="text-slate-900">Maharashtra (Code: 27)</strong></span>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="inline-block bg-slate-900 text-white font-bold px-3 py-1 rounded text-[11px] uppercase tracking-wider">
                      ORIGINAL FOR RECIPIENT
                    </div>
                    <p className="font-black text-sm text-slate-900 pt-1 font-mono">Invoice #: {sale.invoice_no}</p>
                    <p className="text-slate-600">Date: <strong className="text-slate-900">{new Date(sale.sale_date).toLocaleDateString('en-IN')}</strong></p>
                    <p className="text-slate-600">Time: {new Date(sale.sale_date).toLocaleTimeString('en-IN')}</p>
                    <p className="text-slate-600">Place of Supply: <strong className="text-slate-900">Maharashtra (27)</strong></p>
                    <p className="text-slate-600">Reverse Charge: <strong>No</strong></p>
                  </div>
                </div>
              </div>

              {/* Billed To / Farmer Info */}
              <div className="grid grid-cols-2 gap-4 border border-slate-200 rounded-lg p-3 bg-slate-50/50 mb-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Billed To (Customer / Farmer)</p>
                  <p className="font-bold text-sm text-slate-900">{sale.customer_name || 'Walk-in Customer'}</p>
                  <p className="text-slate-600">Village / Address: {sale.customer_village || 'Local Farmer'}</p>
                  <p className="text-slate-600">Mobile: <strong className="text-slate-900 font-mono">{sale.customer_mobile || 'N/A'}</strong></p>
                </div>
                <div className="text-right border-l border-slate-200 pl-4 space-y-0.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Payment Terms & Status</p>
                  <p className="font-bold text-slate-900">Mode: {sale.payment_status === 'PAID' ? 'Fully Paid' : sale.payment_status}</p>
                  {sale.customer_current_balance > 0 && (
                    <p className="font-bold text-red-600">
                      Total Ledger Outstanding: ₹{sale.customer_current_balance}
                    </p>
                  )}
                </div>
              </div>

              {/* Line Items Table */}
              <table className="w-full text-left border-collapse border border-slate-300 mb-3 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                    <th className="p-1.5 border-r border-slate-300 text-center w-6">#</th>
                    <th className="p-1.5 border-r border-slate-300">Description of Goods</th>
                    <th className="p-1.5 border-r border-slate-300 text-center">Batch #</th>
                    <th className="p-1.5 border-r border-slate-300 text-center">Exp Date</th>
                    <th className="p-1.5 border-r border-slate-300 text-right">Qty</th>
                    <th className="p-1.5 border-r border-slate-300 text-right">Unit Rate</th>
                    <th className="p-1.5 border-r border-slate-300 text-right">GST %</th>
                    <th className="p-1.5 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((it, idx) => (
                    <tr key={it.id || idx} className="hover:bg-slate-50">
                      <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-1.5 border-r border-slate-200 font-semibold text-slate-900">{it.product_name}</td>
                      <td className="p-1.5 border-r border-slate-200 font-mono text-center">{it.batch_no}</td>
                      <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-600">{it.exp_date}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono font-semibold">{it.qty} {it.unit}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono">₹{it.unit_price}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono">{it.gst_rate}%</td>
                      <td className="p-1.5 text-right font-mono font-bold text-slate-900">₹{it.total_amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Tax Summary & Totals */}
              <div className="grid grid-cols-2 gap-4 border-t-2 border-slate-900 pt-3">
                <div className="space-y-2">
                  <div>
                    <p className="font-bold text-slate-800">Amount in Words:</p>
                    <p className="italic font-serif text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-200 font-semibold">
                      {numberToWords(sale.grand_total)}
                    </p>
                  </div>

                  <div className="text-[10px] text-slate-500 space-y-0.5 border-t pt-2">
                    <p className="font-bold text-slate-700">Bank Details for Transfer:</p>
                    <p>Bank: <strong>ICICI Bank</strong> | A/C: <strong>123405009876</strong></p>
                    <p>IFSC: <strong>ICIC0001234</strong> | UPI: <strong>krushiseva@icici</strong></p>
                  </div>

                  <div className="text-[9px] text-slate-500 pt-1">
                    <p><strong>Declaration:</strong> We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-right font-mono text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Amount:</span>
                    <span>₹{sale.total_taxable}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Central GST (CGST):</span>
                    <span>₹{(sale.total_tax / 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>State GST (SGST):</span>
                    <span>₹{(sale.total_tax / 2).toFixed(2)}</span>
                  </div>
                  {sale.total_discount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Total Discount:</span>
                      <span>- ₹{sale.total_discount}</span>
                    </div>
                  )}
                  {sale.round_off !== 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Round Off:</span>
                      <span>₹{sale.round_off}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-black text-sm text-slate-900 border-t-2 border-slate-900 pt-1.5">
                    <span>GRAND TOTAL:</span>
                    <span className="text-emerald-800">₹{sale.grand_total}</span>
                  </div>

                  <div className="flex justify-between font-bold text-slate-700 pt-0.5">
                    <span>Paid Amount:</span>
                    <span>₹{sale.paid_amount}</span>
                  </div>

                  {sale.due_amount > 0 && (
                    <div className="flex justify-between font-black text-red-600 border-t border-dashed pt-1">
                      <span>Balance Due (Udhar):</span>
                      <span>₹{sale.due_amount}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Signatory Footer */}
              <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between items-end text-xs text-slate-600">
                <div>
                  <p className="text-[10px]">Thank you for supporting Indian Agriculture!</p>
                  <p className="text-[9px] text-slate-400">Generated via KrushiPOS Enterprise System</p>
                </div>
                <div className="text-center">
                  <div className="w-36 h-10 border-b border-slate-400 mb-1"></div>
                  <p className="font-bold text-slate-800">{storeSettings.store_name || 'KRUSHI SEVA KENDRA'}</p>
                  <p className="text-[10px] text-slate-500">Authorized Signatory</p>
                </div>
              </div>
            </div>
          ) : (
            /* 80mm THERMAL RECEIPT FORMAT */
            <div className="printable-area bg-white p-4 border border-slate-300 rounded shadow-sm w-76 text-[11px] font-mono leading-tight text-slate-900">
              <div className="text-center border-b border-dashed border-slate-400 pb-2 mb-2">
                <h2 className="font-black text-sm uppercase">{storeSettings.store_name || 'KRUSHI SEVA KENDRA'}</h2>
                <p className="text-[10px]">{storeSettings.address || 'APMC Yard, Nashik'}</p>
                <p className="text-[10px]">Mob: {storeSettings.mobile || '9876543210'}</p>
                <p className="font-bold text-[10px]">GSTIN: {storeSettings.gstin || '27AAAAA0000A1Z5'}</p>
              </div>

              <div className="border-b border-dashed border-slate-400 pb-2 mb-2 text-[10px]">
                <p><strong>Inv #:</strong> {sale.invoice_no}</p>
                <p><strong>Date:</strong> {new Date(sale.sale_date).toLocaleString('en-IN')}</p>
                <p><strong>Cust:</strong> {sale.customer_name || 'Walk-in Farmer'}</p>
                {sale.customer_mobile && <p><strong>Mob:</strong> {sale.customer_mobile}</p>}
              </div>

              <table className="w-full text-left mb-2 text-[10px]">
                <thead>
                  <tr className="border-b border-slate-900">
                    <th className="py-1">Item</th>
                    <th className="text-right py-1">Qty</th>
                    <th className="text-right py-1">Amt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dotted divide-slate-300">
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-1">
                        <div className="font-bold">{it.product_name}</div>
                        <div className="text-[9px] text-slate-500">Batch: {it.batch_no}</div>
                      </td>
                      <td className="text-right py-1">{it.qty}</td>
                      <td className="text-right py-1 font-bold">₹{it.total_amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-dashed border-slate-400 pt-2 text-right space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Taxable Value:</span>
                  <span>₹{sale.total_taxable}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST Tax:</span>
                  <span>₹{sale.total_tax}</span>
                </div>
                {sale.total_discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Discount:</span>
                    <span>-₹{sale.total_discount}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm border-t border-b border-slate-900 py-1">
                  <span>TOTAL:</span>
                  <span>₹{sale.grand_total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid Amount:</span>
                  <span>₹{sale.paid_amount}</span>
                </div>
                {sale.due_amount > 0 && (
                  <div className="flex justify-between font-bold text-red-600">
                    <span>DUE (UDHAR):</span>
                    <span>₹{sale.due_amount}</span>
                  </div>
                )}
              </div>

              <div className="text-center border-t border-dashed border-slate-400 mt-3 pt-2 text-[10px]">
                <p className="font-bold">*** THANK YOU! VISIT AGAIN ***</p>
                <p className="text-[9px] text-slate-500">Powered by KrushiPOS System</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
