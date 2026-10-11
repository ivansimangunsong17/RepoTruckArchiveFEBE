import assert from 'node:assert/strict';
import test from 'node:test';
import { containerJobRoutes } from './container-jobs.routes.js';
import { ROLE_PERMISSIONS } from '../users/users.mapper.js';
import { actorHasPermission } from '../../utils/permissions.js';
import { rejectFinanceOperationalMutation } from './container-jobs.controller.js';

function allowed(role, route) {
  const actor = { role, permissions: ROLE_PERMISSIONS[role] };
  return (route.permissions || [route.permission]).some((permission) => actorHasPermission(actor, permission));
}

test('Finance dapat membaca list, detail, biaya, dan riwayat assignment Container Job', () => {
  const paths = ['/api/container-jobs', '/api/container-jobs/:id', '/api/container-jobs/:id/expenses', '/api/container-jobs/:id/assignment-history'];
  for (const path of paths) {
    const route = containerJobRoutes.find((item) => item.method === 'GET' && item.path === path);
    assert.ok(route, path);
    assert.ok(allowed('finance', route), path);
  }
});

test('Finance tidak mendapat izin mutasi eksekusi Container Job; role lain tetap sesuai', () => {
  const executionPaths = [
    '/api/container-jobs/repo-pickups/single/:id', '/api/container-jobs/repo-pickups/combo-2x20',
    '/api/container-jobs/:id', '/api/container-jobs/:id/assignment', '/api/container-jobs/:id/status',
    '/api/container-jobs/:id/reset-assignment', '/api/container-jobs/:id/cancel-review',
    '/api/container-jobs/:id/expenses', '/api/container-jobs/:id/expenses/:expenseId',
  ];
  for (const path of executionPaths) {
    const route = containerJobRoutes.find((item) => item.method !== 'GET' && item.path === path);
    assert.ok(route, path);
    assert.equal(allowed('finance', route), false, path);
    assert.equal(allowed('operational', route), true, path);
    assert.equal(allowed('admin', route), true, path);
  }
  assert.equal(allowed('sales', containerJobRoutes.find((route) => route.method === 'GET' && route.path === '/api/container-jobs')), true);
  assert.equal(allowed('sales', containerJobRoutes.find((route) => route.method === 'PATCH' && route.path === '/api/container-jobs/:id/status')), false);
});

test('proof PATCH lama menolak Finance sebelum membaca atau mengubah data', async () => {
  for (const path of ['/api/container-jobs/:id/expenses/:expenseId/proof', '/api/container-jobs/:id/expenses/:expenseId/uj-transfer-proof']) {
    const route = containerJobRoutes.find((item) => item.method === 'PATCH' && item.path === path);
    assert.ok(route);
    assert.equal(allowed('finance', route), true, 'izin finance lama tetap dipakai untuk routing');
    await assert.rejects(route.handler({ user: { role: 'finance' }, params: { id: 'job', expenseId: 'expense' } }, {}), {
      statusCode: 403, code: 'FORBIDDEN',
    });
  }
  assert.doesNotThrow(() => rejectFinanceOperationalMutation({ role: 'operational' }));
  assert.doesNotThrow(() => rejectFinanceOperationalMutation({ role: 'admin' }));
});
