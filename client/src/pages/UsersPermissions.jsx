import React, { useState, useEffect } from 'react';
import { Users, Shield, Plus, Edit2, Trash2, Key, CheckSquare, Square, UserCheck, ShieldCheck, AlertCircle } from 'lucide-react';
import { apiRequest } from '../api';

export default function UsersPermissions({ showToast }) {
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'roles'
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);

  // User Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userFormData, setUserFormData] = useState({
    username: '', password: '', full_name: '', mobile: '', email: '', role_id: 1, status: 'active', new_password: ''
  });

  // Role Modals
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [roleFormData, setRoleFormData] = useState({
    name: '', description: '', permission_ids: []
  });

  const fetchData = async () => {
    try {
      const [uRes, rRes] = await Promise.all([
        apiRequest('/users'),
        apiRequest('/users/roles-permissions')
      ]);
      if (uRes.success) setUsers(uRes.users || []);
      if (rRes.success) {
        setRoles(rRes.roles || []);
        setPermissions(rRes.permissions || []);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- USER HANDLERS ---
  const openCreateUser = () => {
    setEditingUserId(null);
    setUserFormData({
      username: '', password: '', full_name: '', mobile: '', email: '', role_id: roles[0]?.id || 1, status: 'active', new_password: ''
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
        new_password: userFormData.new_password
      } : {
        username: userFormData.username,
        password: userFormData.password,
        full_name: userFormData.full_name,
        mobile: userFormData.mobile,
        email: userFormData.email,
        role_id: userFormData.role_id
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

  const toggleUserStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await apiRequest(`/users/${user.id}`, {
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

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user account?')) return;
    try {
      const res = await apiRequest(`/users/${userId}`, { method: 'DELETE' });
      if (res.success) {
        showToast(res.message, 'success');
        fetchData();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- ROLE & RESPONSIBILITY HANDLERS ---
  const openCreateRole = () => {
    setEditingRoleId(null);
    setRoleFormData({
      name: '', description: '', permission_ids: []
    });
    setShowRoleModal(true);
  };

  const openEditRole = (role) => {
    setEditingRoleId(role.id);
    setRoleFormData({
      name: role.name,
      description: role.description || '',
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
    if (!window.confirm('Are you sure you want to delete this role?')) return;
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

  // Group permissions by module for matrix display
  const modulesList = Array.from(new Set(permissions.map(p => p.module)));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Tab Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Super Admin Security & Access Control</h1>
          <p className="text-xs text-slate-500">Manage user staff accounts, system roles, and detailed module responsibility matrices</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'users' ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-600 border hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" /> Users & Accounts ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'roles' ? 'bg-emerald-700 text-white shadow' : 'bg-white text-slate-600 border hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Roles & Responsibilities ({roles.length})
          </button>
        </div>
      </div>

      {/* TAB 1: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-slate-600">Active system users and assigned RBAC roles</p>
            <button onClick={openCreateUser} className="btn-primary text-xs">
              <Plus className="w-4 h-4" /> Create New User Account
            </button>
          </div>

          <div className="card-panel overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Assigned Role</th>
                  <th>Mobile Number</th>
                  <th>Email Address</th>
                  <th>Status</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-bold text-slate-900 text-xs">{u.full_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">@{u.username} | ID: #{u.id}</p>
                    </td>
                    <td>
                      <span className="bg-emerald-100 text-emerald-900 text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-emerald-300">
                        {u.role_name || 'User'}
                      </span>
                    </td>
                    <td className="text-xs font-mono text-slate-700">{u.mobile || 'N/A'}</td>
                    <td className="text-xs text-slate-600">{u.email || 'N/A'}</td>
                    <td>
                      <span className={u.status === 'active' ? 'badge-active' : 'badge-danger'}>
                        {u.status}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button onClick={() => openEditUser(u)} className="p-1.5 hover:bg-slate-200 text-slate-700 rounded" title="Edit User">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleUserStatus(u)} className="btn-secondary text-[10px] py-1 px-2" title="Toggle Status">
                          {u.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 hover:bg-red-100 text-red-600 rounded" title="Delete User">
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

      {/* TAB 2: ROLES & RESPONSIBILITY MATRIX */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-slate-600">Configure role permissions and operational responsibilities</p>
            <button onClick={openCreateRole} className="btn-primary text-xs">
              <Plus className="w-4 h-4" /> Create Custom Role
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((r) => {
              const activeCount = r.permission_ids?.length || 0;
              const totalCount = permissions.length;
              return (
                <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-600" /> {r.name}
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        r.is_system ? 'bg-slate-100 text-slate-700 border' : 'bg-purple-100 text-purple-800 border border-purple-200'
                      }`}>
                        {r.is_system ? 'System Role' : 'Custom Role'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 min-h-[36px]">{r.description || 'No description provided.'}</p>

                    <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded text-slate-700">
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">Users Assigned</span>
                        <span className="font-bold text-slate-900">{r.user_count || 0} users</span>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded text-emerald-900">
                        <span className="text-[10px] text-emerald-600 block font-bold uppercase">Responsibilities</span>
                        <span className="font-bold text-emerald-900">{r.name === 'Super Admin' ? 'All (Bypass)' : `${activeCount} / ${totalCount}`}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t text-xs">
                    <button onClick={() => openEditRole(r)} className="btn-secondary text-xs flex items-center gap-1">
                      <Edit2 className="w-3.5 h-3.5" /> Configure Responsibilities
                    </button>
                    {!r.is_system && (
                      <button onClick={() => handleDeleteRole(r.id)} className="text-red-600 hover:text-red-800 p-1" title="Delete Role">
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

      {/* MODAL: USER CREATE / EDIT */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h2 className="font-bold text-base border-b pb-2">
              {editingUserId ? 'Edit User Account' : 'Create New System User'}
            </h2>
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Full Name *</label>
                <input
                  type="text"
                  value={userFormData.full_name}
                  onChange={e => setUserFormData({...userFormData, full_name: e.target.value})}
                  required
                  className="w-full border rounded p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Username *</label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={e => setUserFormData({...userFormData, username: e.target.value})}
                    required
                    className="w-full border rounded p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Assigned Role *</label>
                  <select
                    value={userFormData.role_id}
                    onChange={e => setUserFormData({...userFormData, role_id: parseInt(e.target.value)})}
                    className="w-full border rounded p-2"
                  >
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>

              {editingUserId ? (
                <div>
                  <label className="font-semibold block mb-1">Reset Password (leave blank to keep current)</label>
                  <input
                    type="password"
                    value={userFormData.new_password}
                    onChange={e => setUserFormData({...userFormData, new_password: e.target.value})}
                    placeholder="Enter new password..."
                    className="w-full border rounded p-2"
                  />
                </div>
              ) : (
                <div>
                  <label className="font-semibold block mb-1">Password *</label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={e => setUserFormData({...userFormData, password: e.target.value})}
                    required
                    className="w-full border rounded p-2"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Mobile Number</label>
                  <input
                    type="text"
                    value={userFormData.mobile}
                    onChange={e => setUserFormData({...userFormData, mobile: e.target.value})}
                    className="w-full border rounded p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Account Status</label>
                  <select
                    value={userFormData.status}
                    onChange={e => setUserFormData({...userFormData, status: e.target.value})}
                    className="w-full border rounded p-2"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowUserModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ROLE & RESPONSIBILITIES MATRIX CONFIGURATOR */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 space-y-4 text-xs max-h-[90vh] flex flex-col">
            <div className="border-b pb-2 flex justify-between items-center">
              <h2 className="font-bold text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                {editingRoleId ? `Configure Responsibilities for "${roleFormData.name}"` : 'Create Custom Role & Responsibilities'}
              </h2>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Role Name *</label>
                  <input
                    type="text"
                    value={roleFormData.name}
                    onChange={e => setRoleFormData({...roleFormData, name: e.target.value})}
                    required
                    className="w-full border rounded p-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Role Description</label>
                  <input
                    type="text"
                    value={roleFormData.description}
                    onChange={e => setRoleFormData({...roleFormData, description: e.target.value})}
                    placeholder="Brief responsibility notes..."
                    className="w-full border rounded p-2"
                  />
                </div>
              </div>

              {/* RESPONSIBILITIES MATRIX SECTION */}
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-slate-100 p-2.5 rounded-lg border">
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Responsibilities & Module Permissions Matrix ({roleFormData.permission_ids?.length || 0} Enabled)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRoleFormData({ ...roleFormData, permission_ids: permissions.map(p => p.id) })}
                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-300 hover:bg-emerald-100"
                    >
                      Select All Responsibilities
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
                                  onChange={() => {}} // Handled by label click
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
                <button type="button" onClick={() => setShowRoleModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Role & Responsibilities</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
