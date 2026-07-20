import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuarantineStoragePath,
  buildReplacedStoragePath,
  buildTrashStoragePath,
} from './storage-files.js';

function pathParts(storagePath) {
  return storagePath.split(/[\\/]+/);
}

test('trash path menyimpan dokumen berdasarkan tanggal dan sumber', () => {
  const storagePath = buildTrashStoragePath({
    sourceTable: 'attachments',
    sourceId: '5dc92e46-11b4-4d06-a89c-04b16fc6c564',
    originalRelativePath: 'Sales Order/2026/07 - Juli/SO-001/invoice.pdf',
    deletedAt: new Date('2026-07-20T05:00:00.000Z'),
  });

  assert.deepEqual(pathParts(storagePath), [
    'File Terhapus',
    '2026',
    '07 - Juli',
    '2026-07-20',
    'Attachment',
    '5dc92e46-11b4-4d06-a89c-04b16fc6c564',
    'invoice.pdf',
  ]);
});

test('quarantine path memisahkan alasan dan menghasilkan nama unik', () => {
  const storagePath = buildQuarantineStoragePath({
    sourceRelativePath: 'temporary/berkas customer.pdf',
    reason: 'Database gagal',
    quarantinedAt: new Date('2026-07-20T05:00:00.000Z'),
  });
  const parts = pathParts(storagePath);

  assert.deepEqual(parts.slice(0, 4), [
    'File Karantina',
    'File yang belum lolos pemeriksaan',
    '2026-07-20',
    'Database-gagal',
  ]);
  assert.match(parts.at(-1), /^[0-9a-f]{8}-berkas-customer\.pdf$/);
});

test('file hasil revisi dipisahkan dari recycle bin dokumen aktif', () => {
  const storagePath = buildReplacedStoragePath({
    sourceTable: 'vehicle_documents',
    sourceId: '184c9661-4a8b-49b5-8bf4-e025c506f228',
    originalRelativePath: 'Master Data/Truck/unit/KIR lama.pdf',
    replacedAt: new Date('2026-07-20T05:00:00.000Z'),
  });

  assert.deepEqual(pathParts(storagePath).slice(0, 7), [
    'File Terhapus',
    'File Diganti',
    '2026',
    '07 - Juli',
    '2026-07-20',
    'Dokumen Kendaraan',
    '184c9661-4a8b-49b5-8bf4-e025c506f228',
  ]);
  assert.match(pathParts(storagePath).at(-1), /^[0-9a-f]{8}-KIR-lama\.pdf$/);
});
