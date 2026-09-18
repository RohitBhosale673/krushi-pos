import React, { useState, useEffect } from 'react';
import { ShoppingBag, LogOut, User, Zap, ShieldCheck, Clock, CheckCircle2, Store, Radio, Menu, Building2, ChevronDown } from 'lucide-react';
import { apiRequest, getActiveTenantId, setActiveTenantId } from '../api';

export default function Navbar({ user, onNavigate, onLogout, onToggleSidebar }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [tenantsList, setTenantsList] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(getActiveTenantId() || '');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch tenants if user is Super Admin
  useEffect(() => {
    if (user?.is_super_admin) {
      apiRequest('/tenants')
        .then(res => {
          if (res.success) {
            setTenantsList(res.tenants || []);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const handleTenantChange = (e) => {
    const val = e.target.value;
    setSelectedTenant(val);
    setActiveTenantId(val ? val : null);
    window.location.reload();
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const storeDisplayName = user?.tenant?.name || 'Krushi Seva Kendra';

  return (
    <header className="bg-slate-950 text-white border-b border-slate-800/80 sticky top-0 z-40 px-3 sm:px-4 py-2 flex items-center justify-between shadow-lg select-none">
      {/* Brand, Hamburger & Store Tag */}
      <div className="flex items-center gap-2 sm:gap-3.5">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 -ml-1 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
          title="Open Navigation Menu"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group"
        >
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-1.5 sm:p-2 rounded-xl text-white shadow-md shadow-emerald-900/30 group-hover:scale-105 transition">
            <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base sm:text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                Krushi<span className="text-emerald-400">POS</span>
              </span>
              <span className="hidden xs:inline-block text-[9px] font-bold px-1.5 py-0.2 bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 rounded uppercase tracking-wider">
                {user?.is_super_admin ? 'Super Admin' : (user?.tenant?.subscription_tier || 'Enterprise')}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">Agricultural Retail ERP & Billing</p>
          </div>
        </div>

        {/* Store & Organization Scope Pill */}
        <div className="hidden lg:flex items-center gap-2 ml-3 pl-3 border-l border-slate-800 text-xs text-slate-400">
          {user?.is_super_admin ? (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 px-2 py-0.5 rounded-lg">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-bold text-slate-400">Store Scope:</span>
              <select
                value={selectedTenant}
                onChange={handleTenantChange}
                className="bg-transparent text-emerald-400 font-bold text-xs outline-none cursor-pointer pr-1"
                title="Super Admin Tenant Switcher"
              >
                <option value="" className="bg-slate-900 text-white">🌐 System-Wide (All Stores)</option>
                {tenantsList.map(t => (
                  <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                    🏪 {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
              <Store className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-slate-200">{storeDisplayName}</span>
              {user?.tenant?.code && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-[11px] font-mono text-emerald-400 font-bold">{user.tenant.code}</span>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold">Tenant Isolated</span>
          </div>
        </div>
      </div>

      {/* Center Live Clock */}
      <div className="hidden md:flex items-center gap-2 bg-slate-900/90 border border-slate-800/80 px-3 py-1 rounded-xl shadow-inner">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-mono text-xs font-bold text-slate-100 tracking-wider">
          {formatTime(currentTime)}
        </span>
        <span className="text-slate-600 text-xs">•</span>
        <span className="text-[11px] text-slate-400 font-medium">
          {formatDate(currentTime)}
        </span>
      </div>

      {/* Quick POS Action & Cashier Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Shortcut Button to Open POS */}
        <button
          onClick={() => onNavigate('pos')}
          className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 sm:gap-2 shadow-md shadow-emerald-900/40 border border-emerald-400/30 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
          title="Open POS Cashier Counter (F2)"
        >
          <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 fill-amber-300" />
          <span className="hidden sm:inline">Cashier POS</span>
          <span className="sm:hidden">POS</span>
          <kbd className="hidden sm:inline-flex kbd-chip kbd-chip-dark text-[10px] text-emerald-200 bg-emerald-900/80 border-emerald-700/60">
            F2
          </kbd>
        </button>

        {/* User Info & Logout */}
        {user && (
          <div className="flex items-center gap-1.5 sm:gap-2.5 pl-1.5 sm:pl-2 border-l border-slate-800">
            <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/80 p-1 sm:pl-2 sm:pr-2.5 sm:py-1 rounded-xl">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {(user.full_name || user.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-semibold text-slate-200 leading-tight">
                  {user.full_name || user.username}
                </p>
                <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold uppercase tracking-wide">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  <span>{user.roles?.[0] || 'User'}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="p-1.5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition border border-transparent hover:border-red-500/20 cursor-pointer"
              title="Sign Out of Terminal"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
