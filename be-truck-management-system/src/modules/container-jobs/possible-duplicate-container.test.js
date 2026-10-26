// Pengaman nomor container ganda: klasifikasi blokir vs peringatan, lock, dan pesan -- tanpa database.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertContainerNumberAllowed,
  BLOCKING_CONTAINER_JOB_STATUSES,
  buildContainerNumberInUseError,
  buildPossibleDuplicateContainerError,
  findContainerNumberConflicts,
  POSSIBLE_DUPLICATE_CONTAINER_LOOKBACK_DAYS,
} from './container-number-guard.js';

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: /pg_advisory_xact_lock/.test(sql) ? [] : rows };
    },
  };
}

test('nomor kosong atau tidak berubah tidak memicu query (edit job lain tetap bisa disimpan)', async () => {
  const db = fakeDb([{ id: 'j-run', sales_order_id: 'so-2', status: 'running' }]);
  assert.deepEqual(await assertContainerNumberAllowed(db, { containerNumber: '  ' }), []);
  assert.deepEqual(await assertContainerNumberAllowed(db, { containerNumber: 'situ2688029 ', previousContainerNumber: 'SITU2688029' }), []);
  assert.equal(db.calls.length, 0);
});

test('klasifikasi: job aktif/titip memblokir, job selesai hanya peringatan', async () => {
  const db = fakeDb([
    { id: 'j-repo', sales_order_id: 'so-2', status: 'repo_stored', so_number: 'SO-2', driver_name: 'Sopir A' },
    { id: 'j-run', sales_order_id: 'so-3', status: 'running', so_number: 'SO-3' },
    { id: 'j-same', sales_order_id: 'so-1', status: 'completed', so_number: 'SO-1' },
    { id: 'j-done', sales_order_id: 'so-4', status: 'completed', so_number: 'SO-4' },
  ]);
  const matches = await findContainerNumberConflicts(db, { containerNumber: ' situ2688029 ', jobId: 'j-self', salesOrderId: 'so-1' });
  assert.deepEqual(db.calls[0].params, ['SITU2688029', 'j-self', 'so-1', BLOCKING_CONTAINER_JOB_STATUSES, POSSIBLE_DUPLICATE_CONTAINER_LOOKBACK_DAYS]);
  assert.match(db.calls[0].sql, /cj\.status <> 'cancelled'/);
  assert.match(db.calls[0].sql, /so\.status <> 'cancelled'/);
  assert.deepEqual(matches.map((match) => [match.reason, match.blocking]), [
    ['repo_stored', true], ['active', true], ['same_sales_order', false], ['recently_completed', false],
  ]);
});

test('container aktif/titip ditolak walau dikonfirmasi; lock diambil sebelum pengecekan', async () => {
  const db = fakeDb([{ id: 'j-repo', sales_order_id: 'so-2', status: 'repo_stored', so_number: 'SO-2' }]);
  await assert.rejects(
    assertContainerNumberAllowed(db, { containerNumber: 'SITU2688029', jobId: 'j-new', salesOrderId: 'so-9', confirmed: true }),
    (error) => error.code === 'CONTAINER_NUMBER_IN_ACTIVE_JOB' && error.statusCode === 409 && /Ambil Titip/.test(error.message),
  );
  assert.match(db.calls[0].sql, /pg_advisory_xact_lock/);
  assert.deepEqual(db.calls[0].params, ['SITU2688029']);
});

test('pemakaian ulang setelah selesai: ditahan tanpa konfirmasi, lolos dengan konfirmasi', async () => {
  const rows = [{ id: 'j-done', sales_order_id: 'so-4', status: 'completed', so_number: 'SO-4' }];
  await assert.rejects(
    assertContainerNumberAllowed(fakeDb(rows), { containerNumber: 'MSKU5721094', jobId: 'j-new', salesOrderId: 'so-9' }),
    { code: 'CONTAINER_NUMBER_POSSIBLE_DUPLICATE' },
  );
  const matches = await assertContainerNumberAllowed(fakeDb(rows), { containerNumber: 'MSKU5721094', jobId: 'j-new', salesOrderId: 'so-9', confirmed: 'true' });
  assert.equal(matches.length, 1);
});

test('pesan blokir dan peringatan', () => {
  const stored = buildContainerNumberInUseError('SITU2688029', [{ reason: 'repo_stored', status: 'repo_stored', soNumber: 'SO-2' }]);
  assert.match(stored.message, /masih dititip pada SO-2/);
  assert.match(stored.message, /Ambil Titip/);
  const running = buildContainerNumberInUseError('MSDU1645703', [{ reason: 'active', status: 'running', soNumber: 'SO-3' }]);
  assert.match(running.message, /masih Sedang Jalan pada SO-3/);
  const warning = buildPossibleDuplicateContainerError('MSKU5721094', [{ reason: 'recently_completed', soNumber: 'SO-4' }]);
  assert.equal(warning.code, 'CONTAINER_NUMBER_POSSIBLE_DUPLICATE');
  assert.match(warning.message, /pemakaian ulang/);
});
