import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const { rejectRpuj } = await import('./finance.service.js');
const { mapInvoiceDocuments } = await import('./finance.repository.js');

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
