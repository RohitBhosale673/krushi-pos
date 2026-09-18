import React from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Layers, BarChart3,
  Truck, Users, CreditCard, MessageSquare, RotateCcw, Undo2,
  DollarSign, PieChart, UserCheck, Settings, ShieldAlert, Cpu, X, ShoppingBag
} from 'lucide-react';

export default function Sidebar({ activeTab, onSelectTab, userPermissions = [], user = null, isOpen = false, onClose }) {
  const menuGroups = [
    {
      title: 'CORE BILLING & STOCK',
      items: [
        { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard, perm: null, mod: null },
        { id: 'pos', label: 'POS Cashier Billing', icon: ShoppingCart, perm: 'pos:create', mod: 'pos', badge: 'F2', badgeType: 'shortcut' },
        { id: 'products', label: 'Product Master', icon: Package, perm: 'products:view', mod: 'products' },
        { id: 'batches', label: 'Batches & FEFO', icon: Layers, perm: 'batches:view', mod: 'batches' },
        { id: 'inventory', label: 'Stock Movement', icon: BarChart3, perm: 'batches:view', mod: 'inventory' }
      ]
    },
    {
      title: 'PURCHASE & VENDORS',
      items: [
        { id: 'purchases', label: 'Purchase Entry', icon: Truck, perm: 'purchases:view', mod: 'purchases' },
        { id: 'suppliers', label: 'Suppliers & Ledger', icon: Users, perm: 'suppliers:view', mod: 'suppliers' }
      ]
    },
    {
      title: 'FARMERS & CREDIT (UDHAR)',
      items: [
        { id: 'customers', label: 'Customer Directory', icon: Users, perm: 'customers:view', mod: 'customers' },
        { id: 'udhar', label: 'Udhar & Aging Ledger', icon: CreditCard, perm: 'udhar:view', mod: 'udhar', badge: 'Alert', badgeType: 'danger' },
        { id: 'sms', label: 'SMS Reminder Hub', icon: MessageSquare, perm: 'sms:send', mod: 'sms' }
      ]
    },
    {
      title: 'RETURNS & CASH FLOW',
      items: [
        { id: 'sales_returns', label: 'Sales Returns', icon: RotateCcw, perm: 'returns:sales_return', mod: 'returns' },
        { id: 'purchase_returns', label: 'Purchase Returns', icon: Undo2, perm: 'returns:purchase_return', mod: 'returns' },
        { id: 'expenses', label: 'Store Expenses', icon: DollarSign, perm: 'expenses:manage', mod: 'expenses' }
      ]
    },
    {
      title: 'MANAGEMENT & AUDIT',
      items: [
        { id: 'reports', label: 'Reports & GST Analytics', icon: PieChart, perm: 'reports:view', mod: 'reports' },
        { id: 'users', label: 'Users & Roles', icon: UserCheck, perm: 'users:manage', mod: 'users' },
        { id: 'settings', label: 'Business Settings', icon: Settings, perm: 'settings:manage', mod: 'settings' },
        { id: 'audit', label: 'Security Audit Logs', icon: ShieldAlert, perm: 'audit:view', mod: 'audit' }
      ]
    }
  ];

  const hasPerm = (item) => {
    if (!item) return true;
    // 1. If Super Admin, allow all
    if (user?.is_super_admin) return true;

    // 2. Check tenant allowed modules
    if (item.mod && user?.tenant?.allowed_modules) {
      if (!user.tenant.allowed_modules.includes(item.mod)) {
        return false;
      }
    }

    // 3. Store Manager or Admin has full access to all allowed modules of their store
    const isManager = user?.roles && user.roles.some(r => /manager|admin/i.test(r));
    if (isManager) return true;

    // 4. Check user RBAC permissions for staff
    if (!item.perm) return true;
    return userPermissions.includes(item.perm) || userPermissions.includes('all');
  };

  const handleItemClick = (id) => {
    onSelectTab(id);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside className={`
        fixed lg:static top-0 bottom-0 left-0 z-50
        w-72 lg:w-64 bg-slate-950 text-slate-300 flex flex-col border-r border-slate-800/80 shrink-0 select-none overflow-y-auto dark-scrollbar transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Mobile Header with Close Button */}
        <div className="lg:hidden p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-1.5 rounded-xl text-white">
              <ShoppingBag className="w-4 h-4 stroke-[2.2]" />
            </div>
            <span className="font-extrabold text-base text-white">
              Krushi<span className="text-emerald-400">POS</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition cursor-pointer"
            title="Close Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 space-y-5 flex-1">
          {menuGroups.map((group, gIdx) => (
            <div key={gIdx}>
              <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                <span>{group.title}</span>
              </p>
              <div className="space-y-0.5">
              {group.items.map((item) => {
                if (!hasPerm(item)) return null;
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all group cursor-pointer relative ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md shadow-emerald-950/50'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                    }`}
                  >
                    {/* Active left indicator pill */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full shadow-sm"></span>
                    )}

                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 transition ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-400'}`} />
                      <span className="tracking-tight">{item.label}</span>
                    </div>

                    {item.badge && (
                      item.badgeType === 'shortcut' ? (
                        <kbd className={`kbd-chip ${isActive ? 'bg-emerald-800 text-white border-emerald-700' : 'kbd-chip-dark'}`}>
                          {item.badge}
                        </kbd>
                      ) : (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                          isActive
                            ? 'bg-red-500/30 text-white border border-red-400/40'
                            : 'bg-red-950/80 text-red-400 border border-red-800/60 animate-pulse'
                        }`}>
                          {item.badge}
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Enterprise System Info Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 text-[11px] text-slate-500 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-400">Engine Build</span>
          <span className="font-mono text-emerald-400 font-bold">v2.4.0-PRO</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500">GST Compliance</span>
          <span className="text-slate-400">Rule 46 Active</span>
        </div>
      </div>
    </aside>
    </>
  );
}
