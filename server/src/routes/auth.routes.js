import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne, queryAll, run } from '../db/connection.js';
import { authenticateToken, JWT_SECRET, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const user = await queryOne('SELECT * FROM users WHERE username = ?', [username.trim()]);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact Administrator.' });
    }

    // Verify password
    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    // Fetch roles
    const rolesRows = await queryAll(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `, [user.id]);
    const roles = rolesRows.map(r => r.name);
    const isSuperAdmin = roles.includes('Super Admin');

    // Tenant check
    let tenantData = null;
    if (user.tenant_id) {
      const tenant = await queryOne('SELECT * FROM tenants WHERE id = ?', [user.tenant_id]);
      if (!tenant) {
        return res.status(403).json({ success: false, message: 'Organization not found.' });
      }
      if (tenant.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: `Your organization '${tenant.name}' is currently ${tenant.status}. Contact Super Admin.`
        });
      }

      let allowedModules = [];
      let allowedReports = [];
      try { allowedModules = JSON.parse(tenant.allowed_modules || '[]'); } catch (_) {}
      try { allowedReports = JSON.parse(tenant.allowed_reports || '[]'); } catch (_) {}

      tenantData = {
        ...tenant,
        allowed_modules: allowedModules,
        allowed_reports: allowedReports
      };
    }

    // Permissions
    let permissions = [];
    const isManager = roles && roles.some(r => /manager|admin/i.test(r));

    if (isSuperAdmin) {
      const permRows = await queryAll("SELECT module || ':' || action AS perm FROM permissions");
      permissions = permRows.map(p => p.perm);
    } else if (isManager) {
      // Store Manager has all store permissions for their tenant
      const permRows = await queryAll("SELECT module || ':' || action AS perm FROM permissions WHERE module != 'tenants'");
      permissions = permRows.length > 0 ? permRows.map(p => p.perm) : ['all'];
      if (tenantData && tenantData.allowed_modules) {
        permissions = permissions.filter(p => {
          const mod = p.split(':')[0];
          return tenantData.allowed_modules.includes(mod) || mod === 'auth';
        });
      }
    } else {
      const permRows = await queryAll(`
        SELECT DISTINCT p.module || ':' || p.action AS perm 
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = ?
      `, [user.id]);
      permissions = permRows.map(p => p.perm);

      // Filter by tenant allowed modules if applicable
      if (tenantData && tenantData.allowed_modules) {
        permissions = permissions.filter(p => {
          const mod = p.split(':')[0];
          return tenantData.allowed_modules.includes(mod) || mod === 'auth';
        });
      }
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, tenant_id: user.tenant_id },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    logAuditAction(user.id, 'LOGIN', 'auth', user.id, null, { username: user.username }, req);

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        parent_user_id: user.parent_user_id,
        username: user.username,
        full_name: user.full_name,
        mobile: user.mobile,
        email: user.email,
        roles,
        is_super_admin: isSuperAdmin,
        tenant: tenantData,
        permissions
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Current User Profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const isSuperAdmin = req.user.is_super_admin;

    let permissions = [];
    const isManager = req.user.roles && req.user.roles.some(r => /manager|admin/i.test(r));

    if (isSuperAdmin) {
      const permRows = await queryAll("SELECT module || ':' || action AS perm FROM permissions");
      permissions = permRows.map(p => p.perm);
    } else if (isManager) {
      // Store Manager has all store permissions for their tenant
      const permRows = await queryAll("SELECT module || ':' || action AS perm FROM permissions WHERE module != 'tenants'");
      permissions = permRows.length > 0 ? permRows.map(p => p.perm) : ['all'];
      if (req.user.tenant && req.user.tenant.allowed_modules) {
        permissions = permissions.filter(p => {
          const mod = p.split(':')[0];
          return req.user.tenant.allowed_modules.includes(mod) || mod === 'auth';
        });
      }
    } else {
      const permRows = await queryAll(`
        SELECT DISTINCT p.module || ':' || p.action AS perm 
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = ?
      `, [userId]);
      permissions = permRows.map(p => p.perm);

      if (req.user.tenant && req.user.tenant.allowed_modules) {
        permissions = permissions.filter(p => {
          const mod = p.split(':')[0];
          return req.user.tenant.allowed_modules.includes(mod) || mod === 'auth';
        });
      }
    }

    return res.json({
      success: true,
      user: {
        id: req.user.id,
        tenant_id: req.user.tenant_id,
        parent_user_id: req.user.parent_user_id,
        username: req.user.username,
        full_name: req.user.full_name,
        mobile: req.user.mobile,
        email: req.user.email,
        status: req.user.status,
        roles: req.user.roles,
        is_super_admin: isSuperAdmin,
        tenant: req.user.tenant,
        permissions
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Reset Password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both current and new passwords are required.' });
    }

    const user = await queryOne('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    await run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newHash, req.user.id]);

    logAuditAction(req.user.id, 'CHANGE_PASSWORD', 'auth', req.user.id, null, null, req);

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
