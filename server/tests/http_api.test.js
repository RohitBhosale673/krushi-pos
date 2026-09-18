import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import { app } from '../src/index.js';

test('KrushiPOS HTTP API End-to-End Integration Tests', async (t) => {
  let server;
  let baseUrl;
  let authToken;

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api`;
      resolve();
    });
  });

  t.after(() => {
    if (server) server.close();
  });

  await t.test('1. Server Health Check Endpoint', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200, 'Health check should respond with 200');
    const data = await res.json();
    assert.strictEqual(data.status, 'OK');
    assert.strictEqual(data.system, 'KrushiPOS API Server');
  });

  await t.test('2. Admin User Login Flow', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });

    assert.strictEqual(res.status, 200, 'Login should respond with 200');
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.token, 'Response must include JWT token');
    assert.strictEqual(data.user.username, 'admin');
    assert.ok(data.user.roles.includes('Super Admin'), 'Admin should have Super Admin role');
    authToken = data.token;
  });

  await t.test('3. Authenticated Profile Endpoint (/auth/me)', async () => {
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.username, 'admin');
    assert.ok(Array.isArray(data.user.permissions));
  });

  await t.test('4. Product Masters and Catalog Endpoints', async () => {
    const resMasters = await fetch(`${baseUrl}/products/masters/all`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(resMasters.status, 200);
    const dataMasters = await resMasters.json();
    assert.strictEqual(dataMasters.success, true);
    assert.ok(dataMasters.categories.length > 0, 'Should have categories');
    assert.ok(dataMasters.units.length > 0, 'Should have units');

    const resProds = await fetch(`${baseUrl}/products`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(resProds.status, 200);
    const dataProds = await resProds.json();
    assert.strictEqual(dataProds.success, true);
    assert.ok(dataProds.products.length >= 5, 'Should return seeded products');
  });

  await t.test('5. POS Search & Real-time Catalog Stock', async () => {
    const res = await fetch(`${baseUrl}/pos/search?q=Urea`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.items.length > 0, 'Should find Urea batches');
    const item = data.items[0];
    assert.ok(item.batch_no, 'Batch item must contain batch_no');
    assert.ok(item.available_qty > 0, 'Available quantity must be positive');
  });

  await t.test('6. Customer Directory & Udhar Summary', async () => {
    const resCust = await fetch(`${baseUrl}/customers`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(resCust.status, 200);
    const dataCust = await resCust.json();
    assert.strictEqual(dataCust.success, true);
    assert.ok(dataCust.customers.length > 0, 'Should list customers');

    const resUdhar = await fetch(`${baseUrl}/udhar/summary`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(resUdhar.status, 200);
    const dataUdhar = await resUdhar.json();
    assert.strictEqual(dataUdhar.success, true);
    assert.ok(dataUdhar.summary.total_outstanding_udhari > 0, 'Total outstanding balance should be positive');
    assert.ok(dataUdhar.agingBuckets, 'Aging buckets must be provided');
  });

  await t.test('7. Reports Dashboard and Analytics', async () => {
    const res = await fetch(`${baseUrl}/reports/dashboard`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.dashboard.sales, 'Dashboard must have sales object');
    assert.ok(data.dashboard.udhari, 'Dashboard must have udhari object');
    assert.ok(data.dashboard.inventory, 'Dashboard must have inventory object');
  });

  await t.test('8. Business Settings Endpoint', async () => {
    const res = await fetch(`${baseUrl}/settings`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.settings.store_name, 'Store name setting should exist');
  });

  await t.test('9. CSV Export with Query Token Authentication', async () => {
    const res = await fetch(`${baseUrl}/reports/export/sales?token=${authToken}`);
    assert.strictEqual(res.status, 200, 'Export with query token should succeed with 200');
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('text/csv'), 'Content-type must be text/csv');
    const text = await res.text();
    assert.ok(text.includes('Invoice No'), 'CSV must contain headers');
  });

  await t.test('10. Database Backup Download with Query Token Authentication', async () => {
    const res = await fetch(`${baseUrl}/settings/backup/download?token=${authToken}`);
    assert.strictEqual(res.status, 200, 'Backup download should respond with 200');
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 0, 'Database backup file should not be empty');
  });

  await t.test('11. Create Product with Opening Stock creates batch and stock movement', async () => {
    const newProdPayload = {
      name: 'Bio-Organic Booster 1L',
      product_code: `BOB-${Date.now()}`,
      product_type: 'Plant Growth Promoter',
      primary_unit_id: 1,
      purchase_price: 350,
      selling_price: 500,
      mrp: 550,
      gst_rate: 5,
      opening_stock: 45,
      batch_no: 'BOB-OP-01',
      exp_date: '2028-12-31'
    };

    const res = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newProdPayload)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.productId);

    // Verify stock is 45
    const getRes = await fetch(`${baseUrl}/products?search=Bio-Organic`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const getData = await getRes.json();
    const created = getData.products.find(p => p.id === data.productId);
    assert.ok(created, 'Product should be listed');
    assert.strictEqual(created.total_available_qty, 45, 'Total stock should equal opening stock 45');
  });

  await t.test('12. Edit Product Stock directly updates stock', async () => {
    // Fetch products to find the one we created
    const getRes = await fetch(`${baseUrl}/products?search=Bio-Organic`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const getData = await getRes.json();
    const prod = getData.products[0];
    assert.ok(prod);

    // Update stock to 80
    const updateRes = await fetch(`${baseUrl}/products/${prod.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...prod,
        current_stock: 80,
        stock_notes: 'Physical audit correction'
      })
    });
    assert.strictEqual(updateRes.status, 200);

    // Verify updated stock is 80
    const verifyRes = await fetch(`${baseUrl}/products?search=Bio-Organic`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const verifyData = await verifyRes.json();
    const updated = verifyData.products.find(p => p.id === prod.id);
    assert.strictEqual(updated.total_available_qty, 80, 'Total stock should be updated to 80');
  });

  await t.test('13. Quick Stock Adjust Endpoint updates stock correctly', async () => {
    const getRes = await fetch(`${baseUrl}/products?search=Bio-Organic`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const getData = await getRes.json();
    const prod = getData.products[0];
    assert.ok(prod);

    // Use /adjust-stock endpoint to set to 100
    const adjustRes = await fetch(`${baseUrl}/products/${prod.id}/adjust-stock`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        new_stock: 100,
        adjustment_type: 'set',
        notes: 'Annual audit'
      })
    });
    assert.strictEqual(adjustRes.status, 200);
    const adjustData = await adjustRes.json();
    assert.strictEqual(adjustData.success, true);
    assert.strictEqual(adjustData.newStock, 100);

    // Verify
    const verifyRes = await fetch(`${baseUrl}/products?search=Bio-Organic`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const verifyData = await verifyRes.json();
    const finalProd = verifyData.products.find(p => p.id === prod.id);
    assert.strictEqual(finalProd.total_available_qty, 100, 'Total stock should now be 100');
  });
});
