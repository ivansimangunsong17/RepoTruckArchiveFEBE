import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  assertDriverCommissionProofPayload,
  submitDriverCommissionBatch,
} = await import('./driver-commissions.service.js');

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

test('submit batch komisi menolak periode selain Kamis sampai Rabu', async () => {
  await assert.rejects(
    () => submitDriverCommissionBatch({ periodStart: '2026-08-13', periodEnd: '2026-08-18' }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.match(error.message, /Kamis sampai Rabu/i);
      return true;
    },
  );
});
