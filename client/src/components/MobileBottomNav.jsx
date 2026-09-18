import React from 'react';
import { LayoutDashboard, ShoppingCart, Package, CreditCard, Menu, Zap } from 'lucide-react';

export default function MobileBottomNav({ activeTab, onSelectTab, onOpenMenu }) {
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'pos', label: 'POS Billing', icon: Zap, isSpecial: true },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'udhar', label: 'Udhar', icon: CreditCard },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 text-slate-400 px-2 py-1.5 flex items-center justify-around shadow-2xl safe-bottom select-none"
      aria-label="Mobile Navigation"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        if (item.isSpecial) {
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className="relative -top-3 flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                  isActive
                    ? 'bg-gradient-to-tr from-emerald-500 to-emerald-400 text-white shadow-emerald-600/40 ring-2 ring-white/30 scale-105'
                    : 'bg-gradient-to-tr from-emerald-600 to-emerald-500 text-white shadow-emerald-950/60'
                }`}
              >
                <Icon className="w-6 h-6 fill-white stroke-[2.2]" />
              </div>
              <span className={`text-[10px] font-bold mt-1 tracking-tight ${isActive ? 'text-emerald-400 font-extrabold' : 'text-slate-300'}`}>
                {item.label}
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-colors cursor-pointer relative ${
              isActive ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.4] scale-110' : 'stroke-[1.8]'}`} />
            <span className="text-[10px] tracking-tight">{item.label}</span>
            {isActive && (
              <span className="w-1 h-1 bg-emerald-400 rounded-full mt-0.5"></span>
            )}
          </button>
        );
      })}

      {/* Menu Drawer Toggle Button */}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
      >
        <Menu className="w-5 h-5 mb-0.5 stroke-[1.8]" />
        <span className="text-[10px] tracking-tight">All Menus</span>
      </button>
    </nav>
  );
}
