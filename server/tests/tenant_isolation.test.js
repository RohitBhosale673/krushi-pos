import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import { app } from '../src/index.js';
import { seedDatabase } from '../src/db/seed.js';

test('Multi-Tenant & Role-Based Access Control Isolation Tests', async (t) => {
  let server;
  let baseUrl;

  let superAdminToken;
  let tenant1ManagerToken;
  let tenant2ManagerToken;

  await seedDatabase();

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

  await t.test('1. Authenticate Super Admin, Tenant 1 Manager, and Tenant 2 Manager', async () => {
    // 1a. Super Admin
    const resAdmin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.strictEqual(resAdmin.status, 200);
    const dataAdmin = await resAdmin.json();
    assert.strictEqual(dataAdmin.success, true);
    assert.strictEqual(dataAdmin.user.is_super_admin, true);
    assert.strictEqual(dataAdmin.user.tenant_id, null);
    superAdminToken = dataAdmin.token;

    // 1b. Tenant 1 Manager (Nashik)
    const resM1 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'manager', password: 'manager123' })
    });
    assert.strictEqual(resM1.status, 200);
    const dataM1 = await resM1.json();
    assert.strictEqual(dataM1.success, true);
    assert.strictEqual(dataM1.user.is_super_admin, false);
    assert.ok(dataM1.user.tenant_id > 0);
    tenant1ManagerToken = dataM1.token;

    // 1c. Tenant 2 Manager (Pune)
    const resM2 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'manager_pune', password: 'pune123' })
    });
    assert.strictEqual(resM2.status, 200);
    const dataM2 = await resM2.json();
    assert.strictEqual(dataM2.success, true);
    assert.strictEqual(dataM2.user.is_super_admin, false);
    assert.ok(dataM2.user.tenant_id > 0);
    assert.notStrictEqual(dataM1.user.tenant_id, dataM2.user.tenant_id);
    tenant2ManagerToken = dataM2.token;
  });

  await t.test('2. Super Admin can list all Tenants & summary statistics', async () => {
    const res = await fetch(`${baseUrl}/tenants`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.tenants.length >= 2, 'Should return at least 2 seeded tenants');

    const resStats = await fetch(`${baseUrl}/tenants/summary/stats`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.strictEqual(resStats.status, 200);
    const statsData = await resStats.json();
    assert.ok(statsData.stats.totalTenants >= 2);
  });

  await t.test('3. Non-Super Admin cannot access /api/tenants management endpoints', async () => {
    const res = await fetch(`${baseUrl}/tenants`, {
      headers: { 'Authorization': `Bearer ${tenant1ManagerToken}` }
    });
    assert.strictEqual(res.status, 403, 'Manager must be forbidden from /api/tenants');
  });

  await t.test('4. Strict Product Catalog Isolation between Tenant 1 and Tenant 2', async () => {
    // Tenant 1 lists products
    const resT1 = await fetch(`${baseUrl}/products`, {
      headers: { 'Authorization': `Bearer ${tenant1ManagerToken}` }
    });
    assert.strictEqual(resT1.status, 200);
    const dataT1 = await resT1.json();
    const t1Codes = dataT1.products.map(p => p.product_code);
    assert.ok(t1Codes.includes('PRD-UREA-50'), 'Tenant 1 must see Urea');
    assert.ok(!t1Codes.includes('PRD-PUN-WHEAT'), 'Tenant 1 must NOT see Tenant 2 Pune Wheat');

    // Tenant 2 lists products
    const resT2 = await fetch(`${baseUrl}/products`, {
      headers: { 'Authorization': `Bearer ${tenant2ManagerToken}` }
    });
    assert.strictEqual(resT2.status, 200);
    const dataT2 = await resT2.json();
    const t2Codes = dataT2.products.map(p => p.product_code);
    assert.ok(t2Codes.includes('PRD-PUN-WHEAT'), 'Tenant 2 must see Pune Wheat');
    assert.ok(!t2Codes.includes('PRD-UREA-50'), 'Tenant 2 must NOT see Tenant 1 Urea');
  });

  await t.test('5. Strict Customer Directory Isolation between Tenant 1 and Tenant 2', async () => {
    // Tenant 1 customers
    const resT1 = await fetch(`${baseUrl}/customers`, {
      headers: { 'Authorization': `Bearer ${tenant1ManagerToken}` }
    });
    const dataT1 = await resT1.json();
    const t1Names = dataT1.customers.map(c => c.name);
    assert.ok(t1Names.includes('Pandurang Patil'), 'Tenant 1 must see Pandurang Patil');
    assert.ok(!t1Names.includes('Tukaram More'), 'Tenant 1 must NOT see Tenant 2 customer Tukaram More');

    // Tenant 2 customers
    const resT2 = await fetch(`${baseUrl}/customers`, {
      headers: { 'Authorization': `Bearer ${tenant2ManagerToken}` }
    });
    const dataT2 = await resT2.json();
    const t2Names = dataT2.customers.map(c => c.name);
    assert.ok(t2Names.includes('Tukaram More'), 'Tenant 2 must see Tukaram More');
    assert.ok(!t2Names.includes('Pandurang Patil'), 'Tenant 2 must NOT see Tenant 1 customer Pandurang Patil');
  });

  await t.test('6. Negative Security: Cross-Tenant Single Record Access Blocked', async () => {
    // Get Tenant 2 customer ID
    const resT2 = await fetch(`${baseUrl}/customers`, {
      headers: { 'Authorization': `Bearer ${tenant2ManagerToken}` }
    });
    const dataT2 = await resT2.json();
    const t2Cust = dataT2.customers[0];
    assert.ok(t2Cust);

    // Tenant 1 attempts to query Tenant 2 customer by ID
    const crossRes = await fetch(`${baseUrl}/customers/${t2Cust.id}`, {
      headers: { 'Authorization': `Bearer ${tenant1ManagerToken}` }
    });
    assert.strictEqual(crossRes.status, 404, 'Must return 404 when querying customer of another tenant');
  });

  await t.test('7. Tenant User Creation Quota Enforcement', async () => {
    // Provision a restricted test tenant with max_users = 2
    const resCreateT = await fetch(`${baseUrl}/tenants`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Restricted Seed Store',
        code: `RSS-${Date.now()}`,
        max_users: 2,
        manager_username: `mgr_rss_${Date.now()}`,
        manager_password: 'password123',
        manager_name: 'Test RSS Manager'
      })
    });
    assert.strictEqual(resCreateT.status, 200);
    const tenantData = await resCreateT.json();
    const tenantId = tenantData.tenantId;

    // Login as the new Manager
    const resMgrLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: tenantData.managerId ? (await (await fetch(`${baseUrl}/tenants/${tenantId}`, { headers: { 'Authorization': `Bearer ${superAdminToken}` } })).json()).users[0].username : '', password: 'password123' })
    });
    assert.strictEqual(resMgrLogin.status, 200);
    const mgrToken = (await resMgrLogin.json()).token;

    // The tenant already has 1 user (the Manager).
    // Now create User #2 (within limit of 2) -> Should succeed
    const resUser2 = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mgrToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: `staff_rss_1_${Date.now()}`,
        password: 'password123',
        full_name: 'Staff Member 1',
        role_id: 3 // Cashier
      })
    });
    assert.strictEqual(resUser2.status, 200, 'User #2 creation should succeed');

    // Attempt to create User #3 (exceeding limit of 2) -> Must fail with 400 Bad Request
    const resUser3 = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mgrToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: `staff_rss_2_${Date.now()}`,
        password: 'password123',
        full_name: 'Staff Member 2',
        role_id: 3
      })
    });
    assert.strictEqual(resUser3.status, 400, 'User #3 must be rejected because max_users limit is 2');
    const dataUser3 = await resUser3.json();
    assert.ok(dataUser3.message.includes('User limit reached'));
  });

  await t.test('8. Tenant Module Restriction Enforcement', async () => {
    // Tenant 2 has 'sms' disabled in its allowed_modules
    const resSms = await fetch(`${baseUrl}/sms/eligible-customers`, {
      headers: { 'Authorization': `Bearer ${tenant2ManagerToken}` }
    });
    assert.strictEqual(resSms.status, 403, 'Tenant 2 cannot access SMS module because it is disabled in allowed_modules');
    const data = await resSms.json();
    assert.ok(data.message.includes('disabled for your organization'));
  });

  await t.test('9. Tenant Account Suspension blocks all users under that Tenant', async () => {
    // Super Admin suspends Tenant 2
    const resTenants = await fetch(`${baseUrl}/tenants`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    const tData = await resTenants.json();
    const tenant2 = tData.tenants.find(t => t.code === 'KAM-PUN');
    assert.ok(tenant2);

    const resSuspend = await fetch(`${baseUrl}/tenants/${tenant2.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.strictEqual(resSuspend.status, 200);

    // Tenant 2 user attempts to access any endpoint -> Must be rejected with 403
    const resBlocked = await fetch(`${baseUrl}/products`, {
      headers: { 'Authorization': `Bearer ${tenant2ManagerToken}` }
    });
    assert.strictEqual(resBlocked.status, 403);
    const blockedData = await resBlocked.json();
    assert.ok(blockedData.message.includes('suspended'));

    // Reactivate Tenant 2
    await fetch(`${baseUrl}/tenants/${tenant2.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'active' })
    });
  });

  await t.test('10. Super Admin can delete a Manager and unassign tenant', async () => {
    // 1. Provision a temporary tenant with manager
    const tCode = `T_DEL_${Date.now()}`;
    const resCreate = await fetch(`${baseUrl}/tenants`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Delete Test Branch',
        code: tCode,
        manager_name: 'Temp Manager',
        manager_username: `mgr_del_${Date.now()}`,
        manager_password: 'password123'
      })
    });
    const createData = await resCreate.json();
    assert.strictEqual(resCreate.status, 200);
    const { tenantId, managerId } = createData;
    assert.ok(managerId, 'Manager user should be created');

    // 2. Non-superadmin cannot delete a manager
    const resForbidden = await fetch(`${baseUrl}/users/${managerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenant1ManagerToken}` }
    });
    assert.ok([403, 404].includes(resForbidden.status), 'Non-superadmin cannot delete manager');

    // 3. Super Admin deletes the Manager user account
    const resDel = await fetch(`${baseUrl}/users/${managerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.strictEqual(resDel.status, 200, 'Super Admin can delete manager user');

    // 4. Verify tenant manager_id was set to NULL
    const resTenant = await fetch(`${baseUrl}/tenants/${tenantId}`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    const tenantData = await resTenant.json();
    assert.strictEqual(tenantData.tenant.manager_id, null, 'Tenant manager_id should be cleanly unassigned');
  });

  await t.test('11. Dedicated DELETE /api/tenants/:id/manager and POST /api/tenants/:id/manager', async () => {
    // 1. Create a test tenant
    const tCode = `T_MGR_${Date.now()}`;
    const resCreate = await fetch(`${baseUrl}/tenants`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Manager Reassign Branch',
        code: tCode,
        manager_name: 'Original Manager',
        manager_username: `orig_mgr_${Date.now()}`,
        manager_password: 'password123'
      })
    });
    const { tenantId, managerId } = await resCreate.json();

    // 2. Super Admin deletes manager via DELETE /api/tenants/:id/manager
    const resDelMgr = await fetch(`${baseUrl}/tenants/${tenantId}/manager?delete_account=true`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.strictEqual(resDelMgr.status, 200);

    // Verify tenant has null manager_id
    const resCheck1 = await fetch(`${baseUrl}/tenants/${tenantId}`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.strictEqual((await resCheck1.json()).tenant.manager_id, null);

    // 3. Super Admin provisions a new manager via POST /api/tenants/:id/manager
    const resAssign = await fetch(`${baseUrl}/tenants/${tenantId}/manager`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: `new_mgr_${Date.now()}`,
        password: 'password123',
        full_name: 'New Assigned Manager',
        mobile: '9988776655'
      })
    });
    assert.strictEqual(resAssign.status, 200);
    const assignData = await resAssign.json();
    assert.ok(assignData.managerId, 'New manager id should be returned');

    // Verify tenant now has the new manager_id
    const resCheck2 = await fetch(`${baseUrl}/tenants/${tenantId}`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.strictEqual((await resCheck2.json()).tenant.manager_id, assignData.managerId);
  });
});
