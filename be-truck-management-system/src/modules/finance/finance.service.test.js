import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const { approveFinanceCorrection, rejectFinanceCorrection, rejectRpuj } = await import('./finance.service.js');
const { mapInvoiceDocuments } = await import('./finance.repository.js');
const {
  financeCorrectionTypes,
  isFinanceCorrectionAdminApprovalRequired,
  normalizeFinanceCorrectionType,
  validateFinanceCorrectionInput,
} = await import('./finance-corrections.js');

test('reject RPUJ mewajibkan catatan penolakan', () => {
  assert.throws(
    () => rejectRpuj('job-1', { rejectionNote: '   ' }, { name: 'Finance Test' }),
    (error) => error.code === 'RPUJ_REJECTION_NOTE_REQUIRED' && error.statusCode === 400,
  );
});

test('reject RPUJ membatasi catatan maksimal 500 karakter', () => {
  assert.throws(
    () => rejectRpuj('job-1', { rejectionNote: 'a'.repeat(501) }, { name: 'Finance Test' }),
    (error) => error.code === 'RPUJ_REJECTION_NOTE_TOO_LONG' && error.statusCode === 400,
  );
});

test('setiap container memiliki empat slot dokumen tanpa menggabungkan file yang sama', () => {
  const base = {
    id: 'attachment-1',
    source: 'Operational',
    job_id: 'job-1',
    container_number: null,
    file_name: 'dokumen.png',
    file_size: 100,
    mime_type: 'image/png',
  };
  const documents = mapInvoiceDocuments([
    { ...base, category: 'travelDocumentFile' },
    { ...base, id: 'attachment-2', category: 'loadingVoucherDocument' },
    { ...base, id: 'attachment-3', job_id: 'job-2', category: 'eirDocument' },
  ]);

  assert.equal(documents.length, 8);
  assert.deepEqual(documents.slice(0, 4).map((document) => document.label), [
    'EIR',
    'Surat Jalan',
    'Bon Muat / Bon Bongkar',
    'TILA / Delivery Card / Gatepass / SP2',
  ]);
  assert.equal(documents[0].ready, false);
  assert.equal(documents[1].ready, true);
  assert.equal(documents[2].ready, true);
  assert.equal(documents[1].file.path, 'attachment-1');
  assert.equal(documents[2].file.path, 'attachment-2');
  assert.equal(documents[0].jobReference, 'Container 1 (nomor belum diisi)');
  assert.equal(documents[4].jobReference, 'Container 2 (nomor belum diisi)');
});

test('dokumen tambahan operational ikut tampil di detail invoice finance', () => {
  const base = {
    source: 'Operational',
    job_id: 'job-1',
    container_number: 'CSGU23338220',
    file_size: 100,
    mime_type: 'application/pdf',
  };
  const documents = mapInvoiceDocuments([
    {
      ...base,
      id: 'attachment-sj',
      category: 'travelDocumentFile',
      reference_number: 'SJ-001',
      file_name: 'surat-jalan.pdf',
    },
    {
      ...base,
      id: 'attachment-other-1',
      category: 'otherDocument',
      notes: 'Foto segel',
      file_name: 'foto-segel.pdf',
    },
    {
      ...base,
      id: 'attachment-other-2',
      category: 'otherDocument',
      notes: 'Berita acara',
      file_name: 'berita-acara.pdf',
    },
  ]);

  const otherDocuments = documents.filter((document) => document.category === 'otherDocument');

  assert.equal(documents.length, 6);
  assert.deepEqual(otherDocuments.map((document) => document.label), ['Foto segel', 'Berita acara']);
  assert.deepEqual(otherDocuments.map((document) => document.file.name), ['foto-segel.pdf', 'berita-acara.pdf']);
  assert.equal(otherDocuments.every((document) => document.ready), true);
});

test('validasi koreksi Finance mewajibkan tipe, nomor baru, dan alasan', () => {
  assert.equal(normalizeFinanceCorrectionType('soNumber'), financeCorrectionTypes.soNumber);
  assert.equal(normalizeFinanceCorrectionType('invoice_number'), financeCorrectionTypes.invoiceNumber);

  assert.throws(
    () => validateFinanceCorrectionInput({ correctionType: 'so_number', requestedValue: 'SO-001', reason: '' }),
    (error) => error.code === 'FINANCE_CORRECTION_REASON_REQUIRED' && error.statusCode === 400,
  );
  assert.throws(
    () => validateFinanceCorrectionInput({ correctionType: 'invoice_number', requestedValue: '', reason: 'Salah input' }),
    (error) => error.code === 'FINANCE_CORRECTION_VALUE_REQUIRED' && error.statusCode === 400,
  );
});

test('koreksi Finance menentukan kebutuhan approval Admin dari status order', () => {
  assert.equal(
    isFinanceCorrectionAdminApprovalRequired({ status: 'draft', active_jobs_count: 0, billing_status: 'belum_invoice' }, 'so_number'),
    false,
  );
  assert.equal(
    isFinanceCorrectionAdminApprovalRequired({ status: 'confirmed', active_jobs_count: 1, billing_status: 'belum_invoice' }, 'so_number'),
    true,
  );
  assert.equal(
    isFinanceCorrectionAdminApprovalRequired({ status: 'completed', active_jobs_count: 0, billing_status: 'belum_dikirim' }, 'invoice_number'),
    true,
  );
});

test('reject koreksi Finance mewajibkan catatan Admin', async () => {
  await assert.rejects(
    () => rejectFinanceCorrection('correction-1', { reviewNote: '   ' }, { name: 'Admin Test', role: 'admin' }),
    (error) => error.code === 'FINANCE_CORRECTION_REJECT_NOTE_REQUIRED' && error.statusCode === 400,
  );
});

test('approval koreksi Finance membatasi catatan Admin maksimal 500 karakter', async () => {
  await assert.rejects(
    () => approveFinanceCorrection('correction-1', { reviewNote: 'a'.repeat(501) }, { name: 'Admin Test', role: 'admin' }),
    (error) => error.code === 'FINANCE_CORRECTION_REVIEW_NOTE_TOO_LONG' && error.statusCode === 400,
  );
});
