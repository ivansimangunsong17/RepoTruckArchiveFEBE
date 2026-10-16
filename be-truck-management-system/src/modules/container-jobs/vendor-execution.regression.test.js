import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  requireCompletedJobReady,
  shouldRequireAssignmentAfterVendorRevert,
} from './container-jobs.repository.js';
import { buildMonthlyComparisonRows } from '../reports/reports.repository.js';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('vendor yang dikembalikan menjadi internal wajib melewati validasi assignment', () => {
  assert.equal(shouldRequireAssignmentAfterVendorRevert('vendor', 'internal'), true);
  assert.equal(shouldRequireAssignmentAfterVendorRevert('vendor', 'vendor'), false);
  assert.equal(shouldRequireAssignmentAfterVendorRevert('internal', 'internal'), false);
  assert.equal(shouldRequireAssignmentAfterVendorRevert('vendor', 'internal', true), false);
});

test('migration execution source aman untuk data lama dan dapat dijalankan ulang', () => {
  const sql = read('../../db/migrations/202609250001_container_job_execution_source.sql');

  assert.match(sql, /add column if not exists execution_source text/i);
  assert.match(sql, /set execution_source = 'internal'\s+where execution_source is null/i);
  assert.match(sql, /alter column execution_source set default 'internal'/i);
  assert.match(sql, /alter column execution_source set not null/i);
  assert.match(sql, /if not exists[\s\S]*container_jobs_execution_source_check/i);
  assert.match(sql, /check \(execution_source in \('internal', 'vendor'\)\)/i);
});

test('backend menjadi pengaman vendor dari UJ, dropping, SPK, dan histori assignment internal', () => {
  const source = read('./container-jobs.repository.js');

  assert.match(source, /if \(isVendorExecution && !nextContainerNumber\)[\s\S]*CONTAINER_JOB_VENDOR_CONTAINER_NUMBER_REQUIRED/i);
  assert.match(source, /if \(isVendorExecution && \['repo_stored', 'inap'\]\.includes\(nextStatus\)\)/i);
  assert.match(source, /if \(\(job\.execution_source \|\| 'internal'\) === 'vendor'\) return;/i);
  assert.match(source, /ensureInternalExecution\(client, id, 'Rekening Dropping'\)/i);
  assert.match(source, /ensureInternalExecution\(client, id, 'Uang Jalan'\)/i);
  assert.match(source, /ensureInternalExecution\(client, id, 'SPK internal'\)/i);
  assert.match(source, /if \(!isVendorExecution && \(driverIdentityChanging \|\| vehicleIdentityChanging\)\)/i);
  assert.match(source, /const nextHasDriverCommission = isVendorExecution \|\| isRepoJob \? false/i);
});

test('ritasi vendor dapat diselesaikan tanpa driver, truck, atau SPK internal', async () => {
  const client = {
    async query(sql) {
      assert.match(sql, /from attachments/i);
      return { rows: [{ category: 'eirDocument' }] };
    },
  };

  const completedAt = await requireCompletedJobReady(client, 'job-vendor-1', {
    containerNumber: 'MSCU-123456-7',
    completedAt: '2026-10-16T10:00:00.000Z',
  }, {
    status: 'running',
    execution_source: 'vendor',
    running_at: '2026-10-16T08:00:00.000Z',
    driver_id: null,
    vehicle_id: null,
    spk_number: null,
  }, {
    isVendorExecution: true,
  });

  assert.equal(completedAt, '2026-10-16T10:00:00.000Z');
});

test('ritasi vendor tetap wajib memiliki lampiran EIR saat diselesaikan', async () => {
  const client = {
    async query() {
      return { rows: [] };
    },
  };

  await assert.rejects(
    requireCompletedJobReady(client, 'job-vendor-2', {
      containerNumber: 'MSCU-765432-1',
      completedAt: '2026-10-16T10:00:00.000Z',
    }, {
      status: 'running',
      execution_source: 'vendor',
      running_at: '2026-10-16T08:00:00.000Z',
    }, {
      isVendorExecution: true,
    }),
    (error) => error.code === 'CONTAINER_JOB_COMPLETION_INCOMPLETE'
      && /lampiran EIR/i.test(error.message),
  );
});

