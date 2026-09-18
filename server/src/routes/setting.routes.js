import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.use(authenticateToken);

// List All Business Settings for Caller's Organization
router.get('/', requirePermission('settings', 'manage'), async (req, res) => {
  try {
    const tenantScope = getTenantScope(req);
    const assignedTenantId = tenantScope !== null ? tenantScope : (req.user?.tenant_id || 1);

    const settings = await queryAll('SELECT * FROM business_settings WHERE tenant_id = ? ORDER BY setting_group ASC', [assignedTenantId]);
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.setting_key] = s.setting_value;
    });
    return res.json({ success: true, settings: settingsMap, raw: settings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update Settings for Caller's Organization
router.post('/update', requirePermission('settings', 'manage'), async (req, res) => {
  const settingsObj = req.body;
  const tenantScope = getTenantScope(req);
  const assignedTenantId = tenantScope !== null ? tenantScope : (req.user?.tenant_id || 1);

  if (!settingsObj || typeof settingsObj !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid settings payload.' });
  }

  try {
    await transaction(async () => {
      for (const [key, val] of Object.entries(settingsObj)) {
        const existing = await queryOne('SELECT id FROM business_settings WHERE tenant_id = ? AND setting_key = ?', [assignedTenantId, key]);
        if (existing) {
          await run('UPDATE business_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [String(val), existing.id]);
        } else {
          await run('INSERT INTO business_settings (tenant_id, setting_key, setting_value) VALUES (?, ?, ?)', [assignedTenantId, key, String(val)]);
        }
      }
    });

    logAuditAction(req.user.id, 'UPDATE_SETTINGS', 'settings', null, null, { ...settingsObj, tenant_id: assignedTenantId }, req);

    return res.json({ success: true, message: 'Business settings updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Database Backup Download Endpoint (Restricted to Super Admin)
router.get('/backup/download', requirePermission('settings', 'manage'), (req, res) => {
  if (!req.user.is_super_admin) {
    return res.status(403).json({ success: false, message: 'Only Super Admin can download full database backups.' });
  }

  const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/krushipos.db');

  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ success: false, message: 'Local database file not found (cloud database may be active).' });
  }

  const filename = `KrushiPOS_DB_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  res.download(dbPath, filename);
});

export default router;
