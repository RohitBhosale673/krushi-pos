import jwt from 'jsonwebtoken';
import { queryAll, queryOne, run } from '../db/connection.js';

const JWT_SECRET = process.env.JWT_SECRET || 'krushi_pos_super_secret_jwt_key_2026';

export { JWT_SECRET };

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query && req.query.token);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired session token.' });
    }
    
    try {
      // 1. Fetch active user
      const user = await queryOne(`
        SELECT id, tenant_id, parent_user_id, username, full_name, mobile, email, status, custom_permissions
        FROM users WHERE id = ?
      `, [decoded.id]);

      if (!user) {
        return res.status(403).json({ success: false, message: 'User account not found.' });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: 'User account is inactive or suspended.' });
      }

      // 2. Fetch roles
      const rolesRows = await queryAll(`
        SELECT r.id, r.name, r.scope 
        FROM roles r 
        JOIN user_roles ur ON r.id = ur.role_id 
        WHERE ur.user_id = ?
      `, [user.id]);
      const roles = rolesRows.map(r => r.name);
      const isSuperAdmin = roles.includes('Super Admin');

      // 3. Tenant verification & limits
      let tenantData = null;
      if (user.tenant_id) {
        const tenant = await queryOne('SELECT * FROM tenants WHERE id = ?', [user.tenant_id]);
        if (!tenant) {
          return res.status(403).json({ success: false, message: 'Tenant organization not found.' });
        }
        if (tenant.status !== 'active') {
          return res.status(403).json({
            success: false,
            message: `Tenant organization '${tenant.name}' is ${tenant.status}. Access blocked. Please contact Super Admin.`
          });
        }

        let allowedModules = [];
        let allowedReports = [];
        try {
          allowedModules = JSON.parse(tenant.allowed_modules || '[]');
        } catch (_) {
          allowedModules = [];
        }
        try {
          allowedReports = JSON.parse(tenant.allowed_reports || '[]');
        } catch (_) {
          allowedReports = [];
        }

        tenantData = {
          ...tenant,
          allowed_modules: allowedModules,
          allowed_reports: allowedReports
        };
      }

      req.user = {
        id: user.id,
        tenant_id: user.tenant_id,
        parent_user_id: user.parent_user_id,
        username: user.username,
        full_name: user.full_name,
        mobile: user.mobile,
        email: user.email,
        status: user.status,
        roles,
        is_super_admin: isSuperAdmin,
        tenant: tenantData
      };

      next();
    } catch (dbErr) {
      return res.status(500).json({ success: false, message: 'Database authentication error: ' + dbErr.message });
    }
  });
}

export function requirePermission(moduleName, actionName) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      // 1. Super Admin bypasses all checks
      if (req.user.is_super_admin) {
        return next();
      }

      // 2. Tenant Module Restriction check
      if (req.user.tenant && req.user.tenant.allowed_modules) {
        // Special case: 'users' and 'settings' within tenant
        if (!req.user.tenant.allowed_modules.includes(moduleName) && moduleName !== 'auth') {
          return res.status(403).json({
            success: false,
            message: `Module '${moduleName}' is disabled for your organization. Contact Super Admin to enable access.`
          });
        }
      }

      // 3. Store Manager or Admin has full permissions for their tenant modules
      const isManager = req.user.roles && req.user.roles.some(r => /manager|admin/i.test(r));
      if (isManager && moduleName !== 'tenants') {
        return next();
      }

      // 4. User Permission check via roles
      const hasPerm = await queryOne(`
        SELECT 1 
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = ? AND p.module = ? AND p.action = ?
      `, [req.user.id, moduleName, actionName]);

      if (hasPerm) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `Permission denied. Accessing '${moduleName}:${actionName}' requires higher privileges.`
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };
}

/**
 * Returns the tenant_id to scope queries by:
 * - For Regular Users / Managers: ALWAYS returns req.user.tenant_id.
 * - For Super Admin: returns x-tenant-id / query.tenant_id if set, or null (all data).
 */
export function getTenantScope(req) {
  if (!req.user) return null;
  if (req.user.is_super_admin) {
    const requested = req.headers['x-tenant-id'] || req.query.tenant_id;
    if (requested && !isNaN(parseInt(requested))) {
      return parseInt(requested);
    }
    return null; // System-wide
  }
  return req.user.tenant_id;
}

export function logAuditAction(userId, action, moduleName, recordId = null, oldVal = null, newVal = null, req = null) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1') : 'system';
    const tenantId = req?.user?.tenant_id || null;

    run(`
      INSERT INTO audit_logs (tenant_id, user_id, action, module, record_id, old_values, new_values, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tenantId,
      userId || null,
      action,
      moduleName,
      recordId ? String(recordId) : null,
      oldVal ? (typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal)) : null,
      newVal ? (typeof newVal === 'string' ? newVal : JSON.stringify(newVal)) : null,
      ip
    ]).catch(err => {
      console.error('Audit log recording error:', err);
    });
  } catch (err) {
    console.error('Audit log recording error:', err);
  }
}

export default {
  JWT_SECRET,
  authenticateToken,
  requirePermission,
  getTenantScope,
  logAuditAction
};