test('ritasi internal tetap wajib memiliki driver dan truck saat diselesaikan', async () => {
  const client = {
    async query() {
      throw new Error('Query lampiran tidak boleh dijalankan sebelum assignment valid.');
    },
  };

  await assert.rejects(
    requireCompletedJobReady(client, 'job-internal-1', {
      containerNumber: 'MSCU-111111-1',
      completedAt: '2026-10-16T10:00:00.000Z',
    }, {
      status: 'running',
      execution_source: 'internal',
      running_at: '2026-10-16T08:00:00.000Z',
    }),
    (error) => error.code === 'CONTAINER_JOB_COMPLETION_INCOMPLETE'
      && /driver/i.test(error.message),
  );
});

test('status pemenuhan SO tetap menghitung job internal dan vendor bersama-sama', () => {
  const source = read('./container-jobs.repository.js');
  const refreshStatus = source.slice(
    source.indexOf('async function refreshOrderStatus'),
    source.indexOf('function ensureSalesOrderVerifiedForOperational'),
  );

  assert.match(refreshStatus, /from container_jobs\s+where sales_order_id = \$1\s+group by status/i);
  assert.doesNotMatch(refreshStatus, /execution_source/i);
});

test('Sales Order selalu memakai lifecycle container job normal', () => {
  const mapper = read('../sales-orders/sales-orders.mapper.js');
  const repository = read('../sales-orders/sales-orders.repository.js');

  assert.match(mapper, /is_vendor_order:\s*false/i);
  assert.doesNotMatch(repository, /if \(!payload\.is_vendor_order\)/i);
  assert.doesNotMatch(repository, /if \(payload\.is_vendor_order\)/i);
  assert.match(repository, /for \(const container of form\.containers \|\| \[\]\)/i);
  assert.match(repository, /reconcileSalesOrderContainers\(form\.containers \|\| \[\], currentJobs\.rows\)/i);
});

test('konversi SO vendor lama bersifat dry-run kecuali diminta eksplisit', () => {
  const script = read('../../../scripts/convert-legacy-vendor-orders.js');

  assert.match(script, /const applyChanges = process\.argv\.includes\('--apply'\)/i);
  assert.match(script, /if \(!applyChanges \|\| orders\.length === 0\) return/i);
  assert.match(script, /execution_source, container_number, container_size/i);
  assert.match(script, /update sales_orders set is_vendor_order = false/i);
});

test('query komisi, utilisasi, dan ketersediaan armada mengecualikan vendor', () => {
  const commissions = read('../driver-commissions/driver-commissions.repository.js');
  const reports = read('../reports/reports.repository.js');
  const fleet = read('../operations/fleet-assignment/fleet-assignment.repository.js');

  assert.match(commissions, /coalesce\(cj\.execution_source, 'internal'\) = 'internal'/i);
  assert.match(reports, /const clauses = \[\.\.\.dateFilter\.clauses, "coalesce\(cj\.execution_source, 'internal'\) = 'internal'"\]/i);
  assert.match(fleet, /coalesce\(execution_source, 'internal'\) = 'internal'/i);
});

test('monthly comparison counts internal trips while excluding vendor trips', () => {
  const rows = buildMonthlyComparisonRows([
    { execution_source: 'internal', completed_at: '2026-09-25T03:00:00.000Z' },
    { execution_source: 'vendor', completed_at: '2026-09-25T04:00:00.000Z' },
  ], [], { year: 2026, activeTruckCount: 1 }, new Date('2026-10-09T00:00:00.000Z'));
  assert.equal(rows[8].totalTrips, 1);
});

test('container titip dengan komisi valid langsung eligible masuk batch komisi', () => {
  const source = read('./container-jobs.repository.js');

  assert.match(source, /if \(\['completed', 'repo_stored'\]\.includes\(jobStatus\)\) return 'with_commission'/i);
});
