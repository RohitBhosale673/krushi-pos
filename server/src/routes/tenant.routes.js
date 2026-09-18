import express from 'express';
import bcrypt from 'bcryptjs';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// Middleware: Tenant management requires Super Admin privilege
function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.is_super_admin) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Tenant management requires Super Admin privileges.'
    });
  }
  next();
}

router.use(requireSuperAdmin);

// 1. Get system-wide tenant summary stats
router.get('/summary/stats', async (req, res) => {
  try {
    const totalTenants = (await queryOne('SELECT COUNT(*) AS cnt FROM tenants'))?.cnt || 0;
    const activeTenants = (await queryOne("SELECT COUNT(*) AS cnt FROM tenants WHERE status = 'active'"))?.cnt || 0;
    const suspendedTenants = (await queryOne("SELECT COUNT(*) AS cnt FROM tenants WHERE status = 'suspended'"))?.cnt || 0;
    const totalUsers = (await queryOne('SELECT COUNT(*) AS cnt FROM users'))?.cnt || 0;
    const totalSales = (await queryOne('SELECT COALESCE(SUM(grand_total), 0) AS total FROM sales'))?.total || 0;

    return res.json({
      success: true,
      stats: {
        totalTenants,
        activeTenants,
        suspendedTenants,
        totalUsers,
        totalSales
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. List all Tenants with user count, product count, and Manager info
router.get('/', async (req, res) => {
  try {
    const tenants = await queryAll(`
      SELECT t.*,
             u.full_name AS manager_name,
             u.username AS manager_username,
             u.mobile AS manager_mobile,
             u.email AS manager_email,
             (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) AS current_users_count,
             (SELECT COUNT(*) FROM products WHERE tenant_id = t.id) AS current_products_count,
             (SELECT COALESCE(SUM(grand_total), 0) FROM sales WHERE tenant_id = t.id) AS total_sales_revenue
      FROM tenants t
      LEFT JOIN users u ON t.manager_id = u.id
      ORDER BY t.id ASC
    `);

    // Parse JSON arrays for response
    const formatted = tenants.map(t => {
      let allowed_modules = [];
      let allowed_reports = [];
      try { allowed_modules = JSON.parse(t.allowed_modules || '[]'); } catch (_) {}
      try { allowed_reports = JSON.parse(t.allowed_reports || '[]'); } catch (_) {}
      return {
        ...t,
        allowed_modules,
        allowed_reports
      };
    });

    return res.json({ success: true, tenants: formatted });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Single Tenant details with user staff directory
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.params.id;
    const tenant = await queryOne('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    const users = await queryAll(`
      SELECT u.id, u.username, u.full_name, u.mobile, u.email, u.status, u.created_at,
             r.name AS role_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.tenant_id = ?
      ORDER BY u.id ASC
    `, [tenantId]);

    const settings = await queryAll('SELECT setting_key, setting_value FROM business_settings WHERE tenant_id = ?', [tenantId]);

    let allowed_modules = [];
    let allowed_reports = [];
    try { allowed_modules = JSON.parse(tenant.allowed_modules || '[]'); } catch (_) {}
    try { allowed_reports = JSON.parse(tenant.allowed_reports || '[]'); } catch (_) {}

    return res.json({
      success: true,
      tenant: {
        ...tenant,
        allowed_modules,
        allowed_reports
      },
      users,
      settings
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Create new Tenant & optionally provision its primary Manager
router.post('/', async (req, res) => {
  const {
    name,
    code,
    max_users = 5,
    max_products = 500,
    storage_limit_mb = 100,
    allowed_modules = ['pos', 'products', 'batches', 'inventory', 'purchases', 'suppliers', 'customers', 'udhar', 'returns', 'expenses', 'reports', 'settings', 'users'],
    allowed_reports = ['sales', 'purchases', 'udhari', 'inventory', 'expenses', 'gst'],
    subscription_tier = 'Standard',
    notes,
    manager_username,
    manager_password,
    manager_name,
    manager_mobile,
    manager_email
  } = req.body;

  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Tenant name and code are required.' });
  }

  try {
    const existing = await queryOne('SELECT id FROM tenants WHERE code = ?', [code.trim()]);
    if (existing) {
      return res.status(400).json({ success: false, message: `Tenant with code '${code}' already exists.` });
    }

    let newTenantId;
    let newManagerId = null;

    await transaction(async () => {
      const resT = await run(`
        INSERT INTO tenants (name, code, max_users, max_products, storage_limit_mb, allowed_modules, allowed_reports, subscription_tier, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name.trim(),
        code.trim().toUpperCase(),
        max_users,
        max_products,
        storage_limit_mb,
        JSON.stringify(allowed_modules),
        JSON.stringify(allowed_reports),
        subscription_tier,
        notes || null
      ]);
      newTenantId = resT.lastInsertRowid;

      // If Manager credentials provided, create the Manager user account
      if (manager_username && manager_password) {
        const hash = bcrypt.hashSync(manager_password, 10);
        const resU = await run(`
          INSERT INTO users (tenant_id, username, password_hash, full_name, mobile, email, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `, [
          newTenantId,
          manager_username.trim(),
          hash,
          manager_name ? manager_name.trim() : `Manager (${name})`,
          manager_mobile || null,
          manager_email || null
        ]);
        newManagerId = resU.lastInsertRowid;

        // Assign Manager role
        const mgrRole = await queryOne("SELECT id FROM roles WHERE name = 'Manager'");
        if (mgrRole) {
          await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [newManagerId, mgrRole.id]);
        }

        // Link manager to tenant
        await run('UPDATE tenants SET manager_id = ? WHERE id = ?', [newManagerId, newTenantId]);
      }

      // Initialize default business settings for the new tenant
      const defaultSettings = [
        { key: 'store_name', val: name },
        { key: 'tagline', val: 'Quality Agri Inputs & Seeds' },
        { key: 'invoice_prefix', val: `${code.trim().toUpperCase()}/` },
        { key: 'thermal_header', val: `${name.toUpperCase()}\nMob: ${manager_mobile || ''}` },
        { key: 'thermal_footer', val: 'Thank you for your visit!' }
      ];
      for (const s of defaultSettings) {
        await run(`
          INSERT INTO business_settings (tenant_id, setting_key, setting_value, setting_group, description)
          VALUES (?, ?, ?, 'general', 'Default Store Setting')
        `, [newTenantId, s.key, s.val]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_TENANT', 'tenants', newTenantId, null, { name, code, newManagerId }, req);

    return res.json({
      success: true,
      message: 'Tenant organization created successfully.',
      tenantId: newTenantId,
      managerId: newManagerId
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Update Tenant limits, modules, quota, or status
router.put('/:id', async (req, res) => {
  const tenantId = req.params.id;
  const {
    name,
    status,
    max_users,
    max_products,
    storage_limit_mb,
    allowed_modules,
    allowed_reports,
    subscription_tier,
    notes,
    manager_id
  } = req.body;

  try {
    const target = await queryOne('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    await run(`
      UPDATE tenants
      SET name = COALESCE(?, name),
          status = COALESCE(?, status),
          max_users = COALESCE(?, max_users),
          max_products = COALESCE(?, max_products),
          storage_limit_mb = COALESCE(?, storage_limit_mb),
          allowed_modules = COALESCE(?, allowed_modules),
          allowed_reports = COALESCE(?, allowed_reports),
          subscription_tier = COALESCE(?, subscription_tier),
          notes = COALESCE(?, notes),
          manager_id = CASE WHEN ? = 1 THEN ? ELSE manager_id END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name || null,
      status || null,
      max_users !== undefined ? max_users : null,
      max_products !== undefined ? max_products : null,
      storage_limit_mb !== undefined ? storage_limit_mb : null,
      allowed_modules ? JSON.stringify(allowed_modules) : null,
      allowed_reports ? JSON.stringify(allowed_reports) : null,
      subscription_tier || null,
      notes !== undefined ? notes : null,
      manager_id !== undefined ? 1 : 0,
      manager_id !== undefined ? manager_id : null,
      tenantId
    ]);

    logAuditAction(req.user.id, 'UPDATE_TENANT', 'tenants', tenantId, target, req.body, req);

    return res.json({ success: true, message: 'Tenant organization updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5a. Delete / Remove Manager from Tenant
router.delete('/:id/manager', async (req, res) => {
  const tenantId = req.params.id;
  const deleteAccount = req.query.delete_account !== 'false';

  try {
    const tenant = await queryOne('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    if (!tenant.manager_id) {
      return res.status(400).json({ success: false, message: 'This tenant does not have a designated manager.' });
    }

    const managerId = tenant.manager_id;
    const managerUser = await queryOne('SELECT * FROM users WHERE id = ?', [managerId]);

    await transaction(async () => {
      // 1. Unset manager_id on tenant
      await run('UPDATE tenants SET manager_id = NULL WHERE id = ?', [tenantId]);

      // 2. If deleteAccount is requested and user exists, delete the manager account
      if (deleteAccount && managerUser) {
        await run('UPDATE users SET parent_user_id = NULL WHERE parent_user_id = ?', [managerId]);
        await run('DELETE FROM user_roles WHERE user_id = ?', [managerId]);
        await run('DELETE FROM users WHERE id = ?', [managerId]);
      }
    });

    logAuditAction(req.user.id, 'DELETE_TENANT_MANAGER', 'tenants', tenantId, { manager_id: managerId }, null, req);

    return res.json({
      success: true,
      message: deleteAccount
        ? `Manager account '${managerUser?.full_name || managerUser?.username || managerId}' deleted and unassigned successfully.`
        : 'Manager unassigned from tenant organization successfully.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5b. Assign or Provision Manager for Tenant
router.post('/:id/manager', async (req, res) => {
  const tenantId = req.params.id;
  const { user_id, username, password, full_name, mobile, email } = req.body;

  try {
    const tenant = await queryOne('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    const mgrRole = await queryOne("SELECT id FROM roles WHERE name = 'Manager'");
    let targetManagerId;

    if (user_id) {
      // Assign an existing user under this tenant
      const existingUser = await queryOne('SELECT * FROM users WHERE id = ? AND tenant_id = ?', [user_id, tenantId]);
      if (!existingUser) {
        return res.status(404).json({ success: false, message: 'User not found in this tenant organization.' });
      }
      targetManagerId = user_id;

      if (mgrRole) {
        await run('DELETE FROM user_roles WHERE user_id = ?', [targetManagerId]);
        await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [targetManagerId, mgrRole.id]);
      }
    } else if (username && password) {
      // Provision a new manager
      const existingUsername = await queryOne('SELECT id FROM users WHERE username = ?', [username.trim()]);
      if (existingUsername) {
        return res.status(400).json({ success: false, message: 'Username is already taken.' });
      }

      const hash = bcrypt.hashSync(password, 10);
      const resUser = await run(`
        INSERT INTO users (tenant_id, parent_user_id, username, password_hash, full_name, mobile, email, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `, [
        tenantId,
        req.user.id,
        username.trim(),
        hash,
        full_name ? full_name.trim() : `Manager (${tenant.name})`,
        mobile || null,
        email || null
      ]);
      targetManagerId = resUser.lastInsertRowid;

      if (mgrRole) {
        await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [targetManagerId, mgrRole.id]);
      }
    } else {
      return res.status(400).json({ success: false, message: 'Please provide either user_id or manager credentials (username, password, full_name).' });
    }

    await run('UPDATE tenants SET manager_id = ? WHERE id = ?', [targetManagerId, tenantId]);

    logAuditAction(req.user.id, 'ASSIGN_TENANT_MANAGER', 'tenants', tenantId, null, { manager_id: targetManagerId }, req);

    return res.json({
      success: true,
      message: 'Manager assigned to tenant organization successfully.',
      managerId: targetManagerId
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Delete Tenant (Deactivates or deletes tenant and cascades to its data)
router.delete('/:id', async (req, res) => {
  const tenantId = req.params.id;

  try {
    const target = await queryOne('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    await transaction(async () => {
      // Cascade delete is supported via foreign keys, but deleting explicitly ensures clean state
      await run('DELETE FROM users WHERE tenant_id = ?', [tenantId]);
      await run('DELETE FROM products WHERE tenant_id = ?', [tenantId]);
      await run('DELETE FROM customers WHERE tenant_id = ?', [tenantId]);
      await run('DELETE FROM sales WHERE tenant_id = ?', [tenantId]);
      await run('DELETE FROM business_settings WHERE tenant_id = ?', [tenantId]);
      await run('DELETE FROM tenants WHERE id = ?', [tenantId]);
    });

    logAuditAction(req.user.id, 'DELETE_TENANT', 'tenants', tenantId, target, null, req);

    return res.json({ success: true, message: `Tenant '${target.name}' and associated data deleted successfully.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
