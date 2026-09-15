import assert from 'node:assert/strict';
import test from 'node:test';
import { actorHasPermission, isAdminRole } from './permissions.js';

test('actorHasPermission memberikan admin akses ke permission baru', () => {
  assert.equal(actorHasPermission({ role: 'admin' }, 'future.permission.manage'), true);
  assert.equal(actorHasPermission({ role: 'ADMIN' }, 'future.permission.manage'), true);
});

test('actorHasPermission tetap menolak permission kosong', () => {
  assert.equal(actorHasPermission({ role: 'admin' }, ''), false);
});

test('actorHasPermission role non-admin tetap mengikuti permission matrix', () => {
  assert.equal(actorHasPermission({ role: 'operational' }, 'container_job.update'), true);
  assert.equal(actorHasPermission({ role: 'operational' }, 'driver_commission.submit'), true);
  assert.equal(actorHasPermission({ role: 'sales' }, 'driver_commission.submit'), true);
  assert.equal(actorHasPermission({ role: 'sales' }, 'container_job.update'), false);
  assert.equal(actorHasPermission({ role: 'finance' }, 'master_data.read'), true);
  assert.equal(actorHasPermission({ role: 'finance' }, 'master_data.update'), false);
  assert.equal(actorHasPermission({ role: 'operational' }, 'future.permission.manage'), false);
});

test('isAdminRole menormalisasi role admin', () => {
  assert.equal(isAdminRole(' admin '), true);
  assert.equal(isAdminRole('finance'), false);
});
