import express from 'express';
import bcrypt from 'bcryptjs';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// 1. List all users with role assignments
router.get('/', requirePermission('users', 'manage'), async (req, res) => {
  try {
    const users = await queryAll(`
      SELECT u.id, u.username, u.full_name, u.mobile, u.email, u.status, u.created_at,
             ur.role_id, r.name AS role_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ORDER BY u.id ASC
    `);
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. List all roles with assigned permission IDs & available permissions
router.get('/roles-permissions', requirePermission('users', 'manage'), async (req, res) => {
  try {
    const roles = await queryAll(`
      SELECT r.*, COUNT(ur.user_id) AS user_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      GROUP BY r.id
      ORDER BY r.id ASC
    `);

    const permissions = await queryAll('SELECT * FROM permissions ORDER BY module ASC, id ASC');

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
  const { name, description, permission_ids = [] } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Role name is required.' });
  }

  try {
    const existing = await queryOne('SELECT id FROM roles WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Role name already exists.' });
    }

    let roleId;
    await transaction(async () => {
      const resRole = await run('INSERT INTO roles (name, description, is_system) VALUES (?, ?, 0)', [
        name.trim(), description || null
      ]);
      roleId = resRole.lastInsertRowid;

      if (Array.isArray(permission_ids)) {
        for (const pid of permission_ids) {
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

  try {
    const targetRole = await queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!targetRole) {
      return res.status(404).json({ success: false, message: 'Role not found.' });
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

  try {
    const targetRole = await queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!targetRole) {
      return res.status(404).json({ success: false, message: 'Role not found.' });
    }

    if (targetRole.is_system) {
      return res.status(400).json({ success: false, message: 'System default roles cannot be deleted.' });
    }

    const assignedUsers = await queryOne('SELECT COUNT(*) AS cnt FROM user_roles WHERE role_id = ?', [roleId]);
    if (assignedUsers && assignedUsers.cnt > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete role. It is assigned to ${assignedUsers.cnt} active user(s). Reassign users first.` });
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

// 6. Create User Account
router.post('/', requirePermission('users', 'manage'), async (req, res) => {
  const { username, password, full_name, mobile, email, role_id } = req.body;

  if (!username || !password || !full_name || !role_id) {
    return res.status(400).json({ success: false, message: 'Username, password, full name, and role are required.' });
  }

  try {
    const existing = await queryOne('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    let newUserId;
    await transaction(async () => {
      const hash = bcrypt.hashSync(password, 10);
      const resUser = await run(`
        INSERT INTO users (username, password_hash, full_name, mobile, email, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `, [username.trim(), hash, full_name.trim(), mobile || null, email || null]);

      newUserId = resUser.lastInsertRowid;
      await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [newUserId, role_id]);
    });

    logAuditAction(req.user.id, 'CREATE_USER', 'users', newUserId, null, { username, full_name, role_id }, req);

    return res.json({ success: true, message: 'User created successfully', userId: newUserId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Update User Account details, role, or password
router.put('/:id', requirePermission('users', 'manage'), async (req, res) => {
  const userId = req.params.id;
  const { full_name, mobile, email, status, role_id, new_password, username } = req.body;

  try {
    const target = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await transaction(async () => {
      await run(`
        UPDATE users 
        SET username = COALESCE(?, username),
            full_name = COALESCE(?, full_name),
            mobile = COALESCE(?, mobile),
            email = COALESCE(?, email),
            status = COALESCE(?, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [username || null, full_name || null, mobile || null, email || null, status || null, userId]);

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

  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own logged-in account.' });
  }

  try {
    const target = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await transaction(async () => {
      await run('DELETE FROM user_roles WHERE user_id = ?', [userId]);
      await run('DELETE FROM users WHERE id = ?', [userId]);
    });

    logAuditAction(req.user.id, 'DELETE_USER', 'users', userId, target, null, req);

    return res.json({ success: true, message: 'User account deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
