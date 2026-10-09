import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
// Kunci nilai env sebelum env.js dimuat (dotenv tidak menimpa variabel yang sudah ada).
process.env.MAX_UPLOAD_SIZE_MB = '5';
process.env.FINANCE_DOCUMENT_MAX_UPLOAD_SIZE_MB = '20';

const { env } = await import('../../config/env.js');
const { validateAttachmentFile } = await import('./attachments.service.js');

const MB = 1024 * 1024;
const financeLimit = { maxUploadBytes: env.financeDocumentMaxUploadBytes };

function pdfBuffer(size) {
  const buffer = Buffer.alloc(size, 0x20);
  buffer.write('%PDF-1.4', 0, 'utf8');
  return buffer;
}

function jpgBuffer(size) {
  const buffer = Buffer.alloc(size, 0);
  buffer[0] = 0xff; buffer[1] = 0xd8; buffer[2] = 0xff;
  return buffer;
}

const pdf = (size) => ({ fileName: 'invoice.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(size) });
const tooLarge = (maxMb) => (error) => error.code === 'FILE_TOO_LARGE' && error.statusCode === 400 && error.message === `Ukuran file melebihi batas ${maxMb} MB.`;

test('batas dokumen Finance terpisah dari batas upload umum', () => {
  assert.equal(env.maxUploadBytes, 5 * MB);
  assert.equal(env.financeDocumentMaxUploadBytes, 20 * MB);
});

test('batas umum: file <= 5 MB diterima, > 5 MB ditolak (lampiran non-Finance)', () => {
  assert.doesNotThrow(() => validateAttachmentFile(pdf(4 * MB)));
  assert.doesNotThrow(() => validateAttachmentFile(pdf(5 * MB)));
  assert.throws(() => validateAttachmentFile(pdf(5 * MB + 1)), tooLarge(5));
  assert.throws(() => validateAttachmentFile(pdf(12 * MB)), tooLarge(5));
  assert.throws(() => validateAttachmentFile({ fileName: 'foto.jpg', mimeType: 'image/jpeg', buffer: jpgBuffer(6 * MB) }), tooLarge(5));
});

test('batas dokumen Finance: PDF 4, 12, 19, dan tepat 20 MB diterima; > 20 MB ditolak', () => {
  for (const size of [4 * MB, 12 * MB, 19 * MB, 20 * MB]) {
    assert.doesNotThrow(() => validateAttachmentFile(pdf(size), financeLimit), `${size} bytes`);
  }
  assert.throws(() => validateAttachmentFile(pdf(20 * MB + 1), financeLimit), tooLarge(20));
  assert.throws(() => validateAttachmentFile(pdf(25 * MB), financeLimit), tooLarge(20));
});

test('batas Finance yang lebih besar tidak melonggarkan validasi tipe, ekstensi, atau isi file', () => {
  const small = pdfBuffer(1024);
  assert.throws(
    () => validateAttachmentFile({ fileName: 'invoice.txt', mimeType: 'text/plain', buffer: small }, financeLimit),
    (error) => error.code === 'INVALID_FILE_TYPE',
  );
  assert.throws(
    () => validateAttachmentFile({ fileName: 'invoice.exe', mimeType: 'application/pdf', buffer: small }, financeLimit),
    (error) => error.code === 'INVALID_FILE_EXTENSION',
  );
  assert.throws(
    () => validateAttachmentFile({ fileName: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(12 * MB, 0x41) }, financeLimit),
    (error) => error.code === 'INVALID_FILE_SIGNATURE',
  );
  // Tipe tidak valid tetap ditolak walau ukurannya juga melebihi batas.
  assert.throws(
    () => validateAttachmentFile({ fileName: 'arsip.zip', mimeType: 'application/zip', buffer: Buffer.alloc(25 * MB) }, financeLimit),
    (error) => error.code === 'INVALID_FILE_TYPE',
  );
});
