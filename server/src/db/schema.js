export const schemaSQL = `
-- Tenants / Organizations (Manager Scopes)
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  manager_id INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
  max_users INTEGER DEFAULT 5,
  max_products INTEGER DEFAULT 500,
  storage_limit_mb INTEGER DEFAULT 100,
  allowed_modules TEXT DEFAULT '["pos","products","batches","inventory","purchases","suppliers","customers","udhar","returns","expenses","sms","reports","settings","users"]',
  allowed_reports TEXT DEFAULT '["sales","purchases","udhari","inventory","expenses","gst"]',
  subscription_tier TEXT DEFAULT 'Standard',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  scope TEXT DEFAULT 'system' CHECK(scope IN ('system', 'tenant')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  parent_user_id INTEGER,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  mobile TEXT,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
  custom_permissions TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Business Settings
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  setting_group TEXT DEFAULT 'general',
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Product Hierarchy & Units
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  name TEXT NOT NULL,
  contact_person TEXT,
  mobile TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  allow_decimal INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  category_id INTEGER,
  brand_id INTEGER,
  product_type TEXT NOT NULL CHECK(product_type IN (
    'Fertilizer', 'Seed', 'Pesticide', 'Insecticide', 'Fungicide',
    'Herbicide', 'Plant Growth Promoter', 'Agricultural Tool', 'Equipment', 'Other'
  )),
  description TEXT,
  primary_unit_id INTEGER NOT NULL,
  secondary_unit_id INTEGER,
  conversion_factor REAL DEFAULT 1.0,
  purchase_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  mrp REAL DEFAULT 0,
  wholesale_price REAL DEFAULT 0,
  retail_price REAL DEFAULT 0,
  gst_rate REAL DEFAULT 0,
  hsn_code TEXT,
  min_stock REAL DEFAULT 10,
  max_stock REAL DEFAULT 1000,
  reorder_level REAL DEFAULT 20,
  is_active INTEGER DEFAULT 1,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  FOREIGN KEY (primary_unit_id) REFERENCES units(id),
  FOREIGN KEY (secondary_unit_id) REFERENCES units(id)
);

-- Batches
CREATE TABLE IF NOT EXISTS product_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  product_id INTEGER NOT NULL,
  batch_no TEXT NOT NULL,
  mfg_date DATE,
  exp_date DATE NOT NULL,
  purchase_rate REAL NOT NULL,
  selling_rate REAL NOT NULL,
  mrp REAL NOT NULL,
  qty_received REAL NOT NULL,
  qty_sold REAL DEFAULT 0,
  available_qty REAL NOT NULL,
  damaged_qty REAL DEFAULT 0,
  returned_qty REAL DEFAULT 0,
  status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Near Expiry', 'Expired', 'Out of Stock', 'Blocked')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Stock Movement Ledger
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  product_id INTEGER NOT NULL,
  batch_id INTEGER,
  movement_type TEXT NOT NULL CHECK(movement_type IN (
    'opening_stock', 'purchase', 'sale', 'sale_return',
    'purchase_return', 'stock_adjustment', 'damaged', 'expiry_disposal'
  )),
  qty_change REAL NOT NULL,
  previous_qty REAL NOT NULL,
  new_qty REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  alt_mobile TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  state TEXT DEFAULT 'Maharashtra',
  opening_balance REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  credit_limit REAL DEFAULT 500000,
  payment_terms TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  supplier_id INTEGER NOT NULL,
  txn_type TEXT NOT NULL CHECK(txn_type IN ('PURCHASE', 'PAYMENT', 'PURCHASE_RETURN', 'ADJUSTMENT')),
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit Note', 'Other')),
  ref_type TEXT,
  ref_id TEXT,
  notes TEXT,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  alt_mobile TEXT,
  address TEXT,
  village TEXT,
  taluka TEXT,
  district TEXT,
  state TEXT DEFAULT 'Maharashtra',
  gstin TEXT,
  customer_type TEXT DEFAULT 'Farmer' CHECK(customer_type IN ('Farmer', 'Retail Customer', 'Dealer', 'Business Customer', 'Other')),
  opening_balance REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  credit_limit REAL DEFAULT 50000,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  customer_id INTEGER NOT NULL,
  txn_type TEXT NOT NULL CHECK(txn_type IN ('SALE', 'PAYMENT', 'SALE_RETURN', 'ADJUSTMENT')),
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Other')),
  ref_type TEXT,
  ref_id TEXT,
  notes TEXT,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  invoice_no TEXT NOT NULL,
  customer_id INTEGER,
  cashier_id INTEGER,
  sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_taxable REAL DEFAULT 0,
  total_tax REAL DEFAULT 0,
  total_discount REAL DEFAULT 0,
  round_off REAL DEFAULT 0,
  grand_total REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  due_amount REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'PAID' CHECK(payment_status IN ('PAID', 'PARTIAL', 'CREDIT', 'OVERDUE')),
  sale_type TEXT DEFAULT 'RETAIL' CHECK(sale_type IN ('RETAIL', 'WHOLESALE', 'CREDIT')),
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'HOLD', 'CANCELLED', 'RETURNED')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL,
  mrp REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  gst_rate REAL DEFAULT 0,
  taxable_amount REAL NOT NULL,
  cgst_amount REAL DEFAULT 0,
  sgst_amount REAL DEFAULT 0,
  igst_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES product_batches(id)
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  sale_id INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Credit / Udhar')),
  amount REAL NOT NULL,
  txn_ref TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- Sales Returns
CREATE TABLE IF NOT EXISTS sales_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  return_no TEXT NOT NULL,
  original_sale_id INTEGER,
  customer_id INTEGER,
  user_id INTEGER,
  return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_amount REAL NOT NULL,
  refund_method TEXT DEFAULT 'Credit Adjustment' CHECK(refund_method IN ('Cash', 'UPI', 'Credit Adjustment', 'Bank Transfer')),
  reason TEXT,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'PENDING', 'REJECTED')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (original_sale_id) REFERENCES sales(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  return_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  gst_rate REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  condition_type TEXT DEFAULT 'Restockable' CHECK(condition_type IN ('Restockable', 'Damaged', 'Expired')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES product_batches(id)
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  invoice_no TEXT NOT NULL,
  supplier_invoice_no TEXT,
  supplier_id INTEGER NOT NULL,
  user_id INTEGER,
  purchase_date DATE NOT NULL,
  total_taxable REAL DEFAULT 0,
  total_tax REAL DEFAULT 0,
  total_discount REAL DEFAULT 0,
  freight_charges REAL DEFAULT 0,
  other_charges REAL DEFAULT 0,
  grand_total REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  due_amount REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'PAID' CHECK(payment_status IN ('PAID', 'PARTIAL', 'CREDIT')),
  status TEXT DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED', 'PENDING', 'CANCELLED')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  purchase_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  batch_no TEXT NOT NULL,
  mfg_date DATE,
  exp_date DATE NOT NULL,
  qty REAL NOT NULL,
  unit TEXT NOT NULL,
  purchase_rate REAL NOT NULL,
  mrp REAL NOT NULL,
  selling_rate REAL NOT NULL,
  gst_rate REAL DEFAULT 0,
  taxable_amount REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Purchase Returns
CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  return_no TEXT NOT NULL,
  original_purchase_id INTEGER,
  supplier_id INTEGER NOT NULL,
  user_id INTEGER,
  return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_amount REAL NOT NULL,
  reason TEXT,
  debit_note_no TEXT,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'PENDING')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (original_purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  return_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  gst_rate REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES product_batches(id)
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  category TEXT NOT NULL CHECK(category IN (
    'Rent', 'Electricity', 'Salary', 'Transport', 'Internet',
    'Maintenance', 'Packaging', 'Marketing', 'Miscellaneous', 'Other'
  )),
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date DATE NOT NULL,
  payment_method TEXT DEFAULT 'Cash' CHECK(payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other')),
  recipient TEXT,
  reference_no TEXT,
  description TEXT,
  receipt_url TEXT,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- SMS Logs
CREATE TABLE IF NOT EXISTS sms_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  customer_id INTEGER,
  mobile TEXT NOT NULL,
  template_name TEXT,
  message TEXT NOT NULL,
  provider TEXT DEFAULT 'MSG91',
  provider_msg_id TEXT,
  status TEXT DEFAULT 'SENT' CHECK(status IN ('SENT', 'DELIVERED', 'FAILED', 'SIMULATED')),
  error_message TEXT,
  sent_by INTEGER,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  user_id INTEGER,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
`;

