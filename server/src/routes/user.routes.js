import express from 'express';
import bcrypt from 'bcryptjs';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// 1. List users (Scoped by tenant for Managers, system-wide or filtered for Super Admin)
router.get('/', requirePermission('users', 'manage'), async (req, res) => {
  try {
    const tenantScope = getTenantScope(req);
    let sql = `
      SELECT u.id, u.tenant_id, u.parent_user_id, u.username, u.full_name, u.mobile, u.email, u.status, u.created_at,
             ur.role_id, r.name AS role_name,
             t.name AS tenant_name, t.code AS tenant_code
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN tenants t ON u.tenant_id = t.id
    `;
    const params = [];

    if (tenantScope !== null) {
      sql += ` WHERE u.tenant_id = ?`;
      params.push(tenantScope);
    }

    sql += ` ORDER BY u.id ASC`;

    const users = await queryAll(sql, params);
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. List all roles with assigned permission IDs & available permissions
router.get('/roles-permissions', requirePermission('users', 'manage'), async (req, res) => {
  try {
    const isSuperAdmin = req.user.is_super_admin;
    const tenantScope = getTenantScope(req);

    let rolesSql = `
      SELECT r.*, COUNT(ur.user_id) AS user_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
    `;
    const params = [];

    if (!isSuperAdmin) {
      // Non-super admins only see standard tenant roles or custom roles for their tenant
      rolesSql += ` WHERE r.name != 'Super Admin' AND (r.tenant_id IS NULL OR r.tenant_id = ?)`;
      params.push(tenantScope);
    }

    rolesSql += ` GROUP BY r.id ORDER BY r.id ASC`;

    const roles = await queryAll(rolesSql, params);

    // Permissions: Super Admin gets all, tenant managers get permitted modules
    let permSql = 'SELECT * FROM permissions';
    const permParams = [];
    if (!isSuperAdmin && req.user.tenant && req.user.tenant.allowed_modules) {
      const allowed = req.user.tenant.allowed_modules;
      const placeholders = allowed.map(() => '?').join(',');
      permSql += ` WHERE module IN (${placeholders})`;
      permParams.push(...allowed);
    }
    permSql += ' ORDER BY module ASC, id ASC';

    const permissions = await queryAll(permSql, permParams);

    // Attach permission IDs to each role
    const rolesWithPerms = await Promise.all(roles.map(async (r) => {
      const rolePerms = await queryAll('SELECT permission_id FROM role_permissions WHERE role_id = ?', [r.id]);
      return {
        ...r,
        permission_ids: rolePerms.map(rp => rp.permission_id)
      };
    }));

    return res.json({ success: true, roles: rolesWithPerms, permissions });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Create a new Role
router.post('/roles', requirePermission('users', 'manage'), async (req, res) => {
  const { name, description, permission_ids = [], scope = 'tenant' } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Role name is required.' });
  }

  try {
    const isSuperAdmin = req.user.is_super_admin;
    const targetTenantId = isSuperAdmin ? (req.body.tenant_id || null) : req.user.tenant_id;
    const roleScope = isSuperAdmin ? scope : 'tenant';

    const existing = await queryOne('SELECT id FROM roles WHERE name = ? AND (tenant_id IS NULL OR tenant_id = ?)', [
      name.trim(), targetTenantId
    ]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Role name already exists.' });
    }

    let roleId;
    await transaction(async () => {
      const resRole = await run(`
        INSERT INTO roles (tenant_id, name, description, is_system, scope)
        VALUES (?, ?, ?, 0, ?)
      `, [targetTenantId, name.trim(), description || null, roleScope]);
      roleId = resRole.lastInsertRowid;

      if (Array.isArray(permission_ids)) {
        for (const pid of permission_ids) {
          // If manager, ensure the permission is within their allowed modules
          if (!isSuperAdmin && req.user.tenant?.allowed_modules) {
            const p = await queryOne('SELECT module FROM permissions WHERE id = ?', [pid]);
            if (p && !req.user.tenant.allowed_modules.includes(p.module)) {
              continue; // Skip permissions outside tenant's quota
            }
          }
          await run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, pid]);
        }
      }
    });

    logAuditAction(req.user.id, 'CREATE_ROLE', 'users', roleId, null, { name, permission_ids }, req);

    return res.json({ success: true, message: 'Role created successfully.', roleId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Edit / Update Role details and permissions matrix
router.put('/roles/:id', requirePermission('users', 'manage'), async (req, res) => {
  const roleId = req.params.id;
  const { name, description, permission_ids } = req.body;
  const isSuperAdmin = req.user.is_super_admin;

  try {
    const targetRole = await queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!targetRole) {
      return res.status(404).json({ success: false, message: 'Role not found.' });
    }

    // Tenant authorization
    if (!isSuperAdmin && targetRole.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ success: false, message: 'Cannot edit global or other tenant roles.' });
    }

    if (targetRole.is_system && !isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'System default roles can only be edited by Super Admin.' });
    }

    await transaction(async () => {
      const cleanName = (targetRole.is_system ? targetRole.name : (name || targetRole.name)).trim();

      await run(`
        UPDATE roles 
        SET name = ?, description = ?
        WHERE id = ?
      `, [cleanName, description !== undefined ? description : targetRole.description, roleId]);

      if (Array.isArray(permission_ids)) {
        await run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
        for (const pid of permission_ids) {
          if (!isSuperAdmin && req.user.tenant?.allowed_modules) {
            const p = await queryOne('SELECT module FROM permissions WHERE id = ?', [pid]);
            if (p && !req.user.tenant.allowed_modules.includes(p.module)) {
              continue;
            }
          }
          await run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, pid]);
        }
      }
    });

    logAuditAction(req.user.id, 'UPDATE_ROLE', 'users', roleId, targetRole, { name, description, permission_ids }, req);

    return res.json({ success: true, message: 'Role and responsibilities updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Delete Custom Role
router.delete('/roles/:id', requirePermission('users', 'manage'), async (req, res) => {
  const roleId = req.params.id;
  const isSuperAdmin = req.user.is_super_admin;

  try {
    const targetRole = await queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!targetRole) {
      return res.status(404).json({ success: false, message: 'Role not found.' });
    }

    if (targetRole.is_system) {
      return res.status(400).json({ success: false, message: 'System default roles cannot be deleted.' });
    }

    if (!isSuperAdmin && targetRole.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const assignedUsers = await queryOne('SELECT COUNT(*) AS cnt FROM user_roles WHERE role_id = ?', [roleId]);
    if (assignedUsers && assignedUsers.cnt > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. It is assigned to ${assignedUsers.cnt} active user(s). Reassign users first.`
      });
    }

    await transaction(async () => {
      await run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      await run('DELETE FROM roles WHERE id = ?', [roleId]);
    });

    logAuditAction(req.user.id, 'DELETE_ROLE', 'users', roleId, targetRole, null, req);

    return res.json({ success: true, message: 'Role deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Create User Account (Enforces Super Admin or Manager Tenant Quotas)
router.post('/', requirePermission('users', 'manage'), async (req, res) => {
  const { username, password, full_name, mobile, email, role_id, tenant_id } = req.body;
  const isSuperAdmin = req.user.is_super_admin;

  if (!username || !password || !full_name || !role_id) {
    return res.status(400).json({ success: false, message: 'Username, password, full name, and role are required.' });
  }

  try {
    // Determine assigned tenant
    let assignedTenantId;
    let parentUserId = null;

    if (isSuperAdmin) {
      assignedTenantId = tenant_id !== undefined ? tenant_id : null;
      parentUserId = req.user.id;
    } else {
      // Manager creating user
      assignedTenantId = req.user.tenant_id;
      parentUserId = req.user.id;

      // Check tenant user creation quota!
      if (req.user.tenant && req.user.tenant.max_users) {
        const userCountRow = await queryOne('SELECT COUNT(*) AS cnt FROM users WHERE tenant_id = ?', [assignedTenantId]);
        const currentUsers = userCountRow?.cnt || 0;
        if (currentUsers >= req.user.tenant.max_users) {
          return res.status(400).json({
            success: false,
            message: `User limit reached for your organization (${currentUsers} / ${req.user.tenant.max_users} seats used). Contact Super Admin to expand your plan.`
          });
        }
      }

      // Ensure Manager cannot assign Super Admin role
      const requestedRole = await queryOne('SELECT name FROM roles WHERE id = ?', [role_id]);
      if (requestedRole?.name === 'Super Admin') {
        return res.status(403).json({ success: false, message: 'Cannot assign Super Admin role.' });
      }
    }

    const existing = await queryOne('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    let newUserId;
    await transaction(async () => {
      const hash = bcrypt.hashSync(password, 10);
      const resUser = await run(`
        INSERT INTO users (tenant_id, parent_user_id, username, password_hash, full_name, mobile, email, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `, [assignedTenantId, parentUserId, username.trim(), hash, full_name.trim(), mobile || null, email || null]);

      newUserId = resUser.lastInsertRowid;
      await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [newUserId, role_id]);
    });

    logAuditAction(req.user.id, 'CREATE_USER', 'users', newUserId, null, { username, full_name, role_id, assignedTenantId }, req);

    return res.json({ success: true, message: 'User created successfully', userId: newUserId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Update User Account details, role, or password
router.put('/:id', requirePermission('users', 'manage'), async (req, res) => {
  const userId = req.params.id;
  const { full_name, mobile, email, status, role_id, new_password, username, tenant_id } = req.body;
  const isSuperAdmin = req.user.is_super_admin;

  try {
    let sql = 'SELECT * FROM users WHERE id = ?';
    const params = [userId];

    if (!isSuperAdmin) {
      sql += ' AND tenant_id = ?';
      params.push(req.user.tenant_id);
    }

    const target = await queryOne(sql, params);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found in your organization.' });
    }

    // Ensure non-superadmin cannot assign Super Admin role
    if (!isSuperAdmin && role_id) {
      const r = await queryOne('SELECT name FROM roles WHERE id = ?', [role_id]);
      if (r?.name === 'Super Admin') {
        return res.status(403).json({ success: false, message: 'Cannot assign Super Admin role.' });
      }
    }

    await transaction(async () => {
      const updatedTenantId = isSuperAdmin && tenant_id !== undefined ? tenant_id : target.tenant_id;

      await run(`
        UPDATE users 
        SET username = COALESCE(?, username),
            full_name = COALESCE(?, full_name),
            mobile = COALESCE(?, mobile),
            email = COALESCE(?, email),
            status = COALESCE(?, status),
            tenant_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [username || null, full_name || null, mobile || null, email || null, status || null, updatedTenantId, userId]);

      if (new_password && new_password.trim() !== '') {
        const hash = bcrypt.hashSync(new_password.trim(), 10);
        await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
      }

      if (role_id) {
        await run('DELETE FROM user_roles WHERE user_id = ?', [userId]);
        await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, role_id]);
      }
    });

    logAuditAction(req.user.id, 'UPDATE_USER', 'users', userId, target, { full_name, status, role_id }, req);

    return res.json({ success: true, message: 'User updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Delete User Account
router.delete('/:id', requirePermission('users', 'manage'), async (req, res) => {
  const userId = req.params.id;
  const isSuperAdmin = req.user.is_super_admin;

  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own logged-in account.' });
  }

  try {
    let sql = 'SELECT * FROM users WHERE id = ?';
    const params = [userId];

    if (!isSuperAdmin) {
      sql += ' AND tenant_id = ?';
      params.push(req.user.tenant_id);
    }

    const target = await queryOne(sql, params);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found in your organization.' });
    }

    // Non-superadmin cannot delete a Manager
    if (!isSuperAdmin) {
      const userRole = await queryOne(`
        SELECT r.name FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = ?
      `, [userId]);
      if (userRole?.name === 'Manager') {
        return res.status(403).json({ success: false, message: 'Only Super Admin can delete a Manager account.' });
      }
    }

    await transaction(async () => {
      // 1. Unlink any tenant where this user is the designated manager
      await run('UPDATE tenants SET manager_id = NULL WHERE manager_id = ?', [userId]);

      // 2. Unlink any staff users where this user is the parent
      await run('UPDATE users SET parent_user_id = NULL WHERE parent_user_id = ?', [userId]);

      // 3. Remove user roles
      await run('DELETE FROM user_roles WHERE user_id = ?', [userId]);

      // 4. Delete user record
      await run('DELETE FROM users WHERE id = ?', [userId]);
    });

    logAuditAction(req.user.id, 'DELETE_USER', 'users', userId, target, null, req);

    return res.json({ success: true, message: 'User account deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
