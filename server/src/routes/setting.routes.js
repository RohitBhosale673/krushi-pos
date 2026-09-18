import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.use(authenticateToken);

// List All Business Settings
router.get('/', requirePermission('settings', 'manage'), (req, res) => {
  const settings = queryAll('SELECT * FROM business_settings ORDER BY setting_group ASC');
  const settingsMap = {};
  settings.forEach(s => {
    settingsMap[s.setting_key] = s.setting_value;
  });
  return res.json({ success: true, settings: settingsMap, raw: settings });
});

// Update Settings
router.post('/update', requirePermission('settings', 'manage'), (req, res) => {
  const settingsObj = req.body;

  if (!settingsObj || typeof settingsObj !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid settings payload.' });
  }

  try {
    transaction(() => {
      for (const [key, val] of Object.entries(settingsObj)) {
        run('INSERT INTO business_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP', [key, String(val)]);
      }
    });

    logAuditAction(req.user.id, 'UPDATE_SETTINGS', 'settings', null, null, settingsObj, req);

    return res.json({ success: true, message: 'Business settings updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Database Backup Download Endpoint
router.get('/backup/download', requirePermission('settings', 'manage'), (req, res) => {
  const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/krushipos.db');

  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ success: false, message: 'Database file not found.' });
  }

  const filename = `KrushiPOS_DB_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  res.download(dbPath, filename);
});

export default router;
