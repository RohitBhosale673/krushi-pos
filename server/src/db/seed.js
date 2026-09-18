import bcrypt from 'bcryptjs';
import { getDb, transaction, run, queryOne, queryAll } from './connection.js';
import { initSchema } from './schema.js';

export async function seedDatabase() {
  const db = getDb();
  await initSchema(db);

  console.log('Seeding database with Multi-Tenant KrushiPOS agricultural data...');

  await transaction(async () => {
    // Clear tables in reverse foreign key order for clean idempotent seeding
    const tablesToClear = [
      'sms_logs', 'audit_logs', 'expenses', 'purchase_return_items', 'purchase_returns',
      'purchase_items', 'purchases', 'sales_return_items', 'sales_returns', 'sale_payments',
      'sale_items', 'sales', 'customer_transactions', 'customers', 'supplier_transactions',
      'suppliers', 'stock_movements', 'product_batches', 'products', 'brands', 'categories',
      'units', 'business_settings', 'user_roles', 'role_permissions', 'users', 'permissions', 'roles', 'tenants'
    ];

    for (const table of tablesToClear) {
      await run(`DELETE FROM ${table};`);
    }

    try {
      await run(`DELETE FROM sqlite_sequence;`);
    } catch (_) {}

    // 1. Roles
    const roles = [
      // Standard Roles
      { name: 'Super Admin', description: 'Full system control, tenant provisioning, system-wide analytics', is_system: 1, scope: 'system' },
      { name: 'Manager', description: 'Store management, staff accounts, purchases, billing, tenant settings', is_system: 1, scope: 'tenant' },
      { name: 'Cashier', description: 'POS billing, sales returns, customer selection & receipt printing', is_system: 1, scope: 'tenant' },
      { name: 'Inventory Staff', description: 'Stock tracking, batch updates, damage logs & FEFO checks', is_system: 1, scope: 'tenant' },
      { name: 'Accountant', description: 'Udhari collection, daily expenses, GST reports, supplier payables', is_system: 1, scope: 'tenant' },
      
      // Custom Admin Roles configured by Super Admin
      { name: 'HR Admin', description: 'Human resources, staff accounts, and activity auditing', is_system: 0, scope: 'system' },
      { name: 'Finance Admin', description: 'Financial ledger, udhar aging, expenses, and GST reporting', is_system: 0, scope: 'system' },
      { name: 'Sales Admin', description: 'Sales operations, cashier supervision, and pricing governance', is_system: 0, scope: 'system' },
      { name: 'Support Admin', description: 'Customer support, bill reprinting, and customer communication', is_system: 0, scope: 'system' },
      { name: 'Operations Admin', description: 'Supply chain, vendor management, and product catalog control', is_system: 0, scope: 'system' },
      { name: 'Custom Admin', description: 'Tailored administrative role with custom permissions matrix', is_system: 0, scope: 'system' }
    ];

    for (const role of roles) {
      await run('INSERT INTO roles (name, description, is_system, scope) VALUES (?, ?, ?, ?)', [
        role.name, role.description, role.is_system, role.scope
      ]);
    }

    // 2. Permissions Master
    const permissions = [
      // POS
      { module: 'pos', action: 'create', description: 'Create POS sales bills' },
      { module: 'pos', action: 'hold', description: 'Hold and resume bills' },
      { module: 'pos', action: 'cancel', description: 'Cancel completed bills' },
      { module: 'pos', action: 'reprint', description: 'Reprint old invoices' },
      { module: 'pos', action: 'discount', description: 'Apply bill level discounts' },
      { module: 'pos', action: 'override_expiry', description: 'Override expired stock sale block' },
      
      // Products & Inventory
      { module: 'products', action: 'view', description: 'View product catalog' },
      { module: 'products', action: 'manage', description: 'Add/Edit/Delete products' },
      { module: 'batches', action: 'view', description: 'View stock batches and expiry dates' },
      { module: 'batches', action: 'manage', description: 'Adjust batch stock & status' },
      { module: 'inventory', action: 'adjust', description: 'Perform manual stock adjustments' },

      // Purchases & Suppliers
      { module: 'purchases', action: 'view', description: 'View purchase invoices' },
      { module: 'purchases', action: 'create', description: 'Create purchase invoice' },
      { module: 'suppliers', action: 'view', description: 'View supplier master & ledger' },
      { module: 'suppliers', action: 'manage', description: 'Add/Edit suppliers & payments' },

      // Customers & Udhar
      { module: 'customers', action: 'view', description: 'View customer directory & balances' },
      { module: 'customers', action: 'manage', description: 'Add/Edit customer profiles' },
      { module: 'udhar', action: 'view', description: 'View outstanding Udhar & aging' },
      { module: 'udhar', action: 'collect', description: 'Receive customer Udhar payments' },

      // Returns & Expenses
      { module: 'returns', action: 'sales_return', description: 'Process customer sales return' },
      { module: 'returns', action: 'purchase_return', description: 'Process supplier purchase return' },
      { module: 'expenses', action: 'manage', description: 'Add and view daily expenses' },

      // SMS & Reports
      { module: 'sms', action: 'send', description: 'Send SMS reminders to customers' },
      { module: 'reports', action: 'view', description: 'Access financial & inventory reports' },
      { module: 'reports', action: 'export', description: 'Export report data to CSV/PDF' },

      // System & Tenant Administration
      { module: 'tenants', action: 'manage', description: 'Create and configure tenant organizations and limits' },
      { module: 'users', action: 'manage', description: 'Manage users, roles, and permissions' },
      { module: 'settings', action: 'manage', description: 'Edit business & thermal printer settings' },
      { module: 'audit', action: 'view', description: 'View security audit logs' }
    ];

    for (const perm of permissions) {
      await run('INSERT INTO permissions (module, action, description) VALUES (?, ?, ?)', [
        perm.module, perm.action, perm.description
      ]);
    }

    // Role-Permission mapping helpers
    const getRole = async (rname) => await queryOne('SELECT id FROM roles WHERE name = ?', [rname]);
    const getPermsByModule = async (modules) => {
      const placeholders = modules.map(() => '?').join(',');
      return await queryAll(`SELECT id FROM permissions WHERE module IN (${placeholders})`, modules);
    };

    const assignPermsToRole = async (roleName, permList) => {
      const r = await getRole(roleName);
      if (!r) return;
      for (const p of permList) {
        await run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [r.id, p.id]);
      }
    };

    // Super Admin gets all permissions
    const allPerms = await queryAll('SELECT id FROM permissions');
    await assignPermsToRole('Super Admin', allPerms);

    // Manager gets store permissions (everything except global tenant provisioning)
    const managerPerms = await queryAll("SELECT id FROM permissions WHERE module != 'tenants'");
    await assignPermsToRole('Manager', managerPerms);

    // Cashier
    const cashierPerms = await getPermsByModule(['pos', 'customers']);
    await assignPermsToRole('Cashier', cashierPerms);

    // Inventory Staff
    const invPerms = await getPermsByModule(['products', 'batches', 'inventory', 'purchases']);
    await assignPermsToRole('Inventory Staff', invPerms);

    // Accountant
    const accPerms = await getPermsByModule(['customers', 'udhar', 'suppliers', 'expenses', 'reports']);
    await assignPermsToRole('Accountant', accPerms);

    // HR Admin
    const hrPerms = await getPermsByModule(['users', 'audit', 'reports']);
    await assignPermsToRole('HR Admin', hrPerms);

    // Finance Admin
    const finPerms = await getPermsByModule(['udhar', 'expenses', 'reports', 'suppliers']);
    await assignPermsToRole('Finance Admin', finPerms);

    // Sales Admin
    const salesPerms = await getPermsByModule(['pos', 'customers', 'udhar', 'returns', 'reports']);
    await assignPermsToRole('Sales Admin', salesPerms);

    // Support Admin
    const supPerms = await getPermsByModule(['customers', 'pos', 'sms', 'audit']);
    await assignPermsToRole('Support Admin', supPerms);

    // Operations Admin
    const opsPerms = await getPermsByModule(['products', 'batches', 'inventory', 'purchases', 'suppliers']);
    await assignPermsToRole('Operations Admin', opsPerms);

    // 3. Provision Multi-Tenants (Organizations)
    const resTenant1 = await run(`
      INSERT INTO tenants (name, code, status, max_users, max_products, storage_limit_mb, allowed_modules, allowed_reports, subscription_tier, notes)
      VALUES (?, ?, 'active', 5, 500, 100, ?, ?, 'Enterprise', 'Flagship Nashik Branch')
    `, [
      'Krushi Seva Kendra (Nashik)',
      'KSK-NSK',
      JSON.stringify(['pos','products','batches','inventory','purchases','suppliers','customers','udhar','returns','expenses','sms','reports','settings','users']),
      JSON.stringify(['sales','purchases','udhari','inventory','expenses','gst'])
    ]);
    const tenant1Id = resTenant1.lastInsertRowid;

    const resTenant2 = await run(`
      INSERT INTO tenants (name, code, status, max_users, max_products, storage_limit_mb, allowed_modules, allowed_reports, subscription_tier, notes)
      VALUES (?, ?, 'active', 3, 200, 50, ?, ?, 'Standard', 'Pune District Branch')
    `, [
      'Kisan Agro Mart (Pune)',
      'KAM-PUN',
      JSON.stringify(['pos','products','batches','inventory','customers','udhar','reports','users']),
      JSON.stringify(['sales','udhari','inventory'])
    ]);
    const tenant2Id = resTenant2.lastInsertRowid;

    // 4. Seed Users Across Hierarchy
    const passwordHash = bcrypt.hashSync('admin123', 10);
    const managerHash = bcrypt.hashSync('manager123', 10);
    const cashierHash = bcrypt.hashSync('cashier123', 10);
    const invHash = bcrypt.hashSync('inventory123', 10);
    const accHash = bcrypt.hashSync('accountant123', 10);
    const puneHash = bcrypt.hashSync('pune123', 10);

    const insertUserSQL = `
      INSERT INTO users (tenant_id, parent_user_id, username, password_hash, full_name, mobile, email, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `;

    // 4a. Super Admin (Global Scope, tenant_id = NULL)
    const resAdmin = await run(insertUserSQL, [null, null, 'admin', passwordHash, 'System Super Admin', '9876543210', 'admin@krushi.com']);
    const adminId = resAdmin.lastInsertRowid;

    // 4b. Tenant 1 Users (Nashik)
    const resMgr1 = await run(insertUserSQL, [tenant1Id, null, 'manager', managerHash, 'Ramesh Patil (Nashik Manager)', '9876543211', 'manager@krushi.com']);
    const mgr1Id = resMgr1.lastInsertRowid;

    const resCsh1 = await run(insertUserSQL, [tenant1Id, mgr1Id, 'cashier', cashierHash, 'Suresh Kumar (Nashik Cashier)', '9876543212', 'cashier@krushi.com']);
    const csh1Id = resCsh1.lastInsertRowid;

    const resInv1 = await run(insertUserSQL, [tenant1Id, mgr1Id, 'inventory', invHash, 'Vikas Shinde (Nashik Inventory)', '9876543213', 'inventory@krushi.com']);
    const inv1Id = resInv1.lastInsertRowid;

    const resAcc1 = await run(insertUserSQL, [tenant1Id, mgr1Id, 'accountant', accHash, 'Anil Deshmukh (Nashik Accountant)', '9876543214', 'accountant@krushi.com']);
    const acc1Id = resAcc1.lastInsertRowid;

    // 4c. Tenant 2 Users (Pune)
    const resMgr2 = await run(insertUserSQL, [tenant2Id, null, 'manager_pune', puneHash, 'Ganesh Joshi (Pune Manager)', '9822998877', 'manager.pune@kisanagro.com']);
    const mgr2Id = resMgr2.lastInsertRowid;

    const resCsh2 = await run(insertUserSQL, [tenant2Id, mgr2Id, 'cashier_pune', puneHash, 'Pooja More (Pune Cashier)', '9822998866', 'cashier.pune@kisanagro.com']);
    const csh2Id = resCsh2.lastInsertRowid;

    // Link Primary Managers to Tenants
    await run('UPDATE tenants SET manager_id = ? WHERE id = ?', [mgr1Id, tenant1Id]);
    await run('UPDATE tenants SET manager_id = ? WHERE id = ?', [mgr2Id, tenant2Id]);

    // Assign Roles
    const superRole = await getRole('Super Admin');
    const mgrRole = await getRole('Manager');
    const cshRole = await getRole('Cashier');
    const invRole = await getRole('Inventory Staff');
    const accRole = await getRole('Accountant');

    await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminId, superRole.id]);
    await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [mgr1Id, mgrRole.id]);
    await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [csh1Id, cshRole.id]);
    await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [inv1Id, invRole.id]);
    await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [acc1Id, accRole.id]);
    await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [mgr2Id, mgrRole.id]);
    await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [csh2Id, cshRole.id]);

    // 5. Tenant-Scoped Business Settings
    const seedSettings = async (tId, storeName, tagline, city, mob, gstin, pfx) => {
      const settings = [
        { key: 'store_name', val: storeName, group: 'general', desc: 'Store Business Name' },
        { key: 'tagline', val: tagline, group: 'general', desc: 'Store Tagline' },
        { key: 'address', val: `Shop No. 12, Main Market Road, ${city}, Maharashtra`, group: 'general', desc: 'Store Address' },
        { key: 'mobile', val: mob, group: 'general', desc: 'Contact Mobile Number' },
        { key: 'email', val: `contact@${storeName.toLowerCase().replace(/[^a-z]/g, '')}.com`, group: 'general', desc: 'Contact Email' },
        { key: 'gstin', val: gstin, group: 'tax', desc: 'GST Identification Number' },
        { key: 'invoice_prefix', val: pfx, group: 'invoice', desc: 'Invoice prefix' },
        { key: 'thermal_header', val: `${storeName.toUpperCase()}\n${city}, MH\nMob: ${mob}`, group: 'printer', desc: 'Thermal Print Header' },
        { key: 'thermal_footer', val: 'Thank you for your visit!\nAlways use recommended doses for crops.', group: 'printer', desc: 'Thermal Print Footer' },
        { key: 'sms_provider', val: 'Simulated', group: 'sms', desc: 'Active SMS Provider' },
        { key: 'sms_sender_id', val: 'KRUSHI', group: 'sms', desc: 'SMS Sender ID' },
        { key: 'sms_api_key', val: 'simulated_secret_key_12345', group: 'sms', desc: 'SMS Provider API Key' },
        { key: 'sms_template_udhar', val: 'Dear {customer_name}, your outstanding balance at {store_name} is Rs.{outstanding_amount}. Kindly settle your due date: {due_date}. Contact: {store_phone}.', group: 'sms', desc: 'Udhar Reminder SMS Template' }
      ];

      for (const s of settings) {
        await run(`
          INSERT INTO business_settings (tenant_id, setting_key, setting_value, setting_group, description)
          VALUES (?, ?, ?, ?, ?)
        `, [tId, s.key, s.val, s.group, s.desc]);
      }
    };

    await seedSettings(tenant1Id, 'Krushi Seva Kendra', 'Quality Seeds, Fertilizers & Pesticides', 'Nashik', '9822012345', '27AAAAA0000A1Z5', 'KSK/');
    await seedSettings(tenant2Id, 'Kisan Agro Mart', 'Empowering Farmers with Modern Solutions', 'Pune', '9822998800', '27BBBBB1111B2Z6', 'KAM/');

    // 6. Units, Categories, Brands for Tenant 1 & Tenant 2
    const seedMasters = async (tId) => {
      const units = [
        { name: 'Kilogram', symbol: 'Kg', allow_decimal: 1 },
        { name: 'Gram', symbol: 'g', allow_decimal: 1 },
        { name: 'Metric Ton', symbol: 'Ton', allow_decimal: 1 },
        { name: 'Liter', symbol: 'L', allow_decimal: 1 },
        { name: 'Milliliter', symbol: 'ml', allow_decimal: 1 },
        { name: 'Bag (50 Kg)', symbol: 'Bag', allow_decimal: 0 },
        { name: 'Bottle', symbol: 'Btl', allow_decimal: 0 },
        { name: 'Packet', symbol: 'Pkt', allow_decimal: 0 },
        { name: 'Box', symbol: 'Box', allow_decimal: 0 },
        { name: 'Piece', symbol: 'Pcs', allow_decimal: 0 }
      ];
      for (const u of units) {
        await run('INSERT INTO units (tenant_id, name, symbol, allow_decimal) VALUES (?, ?, ?, ?)', [tId, u.name, u.symbol, u.allow_decimal]);
      }

      const categories = [
        { name: 'Seeds', description: 'Certified hybrid and high yield crop seeds' },
        { name: 'Fertilizers', description: 'Chemical, organic, and bio fertilizers' },
        { name: 'Pesticides', description: 'Crop protection chemicals' },
        { name: 'Insecticides', description: 'Insect control solutions' },
        { name: 'Fungicides', description: 'Fungal infection management' },
        { name: 'Herbicides', description: 'Weed control chemicals' },
        { name: 'Plant Growth Promoters', description: 'Micronutrients and tonic' },
        { name: 'Agricultural Tools', description: 'Manual equipment, sprayers, blades' }
      ];
      for (const c of categories) {
        await run('INSERT INTO categories (tenant_id, name, description) VALUES (?, ?, ?)', [tId, c.name, c.description]);
      }

      const brands = [
        { name: 'Syngenta India', contact_person: 'Anand Sharma', mobile: '9890111222' },
        { name: 'Bayer CropScience', contact_person: 'Pravin Joshi', mobile: '9890222333' },
        { name: 'UPL Limited', contact_person: 'Vikram Mehta', mobile: '9890333444' },
        { name: 'Mahyco Seeds', contact_person: 'Sanjay More', mobile: '9890444555' },
        { name: 'RASI Seeds', contact_person: 'Dinesh Patil', mobile: '9890555666' },
        { name: 'IFFCO', contact_person: 'Rajesh Verma', mobile: '9890666777' },
        { name: 'Coromandel International', contact_person: 'Sunil Rao', mobile: '9890777888' },
        { name: 'Tata Rallis', contact_person: 'Nitin Kulkarni', mobile: '9890888999' }
      ];
      for (const b of brands) {
        await run('INSERT INTO brands (tenant_id, name, contact_person, mobile) VALUES (?, ?, ?, ?)', [tId, b.name, b.contact_person, b.mobile]);
      }
    };

    await seedMasters(tenant1Id);

    // Helpers to resolve master IDs
    const getUnitId = async (_tId, sym) => (await queryOne('SELECT id FROM units WHERE symbol = ?', [sym]))?.id || 1;
    const getCatId = async (_tId, cname) => (await queryOne('SELECT id FROM categories WHERE name = ?', [cname]))?.id || 1;
    const getBrandId = async (_tId, bname) => (await queryOne('SELECT id FROM brands WHERE name = ?', [bname]))?.id || 1;

    // 7. Products Master for Tenant 1 (Nashik)
    const tenant1Products = [
      {
        name: 'Urea 45% N Neem Coated (50kg)', product_code: 'PRD-UREA-50', sku: 'UREA-50KG',
        barcode: '8901001000012', category: 'Fertilizers', brand: 'IFFCO', product_type: 'Fertilizer',
        unit: 'Bag', purchase_price: 242.00, selling_price: 266.50, mrp: 266.50, gst_rate: 5.0,
        hsn_code: '31021000', min_stock: 50, reorder_level: 100
      },
      {
        name: 'DAP 18-46-0 Fertilizer (50kg)', product_code: 'PRD-DAP-50', sku: 'DAP-50KG',
        barcode: '8901001000029', category: 'Fertilizers', brand: 'Coromandel International', product_type: 'Fertilizer',
        unit: 'Bag', purchase_price: 1250.00, selling_price: 1350.00, mrp: 1350.00, gst_rate: 5.0,
        hsn_code: '31052000', min_stock: 40, reorder_level: 80
      },
      {
        name: 'Coragen Insecticide (150ml)', product_code: 'PRD-CORAGEN-150', sku: 'CORAGEN-150ML',
        barcode: '8901001000036', category: 'Insecticides', brand: 'Syngenta India', product_type: 'Insecticide',
        unit: 'Btl', purchase_price: 1650.00, selling_price: 1850.00, mrp: 1950.00, gst_rate: 18.0,
        hsn_code: '38089190', min_stock: 10, reorder_level: 20
      },
      {
        name: 'Mahyco Hybrid Cotton Seeds (475g)', product_code: 'PRD-COTTON-475', sku: 'MAHYCO-BG2-475G',
        barcode: '8901001000043', category: 'Seeds', brand: 'Mahyco Seeds', product_type: 'Seed',
        unit: 'Pkt', purchase_price: 750.00, selling_price: 853.00, mrp: 853.00, gst_rate: 0.0,
        hsn_code: '12099190', min_stock: 25, reorder_level: 50
      },
      {
        name: 'Tata Sencor Herbicide (100g)', product_code: 'PRD-SENCOR-100', sku: 'SENCOR-100G',
        barcode: '8901001000050', category: 'Herbicides', brand: 'Bayer CropScience', product_type: 'Herbicide',
        unit: 'Pkt', purchase_price: 320.00, selling_price: 390.00, mrp: 410.00, gst_rate: 18.0,
        hsn_code: '38089390', min_stock: 15, reorder_level: 30
      },
      {
        name: 'Knapsack Battery Sprayer 16L', product_code: 'PRD-SPRAYER-16L', sku: 'SPRAYER-BAT-16L',
        barcode: '8901001000067', category: 'Agricultural Tools', brand: 'Tata Rallis', product_type: 'Agricultural Tool',
        unit: 'Pcs', purchase_price: 2200.00, selling_price: 2750.00, mrp: 3200.00, gst_rate: 12.0,
        hsn_code: '84248100', min_stock: 5, reorder_level: 10
      }
    ];

    const insertProdSQL = `
      INSERT INTO products (
        tenant_id, name, product_code, sku, barcode, category_id, brand_id, product_type,
        primary_unit_id, purchase_price, selling_price, mrp, wholesale_price, retail_price,
        gst_rate, hsn_code, min_stock, max_stock, reorder_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const p of tenant1Products) {
      const catId = await getCatId(tenant1Id, p.category);
      const brandId = await getBrandId(tenant1Id, p.brand);
      const unitId = await getUnitId(tenant1Id, p.unit);

      await run(insertProdSQL, [
        tenant1Id, p.name, p.product_code, p.sku, p.barcode,
        catId, brandId, p.product_type, unitId,
        p.purchase_price, p.selling_price, p.mrp,
        p.selling_price * 0.95, p.selling_price, p.gst_rate, p.hsn_code,
        p.min_stock, 1000, p.reorder_level
      ]);
    }

    // 7b. Products Master for Tenant 2 (Pune - Distinct Catalog)
    const tenant2Products = [
      {
        name: 'Pune Agro Super Wheat Seeds (40kg)', product_code: 'PRD-PUN-WHEAT', sku: 'PUN-WHEAT-40KG',
        barcode: '8902002000015', category: 'Seeds', brand: 'Mahyco Seeds', product_type: 'Seed',
        unit: 'Bag', purchase_price: 1800.00, selling_price: 2100.00, mrp: 2200.00, gst_rate: 0.0,
        hsn_code: '12099190', min_stock: 20, reorder_level: 40
      },
      {
        name: 'Pune Organic Compost 50kg', product_code: 'PRD-PUN-COMPOST', sku: 'PUN-COMPOST-50KG',
        barcode: '8902002000022', category: 'Fertilizers', brand: 'IFFCO', product_type: 'Fertilizer',
        unit: 'Bag', purchase_price: 450.00, selling_price: 550.00, mrp: 600.00, gst_rate: 5.0,
        hsn_code: '31010099', min_stock: 30, reorder_level: 60
      }
    ];

    for (const p of tenant2Products) {
      const catId = await getCatId(tenant2Id, p.category);
      const brandId = await getBrandId(tenant2Id, p.brand);
      const unitId = await getUnitId(tenant2Id, p.unit);

      await run(insertProdSQL, [
        tenant2Id, p.name, p.product_code, p.sku, p.barcode,
        catId, brandId, p.product_type, unitId,
        p.purchase_price, p.selling_price, p.mrp,
        p.selling_price * 0.95, p.selling_price, p.gst_rate, p.hsn_code,
        p.min_stock, 1000, p.reorder_level
      ]);
    }

    // 8. Batches & Stock Movements for Tenant 1
    const getProductId = async (tId, code) => (await queryOne('SELECT id FROM products WHERE tenant_id = ? AND product_code = ?', [tId, code]))?.id;

    const batchesData = [
      {
        prod_code: 'PRD-UREA-50', batch_no: 'B2026-UREA-01', mfg: '2026-01-10', exp: '2027-12-31',
        purch_rate: 242.00, sell_rate: 266.50, mrp: 266.50, qty_rec: 200, qty_sold: 45, status: 'Active'
      },
      {
        prod_code: 'PRD-UREA-50', batch_no: 'B2025-UREA-99', mfg: '2024-10-01', exp: '2026-10-10',
        purch_rate: 235.00, sell_rate: 260.00, mrp: 266.50, qty_rec: 50, qty_sold: 40, status: 'Near Expiry'
      },
      {
        prod_code: 'PRD-DAP-50', batch_no: 'B2026-DAP-05', mfg: '2026-02-15', exp: '2028-02-15',
        purch_rate: 1250.00, sell_rate: 1350.00, mrp: 1350.00, qty_rec: 100, qty_sold: 25, status: 'Active'
      },
      {
        prod_code: 'PRD-CORAGEN-150', batch_no: 'B2026-COR-11', mfg: '2026-03-01', exp: '2027-09-01',
        purch_rate: 1650.00, sell_rate: 1850.00, mrp: 1950.00, qty_rec: 40, qty_sold: 12, status: 'Active'
      },
      {
        prod_code: 'PRD-CORAGEN-150', batch_no: 'B2024-COR-02', mfg: '2024-01-01', exp: '2026-05-01',
        purch_rate: 1600.00, sell_rate: 1800.00, mrp: 1950.00, qty_rec: 15, qty_sold: 10, status: 'Expired'
      },
      {
        prod_code: 'PRD-COTTON-475', batch_no: 'B2026-SEED-88', mfg: '2026-01-01', exp: '2026-12-31',
        purch_rate: 750.00, sell_rate: 853.00, mrp: 853.00, qty_rec: 150, qty_sold: 60, status: 'Active'
      }
    ];

    const insertBatchSQL = `
      INSERT INTO product_batches (
        tenant_id, product_id, batch_no, mfg_date, exp_date, purchase_rate, selling_rate,
        mrp, qty_received, qty_sold, available_qty, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertStockMoveSQL = `
      INSERT INTO stock_movements (
        tenant_id, product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, notes, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const b of batchesData) {
      const pId = await getProductId(tenant1Id, b.prod_code);
      if (!pId) continue;

      const avail = b.qty_rec - b.qty_sold;
      const res = await run(insertBatchSQL, [
        tenant1Id, pId, b.batch_no, b.mfg, b.exp, b.purch_rate, b.sell_rate, b.mrp,
        b.qty_rec, b.qty_sold, avail, b.status
      ]);

      const batchId = res.lastInsertRowid;
      if (batchId) {
        await run(insertStockMoveSQL, [tenant1Id, pId, batchId, 'opening_stock', avail, 0, avail, 'Initial seed inventory', mgr1Id]);
      }
    }

    // Batches for Tenant 2 (Pune)
    const pIdWheat = await getProductId(tenant2Id, 'PRD-PUN-WHEAT');
    if (pIdWheat) {
      const resB = await run(insertBatchSQL, [
        tenant2Id, pIdWheat, 'B2026-PUN-WH-01', '2026-01-15', '2027-06-30', 1800, 2100, 2200,
        50, 5, 45, 'Active'
      ]);
      await run(insertStockMoveSQL, [tenant2Id, pIdWheat, resB.lastInsertRowid, 'opening_stock', 45, 0, 45, 'Pune Seed opening stock', mgr2Id]);
    }

    // 9. Customers for Tenant 1 (Nashik)
    const customers1Data = [
      {
        name: 'Pandurang Patil', mobile: '9822112233', village: 'Pimpalgaon', taluka: 'Niphad',
        district: 'Nashik', type: 'Farmer', open_bal: 12500, cur_bal: 12500, credit_lim: 50000
      },
      {
        name: 'Shivaji Kadam', mobile: '9822445566', village: 'Ozar', taluka: 'Dindori',
        district: 'Nashik', type: 'Farmer', open_bal: 8400, cur_bal: 8400, credit_lim: 30000
      },
      {
        name: 'Ganesh Deshmukh', mobile: '9822778899', village: 'Sinnar', taluka: 'Sinnar',
        district: 'Nashik', type: 'Farmer', open_bal: 0, cur_bal: 0, credit_lim: 40000
      },
      {
        name: 'Subhash Shinde (Dealer)', mobile: '9822001122', village: 'Lasalgaon', taluka: 'Yeola',
        district: 'Nashik', type: 'Dealer', open_bal: 35000, cur_bal: 35000, credit_lim: 150000
      }
    ];

    const insertCustSQL = `
      INSERT INTO customers (
        tenant_id, name, mobile, village, taluka, district, customer_type, opening_balance, current_balance, credit_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertCustTxnSQL = `
      INSERT INTO customer_transactions (
        tenant_id, customer_id, txn_type, amount, balance_after, payment_method, notes, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const c of customers1Data) {
      const res = await run(insertCustSQL, [tenant1Id, c.name, c.mobile, c.village, c.taluka, c.district, c.type, c.open_bal, c.cur_bal, c.credit_lim]);
      const custId = res.lastInsertRowid;
      if (custId && c.open_bal > 0) {
        await run(insertCustTxnSQL, [tenant1Id, custId, 'SALE', c.open_bal, c.open_bal, 'Credit', 'Opening udhari balance record', mgr1Id]);
      }
    }

    // Customers for Tenant 2 (Pune - Distinct Customers)
    const customers2Data = [
      {
        name: 'Tukaram More', mobile: '9822991122', village: 'Hadapsar', taluka: 'Haveli',
        district: 'Pune', type: 'Farmer', open_bal: 5000, cur_bal: 5000, credit_lim: 25000
      },
      {
        name: 'Santosh Jagtap', mobile: '9822993344', village: 'Baramati', taluka: 'Baramati',
        district: 'Pune', type: 'Farmer', open_bal: 18000, cur_bal: 18000, credit_lim: 60000
      }
    ];

    for (const c of customers2Data) {
      const res = await run(insertCustSQL, [tenant2Id, c.name, c.mobile, c.village, c.taluka, c.district, c.type, c.open_bal, c.cur_bal, c.credit_lim]);
      const custId = res.lastInsertRowid;
      if (custId && c.open_bal > 0) {
        await run(insertCustTxnSQL, [tenant2Id, custId, 'SALE', c.open_bal, c.open_bal, 'Credit', 'Opening udhari Pune', mgr2Id]);
      }
    }

    // 10. Suppliers for Tenant 1
    const suppliers1Data = [
      {
        name: 'Nashik Agri Distributors Pvt Ltd', company_name: 'Nashik Agri Dist', mobile: '9422110011',
        gstin: '27AABCN1234F1Z9', open_bal: 45000, cur_bal: 45000, credit_lim: 500000
      },
      {
        name: 'Maharashtra Seed Agency', company_name: 'MH Seed Agency', mobile: '9422220022',
        gstin: '27AABCM5678G1Z3', open_bal: 12000, cur_bal: 12000, credit_lim: 300000
      }
    ];

    const insertSuppSQL = `
      INSERT INTO suppliers (
        tenant_id, name, company_name, mobile, gstin, opening_balance, current_balance, credit_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const s of suppliers1Data) {
      await run(insertSuppSQL, [tenant1Id, s.name, s.company_name, s.mobile, s.gstin, s.open_bal, s.cur_bal, s.credit_lim]);
    }

    // Suppliers for Tenant 2
    await run(insertSuppSQL, [
      tenant2Id, 'Pune Seed & Fertilizer Traders', 'Pune Traders', '9422880011',
      '27AABCP9999P1Z1', 20000, 20000, 400000
    ]);

    // 11. Sample Sales Invoices
    const cust1 = (await queryOne('SELECT id FROM customers WHERE tenant_id = ? AND mobile = ?', [tenant1Id, '9822112233']))?.id;
    if (cust1) {
      const insertSaleSQL = `
        INSERT INTO sales (
          tenant_id, invoice_no, customer_id, cashier_id, total_taxable, total_tax, grand_total, paid_amount, due_amount, payment_status, sale_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await run(insertSaleSQL, [tenant1Id, 'KSK/2026/001', cust1, csh1Id, 5000.00, 250.00, 5250.00, 2500.00, 2750.00, 'PARTIAL', 'CREDIT']);
    }

    const custPune = (await queryOne('SELECT id FROM customers WHERE tenant_id = ? AND mobile = ?', [tenant2Id, '9822991122']))?.id;
    if (custPune) {
      await run(`
        INSERT INTO sales (
          tenant_id, invoice_no, customer_id, cashier_id, total_taxable, total_tax, grand_total, paid_amount, due_amount, payment_status, sale_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [tenant2Id, 'KAM/2026/001', custPune, csh2Id, 4200.00, 0.00, 4200.00, 4200.00, 0.00, 'PAID', 'RETAIL']);
    }

    // 12. Sample Expenses
    const insertExpSQL = `
      INSERT INTO expenses (tenant_id, category, title, amount, expense_date, payment_method, description, user_id)
      VALUES (?, ?, ?, ?, DATE('now'), ?, ?, ?)
    `;
    await run(insertExpSQL, [tenant1Id, 'Electricity', 'Shop Electricity Bill Sept 2026', 2450.00, 'UPI', 'MSEDCL Monthly Bill', mgr1Id]);
    await run(insertExpSQL, [tenant1Id, 'Transport', 'Seed Transport from Godown', 1200.00, 'Cash', 'Tempo freight charges', mgr1Id]);
    await run(insertExpSQL, [tenant2Id, 'Rent', 'Pune Shop Monthly Rent', 15000.00, 'Bank Transfer', 'Market Yard Shop Rent', mgr2Id]);

    console.log('Multi-Tenant Database seeding completed successfully!');
  });
}

if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}

export default { seedDatabase };
