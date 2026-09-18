import bcrypt from 'bcryptjs';
import { getDb, transaction, run, queryOne, queryAll } from './connection.js';
import { initSchema } from './schema.js';

export async function seedDatabase() {
  const db = getDb();
  await initSchema(db);

  console.log('Seeding database with KrushiPOS agricultural data...');

  await transaction(async () => {
    // Clear tables in reverse foreign key order for clean idempotent seeding
    const tablesToClear = [
      'sms_logs', 'audit_logs', 'expenses', 'purchase_return_items', 'purchase_returns',
      'purchase_items', 'purchases', 'sales_return_items', 'sales_returns', 'sale_payments',
      'sale_items', 'sales', 'customer_transactions', 'customers', 'supplier_transactions',
      'suppliers', 'stock_movements', 'product_batches', 'products', 'brands', 'categories',
      'units', 'business_settings', 'user_roles', 'role_permissions', 'users', 'permissions', 'roles'
    ];

    for (const table of tablesToClear) {
      await run(`DELETE FROM ${table};`);
    }

    try {
      await run(`DELETE FROM sqlite_sequence;`);
    } catch (_) {}

    // 1. Roles & Permissions
    const roles = [
      { name: 'Super Admin', description: 'Full system control and access to all modules', is_system: 1 },
      { name: 'Manager', description: 'Store management, inventory, purchases, and billing', is_system: 1 },
      { name: 'Cashier', description: 'POS billing, sales returns, customer selection', is_system: 1 },
      { name: 'Inventory Staff', description: 'Stock tracking, batch updates, damage logs', is_system: 1 },
      { name: 'Accountant', description: 'Udhari collection, expenses, reports, supplier payables', is_system: 1 }
    ];

    for (const role of roles) {
      await run('INSERT INTO roles (name, description, is_system) VALUES (?, ?, ?)', [role.name, role.description, role.is_system]);
    }

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

      // System Administration
      { module: 'users', action: 'manage', description: 'Manage users, roles, and permissions' },
      { module: 'settings', action: 'manage', description: 'Edit business & thermal printer settings' },
      { module: 'audit', action: 'view', description: 'View system security audit logs' }
    ];

    for (const perm of permissions) {
      await run('INSERT INTO permissions (module, action, description) VALUES (?, ?, ?)', [perm.module, perm.action, perm.description]);
    }

    // Assign all permissions to Super Admin
    const adminRole = await queryOne('SELECT id FROM roles WHERE name = ?', ['Super Admin']);
    const allPerms = await queryAll('SELECT id FROM permissions');
    if (adminRole) {
      for (const p of allPerms) {
        await run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [adminRole.id, p.id]);
      }
    }

    // 2. Default Users
    const passwordHash = bcrypt.hashSync('admin123', 10);
    const cashierHash = bcrypt.hashSync('cashier123', 10);
    const managerHash = bcrypt.hashSync('manager123', 10);
    const invHash = bcrypt.hashSync('inventory123', 10);
    const accHash = bcrypt.hashSync('accountant123', 10);

    const insertUserSQL = `
      INSERT INTO users (username, password_hash, full_name, mobile, email, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `;

    await run(insertUserSQL, ['admin', passwordHash, 'Super Admin', '9876543210', 'admin@krushi.com']);
    await run(insertUserSQL, ['manager', managerHash, 'Ramesh Patil (Manager)', '9876543211', 'manager@krushi.com']);
    await run(insertUserSQL, ['cashier', cashierHash, 'Suresh Kumar (Cashier)', '9876543212', 'cashier@krushi.com']);
    await run(insertUserSQL, ['inventory', invHash, 'Vikas Shinde (Inventory)', '9876543213', 'inventory@krushi.com']);
    await run(insertUserSQL, ['accountant', accHash, 'Anil Deshmukh (Accountant)', '9876543214', 'accountant@krushi.com']);

    // Assign Roles to Users
    const getUser = async (uname) => await queryOne('SELECT id FROM users WHERE username = ?', [uname]);
    const getRole = async (rname) => await queryOne('SELECT id FROM roles WHERE name = ?', [rname]);

    const adminU = await getUser('admin');
    const superR = await getRole('Super Admin');
    if (adminU && superR) await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminU.id, superR.id]);

    const mgrU = await getUser('manager');
    const mgrR = await getRole('Manager');
    if (mgrU && mgrR) await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [mgrU.id, mgrR.id]);

    const cshU = await getUser('cashier');
    const cshR = await getRole('Cashier');
    if (cshU && cshR) await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [cshU.id, cshR.id]);

    const invU = await getUser('inventory');
    const invR = await getRole('Inventory Staff');
    if (invU && invR) await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [invU.id, invR.id]);

    const accU = await getUser('accountant');
    const accR = await getRole('Accountant');
    if (accU && accR) await run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [accU.id, accR.id]);

    // Assign permissions for Cashier & Manager
    const cashierRole = await getRole('Cashier');
    if (cashierRole) {
      const cashierPerms = await queryAll(`SELECT id FROM permissions WHERE module IN ('pos', 'customers')`);
      for (const cp of cashierPerms) {
        await run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [cashierRole.id, cp.id]);
      }
    }

    // 3. Business Settings
    const defaultSettings = [
      { key: 'store_name', val: 'Krushi Seva Kendra', group: 'general', desc: 'Store Business Name' },
      { key: 'tagline', val: 'Quality Seeds, Fertilizers & Pesticides', group: 'general', desc: 'Store Tagline' },
      { key: 'address', val: 'Shop No. 12, Main Market Road, Nashik, Maharashtra - 422001', group: 'general', desc: 'Store Address' },
      { key: 'mobile', val: '9822012345', group: 'general', desc: 'Contact Mobile Number' },
      { key: 'email', val: 'contact@krushisevakendra.com', group: 'general', desc: 'Contact Email' },
      { key: 'gstin', val: '27AAAAA0000A1Z5', group: 'tax', desc: 'GST Identification Number' },
      { key: 'invoice_prefix', val: 'KSK/', group: 'invoice', desc: 'Invoice prefix' },
      { key: 'thermal_header', val: 'KRUSHI SEVA KENDRA\nNashik, MH\nMob: 9822012345', group: 'printer', desc: 'Thermal Print Header' },
      { key: 'thermal_footer', val: 'Thank you for your visit!\nAlways use recommended doses for crops.', group: 'printer', desc: 'Thermal Print Footer' },
      { key: 'sms_provider', val: 'Simulated', group: 'sms', desc: 'Active SMS Provider (MSG91, Twilio, Textlocal, Simulated)' },
      { key: 'sms_sender_id', val: 'KRUSHI', group: 'sms', desc: 'SMS Sender ID' },
      { key: 'sms_api_key', val: 'simulated_secret_key_12345', group: 'sms', desc: 'SMS Provider API Key' },
      { key: 'sms_template_udhar', val: 'Dear {customer_name}, your outstanding balance at {store_name} is Rs.{outstanding_amount}. Kindly settle your due date: {due_date}. Contact: {store_phone}.', group: 'sms', desc: 'Udhar Reminder SMS Template' }
    ];

    for (const s of defaultSettings) {
      await run(`
        INSERT INTO business_settings (setting_key, setting_value, setting_group, description)
        VALUES (?, ?, ?, ?)
      `, [s.key, s.val, s.group, s.desc]);
    }

    // 4. Units, Categories, Brands
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
      await run('INSERT INTO units (name, symbol, allow_decimal) VALUES (?, ?, ?)', [u.name, u.symbol, u.allow_decimal]);
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
      await run('INSERT INTO categories (name, description) VALUES (?, ?)', [c.name, c.description]);
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
      await run('INSERT INTO brands (name, contact_person, mobile) VALUES (?, ?, ?)', [b.name, b.contact_person, b.mobile]);
    }

    // Helpers to get IDs
    const getUnitId = async (sym) => (await queryOne('SELECT id FROM units WHERE symbol = ?', [sym]))?.id || 1;
    const getCatId = async (cname) => (await queryOne('SELECT id FROM categories WHERE name = ?', [cname]))?.id || 1;
    const getBrandId = async (bname) => (await queryOne('SELECT id FROM brands WHERE name = ?', [bname]))?.id || 1;

    // 5. Products Master
    const productsData = [
      {
        name: 'Urea 45% N Neem Coated (50kg)',
        product_code: 'PRD-UREA-50',
        sku: 'UREA-50KG',
        barcode: '8901001000012',
        category: 'Fertilizers',
        brand: 'IFFCO',
        product_type: 'Fertilizer',
        unit: 'Bag',
        purchase_price: 242.00,
        selling_price: 266.50,
        mrp: 266.50,
        gst_rate: 5.0,
        hsn_code: '31021000',
        min_stock: 50,
        reorder_level: 100
      },
      {
        name: 'DAP 18-46-0 Fertilizer (50kg)',
        product_code: 'PRD-DAP-50',
        sku: 'DAP-50KG',
        barcode: '8901001000029',
        category: 'Fertilizers',
        brand: 'Coromandel International',
        product_type: 'Fertilizer',
        unit: 'Bag',
        purchase_price: 1250.00,
        selling_price: 1350.00,
        mrp: 1350.00,
        gst_rate: 5.0,
        hsn_code: '31052000',
        min_stock: 40,
        reorder_level: 80
      },
      {
        name: 'Coragen Insecticide (150ml)',
        product_code: 'PRD-CORAGEN-150',
        sku: 'CORAGEN-150ML',
        barcode: '8901001000036',
        category: 'Insecticides',
        brand: 'Syngenta India',
        product_type: 'Insecticide',
        unit: 'Btl',
        purchase_price: 1650.00,
        selling_price: 1850.00,
        mrp: 1950.00,
        gst_rate: 18.0,
        hsn_code: '38089190',
        min_stock: 10,
        reorder_level: 20
      },
      {
        name: 'Mahyco Hybrid Cotton Seeds (475g)',
        product_code: 'PRD-COTTON-475',
        sku: 'MAHYCO-BG2-475G',
        barcode: '8901001000043',
        category: 'Seeds',
        brand: 'Mahyco Seeds',
        product_type: 'Seed',
        unit: 'Pkt',
        purchase_price: 750.00,
        selling_price: 853.00,
        mrp: 853.00,
        gst_rate: 0.0,
        hsn_code: '12099190',
        min_stock: 25,
        reorder_level: 50
      },
      {
        name: 'Tata Sencor Herbicide (100g)',
        product_code: 'PRD-SENCOR-100',
        sku: 'SENCOR-100G',
        barcode: '8901001000050',
        category: 'Herbicides',
        brand: 'Bayer CropScience',
        product_type: 'Herbicide',
        unit: 'Pkt',
        purchase_price: 320.00,
        selling_price: 390.00,
        mrp: 410.00,
        gst_rate: 18.0,
        hsn_code: '38089390',
        min_stock: 15,
        reorder_level: 30
      },
      {
        name: 'Knapsack Battery Sprayer 16L',
        product_code: 'PRD-SPRAYER-16L',
        sku: 'SPRAYER-BAT-16L',
        barcode: '8901001000067',
        category: 'Agricultural Tools',
        brand: 'Tata Rallis',
        product_type: 'Agricultural Tool',
        unit: 'Pcs',
        purchase_price: 2200.00,
        selling_price: 2750.00,
        mrp: 3200.00,
        gst_rate: 12.0,
        hsn_code: '84248100',
        min_stock: 5,
        reorder_level: 10
      }
    ];

    const insertProdSQL = `
      INSERT INTO products (
        name, product_code, sku, barcode, category_id, brand_id, product_type,
        primary_unit_id, purchase_price, selling_price, mrp, wholesale_price, retail_price,
        gst_rate, hsn_code, min_stock, max_stock, reorder_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const p of productsData) {
      const catId = await getCatId(p.category);
      const brandId = await getBrandId(p.brand);
      const unitId = await getUnitId(p.unit);

      await run(insertProdSQL, [
        p.name, p.product_code, p.sku, p.barcode,
        catId, brandId, p.product_type,
        unitId, p.purchase_price, p.selling_price, p.mrp,
        p.selling_price * 0.95, p.selling_price, p.gst_rate, p.hsn_code,
        p.min_stock, 1000, p.reorder_level
      ]);
    }

    // 6. Product Batches & Stock Movements
    const getProductId = async (code) => (await queryOne('SELECT id FROM products WHERE product_code = ?', [code]))?.id;

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
        product_id, batch_no, mfg_date, exp_date, purchase_rate, selling_rate,
        mrp, qty_received, qty_sold, available_qty, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertStockMoveSQL = `
      INSERT INTO stock_movements (
        product_id, batch_id, movement_type, qty_change, previous_qty, new_qty, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    for (const b of batchesData) {
      const pId = await getProductId(b.prod_code);
      if (!pId) continue;

      const avail = b.qty_rec - b.qty_sold;
      const res = await run(insertBatchSQL, [
        pId, b.batch_no, b.mfg, b.exp, b.purch_rate, b.sell_rate, b.mrp,
        b.qty_rec, b.qty_sold, avail, b.status
      ]);

      const batchId = res.lastInsertRowid;
      if (batchId) {
        await run(insertStockMoveSQL, [pId, batchId, 'opening_stock', avail, 0, avail, 'Initial seed inventory']);
      }
    }

    // 7. Customers
    const customersData = [
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
        name, mobile, village, taluka, district, customer_type, opening_balance, current_balance, credit_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertCustTxnSQL = `
      INSERT INTO customer_transactions (
        customer_id, txn_type, amount, balance_after, payment_method, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    for (const c of customersData) {
      const res = await run(insertCustSQL, [c.name, c.mobile, c.village, c.taluka, c.district, c.type, c.open_bal, c.cur_bal, c.credit_lim]);
      const custId = res.lastInsertRowid;
      if (custId && c.open_bal > 0) {
        await run(insertCustTxnSQL, [custId, 'SALE', c.open_bal, c.open_bal, 'Credit', 'Opening udhari balance record']);
      }
    }

    // 8. Suppliers
    const suppliersData = [
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
        name, company_name, mobile, gstin, opening_balance, current_balance, credit_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    for (const s of suppliersData) {
      await run(insertSuppSQL, [s.name, s.company_name, s.mobile, s.gstin, s.open_bal, s.cur_bal, s.credit_lim]);
    }

    // 9. Sample Sales Invoices
    const cust1 = (await queryOne('SELECT id FROM customers WHERE mobile=?', ['9822112233']))?.id;
    const adminUser = await getUser('admin');
    
    if (cust1 && adminUser) {
      const insertSaleSQL = `
        INSERT INTO sales (
          invoice_no, customer_id, cashier_id, total_taxable, total_tax, grand_total, paid_amount, due_amount, payment_status, sale_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await run(insertSaleSQL, ['KSK/2026/001', cust1, adminUser.id, 5000.00, 250.00, 5250.00, 2500.00, 2750.00, 'PARTIAL', 'CREDIT']);
    }

    // 10. Sample Expenses
    const insertExpSQL = `
      INSERT INTO expenses (category, title, amount, expense_date, payment_method, description, user_id)
      VALUES (?, ?, ?, DATE('now'), ?, ?, ?)
    `;

    await run(insertExpSQL, ['Electricity', 'Shop Electricity Bill Sept 2026', 2450.00, 'UPI', 'MSEDCL Monthly Bill', adminUser?.id || 1]);
    await run(insertExpSQL, ['Transport', 'Seed Transport from Godown', 1200.00, 'Cash', 'Tempo freight charges', adminUser?.id || 1]);

    console.log('Database seeding completed successfully!');
  });
}

if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}
