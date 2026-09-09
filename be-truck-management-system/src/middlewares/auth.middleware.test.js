import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const { ensureRoutePermission } = await import('./auth.middleware.js');

function actorForRole(role) {
  return { sub: `user-${role}`, email: `${role}@example.test`, name: `User ${role}`, role };
}

test('ensureRoutePermission accepts read-only order overview route for every active app role', () => {
  const route = {
    permissions: ['report.read', 'container_job.read', 'sales_order.read'],
  };

  ['admin', 'sales', 'operational', 'pengamat', 'observer', 'finance'].forEach((role) => {
    const actor = actorForRole(role);
    const result = ensureRoutePermission(route, actor);

    assert.equal(result.role, role);
  });
});

test('ensureRoutePermission still rejects roles without any accepted permission', () => {
  const route = {
    permissions: ['report.read', 'container_job.read', 'sales_order.read'],
  };

  assert.throws(
    () => ensureRoutePermission(route, actorForRole('temporary')),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});

test('ensureRoutePermission limits historical entry management to admin', () => {
  const route = {
    permission: 'historical_entry.manage',
  };

  assert.equal(ensureRoutePermission(route, actorForRole('admin')).role, 'admin');
  ['sales', 'operational', 'pengamat', 'observer', 'finance'].forEach((role) => {
    assert.throws(
      () => ensureRoutePermission(route, actorForRole(role)),
      (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
    );
  });
});

test('ensureRoutePermission mengizinkan viewer akses Finance read only', () => {
  const readRoute = {
    permission: 'finance.invoice.read',
  };
  const updateRoute = {
    permission: 'finance.invoice.payment.record',
  };
  const actor = actorForRole('observer');

  assert.equal(ensureRoutePermission(readRoute, actor).role, 'observer');
  assert.throws(
    () => ensureRoutePermission(updateRoute, actor),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});

test('ensureRoutePermission mengizinkan viewer membaca monitoring biaya dropping tanpa reconcile', () => {
  const readRoute = {
    permission: 'finance.operational_fund.read',
  };
  const reconcileRoute = {
    permission: 'finance.operational_fund.reconcile',
  };
  const actor = actorForRole('observer');

  assert.equal(ensureRoutePermission(readRoute, actor).role, 'observer');
  assert.throws(
    () => ensureRoutePermission(reconcileRoute, actor),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});

test('ensureRoutePermission memberikan admin akses ke permission baru tanpa update matrix', () => {
  const route = {
    permission: 'future.permission.manage',
  };

  assert.equal(ensureRoutePermission(route, actorForRole('admin')).role, 'admin');
  assert.throws(
    () => ensureRoutePermission(route, actorForRole('finance')),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});

test('ensureRoutePermission mengizinkan route authOnly untuk role apapun tanpa cek permission', () => {
  const route = { authOnly: true };
  const actor = actorForRole('observer');

  assert.equal(ensureRoutePermission(route, actor), actor);
});
