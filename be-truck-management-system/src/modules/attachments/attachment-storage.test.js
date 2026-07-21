import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildAttachmentStoragePath,
  parseSalesOrderStorageRoot,
  resolveUploadPath,
} from './attachment-storage.js';

const salesOrderId = 'a12b34cd-1111-4222-8333-1234567890ab';
const containerJobId = 'f412eb2c-1111-4222-8333-1234567890ab';

function pathParts(storagePath) {
  return storagePath.split(/[\\/]+/);
}

test('stores a sales document in the readable Sales Order hierarchy', () => {
  const storagePath = buildAttachmentStoragePath(
    {
      entityType: 'sales_order',
      entityId: salesOrderId,
      category: 'Delivery Order',
      fileName: 'DO Customer.pdf',
    },
    {
      salesOrderId,
      soNumber: 'SO-009878',
      createdAt: '2026-06-30T18:00:00.000Z',
    },
  );

  const parts = pathParts(storagePath);
  assert.deepEqual(parts.slice(0, -1), [
    'Sales Order',
    '2026',
    '07 - Juli',
    'SO-009878',
    '01 - Dokumen Sales',
    'Delivery Order',
  ]);
  assert.match(parts.at(-1), /-DO-Customer\.pdf$/);
});

test('stores container documents under the immutable job reference', () => {
  const storagePath = buildAttachmentStoragePath(
    {
      entityType: 'container_job',
      entityId: containerJobId,
      category: 'eirDocument',
      fileName: 'EIR.png',
    },
    {
      salesOrderId,
      containerJobId,
      soNumber: 'SO-009878',
      createdAt: '2026-07-01T08:00:00.000Z',
    },
  );

  const parts = pathParts(storagePath);
  assert.deepEqual(parts.slice(0, -1), [
    'Sales Order',
    '2026',
    '07 - Juli',
    'SO-009878',
    '02 - Dokumen Container',
    'JOB-F412EB2C',
    'EIR',
  ]);
});

test('stores a transfer proof in Finance instead of the container folder', () => {
  const storagePath = buildAttachmentStoragePath(
    {
      entityType: 'container_job',
      entityId: containerJobId,
      category: 'rpujTransferProof',
      fileName: 'Bukti Transfer.pdf',
    },
    {
      salesOrderId,
      containerJobId,
      soNumber: 'SO-009878',
      createdAt: '2026-07-01T08:00:00.000Z',
    },
  );

  const parts = pathParts(storagePath);
  assert.deepEqual(parts.slice(0, -1), [
    'Sales Order',
    '2026',
    '07 - Juli',
    'SO-009878',
    '03 - Dokumen Finance',
    'Bukti Transfer',
  ]);
});

test('uses a stable order reference while the SO number is not available', () => {
  const storagePath = buildAttachmentStoragePath(
    {
      entityType: 'container_job',
      entityId: containerJobId,
      category: 'travelDocumentFile',
      fileName: 'Surat Jalan.jpg',
    },
    {
      salesOrderId,
      containerJobId,
      createdAt: '2026-07-01T08:00:00.000Z',
    },
  );

  assert.equal(pathParts(storagePath)[3], 'ORDER-A12B34CD');
});

test('reuses the first storage root after an SO number is assigned', () => {
  const storageRootParts = ['Sales Order', '2026', '07 - Juli', 'ORDER-A12B34CD'];
  const storagePath = buildAttachmentStoragePath(
    {
      entityType: 'sales_order',
      entityId: salesOrderId,
      category: 'Customer SPK',
      fileName: 'SPK.pdf',
    },
    {
      salesOrderId,
      soNumber: 'SO-009878',
      createdAt: '2026-07-01T08:00:00.000Z',
      storageRootParts,
    },
  );

  assert.deepEqual(pathParts(storagePath).slice(0, 4), storageRootParts);
  assert.deepEqual(parseSalesOrderStorageRoot(storagePath), storageRootParts);
});

test('continues to resolve legacy paths stored in the database', () => {
  const legacyRelativePath = join(
    'sales-orders',
    '2026',
    'Juli',
    '2026-07-01',
    'SO-009878',
    '03-container-jobs',
    'CONT123',
    'eir',
    'legacy.png',
  );

  const resolvedPath = resolveUploadPath(legacyRelativePath);
  assert.ok(resolvedPath.endsWith(legacyRelativePath));
  assert.equal(parseSalesOrderStorageRoot(legacyRelativePath), null);
});

test('stores master data documents in folders separated by entity and category', () => {
  const cases = [
    ['truck', 'stnkDocument', 'Truck', 'STNK', 'TRK-020-B-1234-ABC-20FT__a12b34cd', 'TRK-020 B 1234 ABC 20FT'],
    ['chassis', 'ownershipDocument', 'Chassis', 'Dokumen Kepemilikan', 'CHS-040-40FT__a12b34cd', 'CHS-040 40FT'],
    ['driver', 'licenseDocument', 'Sopir', 'SIM', 'Budi-Santoso__a12b34cd', 'Budi Santoso'],
    ['customer', 'companyProfileDocument', 'Customer', 'Company Profile', 'PT-Alpha-Logistik__a12b34cd', 'PT Alpha Logistik'],
  ];

  cases.forEach(([entityType, category, entityFolder, categoryFolder, recordFolder, masterRecordLabel]) => {
    const storagePath = buildAttachmentStoragePath(
      {
        entityType,
        entityId: salesOrderId,
        category,
        fileName: `${category}.pdf`,
      },
      { masterRecordLabel },
    );

    assert.deepEqual(pathParts(storagePath).slice(0, 4), [
      'Master Data',
      entityFolder,
      recordFolder,
      categoryFolder,
    ]);
  });
});
