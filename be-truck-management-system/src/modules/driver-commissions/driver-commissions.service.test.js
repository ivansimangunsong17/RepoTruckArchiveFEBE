import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  assertDriverCommissionProofPayload,
  submitDriverCommissionBatch,
} = await import('./driver-commissions.service.js');

const __dirname = dirname(fileURLToPath(import.meta.url));

test('query komisi mengecualikan item kedua combo pickup 2x20', () => {
  const source = readFileSync(join(__dirname, 'driver-commissions.repository.js'), 'utf8');
  assert.match(source, /container_pickup_items cpi/i);
  assert.match(source, /container_pickup_movements cpm/i);
  assert.match(source, /not \(cpm\.pickup_type = 'combo_2x20' and coalesce\(cpi\.sequence_no, 1\) > 1\)/i);
});

test('query komisi container titip memakai tanggal masuk penitipan sebagai tanggal komisi', () => {
  const source = readFileSync(join(__dirname, 'driver-commissions.repository.js'), 'utf8');
  assert.match(source, /coalesce\(cj\.repo_stored_at, cj\.completed_at\) at time zone 'Asia\/Jakarta'\)::date as completed_date/i);
  assert.match(source, /coalesce\(cj\.repo_stored_at, cj\.completed_at\) as completed_at/i);
  assert.doesNotMatch(source, /and \(cj\.completed_at at time zone 'Asia\/Jakarta'\)::date between \$1::date and \$2::date/i);
});

test('validasi bukti transfer komisi menolak payload kosong', () => {
  assert.throws(
    () => assertDriverCommissionProofPayload({}),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.deepEqual(error.details, ['fileName', 'mimeType', 'fileBase64']);
      return true;
    },
  );
});

test('validasi bukti transfer komisi menerima payload file lengkap', () => {
  assert.doesNotThrow(() => assertDriverCommissionProofPayload({
    fileName: 'bukti.png',
    mimeType: 'image/png',
    fileBase64: 'data:image/png;base64,AAA=',
  }));
});

test('submit batch komisi menolak periode selain Minggu sampai Sabtu', async () => {
  await assert.rejects(
    () => submitDriverCommissionBatch({ periodStart: '2026-08-09', periodEnd: '2026-08-14' }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.match(error.message, /Minggu sampai Sabtu/i);
      return true;
    },
  );
});
