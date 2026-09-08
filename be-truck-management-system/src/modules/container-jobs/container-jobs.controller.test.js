import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  adminCorrectionChanges,
  adminCorrectionMetadata,
  assertDocumentOnlyPayload,
  isAdminCorrectionPayload,
  isDocumentOnlyActor,
} = await import('./container-jobs.controller.js');

test('mengenali payload koreksi admin', () => {
  assert.equal(isAdminCorrectionPayload({ adminCorrectionMode: true }), true);
  assert.equal(isAdminCorrectionPayload({ adminCorrectionMode: 'true' }), true);
  assert.equal(isAdminCorrectionPayload({ adminCorrectionMode: false }), false);
  assert.equal(isAdminCorrectionPayload({}), false);
});

test('metadata koreksi admin memuat alasan dan referensi job', () => {
  assert.deepEqual(
    adminCorrectionMetadata(
      { adminCorrectionMode: true, adminCorrectionReason: ' Koreksi tanggal selesai ' },
      { orderId: 'order-1', soNumber: 'SO-ARM-001', containerNumber: 'MSCU1234567' },
    ),
    {
      adminCorrection: true,
      adminCorrectionReason: 'Koreksi tanggal selesai',
      salesOrderId: 'order-1',
      soNumber: 'SO-ARM-001',
      containerNumber: 'MSCU1234567',
    },
  );
  assert.deepEqual(adminCorrectionMetadata({ adminCorrectionMode: false }), {});
});

test('audit koreksi admin hanya mencatat field penting yang berubah', () => {
  assert.deepEqual(
    adminCorrectionChanges(
      {
        status: 'running',
        containerNumber: 'MSCU1234567',
        completedAt: '2026-07-19T12:00:00.000Z',
        driverCommissionAmount: 50000,
      },
      {
        status: 'completed',
        containerNumber: 'MSCU1234567',
        completedAt: '2026-07-19T13:00:00.000Z',
        driverCommissionAmount: 50000,
      },
    ),
    [
      {
        field: 'status',
        label: 'Status',
        before: 'running',
        after: 'completed',
      },
      {
        field: 'completedAt',
        label: 'Waktu Selesai',
        before: '2026-07-19T12:00:00.000Z',
        after: '2026-07-19T13:00:00.000Z',
      },
    ],
  );
});

test('sales dengan akses dokumen hanya boleh mengirim payload dokumen operational', () => {
  const salesActor = { role: 'sales' };
  assert.equal(isDocumentOnlyActor(salesActor), true);

  assert.doesNotThrow(() => assertDocumentOnlyPayload(salesActor, {
    updatedBy: 'Sales A',
    eirNumber: 'EIR-001',
    eirDocument: { name: 'eir.pdf' },
    loadingVoucher: 'BM-001',
    otherDocuments: [{ name: 'Foto bongkar', file: { name: 'foto.jpg' } }],
  }));

  assert.throws(
    () => assertDocumentOnlyPayload(salesActor, {
      updatedBy: 'Sales A',
      status: 'completed',
      plateNumber: 'B 1000 AA',
    }),
    /hanya boleh mengubah dokumen/i,
  );
});

test('operational tetap bukan mode dokumen saja karena punya akses update job penuh', () => {
  const operationalActor = { role: 'operational' };
  assert.equal(isDocumentOnlyActor(operationalActor), false);
  assert.doesNotThrow(() => assertDocumentOnlyPayload(operationalActor, {
    status: 'running',
    plateNumber: 'B 1000 AA',
  }));
});