export const indexSQL = `
CREATE INDEX IF NOT EXISTS idx_tenants_code ON tenants(code);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_batches_tenant ON product_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_exp ON product_batches(exp_date);
CREATE INDEX IF NOT EXISTS idx_batches_status ON product_batches(status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_balance ON customers(current_balance);
CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no);
CREATE INDEX IF NOT EXISTS idx_purchases_tenant ON purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON business_settings(tenant_id);
`;

const tablesRequiringTenantId = [
  'roles', 'users', 'business_settings', 'categories', 'brands', 'units',
  'products', 'product_batches', 'stock_movements', 'suppliers', 'supplier_transactions',
  'customers', 'customer_transactions', 'sales', 'sale_items', 'sale_payments',
  'sales_returns', 'sales_return_items', 'purchases', 'purchase_items',
  'purchase_returns', 'purchase_return_items', 'expenses', 'sms_logs', 'audit_logs'
];

export async function initSchema(db) {
  const exec = async (sql) => {
    if (db && typeof db.executeMultiple === 'function') {
      return await db.executeMultiple(sql);
    } else if (db && typeof db.exec === 'function') {
      return db.exec(sql);
    } else if (db && typeof db.execute === 'function') {
      return await db.execute(sql);
    }
  };

  // Ensure business_settings has tenant_id and not an obsolete UNIQUE(setting_key) constraint
  try {
    const checkRes = db.execute ? await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='business_settings'") : null;
    const sqlStr = String(checkRes?.rows?.[0]?.[0] || checkRes?.rows?.[0]?.sql || '');
    if (sqlStr && (sqlStr.includes('setting_key TEXT UNIQUE') || !sqlStr.includes('tenant_id'))) {
      await exec("DROP TABLE IF EXISTS business_settings;");
    }
  } catch (_) {}

  // 1. Create tables
  await exec(schemaSQL);

  // 2. Migration: Ensure all columns exist for existing databases
  for (const table of tablesRequiringTenantId) {
    try {
      await exec(`ALTER TABLE ${table} ADD COLUMN tenant_id INTEGER;`);
    } catch (_) {}
  }

  try {
    await exec(`ALTER TABLE users ADD COLUMN parent_user_id INTEGER;`);
  } catch (_) {}

  try {
    await exec(`ALTER TABLE users ADD COLUMN custom_permissions TEXT;`);
  } catch (_) {}

  try {
    await exec(`ALTER TABLE roles ADD COLUMN scope TEXT DEFAULT 'tenant';`);
  } catch (_) {}

  try {
    await exec(`ALTER TABLE roles ADD COLUMN tenant_id INTEGER;`);
  } catch (_) {}

  // 3. Create all indexes
  await exec(indexSQL);

  // 4. Ensure master permissions & default roles exist (essential for existing production databases)
  try {
    let permCount = 0;
    if (db && typeof db.execute === 'function') {
      const pRes = await db.execute("SELECT COUNT(*) AS cnt FROM permissions;");
      permCount = Number(pRes?.rows?.[0]?.[0] || pRes?.rows?.[0]?.cnt || 0);
    }
    if (permCount === 0) {
      await initMasterPermissionsAndRoles(exec, db);
    }
  } catch (_) {}
}

