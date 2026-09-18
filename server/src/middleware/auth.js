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

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired session token.' });
    }
    
    // Ensure user is still active in DB
    const activeUser = queryOne('SELECT id, username, full_name, status FROM users WHERE id = ?', [user.id]);
    if (!activeUser || activeUser.status !== 'active') {
      return res.status(403).json({ success: false, message: 'User account is inactive or disabled.' });
    }

    req.user = activeUser;
    next();
  });
}

export function requirePermission(moduleName, actionName) {
  return (req, res, next) => {
    const userId = req.user.id;

    // Check if user is Super Admin
    const userRole = queryOne(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ? AND r.name = 'Super Admin'
    `, [userId]);

    if (userRole) {
      return next(); // Super Admin bypasses permission check
    }

    // Check module permission via roles
    const hasPerm = queryOne(`
      SELECT 1 
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ? AND p.module = ? AND p.action = ?
    `, [userId, moduleName, actionName]);

    if (hasPerm) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Permission denied. Accessing '${moduleName}:${actionName}' requires higher privileges.`
    });
  };
}

export function logAuditAction(userId, action, moduleName, recordId = null, oldVal = null, newVal = null, req = null) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1') : 'system';
    run(`
      INSERT INTO audit_logs (user_id, action, module, record_id, old_values, new_values, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userId || null,
      action,
      moduleName,
      recordId ? String(recordId) : null,
      oldVal ? (typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal)) : null,
      newVal ? (typeof newVal === 'string' ? newVal : JSON.stringify(newVal)) : null,
      ip
    ]);
  } catch (err) {
    console.error('Audit log recording error:', err);
  }
}
