import React, { useState, useEffect } from 'react';
import { Settings, Save, Download, Database, Printer, Building } from 'lucide-react';
import { apiRequest, getAuthToken } from '../api';

export default function BusinessSettings({ showToast }) {
  const [settings, setSettings] = useState({
    store_name: '', tagline: '', address: '', mobile: '', email: '',
    gstin: '', invoice_prefix: '', thermal_header: '', thermal_footer: '',
    sms_provider: 'Simulated', sms_sender_id: 'KRUSHI', sms_api_key: ''
  });
  const [loading, setLoading] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await apiRequest('/settings');
      if (res.success && res.settings) {
        setSettings(prev => ({ ...prev, ...res.settings }));
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest('/settings/update', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      if (res.success) {
        showToast('Business settings saved successfully!', 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBackup = () => {
    const token = getAuthToken();
    const url = `/api/settings/backup/download?token=${token}`;
    window.open(url, '_blank');
    showToast('Downloading complete SQLite database backup...', 'info');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="border-b pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Business & Printer Settings</h1>
          <p className="text-xs text-slate-500">Configure Krushi Seva Kendra shop details, GSTIN, invoice numbering, and printer templates</p>
        </div>
        <button onClick={handleDownloadBackup} className="btn-secondary text-xs">
          <Download className="w-4 h-4 text-emerald-600" /> Download DB Backup (.db)
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Store Profile Panel */}
        <div className="card-panel p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
            <Building className="w-4 h-4 text-emerald-600" /> Store Profile & Tax Info
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold block mb-1">Store Name *</label>
              <input type="text" value={settings.store_name} onChange={e => setSettings({...settings, store_name: e.target.value})} required className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="font-semibold block mb-1">Store Tagline</label>
              <input type="text" value={settings.tagline} onChange={e => setSettings({...settings, tagline: e.target.value})} className="w-full border rounded p-2" />
            </div>
            <div className="sm:col-span-2">
              <label className="font-semibold block mb-1">Full Shop Address *</label>
              <textarea rows="2" value={settings.address} onChange={e => setSettings({...settings, address: e.target.value})} required className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="font-semibold block mb-1">Mobile Number *</label>
              <input type="text" value={settings.mobile} onChange={e => setSettings({...settings, mobile: e.target.value})} required className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="font-semibold block mb-1">Email</label>
              <input type="email" value={settings.email} onChange={e => setSettings({...settings, email: e.target.value})} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="font-semibold block mb-1">GSTIN Number *</label>
              <input type="text" value={settings.gstin} onChange={e => setSettings({...settings, gstin: e.target.value})} required className="w-full border rounded p-2 font-mono" />
            </div>
            <div>
              <label className="font-semibold block mb-1">Invoice Prefix</label>
              <input type="text" value={settings.invoice_prefix} onChange={e => setSettings({...settings, invoice_prefix: e.target.value})} className="w-full border rounded p-2 font-mono" />
            </div>
          </div>
        </div>

        {/* Printer & Receipt Settings */}
        <div className="card-panel p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-sm border-b pb-2 flex items-center gap-2">
            <Printer className="w-4 h-4 text-emerald-600" /> Thermal Printer & Receipt Headers
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold block mb-1">Thermal Receipt Header</label>
              <textarea rows="3" value={settings.thermal_header} onChange={e => setSettings({...settings, thermal_header: e.target.value})} className="w-full border rounded p-2 font-mono" />
            </div>
            <div>
              <label className="font-semibold block mb-1">Thermal Receipt Footer</label>
              <textarea rows="3" value={settings.thermal_footer} onChange={e => setSettings({...settings, thermal_footer: e.target.value})} className="w-full border rounded p-2 font-mono" />
            </div>
          </div>
        </div>

        {/* SMS Integration Credentials */}
        <div className="card-panel p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-sm border-b pb-2">SMS Gateway Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-semibold block mb-1">Active Provider</label>
              <select value={settings.sms_provider} onChange={e => setSettings({...settings, sms_provider: e.target.value})} className="w-full border rounded p-2">
                <option value="Simulated">Simulated (Test Mode)</option>
                <option value="MSG91">MSG91 API</option>
                <option value="Twilio">Twilio API</option>
                <option value="Textlocal">Textlocal API</option>
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-1">Sender ID</label>
              <input type="text" value={settings.sms_sender_id} onChange={e => setSettings({...settings, sms_sender_id: e.target.value})} className="w-full border rounded p-2 font-mono" />
            </div>
            <div>
              <label className="font-semibold block mb-1">API Key / Auth Token</label>
              <input type="password" value={settings.sms_api_key} onChange={e => setSettings({...settings, sms_api_key: e.target.value})} className="w-full border rounded p-2 font-mono" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={loading} className="btn-primary py-3 px-8 text-sm">
            <Save className="w-4 h-4" /> Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
}
