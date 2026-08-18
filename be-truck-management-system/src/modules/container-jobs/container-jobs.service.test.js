import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  adminCorrectionReason,
  canUseAdminCorrection,
  ensureRepoStoragePayload,
  hasCompletedTimelineChange,
  hasDriverCommissionChange,
  hasOperationalDocumentChange,
  isAdminCorrectionMode,
  isContainerNumberLockedForOperational,
  isDriverCommissionLockedForOperational,
  isInitialContainerNumberInput,
  isOtherCostLockedForRepoPickup,
  isRepoCancellationLockedForOperational,
} = await import('./container-jobs.service.js');
const { hasCompleteOperationalAssignment, hasRequiredRepoCompletionDocuments, shouldValidateVehicleContainerSize } = await import('./container-jobs.repository.js');

test('mengenali pengisian pertama nomor container setelah UJ dikirim', () => {
  assert.equal(isInitialContainerNumberInput(
    { containerNumber: '', status: 'running', rpujStatus: 'paid' },
    { containerNumber: 'TCLU1234567' },
  ), true);
});

test('tidak menganggap perubahan nomor tersimpan sebagai pengisian pertama', () => {
  assert.equal(isInitialContainerNumberInput(
    { containerNumber: 'TCLU1234567', status: 'running', rpujStatus: 'paid' },
    { containerNumber: 'TCLU7654321' },
  ), false);
});

test('mengunci perubahan nomor container saat container dititipkan', () => {
  assert.equal(isContainerNumberLockedForOperational(
    { containerNumber: 'TCLU1234567', status: 'repo_stored', rpujStatus: 'approved' },
    { containerNumber: 'TCLU7654321', status: 'running' },
  ), true);
});

test('mengunci perubahan biaya lainnya saat ambil container titip', () => {
  assert.equal(isOtherCostLockedForRepoPickup(
    { status: 'repo_stored', rpujNotes: '{"amount":150000,"notes":"Parkir"}' },
    { status: 'running', rpujNotes: '{"amount":250000,"notes":"Parkir tambahan"}' },
  ), true);
  assert.equal(isOtherCostLockedForRepoPickup(
    { status: 'repo_stored', rpujNotes: '{"amount":150000,"notes":"Parkir"}' },
    { status: 'running', rpujNotes: '{"amount":150000,"notes":"Parkir"}' },
  ), false);
});

test('mengenali perubahan snapshot komisi sopir', () => {
  assert.equal(hasDriverCommissionChange(
    { hasDriverCommission: false, driverCommissionAmount: 0 },
    { hasDriverCommission: true, driverCommissionAmount: 50000 },
  ), true);
  assert.equal(hasDriverCommissionChange(
    { hasDriverCommission: true, driverCommissionAmount: 50000, driverCommissionNote: 'Komisi Bandung' },
    { hasDriverCommission: true, driverCommissionAmount: 50000, driverCommissionNote: 'Komisi Bandung' },
  ), false);
});

test('mengunci perubahan komisi sopir operational setelah RPUJ disetujui atau dibayar', () => {
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'operational' },
    { rpujStatus: 'approved', status: 'running', hasDriverCommission: true, driverCommissionAmount: 50000 },
    { hasDriverCommission: true, driverCommissionAmount: 75000 },
  ), true);
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'admin' },
    { rpujStatus: 'paid', status: 'running', hasDriverCommission: true, driverCommissionAmount: 50000 },
    { hasDriverCommission: true, driverCommissionAmount: 75000 },
  ), true);
  assert.equal(isDriverCommissionLockedForOperational(
    { role: 'admin' },
    { rpujStatus: 'paid', status: 'running', hasDriverCommission: true, driverCommissionAmount: 50000 },
    { hasDriverCommission: true, driverCommissionAmount: 75000, adminCorrectionMode: true, adminCorrectionReason: 'Salah input komisi' },
  ), false);
});

test('mengunci pembatalan operational setelah container pernah dititipkan', () => {
  assert.equal(isRepoCancellationLockedForOperational(
    { role: 'operational' },
    { status: 'running', repoStoredAt: '2026-07-23T09:00:00.000Z', repoPickedUpAt: '2026-07-23T10:00:00.000Z' },
    { status: 'cancelled' },
  ), true);
  assert.equal(isRepoCancellationLockedForOperational(
    { role: 'admin' },
    { status: 'running', repoStoredAt: '2026-07-23T09:00:00.000Z' },
    { status: 'cancelled' },
  ), true);
  assert.equal(isRepoCancellationLockedForOperational(
    { role: 'admin' },
    { status: 'running', repoStoredAt: '2026-07-23T09:00:00.000Z' },
    { status: 'cancelled', adminCorrectionMode: true, adminCorrectionReason: 'Pembatalan koreksi admin' },
  ), false);
});

test('mode koreksi admin membutuhkan role admin dan alasan', () => {
  assert.equal(isAdminCorrectionMode({ adminCorrectionMode: true }), true);
  assert.equal(isAdminCorrectionMode({ adminCorrectionMode: 'true' }), true);
  assert.equal(adminCorrectionReason({ adminCorrectionReason: ' Salah tanggal selesai ' }), 'Salah tanggal selesai');
  assert.equal(canUseAdminCorrection(
    { role: 'admin' },
    { adminCorrectionMode: true, adminCorrectionReason: 'Salah tanggal selesai' },
  ), true);
  assert.equal(canUseAdminCorrection(
    { role: 'operational' },
    { adminCorrectionMode: true, adminCorrectionReason: 'Salah tanggal selesai' },
  ), false);
  assert.equal(canUseAdminCorrection(
    { role: 'admin' },
    { adminCorrectionMode: true, adminCorrectionReason: 'pendek' },
  ), false);
});

