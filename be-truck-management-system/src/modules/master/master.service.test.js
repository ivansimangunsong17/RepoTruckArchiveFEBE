import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldDetachDriverFromUnit } from './master.service.js';

test('driver dilepas dari unit saat status cuti atau tidak aktif', () => {
  assert.equal(shouldDetachDriverFromUnit('Cuti'), true);
  assert.equal(shouldDetachDriverFromUnit('Tidak Aktif'), true);
  assert.equal(shouldDetachDriverFromUnit('Aktif'), false);
  assert.equal(shouldDetachDriverFromUnit('Bertugas'), false);
});
