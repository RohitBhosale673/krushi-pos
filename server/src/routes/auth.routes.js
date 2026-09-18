import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne, queryAll, run } from '../db/connection.js';
import { authenticateToken, JWT_SECRET, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ success: false, message: 'Account is deactivated. Contact Administrator.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  // Fetch roles and permissions
  const roles = queryAll(`
    SELECT r.name 
    FROM roles r 
    JOIN user_roles ur ON r.id = ur.role_id 
    WHERE ur.user_id = ?
  `, [user.id]).map(r => r.name);

  let permissions = [];
  if (roles.includes('Super Admin')) {
    permissions = queryAll("SELECT module || ':' || action AS perm FROM permissions").map(p => p.perm);
  } else {
    permissions = queryAll(`
      SELECT DISTINCT p.module || ':' || p.action AS perm 
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ?
    `, [user.id]).map(p => p.perm);
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });

  logAuditAction(user.id, 'LOGIN', 'auth', user.id, null, { username: user.username }, req);

  return res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      mobile: user.mobile,
      email: user.email,
      roles,
      permissions
    }
  });
});

// Current User Profile
router.get('/me', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const user = queryOne('SELECT id, username, full_name, mobile, email, status FROM users WHERE id = ?', [userId]);

  const roles = queryAll(`
    SELECT r.name 
    FROM roles r 
    JOIN user_roles ur ON r.id = ur.role_id 
    WHERE ur.user_id = ?
  `, [userId]).map(r => r.name);

  let permissions = [];
  if (roles.includes('Super Admin')) {
    permissions = queryAll("SELECT module || ':' || action AS perm FROM permissions").map(p => p.perm);
  } else {
    permissions = queryAll(`
      SELECT DISTINCT p.module || ':' || p.action AS perm 
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ?
    `, [userId]).map(p => p.perm);
  }

  return res.json({
    success: true,
    user: {
      ...user,
      roles,
      permissions
    }
  });
});

// Reset Password
router.post('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Both current and new passwords are required.' });
  }

  const user = queryOne('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newHash, req.user.id]);

  logAuditAction(req.user.id, 'CHANGE_PASSWORD', 'auth', req.user.id, null, null, req);

  return res.json({ success: true, message: 'Password updated successfully.' });
});

export default router;
