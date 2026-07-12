import test from 'node:test';
import assert from 'node:assert/strict';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const { calculateVehicleDocumentStatus } = await import('./vehicle-documents.service.js');

test('vehicle document status dihitung dari expired_date', () => {
  const base = new Date('2026-07-12T00:00:00.000Z');

  assert.equal(calculateVehicleDocumentStatus('2026-07-11', base), 'Expired');
  assert.equal(calculateVehicleDocumentStatus('2026-07-19', base), 'Segera Habis');
  assert.equal(calculateVehicleDocumentStatus('2026-08-10', base), 'Akan Habis');
  assert.equal(calculateVehicleDocumentStatus('2026-08-12', base), 'Aktif');
});
