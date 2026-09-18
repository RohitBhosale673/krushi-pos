import React, { useState, useEffect } from 'react';
import {
  Users, Shield, Plus, Edit2, Trash2, Key, CheckSquare, Square, UserCheck,
  ShieldCheck, AlertCircle, Building2, Sliders, Check, Lock, ChevronRight,
  RefreshCw, BarChart2, HardDrive, Package, AlertTriangle, UserPlus, Eye, Power,
  UserX
} from 'lucide-react';
import { apiRequest, setActiveTenantId, getActiveTenantId } from '../api';

const AVAILABLE_MODULES = [
  { id: 'pos', name: 'POS Cashier Billing', desc: 'Billing, sales counter, invoice generation' },
  { id: 'products', name: 'Product Catalog', desc: 'Product master, barcodes, categories' },
  { id: 'batches', name: 'Batches & Expiry', desc: 'FEFO batch tracking, batch expiry' },
  { id: 'inventory', name: 'Stock Movement', desc: 'Stock in/out, adjustments, ledger' },
  { id: 'purchases', name: 'Purchase Entry', desc: 'Purchase invoices from distributors' },
  { id: 'suppliers', name: 'Supplier Management', desc: 'Supplier directory and vendor ledger' },
  { id: 'customers', name: 'Farmer / Customer Directory', desc: 'Customer profiles, credit balance' },
  { id: 'udhar', name: 'Udhar & Aging Ledger', desc: 'Credit accounts, payment receipts, aging' },
  { id: 'returns', name: 'Returns Management', desc: 'Customer sales & supplier purchase returns' },
  { id: 'expenses', name: 'Store Expenses', desc: 'Daily operational expenses tracking' },
  { id: 'sms', name: 'SMS Reminders', desc: 'Payment reminders and greeting SMS' },
  { id: 'reports', name: 'Analytics & GST Reports', desc: 'Sales, GST, Stock, and Profit reports' },
  { id: 'settings', name: 'Business Settings', desc: 'Store info, thermal printer settings' },
  { id: 'users', name: 'Users & Roles', desc: 'Staff account and permission control' }
];

const AVAILABLE_REPORTS = [
  { id: 'sales', name: 'Sales & Daily Revenue' },
  { id: 'purchases', name: 'Purchases & Vendor Invoices' },
  { id: 'udhari', name: 'Farmer Udhar & Aging' },
  { id: 'inventory', name: 'Inventory & Batch Valuation' },
  { id: 'expenses', name: 'Store Expenses & P&L' },
  { id: 'gst', name: 'GST R1 & Tax Summary' }
];

