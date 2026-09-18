import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { getDb } from './db/connection.js';
import { initSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import productRoutes from './routes/product.routes.js';
import batchRoutes from './routes/batch.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import supplierRoutes from './routes/supplier.routes.js';
import customerRoutes from './routes/customer.routes.js';
import posRoutes from './routes/pos.routes.js';
import purchaseRoutes from './routes/purchase.routes.js';
import udharRoutes from './routes/udhar.routes.js';
import smsRoutes from './routes/sms.routes.js';
import salesReturnRoutes from './routes/sales_return.routes.js';
import purchaseReturnRoutes from './routes/purchase_return.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import reportRoutes from './routes/report.routes.js';
import settingRoutes from './routes/setting.routes.js';
import auditRoutes from './routes/audit.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Database & Schema
const db = getDb();
initSchema(db);

// Auto-seed if database is empty
const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get()?.count || 0;
if (userCount === 0) {
  console.log('Database empty. Initializing seed data...');
  seedDatabase();
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static uploads folder
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// API Router registration
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/udhar', udharRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/returns/sales', salesReturnRoutes);
app.use('/api/returns/purchase', purchaseReturnRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/audit', auditRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    system: 'KrushiPOS API Server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend build if exists
const clientBuildDir = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientBuildDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const indexPath = path.join(clientBuildDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('API Server Running. Frontend static build not found.');
  }
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('API Server Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

export { app };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
let server;
if (isMain) {
  server = app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`  KrushiPOS Backend API Server active on port ${PORT}`);
    console.log(`  Health check: http://localhost:${PORT}/api/health`);
    console.log(`=================================================`);
  });
}

export default app;