async function initMasterPermissionsAndRoles(exec, db) {
  const defaultPermissions = [
    ['pos', 'create', 'Create POS sales bills'],
    ['pos', 'hold', 'Hold and resume bills'],
    ['pos', 'cancel', 'Cancel completed bills'],
    ['pos', 'reprint', 'Reprint old invoices'],
    ['pos', 'discount', 'Apply bill level discounts'],
    ['pos', 'override_expiry', 'Override expired stock sale block'],
    ['products', 'view', 'View product catalog'],
    ['products', 'manage', 'Add/Edit/Delete products'],
    ['batches', 'view', 'View stock batches and expiry dates'],
    ['batches', 'manage', 'Adjust batch stock & status'],
    ['inventory', 'adjust', 'Perform manual stock adjustments'],
    ['purchases', 'view', 'View purchase invoices'],
    ['purchases', 'create', 'Create purchase invoice'],
    ['suppliers', 'view', 'View supplier master & ledger'],
    ['suppliers', 'manage', 'Add/Edit suppliers & payments'],
    ['customers', 'view', 'View customer directory & balances'],
    ['customers', 'manage', 'Add/Edit customer profiles'],
    ['udhar', 'view', 'View outstanding Udhar & aging'],
    ['udhar', 'collect', 'Receive customer Udhar payments'],
    ['returns', 'sales_return', 'Process customer sales return'],
    ['returns', 'purchase_return', 'Process supplier purchase return'],
    ['expenses', 'manage', 'Add and view daily expenses'],
    ['sms', 'send', 'Send SMS reminders to customers'],
    ['reports', 'view', 'Access financial & inventory reports'],
    ['reports', 'export', 'Export report data to CSV/PDF'],
    ['tenants', 'manage', 'Create and configure tenant organizations and limits'],
    ['users', 'manage', 'Manage users, roles, and permissions'],
    ['settings', 'manage', 'Edit business & thermal printer settings'],
    ['audit', 'view', 'View security audit logs']
  ];

  for (const [mod, act, desc] of defaultPermissions) {
    try {
      if (db && typeof db.execute === 'function') {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO permissions (module, action, description) VALUES (?, ?, ?)',
          args: [mod, act, desc]
        });
      }
    } catch (_) {}
  }

  const defaultRoles = [
    ['Super Admin', 'Full system control, tenant provisioning, system-wide analytics', 1, 'system'],
    ['Manager', 'Store management, staff accounts, purchases, billing, tenant settings', 1, 'tenant'],
    ['Cashier', 'POS billing, sales returns, customer selection & receipt printing', 1, 'tenant'],
    ['Inventory Staff', 'Stock tracking, batch updates, damage logs & FEFO checks', 1, 'tenant'],
    ['Accountant', 'Udhari collection, daily expenses, GST reports, supplier payables', 1, 'tenant']
  ];

  for (const [rname, rdesc, isSys, scope] of defaultRoles) {
    try {
      if (db && typeof db.execute === 'function') {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO roles (name, description, is_system, scope) VALUES (?, ?, ?, ?)',
          args: [rname, rdesc, isSys, scope]
        });
      }
    } catch (_) {}
  }

  // Link permissions to standard roles
  try {
    if (db && typeof db.execute === 'function') {
      // Super Admin: all permissions
      await db.execute(`
        INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'Super Admin'
      `);
      // Manager: all store permissions except global tenant provisioning
      await db.execute(`
        INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'Manager' AND p.module != 'tenants'
      `);
      // Cashier
      await db.execute(`
        INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p 
        WHERE r.name = 'Cashier' AND (p.module = 'pos' OR p.module = 'customers' OR (p.module = 'products' AND p.action = 'view'))
      `);
    }
  } catch (_) {}
}

export default {
  schemaSQL,
  indexSQL,
  initSchema
};

