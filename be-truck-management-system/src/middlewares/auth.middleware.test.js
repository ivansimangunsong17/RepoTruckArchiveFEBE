import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const { authorizeRoute } = await import('./auth.middleware.js');
const { createAuthToken } = await import('../modules/auth/auth.utils.js');

function requestForRole(role) {
  const token = createAuthToken({
    id: `user-${role}`,
    email: `${role}@example.test`,
    name: `User ${role}`,
    role,
  });
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
    query: {},
  };
}

test('authorizeRoute accepts read-only order overview route for every active app role', () => {
  const route = {
    permissions: ['report.read', 'container_job.read', 'sales_order.read'],
  };

  ['admin', 'sales', 'operational', 'pengamat', 'observer', 'finance'].forEach((role) => {
    const request = requestForRole(role);
    const payload = authorizeRoute(route, request);

    assert.equal(payload.role, role);
    assert.equal(request.user.role, role);
  });
});

test('authorizeRoute still rejects roles without any accepted permission', () => {
  const route = {
    permissions: ['report.read', 'container_job.read', 'sales_order.read'],
  };

  assert.throws(
    () => authorizeRoute(route, requestForRole('temporary')),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});

test('authorizeRoute limits historical entry management to admin', () => {
  const route = {
    permission: 'historical_entry.manage',
  };

  assert.equal(authorizeRoute(route, requestForRole('admin')).role, 'admin');
  ['sales', 'operational', 'pengamat', 'observer', 'finance'].forEach((role) => {
    assert.throws(
      () => authorizeRoute(route, requestForRole(role)),
      (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
    );
  });
});
