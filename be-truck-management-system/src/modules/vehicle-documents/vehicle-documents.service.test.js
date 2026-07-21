import test from 'node:test';
import assert from 'node:assert/strict';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  buildVehicleDocumentPath,
  calculateVehicleDocumentStatus,
} = await import('./vehicle-documents.service.js');

test('vehicle document status dihitung dari expired_date', () => {
  const base = new Date('2026-07-12T00:00:00.000Z');

  assert.equal(calculateVehicleDocumentStatus('2026-07-11', base), 'Expired');
  assert.equal(calculateVehicleDocumentStatus('2026-07-19', base), 'Segera Habis');
  assert.equal(calculateVehicleDocumentStatus('2026-08-10', base), 'Akan Habis');
  assert.equal(calculateVehicleDocumentStatus('2026-08-12', base), 'Aktif');
});

test('vehicle document baru disimpan dalam struktur Master Data Truck', () => {
  const vehicleId = 'a12b34cd-1111-4222-8333-1234567890ab';
  const relativePath = buildVehicleDocumentPath(
    { id: vehicleId, unit_code: 'TRK-001', unit_kind: 'HEAD' },
    { documentType: 'KIR_HEAD', issuedDate: '2026-07-20' },
    'dokumen-kir.pdf',
  );
  const parts = relativePath.split(/[\\/]+/);

  assert.deepEqual(parts.slice(0, 4), [
    'Master Data',
    'Truck',
    'TRK-001__a12b34cd',
    'KIR dan Uji Berkala',
  ]);
  assert.match(parts.at(-1), /^20260720-[a-f0-9]{8}-dokumen-kir\.pdf$/);
});

test('unit chassis disimpan terpisah dari dokumen truck', () => {
  const vehicleId = 'b23c45de-1111-4222-8333-1234567890ab';
  const relativePath = buildVehicleDocumentPath(
    { id: vehicleId, unit_code: 'CHS-001', unit_kind: 'CHASSIS' },
    { documentType: 'ASURANSI', issuedDate: '2026-07-20' },
    'polis.pdf',
  );

  assert.deepEqual(relativePath.split(/[\\/]+/).slice(0, 4), [
    'Master Data',
    'Chassis',
    'CHS-001__b23c45de',
    'Asuransi',
  ]);
});
