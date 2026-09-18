import React, { useState } from 'react';
import { ShoppingBag, Lock, User, ArrowRight, ShieldCheck, Store, RefreshCw, KeyRound } from 'lucide-react';
import { apiRequest, setAuthToken } from '../api';

export default function Login({ onLoginSuccess, showToast }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      showToast('Please enter both username and password.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (res.success) {
        setAuthToken(res.token);
        showToast('Welcome back to KrushiPOS!', 'success');
        onLoginSuccess(res.user);
      }
    } catch (err) {
      showToast(err.message || 'Login failed. Check credentials.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-3 sm:p-4 relative overflow-hidden select-none">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-7">
          <div className="inline-flex bg-gradient-to-br from-emerald-500 to-emerald-700 p-3.5 rounded-2xl text-white mb-3.5 shadow-lg shadow-emerald-900/40">
            <ShoppingBag className="w-8 h-8 stroke-[2.2]" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-2xl font-black text-white tracking-tight">
              Krushi<span className="text-emerald-400">POS</span>
            </h1>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded uppercase">
              Enterprise
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">Agricultural Store ERP & POS Terminal System</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Terminal Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Access Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.01] active:scale-98 disabled:opacity-50 mt-6 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In to Terminal Counter</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Credentials Switcher */}
        <div className="mt-7 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-500 space-y-2">
          <p className="font-semibold text-slate-400 flex items-center justify-center gap-1">
            <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
            <span>Quick Fill Demo Accounts</span>
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin', 'admin123')}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-mono text-emerald-400 transition cursor-pointer"
            >
              admin / admin123
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('cashier', 'cashier123')}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-mono text-emerald-400 transition cursor-pointer"
            >
              cashier / cashier123
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-slate-600 text-[11px] space-y-0.5">
        <p>KrushiPOS Enterprise Edition v2.4.0</p>
        <p>GST Compliant Billing & Real-Time Stock Engine</p>
      </div>
    </div>
  );
}
