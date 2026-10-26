// Biaya Titip/Repo Rp300.000 sebagai item Reimbursement SO: tepat sekali, tanpa database.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRepoStorageFeeDescription,
  recordRepoStorageFee,
  REPO_STORAGE_FEE_AMOUNT,
  repoStorageFeeIdempotencyKey,
  repoStorageFeeSkipReason,
} from './repo-storage-fee.js';

// Tabel palsu container_job_expenses yang meniru unique index idempotency_key.
function feeClient({ debitNoteIssued = false, legacyRepoRevenue = false, manualRepoReimbursement = false } = {}) {
  const expenses = [];
  const calls = [];
  return {
    expenses,
    calls,
    async query(sql, params) {
      calls.push(sql);
      if (sql.includes('from sales_orders so') && sql.includes('for update of so')) {
        return { rows: [{ id: params[0], debit_note_issued: debitNoteIssued }] };
      }
      if (sql.includes('from manual_revenue_lines')) return { rows: legacyRepoRevenue ? [{ id: 'mrl-1' }] : [] };
      if (sql.includes("ilike '%titip%'")) return { rows: manualRepoReimbursement ? [{ id: 'exp-manual' }] : [] };
      if (sql.startsWith('select id from container_job_expenses where idempotency_key')) {
        return { rows: expenses.filter((row) => row.idempotency_key === params[0]) };
      }
      if (sql.includes('insert into container_job_expenses')) {
        assert.match(sql, /'reimbursement', 'reimbursement'/);
        const [salesOrderId, jobId, amount, description, recipientName, paymentStatus, financeCheckStatus, financeNote, source, sourceRefId, key, actor] = params;
        if (expenses.some((row) => row.idempotency_key === key)) return { rows: [] };
        const row = {
          id: `exp-${expenses.length + 1}`, sales_order_id: salesOrderId, container_job_id: jobId, amount, description,
          recipient_name: recipientName, payment_status: paymentStatus, finance_check_status: financeCheckStatus,
          finance_note: financeNote, source, source_ref_id: sourceRefId, idempotency_key: key, created_by_name: actor,
        };
        expenses.push(row);
        return { rows: [{ id: row.id }] };
      }
      throw new Error(`Query tidak terduga: ${sql}`);
    },
  };
}

const job = { id: 'job-1', sales_order_id: 'so-1', container_number: 'SITU2688029', customer_name: 'PT Customer', repo_stored_at: null };

test('titip pertama: satu item Reimbursement Rp300.000 pada SO job, tanpa transaksi Rekening Dropping', async () => {
  const client = feeClient();
  const result = await recordRepoStorageFee(client, { job, actorName: 'Ops' });
  assert.equal(result.status, 'created');
  assert.equal(client.expenses.length, 1);
  const [fee] = client.expenses;
  assert.deepEqual(
    [fee.sales_order_id, fee.container_job_id, fee.amount, fee.description, fee.payment_status, fee.finance_check_status, fee.idempotency_key],
    ['so-1', 'job-1', REPO_STORAGE_FEE_AMOUNT, 'Biaya Titip/Repo SITU2688029', 'belum_dibayar', 'belum_dicek', repoStorageFeeIdempotencyKey('job-1')],
  );
  assert.equal(REPO_STORAGE_FEE_AMOUNT, 300000);
  assert.equal(client.calls.some((sql) => sql.includes('operational_fund_transactions')), false);
});

test('retry/simpan ulang/request kedua: tidak membuat item kedua', async () => {
  const client = feeClient();
  await recordRepoStorageFee(client, { job, actorName: 'Ops' });
  const again = await recordRepoStorageFee(client, { job, actorName: 'Ops' });
  assert.equal(again.status, 'already_recorded');
  assert.equal(client.expenses.length, 1);
});

test('kebijakan data lama: input historis dan job yang sudah pernah dititip tidak ditagih otomatis', async () => {
  assert.equal(repoStorageFeeSkipReason({ job, entrySource: 'historical' }), 'historical_entry');
  assert.equal(repoStorageFeeSkipReason({ job: { ...job, entry_source: 'historical' }, entrySource: undefined }), 'historical_entry');
  assert.equal(repoStorageFeeSkipReason({ job: { ...job, repo_stored_at: '2026-09-01T03:00:00.000Z' } }), 'previously_stored');
  assert.equal(repoStorageFeeSkipReason({ job }), null);

  const client = feeClient();
  assert.deepEqual(await recordRepoStorageFee(client, { job, actorName: 'Ops', entrySource: 'historical' }), { status: 'skipped', reason: 'historical_entry' });
  assert.deepEqual(
    await recordRepoStorageFee(client, { job: { ...job, repo_stored_at: '2026-09-01T03:00:00.000Z' }, actorName: 'Ops' }),
    { status: 'skipped', reason: 'previously_stored' },
  );
  assert.equal(client.calls.length, 0, 'tidak menyentuh database sama sekali');
});

test('Revenue Repo lama atau reimbursement titip manual pada job yang sama: tidak dihitung ganda', async () => {
  const legacy = feeClient({ legacyRepoRevenue: true });
  assert.deepEqual(await recordRepoStorageFee(legacy, { job, actorName: 'Ops' }), { status: 'skipped', reason: 'legacy_repo_revenue' });
  assert.equal(legacy.expenses.length, 0);

  const manual = feeClient({ manualRepoReimbursement: true });
  assert.deepEqual(await recordRepoStorageFee(manual, { job, actorName: 'Ops' }), { status: 'skipped', reason: 'existing_reimbursement' });
  assert.equal(manual.expenses.length, 0);
});

test('Debit Note SO sudah terbit: tidak ditagih, pengecualian tercatat persisten untuk Finance', async () => {
  const client = feeClient({ debitNoteIssued: true });
  const result = await recordRepoStorageFee(client, { job, actorName: 'Ops' });
  assert.equal(result.status, 'pending_finance_decision');
  assert.equal(result.warning.code, 'REPO_STORAGE_FEE_DEBIT_NOTE_ISSUED');
  assert.match(result.warning.message, /Perlu Klarifikasi/);
  assert.equal(client.expenses.length, 1);
  const [pending] = client.expenses;
  assert.equal(pending.payment_status, 'batal', 'tidak ikut nominal Debit Note');
  assert.equal(pending.finance_check_status, 'perlu_klarifikasi');
  assert.match(pending.finance_note, /keputusan Finance/);
  // Penitipan berikutnya tidak membuat tagihan otomatis kedua.
  assert.equal((await recordRepoStorageFee(client, { job, actorName: 'Ops' })).status, 'already_recorded');
  assert.equal(client.expenses.length, 1);
});

test('deskripsi tanpa nomor container tetap terbaca', () => {
  assert.equal(buildRepoStorageFeeDescription(''), 'Biaya Titip/Repo');
});
