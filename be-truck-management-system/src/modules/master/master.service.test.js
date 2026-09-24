import assert from 'node:assert/strict';
import test from 'node:test';
import { isSameTruckChassis, shouldDetachDriverFromUnit } from './master.service.js';

test('driver dilepas dari unit saat status cuti atau tidak aktif', () => {
  assert.equal(shouldDetachDriverFromUnit('Cuti'), true);
  assert.equal(shouldDetachDriverFromUnit('Tidak Aktif'), true);
  assert.equal(shouldDetachDriverFromUnit('Aktif'), false);
  assert.equal(shouldDetachDriverFromUnit('Bertugas'), false);
});

test('chassis truck dianggap sama tanpa terpengaruh kapital dan spasi', () => {
  assert.equal(isSameTruckChassis({ kirChassisNumber: 'CHS-018' }, ' chs-018 '), true);
  assert.equal(isSameTruckChassis({ kirChassisNumber: 'CHS-018' }, 'CHS-017'), false);
  assert.equal(isSameTruckChassis({ kirChassisNumber: '' }, ''), true);
});
