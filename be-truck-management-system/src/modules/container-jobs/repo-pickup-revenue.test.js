import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPO_REVENUE_PER_CONTAINER,
  buildRepoRevenueDescription,
  createRepoRevenueLines,
} from './repo-pickup-revenue.js';

// Tabel palsu yang meniru unique index uq_manual_revenue_lines_pickup_item.
function revenueClient() {
  const rows = [];
  const client = {
    async query(sql, params) {
      if (sql.includes('insert into manual_revenue_lines')) {
        assert.ok(sql.includes("'repo'"));
        assert.ok(sql.includes("'draft'"));
        const [salesOrderId, containerJobId, pickupItemId, description, amount, note, actorName] = params;
        if (rows.some((row) => row.container_pickup_item_id === pickupItemId)) return { rows: [] };
        const row = {
          id: `mrl-${rows.length + 1}`,
          sales_order_id: salesOrderId,
          container_job_id: containerJobId,
          container_pickup_item_id: pickupItemId,
          description,
          total_amount: amount,
          note,
          created_by_name: actorName,
          status: 'draft',
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.includes('from manual_revenue_lines')) {
        return { rows: rows.filter((row) => row.container_pickup_item_id === params[0]) };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return { client, rows };
}

const item = (id, jobId, salesOrderId, containerNumber) => ({
  id, job: { id: jobId, sales_order_id: salesOrderId, container_number: containerNumber },
});

test('tarif Revenue Repo Rp300.000 per container', () => {
  assert.equal(REPO_REVENUE_PER_CONTAINER, 300000);
  assert.equal(buildRepoRevenueDescription({ containerNumber: 'AAAU1111111', pickupType: 'single' }), 'Revenue Repo AAAU1111111');
  assert.equal(
    buildRepoRevenueDescription({ containerNumber: 'BBBU2222222', pickupType: 'combo_2x20' }),
    'Revenue Repo BBBU2222222 (Combo 2x20)',
  );
});

test('single Repo: satu baris revenue draft Rp300.000 untuk item, job, dan SO-nya', async () => {
  const { client, rows } = revenueClient();
  const lines = await createRepoRevenueLines(client, {
    movementId: 'mv-1', pickupType: 'single', items: [item('item-1', 'job-1', 'so-1', 'AAAU1111111')], actorName: 'Operational',
  });
  assert.equal(lines.length, 1);
  assert.deepEqual(rows.map((row) => [row.container_pickup_item_id, row.container_job_id, row.sales_order_id, row.total_amount, row.status]), [
    ['item-1', 'job-1', 'so-1', 300000, 'draft'],
  ]);
  assert.equal(rows[0].note, 'movement:mv-1');
});

test('combo 2x20: dua baris Rp300.000 (total Rp600.000), tiap baris ke SO job masing-masing', async () => {
  const { client, rows } = revenueClient();
  const lines = await createRepoRevenueLines(client, {
    movementId: 'mv-2',
    pickupType: 'combo_2x20',
    items: [item('item-a', 'job-a', 'so-a', 'AAAU1111111'), item('item-b', 'job-b', 'so-b', 'BBBU2222222')],
    actorName: 'Operational',
  });
  assert.equal(lines.length, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.total_amount, 0), 600000);
  assert.deepEqual(rows.map((row) => [row.container_job_id, row.sales_order_id]), [['job-a', 'so-a'], ['job-b', 'so-b']]);
});

test('dipanggil ulang untuk item yang sama tidak menggandakan revenue', async () => {
  const { client, rows } = revenueClient();
  const input = { movementId: 'mv-3', pickupType: 'single', items: [item('item-3', 'job-3', 'so-3', 'CCCU3333333')], actorName: 'Operational' };
  const first = await createRepoRevenueLines(client, input);
  const second = await createRepoRevenueLines(client, input);
  assert.equal(rows.length, 1);
  assert.equal(second[0].id, first[0].id);
});
