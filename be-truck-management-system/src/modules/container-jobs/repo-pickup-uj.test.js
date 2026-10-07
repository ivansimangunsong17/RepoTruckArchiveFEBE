import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPO_UJ_SOURCE,
  buildRepoUjDescription,
  normalizeRepoUjAmount,
  postRepoUjToDroppingAccount,
} from './repo-pickup-uj.js';

// Ledger palsu yang meniru unique index uq_operational_fund_transactions_repo_uj.
function ledgerClient() {
  const rows = [];
  const batches = [];
  const client = {
    async query(sql, params) {
      if (sql.includes('insert into operational_fund_transactions')) {
        const [batchId, transactionDate, amount, description, topName, driverName, source, sourceRefId] = params;
        assert.equal(source, REPO_UJ_SOURCE);
        assert.ok(sql.includes("'debit', 'uj_order'"));
        if (rows.some((row) => row.source === source && row.source_ref_id === sourceRefId && row.status === 'posted')) {
          return { rows: [] };
        }
        const row = {
          id: `oft-${rows.length + 1}`,
          batch_id: batchId,
          transaction_date: transactionDate,
          amount,
          description,
          top_name: topName,
          driver_name: driverName,
          source,
          source_ref_id: sourceRefId,
          status: 'posted',
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.includes('from operational_fund_transactions')) {
        return { rows: rows.filter((row) => row.source === params[0] && row.source_ref_id === params[1]) };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const ensureBatch = async (_client, batchDate, actorName) => {
    batches.push({ batchDate, actorName });
    return { id: 'batch-1', batch_date: batchDate, status: 'open' };
  };
  return { client, rows, batches, ensureBatch };
}

test('Total UJ Repo: wajib, angka bulat, tidak negatif, 0 boleh', () => {
  assert.equal(normalizeRepoUjAmount({ repoUjAmount: 150000 }), 150000);
  assert.equal(normalizeRepoUjAmount({ repoUjAmount: '175000' }), 175000);
  assert.equal(normalizeRepoUjAmount({ repoUjAmount: 0 }), 0);
  assert.equal(normalizeRepoUjAmount({ repoUjAmount: '0' }), 0);
  assert.throws(() => normalizeRepoUjAmount({}), { code: 'REPO_UJ_AMOUNT_REQUIRED', statusCode: 400 });
  assert.throws(() => normalizeRepoUjAmount({ repoUjAmount: '' }), { code: 'REPO_UJ_AMOUNT_REQUIRED' });
  assert.throws(() => normalizeRepoUjAmount({ repoUjAmount: -1 }), { code: 'REPO_UJ_AMOUNT_NEGATIVE', statusCode: 400 });
  assert.throws(() => normalizeRepoUjAmount({ repoUjAmount: '-150000' }), { code: 'REPO_UJ_AMOUNT_NEGATIVE' });
  assert.throws(() => normalizeRepoUjAmount({ repoUjAmount: 1500.5 }), { code: 'REPO_UJ_AMOUNT_INVALID' });
  assert.throws(() => normalizeRepoUjAmount({ repoUjAmount: 'abc' }), { code: 'REPO_UJ_AMOUNT_INVALID' });
});

test('satu movement single memposting tepat satu debit UJ Repo', async () => {
  const ledger = ledgerClient();
  const posted = await postRepoUjToDroppingAccount(ledger.client, {
    movementId: 'movement-single',
    amount: 150000,
    batchDate: '2026-10-07',
    ensureBatch: ledger.ensureBatch,
    description: buildRepoUjDescription({ pickupType: 'single', plateNumber: 'B 9123 XX', containerNumbers: ['MSCU1234567'] }),
    driverName: 'ALIUDIN',
    actorName: 'Operational',
  });
  assert.equal(ledger.rows.length, 1);
  assert.equal(posted.amount, 150000);
  assert.equal(posted.source_ref_id, 'movement-single');
  assert.equal(ledger.rows[0].driver_name, 'ALIUDIN');
  assert.equal(ledger.rows[0].description, 'UJ Repo - B 9123 XX - MSCU1234567');
  assert.deepEqual(ledger.batches, [{ batchDate: '2026-10-07', actorName: 'Operational' }]);
});

test('combo 2x20 tetap satu debit untuk total UJ, bukan per container', async () => {
  const ledger = ledgerClient();
  await postRepoUjToDroppingAccount(ledger.client, {
    movementId: 'movement-combo',
    amount: 175000,
    batchDate: '2026-10-07',
    ensureBatch: ledger.ensureBatch,
    description: buildRepoUjDescription({ pickupType: 'combo_2x20', plateNumber: 'B 9123 XX', containerNumbers: ['AAAU1111111', 'BBBU2222222'] }),
    driverName: 'ALIUDIN',
    actorName: 'Operational',
  });
  assert.equal(ledger.rows.length, 1);
  assert.equal(ledger.rows[0].amount, 175000);
  assert.equal(ledger.rows[0].description, 'UJ Repo Combo 2x20 - B 9123 XX - AAAU1111111 + BBBU2222222');
});

test('posting ulang untuk movement yang sama tidak menggandakan debit', async () => {
  const ledger = ledgerClient();
  const input = {
    movementId: 'movement-retry',
    amount: 200000,
    batchDate: '2026-10-07',
    ensureBatch: ledger.ensureBatch,
    actorName: 'Operational',
  };
  const first = await postRepoUjToDroppingAccount(ledger.client, input);
  const second = await postRepoUjToDroppingAccount(ledger.client, input);
  assert.equal(ledger.rows.length, 1);
  assert.equal(second.id, first.id);
  assert.equal(second.amount, 200000);
});

test('UJ Repo 0 tidak membuat debit dan tidak membuka batch', async () => {
  const ledger = ledgerClient();
  const posted = await postRepoUjToDroppingAccount(ledger.client, {
    movementId: 'movement-zero',
    amount: 0,
    batchDate: '2026-10-07',
    ensureBatch: ledger.ensureBatch,
    actorName: 'Operational',
  });
  assert.equal(posted, null);
  assert.equal(ledger.rows.length, 0);
  assert.equal(ledger.batches.length, 0);
});

test('gagal membuka batch (misal batch ditutup) melempar error tanpa menulis ledger', async () => {
  const ledger = ledgerClient();
  const closedBatch = async () => {
    const error = new Error('Batch rekening dropping tanggal ini sudah ditutup.');
    error.code = 'OPERATIONAL_FUND_BATCH_CLOSED';
    throw error;
  };
  await assert.rejects(postRepoUjToDroppingAccount(ledger.client, {
    movementId: 'movement-closed',
    amount: 150000,
    batchDate: '2026-10-07',
    ensureBatch: closedBatch,
    actorName: 'Operational',
  }), { code: 'OPERATIONAL_FUND_BATCH_CLOSED' });
  assert.equal(ledger.rows.length, 0);
});
