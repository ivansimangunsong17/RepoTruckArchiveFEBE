import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const { hasOperationalDocumentChange, isInitialContainerNumberInput } = await import('./container-jobs.service.js');

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