export default function UsersPermissions({ showToast, user }) {
  const isSuperAdmin = !!user?.is_super_admin;
  const [activeTab, setActiveTab] = useState(isSuperAdmin ? 'tenants' : 'users'); // 'tenants', 'users', 'roles'

  // Data states
  const [tenants, setTenants] = useState([]);
  const [tenantStats, setTenantStats] = useState(null);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState('');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Current tenant active context
  const currentActiveTenantId = getActiveTenantId();

  // Tenant Modals
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState(null);
  const [tenantFormData, setTenantFormData] = useState({
    name: '',
    code: '',
    max_users: 5,
    max_products: 500,
    storage_limit_mb: 100,
    subscription_tier: 'Standard',
    status: 'active',
    notes: '',
    allowed_modules: AVAILABLE_MODULES.map(m => m.id),
    allowed_reports: AVAILABLE_REPORTS.map(r => r.id),
    manager_username: '',
    manager_password: '',
    manager_name: '',
    manager_mobile: '',
    manager_email: ''
  });

  // Assign/Change Manager Modal
  const [showAssignManagerModal, setShowAssignManagerModal] = useState(false);
  const [assigningTenant, setAssigningTenant] = useState(null);
  const [assignMode, setAssignMode] = useState('existing'); // 'existing' or 'new'
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [newManagerForm, setNewManagerForm] = useState({
    full_name: '',
    username: '',
    password: '',
    mobile: '',
    email: ''
  });

  // User Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userFormData, setUserFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    mobile: '',
    email: '',
    role_id: 1,
    tenant_id: '',
    status: 'active',
    new_password: ''
  });

  // Role Modals
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [roleFormData, setRoleFormData] = useState({
    name: '',
    description: '',
    scope: 'tenant',
    tenant_id: '',
    permission_ids: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const calls = [
        apiRequest('/users'),
        apiRequest('/users/roles-permissions')
      ];

      if (isSuperAdmin) {
        calls.push(apiRequest('/tenants'));
        calls.push(apiRequest('/tenants/summary/stats'));
      }

      const results = await Promise.all(calls);
      const uRes = results[0];
      const rRes = results[1];

      if (uRes.success) setUsers(uRes.users || []);
      if (rRes.success) {
        setRoles(rRes.roles || []);
        setPermissions(rRes.permissions || []);
      }

      if (isSuperAdmin && results[2] && results[2].success) {
        setTenants(results[2].tenants || []);
      }
      if (isSuperAdmin && results[3] && results[3].success) {
        setTenantStats(results[3].stats || null);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered users
  const filteredUsers = users.filter(u => {
    if (!selectedTenantFilter) return true;
    return String(u.tenant_id) === String(selectedTenantFilter);
  });

  // Tenant seat calculations for Managers
  const currentTenantUserLimit = user?.tenant?.max_users || 5;
  const currentTenantUserCount = users.length;
  const isSeatLimitReached = !isSuperAdmin && currentTenantUserCount >= currentTenantUserLimit;

  // --- TENANT HANDLERS (Super Admin) ---
  const openCreateTenant = () => {
    setEditingTenantId(null);
    setTenantFormData({
      name: '',
      code: '',
      max_users: 5,
      max_products: 500,
      storage_limit_mb: 100,
      subscription_tier: 'Standard',
      status: 'active',
      notes: '',
      allowed_modules: AVAILABLE_MODULES.map(m => m.id),
      allowed_reports: AVAILABLE_REPORTS.map(r => r.id),
      manager_username: '',
      manager_password: '',
      manager_name: '',
      manager_mobile: '',
      manager_email: ''
    });
    setShowTenantModal(true);
  };

  const openEditTenant = (t) => {
    setEditingTenantId(t.id);
    setTenantFormData({
      name: t.name,
      code: t.code,
      max_users: t.max_users || 5,
      max_products: t.max_products || 500,
      storage_limit_mb: t.storage_limit_mb || 100,
      subscription_tier: t.subscription_tier || 'Standard',
      status: t.status || 'active',
      notes: t.notes || '',
      allowed_modules: Array.isArray(t.allowed_modules) ? t.allowed_modules : [],
      allowed_reports: Array.isArray(t.allowed_reports) ? t.allowed_reports : [],
      manager_username: '',
      manager_password: '',
      manager_name: t.manager_name || '',
      manager_mobile: t.manager_mobile || '',
      manager_email: t.manager_email || ''
    });
    setShowTenantModal(true);
  };

  const handleSaveTenant = async (e) => {
    e.preventDefault();
    try {
      if (editingTenantId) {
        const res = await apiRequest(`/tenants/${editingTenantId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: tenantFormData.name,
            status: tenantFormData.status,
            max_users: Number(tenantFormData.max_users),
            max_products: Number(tenantFormData.max_products),
            storage_limit_mb: Number(tenantFormData.storage_limit_mb),
            subscription_tier: tenantFormData.subscription_tier,
            allowed_modules: tenantFormData.allowed_modules,
            allowed_reports: tenantFormData.allowed_reports,
            notes: tenantFormData.notes
          })
        });
        if (res.success) {
          showToast('Tenant organization updated successfully', 'success');
          setShowTenantModal(false);
          fetchData();
        }
      } else {
        const res = await apiRequest('/tenants', {
          method: 'POST',
          body: JSON.stringify({
            name: tenantFormData.name,
            code: tenantFormData.code,
            max_users: Number(tenantFormData.max_users),
            max_products: Number(tenantFormData.max_products),
            storage_limit_mb: Number(tenantFormData.storage_limit_mb),
            subscription_tier: tenantFormData.subscription_tier,
            allowed_modules: tenantFormData.allowed_modules,
            allowed_reports: tenantFormData.allowed_reports,
            notes: tenantFormData.notes,
            manager_username: tenantFormData.manager_username,
            manager_password: tenantFormData.manager_password,
            manager_name: tenantFormData.manager_name,
            manager_mobile: tenantFormData.manager_mobile,
            manager_email: tenantFormData.manager_email
          })
        });
        if (res.success) {
          showToast(res.message || 'Tenant organization & manager created successfully', 'success');
          setShowTenantModal(false);
          fetchData();
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const toggleTenantStatus = async (tenant) => {
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await apiRequest(`/tenants/${tenant.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      if (res.success) {
        showToast(`Tenant status set to ${newStatus}`, 'info');
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteTenant = async (tenantId) => {
    if (!window.confirm('Are you sure you want to delete this Tenant? This will permanently remove all associated users, products, and transactions!')) return;
    try {
      const res = await apiRequest(`/tenants/${tenantId}`, { method: 'DELETE' });
      if (res.success) {
        showToast(res.message, 'success');
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete Manager directly from Tenant card
  const handleDeleteTenantManager = async (tenant) => {
    const mgrName = tenant.manager_name || tenant.manager_username || 'Manager';
    const confirmPrompt = `Are you sure you want to delete the Manager account for "${tenant.name}"?\n\nManager: ${mgrName} (@${tenant.manager_username})\n\nThis will permanently delete the manager user account and unassign the tenant manager.`;
    if (!window.confirm(confirmPrompt)) return;

    try {
      const res = await apiRequest(`/tenants/${tenant.id}/manager?delete_account=true`, {
        method: 'DELETE'
      });
      if (res.success) {
        showToast(res.message || 'Manager account deleted successfully', 'success');
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Open Assign / Change Manager Modal
  const openAssignManager = (tenant) => {
    setAssigningTenant(tenant);
    setAssignMode('existing');
    setSelectedStaffId('');
    setNewManagerForm({
      full_name: '',
      username: '',
      password: '',
      mobile: '',
      email: ''
    });
    setShowAssignManagerModal(true);
  };

  const handleSaveAssignManager = async (e) => {
    e.preventDefault();
    if (!assigningTenant) return;

    try {
      const payload = assignMode === 'existing'
        ? { user_id: Number(selectedStaffId) }
        : {
            username: newManagerForm.username.trim(),
            password: newManagerForm.password,
            full_name: newManagerForm.full_name.trim(),
            mobile: newManagerForm.mobile || null,
            email: newManagerForm.email || null
          };

      const res = await apiRequest(`/tenants/${assigningTenant.id}/manager`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.success) {
        showToast(res.message || 'Manager assigned successfully', 'success');
        setShowAssignManagerModal(false);
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSwitchTenant = (tenantId) => {
    if (String(currentActiveTenantId) === String(tenantId)) {
      setActiveTenantId(null);
      showToast('Switched to System-Wide Super Admin view', 'info');
    } else {
      setActiveTenantId(tenantId);
      showToast(`Switched view to Tenant #${tenantId}`, 'success');
    }
    setTimeout(() => window.location.reload(), 300);
  };

  // --- USER HANDLERS ---
  const openCreateUser = () => {
    if (isSeatLimitReached) {
      showToast('Seat quota reached! Contact Super Admin to increase your user seat limit.', 'error');
      return;
    }

    setEditingUserId(null);
    const defaultRole = roles.find(r => r.name !== 'Super Admin')?.id || 1;
    setUserFormData({
      username: '',
      password: '',
      full_name: '',
      mobile: '',
      email: '',
      role_id: defaultRole,
      tenant_id: isSuperAdmin ? (tenants[0]?.id || '') : (user?.tenant_id || ''),
      status: 'active',
      new_password: ''
    });
    setShowUserModal(true);
  };

  const openEditUser = (u) => {
    setEditingUserId(u.id);
    setUserFormData({
      username: u.username,
      password: '',
      full_name: u.full_name,
      mobile: u.mobile || '',
      email: u.email || '',
      role_id: u.role_id || 1,
      tenant_id: u.tenant_id || '',
      status: u.status || 'active',
      new_password: ''
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      const method = editingUserId ? 'PUT' : 'POST';
      const endpoint = editingUserId ? `/users/${editingUserId}` : '/users';

      const payload = editingUserId ? {
        username: userFormData.username,
        full_name: userFormData.full_name,
        mobile: userFormData.mobile,
        email: userFormData.email,
        role_id: userFormData.role_id,
        status: userFormData.status,
        new_password: userFormData.new_password,
        ...(isSuperAdmin && { tenant_id: userFormData.tenant_id ? Number(userFormData.tenant_id) : null })
      } : {
        username: userFormData.username,
        password: userFormData.password,
        full_name: userFormData.full_name,
        mobile: userFormData.mobile,
        email: userFormData.email,
        role_id: userFormData.role_id,
        ...(isSuperAdmin && { tenant_id: userFormData.tenant_id ? Number(userFormData.tenant_id) : null })
      };

      const res = await apiRequest(endpoint, {
        method,
        body: JSON.stringify(payload)
      });

      if (res.success) {
        showToast(res.message, 'success');
        setShowUserModal(false);
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const toggleUserStatus = async (targetUser) => {
    const newStatus = targetUser.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await apiRequest(`/users/${targetUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      if (res.success) {
        showToast(`User status updated to ${newStatus}`, 'info');
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete User Account (Works for both regular staff and Managers!)
  const handleDeleteUser = async (targetUser) => {
    const isManager = targetUser.role_name === 'Manager';
    const confirmPrompt = isManager
      ? `Are you sure you want to delete Manager account "${targetUser.full_name}" (@${targetUser.username})?\n\nThis will permanently delete the manager account and unassign the manager from ${targetUser.tenant_name || 'their organization'}.`
      : `Are you sure you want to delete user account "${targetUser.full_name}" (@${targetUser.username})?`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      const res = await apiRequest(`/users/${targetUser.id}`, { method: 'DELETE' });
      if (res.success) {
        showToast(res.message || 'User account deleted successfully.', 'success');
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- ROLE HANDLERS ---
  const openCreateRole = () => {
    setEditingRoleId(null);
    setRoleFormData({
      name: '',
      description: '',
      scope: isSuperAdmin ? 'global' : 'tenant',
      tenant_id: isSuperAdmin ? '' : (user?.tenant_id || ''),
      permission_ids: []
    });
    setShowRoleModal(true);
  };

  const openEditRole = (role) => {
    setEditingRoleId(role.id);
    setRoleFormData({
      name: role.name,
      description: role.description || '',
      scope: role.scope || 'tenant',
      tenant_id: role.tenant_id || '',
      permission_ids: role.permission_ids || []
    });
    setShowRoleModal(true);
  };

  const togglePermission = (permId) => {
    const current = roleFormData.permission_ids || [];
    if (current.includes(permId)) {
      setRoleFormData({ ...roleFormData, permission_ids: current.filter(id => id !== permId) });
    } else {
      setRoleFormData({ ...roleFormData, permission_ids: [...current, permId] });
    }
  };

  const toggleModulePermissions = (moduleName, enable) => {
    const modulePermIds = permissions.filter(p => p.module === moduleName).map(p => p.id);
    const current = new Set(roleFormData.permission_ids || []);

    if (enable) {
      modulePermIds.forEach(id => current.add(id));
    } else {
      modulePermIds.forEach(id => current.delete(id));
    }

    setRoleFormData({ ...roleFormData, permission_ids: Array.from(current) });
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    try {
      const method = editingRoleId ? 'PUT' : 'POST';
      const endpoint = editingRoleId ? `/users/roles/${editingRoleId}` : '/users/roles';

      const res = await apiRequest(endpoint, {
        method,
        body: JSON.stringify(roleFormData)
      });

      if (res.success) {
        showToast(res.message, 'success');
        setShowRoleModal(false);
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this custom role?')) return;
    try {
      const res = await apiRequest(`/users/roles/${roleId}`, { method: 'DELETE' });
      if (res.success) {
        showToast(res.message, 'success');
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const modulesList = Array.from(new Set(permissions.map(p => p.module)));

  // Filter staff list for the tenant currently being assigned a manager
  const currentTenantStaff = assigningTenant
    ? users.filter(u => String(u.tenant_id) === String(assigningTenant.id) && u.id !== assigningTenant.manager_id)
    : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {isSuperAdmin ? 'Hierarchy & Access Control Hub' : 'Store Users & Roles Management'}
            </h1>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
              isSuperAdmin ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
            }`}>
              {isSuperAdmin ? 'Super Admin' : 'Manager Scope'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isSuperAdmin
              ? 'Manage multi-tenant organizations, managers, staff limits, and custom administrative roles'
              : 'Manage store staff accounts, access permissions, and seat limitations'}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('tenants')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'tenants' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" /> Organizations & Tenants ({tenants.length})
            </button>
          )}

          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'users' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" /> Users & Staff ({users.length})
          </button>

          <button
            onClick={() => setActiveTab('roles')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'roles' ? 'bg-emerald-700 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Roles & Responsibilities ({roles.length})
          </button>
        </div>
      </div>

      {/* TAB 1: TENANTS & ORGANIZATIONS (Super Admin Only) */}
      {isSuperAdmin && activeTab === 'tenants' && (
        <div className="space-y-6">
          {/* Summary Stats Cards */}
          {tenantStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Tenants</span>
                <span className="text-2xl font-black text-slate-900">{tenantStats.totalTenants}</span>
                <span className="text-[10px] text-slate-400 block mt-1">Organizations</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Active Stores</span>
                <span className="text-2xl font-black text-emerald-800">{tenantStats.activeTenants}</span>
                <span className="text-[10px] text-emerald-600 block mt-1">Operating normally</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Suspended</span>
                <span className="text-2xl font-black text-amber-800">{tenantStats.suspendedTenants}</span>
                <span className="text-[10px] text-amber-600 block mt-1">Access blocked</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Staff Accounts</span>
                <span className="text-2xl font-black text-slate-900">{tenantStats.totalUsers}</span>
                <span className="text-[10px] text-slate-400 block mt-1">Across all branches</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">System Revenue</span>
                <span className="text-2xl font-black text-blue-900">₹{Number(tenantStats.totalSales).toLocaleString('en-IN')}</span>
                <span className="text-[10px] text-blue-600 block mt-1">Consolidated gross</span>
              </div>
            </div>
          )}

          {/* Action Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Provisioned Tenant Environments</h2>
              <p className="text-xs text-slate-500">Each organization operates in complete database and tenant isolation</p>
            </div>
            <button onClick={openCreateTenant} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Provision New Tenant & Manager
            </button>
          </div>

          {/* Tenants Grid / Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {tenants.map((t) => {
              const userPct = Math.min(100, Math.round(((t.current_users_count || 0) / (t.max_users || 1)) * 100));
              const prodPct = Math.min(100, Math.round(((t.current_products_count || 0) / (t.max_products || 1)) * 100));
              const isSuspended = t.status === 'suspended';
              const isCurrentScope = String(currentActiveTenantId) === String(t.id);

              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-2xl border p-5 shadow-xs transition-all space-y-4 flex flex-col justify-between ${
                    isSuspended ? 'border-red-300 bg-red-50/10' : isCurrentScope ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row */}
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-base">{t.name}</h3>
                          <span className="font-mono text-[10px] font-extrabold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border">
                            {t.code}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{t.notes || 'No description notes.'}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          t.subscription_tier === 'Enterprise' ? 'bg-purple-100 text-purple-900 border border-purple-200' :
                          t.subscription_tier === 'Standard' ? 'bg-blue-100 text-blue-900 border border-blue-200' :
                          'bg-slate-100 text-slate-700 border'
                        }`}>
                          {t.subscription_tier}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isSuspended ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {t.status}
                        </span>
                      </div>
                    </div>

                    {/* Manager Card with Action Buttons */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Designated Manager</span>
                          <span className="font-bold text-slate-900 text-sm block">{t.manager_name || 'No Manager Assigned'}</span>
                          {t.manager_username ? (
                            <span className="text-[11px] text-slate-500 font-mono">@{t.manager_username}</span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                              Unassigned Store
                            </span>
                          )}
                        </div>
                        <div className="text-right text-[11px] text-slate-600">
                          <span className="block">{t.manager_mobile || ''}</span>
                          <span className="text-slate-400 block truncate max-w-[140px]">{t.manager_email || ''}</span>
                        </div>
                      </div>

                      {/* Manager Controls: Delete Manager / Change Manager / Assign Manager */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                        {t.manager_name ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openAssignManager(t)}
                              className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              title="Reassign or change designated manager"
                            >
                              <UserCheck className="w-3.5 h-3.5 text-blue-600" /> Change
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTenantManager(t)}
                              className="px-2.5 py-1 text-[11px] font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              title="Delete manager account and unassign tenant"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600" /> Delete Manager
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openAssignManager(t)}
                            className="px-3 py-1.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Assign / Create Manager
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quota & Limits Indicators */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      {/* User Seats */}
                      <div className="bg-white border rounded-xl p-2.5">
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="text-slate-500 font-medium flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" /> Staff Seats
                          </span>
                          <span className="font-bold text-slate-900">{t.current_users_count || 0} / {t.max_users}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${userPct >= 90 ? 'bg-red-500' : userPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${userPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Products Quota */}
                      <div className="bg-white border rounded-xl p-2.5">
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="text-slate-500 font-medium flex items-center gap-1">
                            <Package className="w-3.5 h-3.5" /> Product Limit
                          </span>
                          <span className="font-bold text-slate-900">{t.current_products_count || 0} / {t.max_products}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${prodPct >= 90 ? 'bg-red-500' : prodPct >= 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{ width: `${prodPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Allowed Modules Preview */}
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase mb-1">Allowed Modules ({t.allowed_modules?.length || 0}/14)</span>
                      <div className="flex flex-wrap gap-1">
                        {(t.allowed_modules || []).slice(0, 7).map(m => (
                          <span key={m} className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded font-mono">
                            {m}
                          </span>
                        ))}
                        {(t.allowed_modules || []).length > 7 && (
                          <span className="text-[10px] text-slate-400 font-semibold">
                            +{t.allowed_modules.length - 7} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSwitchTenant(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                          isCurrentScope ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                        title="Filter / view data exclusively for this tenant"
                      >
                        <Eye className="w-3.5 h-3.5" /> {isCurrentScope ? 'Active Scope' : 'Filter Scope'}
                      </button>
                      <button
                        onClick={() => toggleTenantStatus(t)}
                        className={`p-1.5 rounded-lg border transition ${
                          isSuspended ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-amber-50 text-amber-700 border-amber-300'
                        }`}
                        title={isSuspended ? 'Activate Tenant' : 'Suspend Tenant'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditTenant(t)}
                        className="p-1.5 hover:bg-slate-100 text-slate-700 rounded-lg"
                        title="Edit Quotas & Modules"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTenant(t.id)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg"
                        title="Delete Entire Tenant Organization"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: USERS & ACCOUNTS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Manager Seat Limit Banner */}
          {!isSuperAdmin && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {user?.tenant?.name || 'Store Branch'} Staff Capacity
                  </h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isSeatLimitReached ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {currentTenantUserCount} of {currentTenantUserLimit} Seats Used
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {isSeatLimitReached
                    ? 'You have reached your allocated user limit. Contact your Super Admin to add more staff seats.'
                    : `You can create ${currentTenantUserLimit - currentTenantUserCount} more staff account(s) under your organization.`}
                </p>
              </div>

              <div className="w-full sm:w-48">
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isSeatLimitReached ? 'bg-red-500' : (currentTenantUserCount / currentTenantUserLimit) >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (currentTenantUserCount / currentTenantUserLimit) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Controls row */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              {isSuperAdmin && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Filter by Tenant:</span>
                  <select
                    value={selectedTenantFilter}
                    onChange={(e) => setSelectedTenantFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white font-medium"
                  >
                    <option value="">All Organizations ({users.length})</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <span className="text-xs text-slate-500">
                Showing {filteredUsers.length} user account(s)
              </span>
            </div>

            <button
              onClick={openCreateUser}
              disabled={isSeatLimitReached}
              className={`btn-primary text-xs flex items-center gap-1.5 ${
                isSeatLimitReached ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              title={isSeatLimitReached ? 'User limit reached' : 'Create new user'}
            >
              <UserPlus className="w-4 h-4" /> Create User Account
            </button>
          </div>

          {/* Users Table */}
          <div className="card-panel overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User Details</th>
                  {isSuperAdmin && <th>Tenant / Organization</th>}
                  <th>Assigned Role</th>
                  <th>Contact Info</th>
                  <th>Status</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-bold text-slate-900 text-xs">{u.full_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">@{u.username} | ID: #{u.id}</p>
                    </td>

                    {isSuperAdmin && (
                      <td>
                        {u.tenant_name ? (
                          <div>
                            <span className="font-bold text-slate-800 text-xs block">{u.tenant_name}</span>
                            <span className="text-[10px] font-mono text-slate-400">{u.tenant_code}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                            Global / Super
                          </span>
                        )}
                      </td>
                    )}

                    <td>
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                        u.role_name === 'Super Admin' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                        u.role_name === 'Manager' ? 'bg-purple-100 text-purple-900 border-purple-300' :
                        'bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}>
                        {u.role_name || 'Staff User'}
                      </span>
                    </td>

                    <td className="text-xs">
                      <p className="font-mono text-slate-700">{u.mobile || 'N/A'}</p>
                      <p className="text-slate-400 text-[11px]">{u.email || ''}</p>
                    </td>

                    <td>
                      <span className={u.status === 'active' ? 'badge-active' : 'badge-danger'}>
                        {u.status}
                      </span>
                    </td>

                    <td className="text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditUser(u)}
                          className="p-1.5 hover:bg-slate-200 text-slate-700 rounded"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleUserStatus(u)}
                          className="btn-secondary text-[10px] py-1 px-2"
                          title="Toggle Status"
                        >
                          {u.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 hover:bg-red-100 text-red-600 rounded"
                          title={u.role_name === 'Manager' ? 'Delete Manager Account' : 'Delete User Account'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ROLES & RESPONSIBILITIES */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Role-Based Access Control (RBAC) Matrices</h2>
              <p className="text-xs text-slate-500">
                Configure operational permissions, administrative duties, and custom user roles
              </p>
            </div>
            <button onClick={openCreateRole} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Create Custom Role
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((r) => {
              const activeCount = r.permission_ids?.length || 0;
              const totalCount = permissions.length;
              const isSuper = r.name === 'Super Admin';
              const isCustomAdmin = ['HR Admin', 'Finance Admin', 'Sales Admin', 'Support Admin', 'Operations Admin', 'Custom Admin'].includes(r.name);

              return (
                <div
                  key={r.id}
                  className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 ${
                    isSuper ? 'border-amber-300 bg-amber-50/10' :
                    isCustomAdmin ? 'border-blue-200' : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                        <Shield className={`w-4 h-4 ${isSuper ? 'text-amber-600' : isCustomAdmin ? 'text-blue-600' : 'text-emerald-600'}`} />
                        {r.name}
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        r.is_system ? 'bg-slate-100 text-slate-700 border' : 'bg-purple-100 text-purple-800 border border-purple-200'
                      }`}>
                        {r.is_system ? 'System Role' : 'Custom Role'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 min-h-[36px]">{r.description || 'Standard access role.'}</p>

                    <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded text-slate-700">
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">Users Assigned</span>
                        <span className="font-bold text-slate-900">{r.user_count || 0} user(s)</span>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded text-emerald-900">
                        <span className="text-[10px] text-emerald-600 block font-bold uppercase">Permissions</span>
                        <span className="font-bold text-emerald-900">
                          {isSuper ? 'All (Full Bypass)' : `${activeCount} / ${totalCount}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t text-xs">
                    <button
                      onClick={() => openEditRole(r)}
                      disabled={isSuper && !isSuperAdmin}
                      className="btn-secondary text-xs flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Configure Permissions
                    </button>
                    {!r.is_system && (
                      <button
                        onClick={() => handleDeleteRole(r.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Delete Role"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: TENANT CREATE / EDIT (Super Admin Only)
         ======================================================== */}
      {showTenantModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 text-xs max-h-[90vh] flex flex-col">
            <div className="border-b pb-3 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-slate-700" />
                  {editingTenantId ? `Configure Tenant: ${tenantFormData.name}` : 'Provision New Tenant Organization'}
                </h2>
                <p className="text-[11px] text-slate-500">Configure tenant quotas, allowed modules, and primary manager credentials</p>
              </div>
            </div>

            <form onSubmit={handleSaveTenant} className="space-y-4 flex-1 overflow-y-auto pr-1">
              {/* Organization Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Organization Name *</label>
                  <input
                    type="text"
                    value={tenantFormData.name}
                    onChange={e => setTenantFormData({...tenantFormData, name: e.target.value})}
                    placeholder="e.g. Krushi Seva Kendra (Nashik)"
                    required
                    className="w-full border rounded-lg p-2 font-medium"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Tenant Code *</label>
                  <input
                    type="text"
                    value={tenantFormData.code}
                    onChange={e => setTenantFormData({...tenantFormData, code: e.target.value.toUpperCase()})}
                    placeholder="e.g. KSK-NSK"
                    required
                    disabled={!!editingTenantId}
                    className="w-full border rounded-lg p-2 font-mono font-bold uppercase"
                  />
                </div>
              </div>

              {/* Limits & Quotas */}
              <div className="bg-slate-50 p-3 rounded-xl border space-y-2">
                <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block">
                  Tenant Limitations & Quotas
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold block mb-1 text-slate-600">Max Users (Seats) *</label>
                    <input
                      type="number"
                      min="1"
                      value={tenantFormData.max_users}
                      onChange={e => setTenantFormData({...tenantFormData, max_users: e.target.value})}
                      required
                      className="w-full border rounded-lg p-2 font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1 text-slate-600">Max Products *</label>
                    <input
                      type="number"
                      min="10"
                      value={tenantFormData.max_products}
                      onChange={e => setTenantFormData({...tenantFormData, max_products: e.target.value})}
                      required
                      className="w-full border rounded-lg p-2 font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1 text-slate-600">Storage Limit (MB)</label>
                    <input
                      type="number"
                      min="10"
                      value={tenantFormData.storage_limit_mb}
                      onChange={e => setTenantFormData({...tenantFormData, storage_limit_mb: e.target.value})}
                      className="w-full border rounded-lg p-2 font-bold bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Subscription & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Subscription Tier</label>
                  <select
                    value={tenantFormData.subscription_tier}
                    onChange={e => setTenantFormData({...tenantFormData, subscription_tier: e.target.value})}
                    className="w-full border rounded-lg p-2 font-medium"
                  >
                    <option value="Enterprise">Enterprise (All Features)</option>
                    <option value="Standard">Standard</option>
                    <option value="Starter">Starter</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Account Status</label>
                  <select
                    value={tenantFormData.status}
                    onChange={e => setTenantFormData({...tenantFormData, status: e.target.value})}
                    className="w-full border rounded-lg p-2 font-medium"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended (Access Blocked)</option>
                  </select>
                </div>
              </div>

              {/* Allowed Modules Multi-select Checkboxes */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Allowed Modules ({tenantFormData.allowed_modules?.length || 0}/14 Enabled)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTenantFormData({...tenantFormData, allowed_modules: AVAILABLE_MODULES.map(m => m.id)})}
                      className="text-[10px] font-bold text-emerald-700 hover:underline"
                    >
                      Enable All
                    </button>
                    <button
                      type="button"
                      onClick={() => setTenantFormData({...tenantFormData, allowed_modules: []})}
                      className="text-[10px] font-bold text-slate-500 hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_MODULES.map((mod) => {
                    const isChecked = tenantFormData.allowed_modules?.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        onClick={() => {
                          const cur = tenantFormData.allowed_modules || [];
                          const updated = isChecked ? cur.filter(x => x !== mod.id) : [...cur, mod.id];
                          setTenantFormData({...tenantFormData, allowed_modules: updated});
                        }}
                        className={`p-2 rounded-lg border cursor-pointer select-none flex items-start gap-1.5 transition ${
                          isChecked ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-medium' : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <input type="checkbox" checked={isChecked} onChange={() => {}} className="mt-0.5 accent-emerald-600" />
                        <div>
                          <p className="font-bold text-[11px] leading-tight">{mod.name}</p>
                          <p className="text-[9px] text-slate-500 leading-tight truncate">{mod.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Allowed Reports Checkboxes */}
              <div className="space-y-2 border-t pt-3">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
                  Allowed Reports Access
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_REPORTS.map((rep) => {
                    const isChecked = tenantFormData.allowed_reports?.includes(rep.id);
                    return (
                      <label
                        key={rep.id}
                        onClick={() => {
                          const cur = tenantFormData.allowed_reports || [];
                          const updated = isChecked ? cur.filter(x => x !== rep.id) : [...cur, rep.id];
                          setTenantFormData({...tenantFormData, allowed_reports: updated});
                        }}
                        className={`p-2 rounded-lg border cursor-pointer select-none flex items-center gap-1.5 transition ${
                          isChecked ? 'bg-blue-50/80 border-blue-400 text-blue-950 font-medium' : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <input type="checkbox" checked={isChecked} onChange={() => {}} className="accent-blue-600" />
                        <span className="text-xs font-semibold">{rep.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Initial Manager Provisioning (Only on create) */}
              {!editingTenantId && (
                <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-200 space-y-3">
                  <div>
                    <h3 className="font-bold text-purple-900 text-xs flex items-center gap-1">
                      <UserPlus className="w-3.5 h-3.5 text-purple-600" /> Initial Manager Account
                    </h3>
                    <p className="text-[10px] text-purple-700">Primary administrator account assigned to this organization</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold block mb-1 text-slate-700">Manager Full Name *</label>
                      <input
                        type="text"
                        value={tenantFormData.manager_name}
                        onChange={e => setTenantFormData({...tenantFormData, manager_name: e.target.value})}
                        placeholder="e.g. Ramesh Patil"
                        required
                        className="w-full border rounded p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-slate-700">Username *</label>
                      <input
                        type="text"
                        value={tenantFormData.manager_username}
                        onChange={e => setTenantFormData({...tenantFormData, manager_username: e.target.value})}
                        placeholder="e.g. manager_nsk"
                        required
                        className="w-full border rounded p-1.5 bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="font-semibold block mb-1 text-slate-700">Password *</label>
                      <input
                        type="password"
                        value={tenantFormData.manager_password}
                        onChange={e => setTenantFormData({...tenantFormData, manager_password: e.target.value})}
                        placeholder="Secret password..."
                        required
                        className="w-full border rounded p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-slate-700">Mobile Number</label>
                      <input
                        type="text"
                        value={tenantFormData.manager_mobile}
                        onChange={e => setTenantFormData({...tenantFormData, manager_mobile: e.target.value})}
                        placeholder="9876543210"
                        className="w-full border rounded p-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-slate-700">Email Address</label>
                      <input
                        type="email"
                        value={tenantFormData.manager_email}
                        onChange={e => setTenantFormData({...tenantFormData, manager_email: e.target.value})}
                        placeholder="manager@store.com"
                        className="w-full border rounded p-1.5 bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="font-semibold block mb-1 text-slate-700">Internal Branch Notes</label>
                <textarea
                  value={tenantFormData.notes}
                  onChange={e => setTenantFormData({...tenantFormData, notes: e.target.value})}
                  rows="2"
                  placeholder="Location, branch notes, or billing contacts..."
                  className="w-full border rounded-lg p-2"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t sticky bottom-0 bg-white">
                <button type="button" onClick={() => setShowTenantModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingTenantId ? 'Save Tenant Updates' : 'Provision Tenant Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ASSIGN / CHANGE MANAGER (Super Admin Only)
         ======================================================== */}
      {showAssignManagerModal && assigningTenant && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="border-b pb-2 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                  {assigningTenant.manager_name ? `Change Manager for ${assigningTenant.name}` : `Assign Manager for ${assigningTenant.name}`}
                </h2>
                <p className="text-[11px] text-slate-500">Promote an existing staff user or provision a new manager account</p>
              </div>
            </div>

            <form onSubmit={handleSaveAssignManager} className="space-y-4">
              {/* Option Mode Buttons */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAssignMode('existing')}
                  className={`py-1.5 rounded-lg font-bold text-xs transition ${
                    assignMode === 'existing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Promote Existing Staff
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode('new')}
                  className={`py-1.5 rounded-lg font-bold text-xs transition ${
                    assignMode === 'new' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Create New Manager
                </button>
              </div>

              {assignMode === 'existing' ? (
                <div>
                  <label className="font-bold block mb-1 text-slate-700">Select Staff User to Promote to Manager *</label>
                  {currentTenantStaff.length === 0 ? (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs">
                      No other staff users found in this organization. Select "Create New Manager" instead.
                    </div>
                  ) : (
                    <select
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                      required
                      className="w-full border rounded-lg p-2 font-medium"
                    >
                      <option value="">-- Select a staff member --</option>
                      {currentTenantStaff.map(st => (
                        <option key={st.id} value={st.id}>
                          {st.full_name} (@{st.username}) - Current Role: {st.role_name || 'Staff'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="font-bold block mb-1 text-slate-700">Manager Full Name *</label>
                    <input
                      type="text"
                      value={newManagerForm.full_name}
                      onChange={(e) => setNewManagerForm({ ...newManagerForm, full_name: e.target.value })}
                      placeholder="e.g. Anand Shinde"
                      required
                      className="w-full border rounded-lg p-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-bold block mb-1 text-slate-700">Username *</label>
                      <input
                        type="text"
                        value={newManagerForm.username}
                        onChange={(e) => setNewManagerForm({ ...newManagerForm, username: e.target.value })}
                        placeholder="e.g. manager_anand"
                        required
                        className="w-full border rounded-lg p-2"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1 text-slate-700">Password *</label>
                      <input
                        type="password"
                        value={newManagerForm.password}
                        onChange={(e) => setNewManagerForm({ ...newManagerForm, password: e.target.value })}
                        placeholder="Secret password..."
                        required
                        className="w-full border rounded-lg p-2"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold block mb-1 text-slate-700">Mobile Number</label>
                      <input
                        type="text"
                        value={newManagerForm.mobile}
                        onChange={(e) => setNewManagerForm({ ...newManagerForm, mobile: e.target.value })}
                        placeholder="9876543210"
                        className="w-full border rounded-lg p-2"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-slate-700">Email Address</label>
                      <input
                        type="email"
                        value={newManagerForm.email}
                        onChange={(e) => setNewManagerForm({ ...newManagerForm, email: e.target.value })}
                        placeholder="manager@branch.com"
                        className="w-full border rounded-lg p-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowAssignManagerModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignMode === 'existing' && !selectedStaffId}
                  className="btn-primary"
                >
                  Save Manager Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: USER CREATE / EDIT
         ======================================================== */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2 text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-slate-700" />
              {editingUserId ? 'Edit Staff Account' : 'Create New User Account'}
            </h2>
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1 text-slate-700">Full Name *</label>
                <input
                  type="text"
                  value={userFormData.full_name}
                  onChange={e => setUserFormData({...userFormData, full_name: e.target.value})}
                  required
                  className="w-full border rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Username *</label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={e => setUserFormData({...userFormData, username: e.target.value})}
                    required
                    className="w-full border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Assigned Role *</label>
                  <select
                    value={userFormData.role_id}
                    onChange={e => setUserFormData({...userFormData, role_id: parseInt(e.target.value)})}
                    className="w-full border rounded-lg p-2 font-medium"
                  >
                    {roles
                      .filter(r => isSuperAdmin || r.name !== 'Super Admin')
                      .map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Super Admin Tenant Assignment */}
              {isSuperAdmin && (
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Assign to Tenant Organization</label>
                  <select
                    value={userFormData.tenant_id}
                    onChange={e => setUserFormData({...userFormData, tenant_id: e.target.value})}
                    className="w-full border rounded-lg p-2 font-medium"
                  >
                    <option value="">Global (Super Admin level)</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {editingUserId ? (
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Reset Password (leave blank to keep current)</label>
                  <input
                    type="password"
                    value={userFormData.new_password}
                    onChange={e => setUserFormData({...userFormData, new_password: e.target.value})}
                    placeholder="Enter new password..."
                    className="w-full border rounded-lg p-2"
                  />
                </div>
              ) : (
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Password *</label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={e => setUserFormData({...userFormData, password: e.target.value})}
                    required
                    className="w-full border rounded-lg p-2"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Mobile Number</label>
                  <input
                    type="text"
                    value={userFormData.mobile}
                    onChange={e => setUserFormData({...userFormData, mobile: e.target.value})}
                    placeholder="9876543210"
                    className="w-full border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Account Status</label>
                  <select
                    value={userFormData.status}
                    onChange={e => setUserFormData({...userFormData, status: e.target.value})}
                    className="w-full border rounded-lg p-2 font-medium"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowUserModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ROLE & RESPONSIBILITIES CONFIGURATOR
         ======================================================== */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-4 text-xs max-h-[90vh] flex flex-col">
            <div className="border-b pb-2 flex justify-between items-center">
              <h2 className="font-bold text-base flex items-center gap-2 text-slate-900">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                {editingRoleId ? `Configure Responsibilities for "${roleFormData.name}"` : 'Create Custom Role & Responsibilities'}
              </h2>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Role Name *</label>
                  <input
                    type="text"
                    value={roleFormData.name}
                    onChange={e => setRoleFormData({...roleFormData, name: e.target.value})}
                    required
                    className="w-full border rounded-lg p-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Role Description</label>
                  <input
                    type="text"
                    value={roleFormData.description}
                    onChange={e => setRoleFormData({...roleFormData, description: e.target.value})}
                    placeholder="Brief responsibility notes..."
                    className="w-full border rounded-lg p-2"
                  />
                </div>
              </div>

              {/* RESPONSIBILITIES MATRIX SECTION */}
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-slate-100 p-2.5 rounded-lg border">
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Module Responsibilities Matrix ({roleFormData.permission_ids?.length || 0} Enabled)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRoleFormData({ ...roleFormData, permission_ids: permissions.map(p => p.id) })}
                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-300 hover:bg-emerald-100"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoleFormData({ ...roleFormData, permission_ids: [] })}
                      className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-1 rounded hover:bg-slate-300"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="space-y-3 divide-y">
                  {modulesList.map((mod) => {
                    const modulePerms = permissions.filter(p => p.module === mod);
                    const allSelected = modulePerms.every(p => roleFormData.permission_ids?.includes(p.id));

                    return (
                      <div key={mod} className="pt-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-slate-900 uppercase tracking-tight text-xs flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                            Module: {mod.toUpperCase()}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleModulePermissions(mod, !allSelected)}
                            className="text-[10px] text-emerald-800 font-bold hover:underline"
                          >
                            {allSelected ? 'Unselect Module' : 'Select All in Module'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {modulePerms.map((perm) => {
                            const isChecked = roleFormData.permission_ids?.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                onClick={() => togglePermission(perm.id)}
                                className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition select-none ${
                                  isChecked
                                    ? 'bg-emerald-50/70 border-emerald-400 text-emerald-950 font-medium'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="mt-0.5 accent-emerald-600"
                                />
                                <div>
                                  <p className="font-bold text-xs">{perm.module}:{perm.action}</p>
                                  <p className="text-[10px] text-slate-500 leading-tight">{perm.description}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-white">
                <button type="button" onClick={() => setShowRoleModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Role & Responsibilities
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
