import assert from 'node:assert/strict';
import test from 'node:test';
import { mapActivityLog, toActivityLogDb } from './activity-logs.mapper.js';

test('mapActivityLog exposes audit metadata fields', () => {
  const row = {
    id: 'log-1',
    actor_name: 'Admin',
    actor_role: 'admin',
    action: 'UPDATE_SETTINGS',
    target: 'settings',
    metadata: {
      actorUserId: 'user-1',
      module: 'settings',
      entityType: 'system_settings',
      entityId: 'archive',
      beforeData: { companyName: 'Old' },
      afterData: { companyName: 'New' },
      ipAddress: '127.0.0.1',
      userAgent: 'node-test',
    },
    created_at: '2026-07-10T00:00:00.000Z',
  };

  assert.deepEqual(mapActivityLog(row), {
    id: 'log-1',
    actorName: 'Admin',
    actorRole: 'admin',
    action: 'UPDATE_SETTINGS',
    target: 'settings',
    actorUserId: 'user-1',
    module: 'settings',
    entityType: 'system_settings',
    entityId: 'archive',
    beforeData: { companyName: 'Old' },
    afterData: { companyName: 'New' },
    ipAddress: '127.0.0.1',
    userAgent: 'node-test',
    metadata: row.metadata,
    createdAt: '2026-07-10T00:00:00.000Z',
  });
});

test('toActivityLogDb stores audit detail in metadata json', () => {
  const dbPayload = toActivityLogDb({
    actorName: 'Admin',
    actorRole: 'admin',
    action: 'LOGIN_SUCCESS',
    module: 'auth',
    metadata: { actorUserId: 'user-1' },
  });

  assert.equal(dbPayload.actor_name, 'Admin');
  assert.equal(dbPayload.actor_role, 'admin');
  assert.equal(dbPayload.action, 'LOGIN_SUCCESS');
  assert.equal(dbPayload.target, 'auth');
  assert.equal(dbPayload.metadata, JSON.stringify({ actorUserId: 'user-1' }));
});