test('mengizinkan pengisian awal dokumen kosong setelah job selesai', () => {
  assert.equal(hasOperationalDocumentChange(
    { eirNumber: '', loadingVoucher: '' },
    { eirNumber: 'EIR-001', loadingVoucher: 'BON-001' },
  ), false);
});

test('mengenali revisi dokumen yang sudah tersimpan', () => {
  assert.equal(hasOperationalDocumentChange(
    { eirNumber: 'EIR-001' },
    { eirNumber: 'EIR-REVISI' },
  ), true);
});

test('mengenali revisi timeline job selesai', () => {
  assert.equal(hasCompletedTimelineChange(
    {
      runningAt: '2026-06-29T06:45:00.000Z',
      completedAt: '2026-07-01T06:45:00.000Z',
    },
    {
      runningAt: '2026-06-29T06:45:00.000Z',
      completedAt: '2026-07-01T06:45:00.000Z',
    },
  ), false);
  assert.equal(hasCompletedTimelineChange(
    {
      runningAt: '2026-06-29T06:45:00.000Z',
      completedAt: '2026-07-01T06:45:00.000Z',
    },
    {
      runningAt: '2026-06-29T07:45:00.000Z',
      completedAt: '2026-07-01T06:45:00.000Z',
    },
  ), true);
});

test('assignment operational belum lengkap jika truck atau driver kosong', () => {
  assert.equal(hasCompleteOperationalAssignment({ plateNumber: 'B 1234 XYZ', driver: '' }), false);
  assert.equal(hasCompleteOperationalAssignment({ plateNumber: '', driver: 'Budi' }), false);
});

test('assignment operational lengkap dari payload atau snapshot tersimpan', () => {
  assert.equal(hasCompleteOperationalAssignment({ plateNumber: 'B 1234 XYZ', driver: 'Budi' }), true);
  assert.equal(hasCompleteOperationalAssignment({}, null, null, {
    assignment_snapshot: {
      plateNumber: 'B 1234 XYZ',
      driver: 'Budi',
    },
  }), true);
});

test('data lama tidak mengunci mismatch ukuran truck dan container', () => {
  assert.equal(shouldValidateVehicleContainerSize({ entrySource: 'historical' }, { entry_source: 'realtime' }), false);
  assert.equal(shouldValidateVehicleContainerSize({}, { entry_source: 'historical' }), false);
  assert.equal(shouldValidateVehicleContainerSize({}, { entry_source: 'realtime' }), true);
});

test('completion job biasa tidak membutuhkan EIR Titip', () => {
  assert.equal(hasRequiredRepoCompletionDocuments({}, new Set(['eirDocument'])), true);
});

test('completion job titip membutuhkan nomor dan dokumen EIR Titip', () => {
  assert.equal(hasRequiredRepoCompletionDocuments(
    { repo_location: 'Depo Marunda', repo_eir_number: 'EIR-TITIP-001' },
    new Set(['repoEirDocument']),
  ), true);
  assert.equal(hasRequiredRepoCompletionDocuments(
    { repo_location: 'Depo Marunda', repo_eir_number: 'EIR-TITIP-001' },
    new Set(['eirDocument']),
  ), false);
  assert.equal(hasRequiredRepoCompletionDocuments(
    { repo_location: 'Depo Marunda' },
    new Set(['repoEirDocument']),
  ), false);
});

test('menolak titip container jika job belum sedang jalan', () => {
  assert.throws(() => ensureRepoStoragePayload(
    {
      status: 'received',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      repoEirDocument: { path: 'eir-titip.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Marunda',
      repoReason: 'Menunggu instruksi bongkar',
      repoEirNumber: 'EIR-TITIP-001',
      repoContainerCondition: 'empty',
    },
  ), /Sedang Jalan/);
});

test('mengizinkan titip container jika job sedang jalan dan syarat lengkap', () => {
  assert.doesNotThrow(() => ensureRepoStoragePayload(
    {
      status: 'running',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      repoEirDocument: { path: 'eir-titip.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Marunda',
      repoReason: 'Menunggu instruksi bongkar',
      repoEirNumber: 'EIR-TITIP-001',
      repoContainerCondition: 'empty',
    },
  ));
});

test('menolak titip ulang setelah container pernah dititipkan', () => {
  assert.throws(() => ensureRepoStoragePayload(
    {
      status: 'running',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      repoLocation: 'Depo Marunda',
      repoStoredAt: '2026-07-23T09:00:00.000Z',
      repoPickedUpAt: '2026-07-23T10:00:00.000Z',
      repoEirDocument: { path: 'eir-titip.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Cakung',
      repoReason: 'Menunggu ulang',
      repoEirNumber: 'EIR-TITIP-002',
      repoContainerCondition: 'empty',
    },
  ), /tidak bisa dititipkan ulang/);
});

test('menolak titip container tanpa nomor EIR Titip', () => {
  assert.throws(() => ensureRepoStoragePayload(
    {
      status: 'running',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      repoEirDocument: { path: 'eir-titip.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Marunda',
      repoReason: 'Menunggu instruksi bongkar',
      repoContainerCondition: 'empty',
    },
  ), /Nomor EIR Titip/);
});

test('menolak titip container jika hanya EIR akhir yang tersedia', () => {
  assert.throws(() => ensureRepoStoragePayload(
    {
      status: 'running',
      containerNumber: 'TCLU1234567',
      driver: 'Budi',
      plateNumber: 'B 1234 XYZ',
      eirDocument: { path: 'eir-akhir.pdf' },
    },
    {
      status: 'repo_stored',
      repoLocation: 'Depo Marunda',
      repoReason: 'Menunggu instruksi bongkar',
      repoEirNumber: 'EIR-TITIP-001',
      repoContainerCondition: 'empty',
    },
  ), /EIR Titip/);
});
