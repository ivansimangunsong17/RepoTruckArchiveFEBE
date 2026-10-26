import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
const { salesOrderRoutes } = await import('./sales-orders.routes.js');
const { ACTIVE_OPERATIONAL_JOB_STATUSES, ACTIVE_OPERATIONAL_ORDER_LIMIT } = await import('./sales-orders.repository.js');

test('route active-operational terdaftar sebelum /:id dengan permission baca SO', () => {
  const activeIndex = salesOrderRoutes.findIndex((route) => route.method === 'GET' && route.path === '/api/sales-orders/active-operational');
  const detailIndex = salesOrderRoutes.findIndex((route) => route.method === 'GET' && route.path === '/api/sales-orders/:id');
  assert.ok(activeIndex >= 0);
  assert.ok(activeIndex < detailIndex, 'router mencocokkan berurutan; /:id tidak boleh menelan active-operational');
  assert.equal(salesOrderRoutes[activeIndex].permission, 'sales_order.read');
});

test('status job aktif mencakup inap dan repo_stored, tanpa completed/cancelled', () => {
  assert.deepEqual([...ACTIVE_OPERATIONAL_JOB_STATUSES].sort(), ['inap', 'received', 'repo_stored', 'running']);
  assert.ok(ACTIVE_OPERATIONAL_ORDER_LIMIT >= 100);
});
