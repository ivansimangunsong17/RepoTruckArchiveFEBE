import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shouldRequireAssignmentAfterVendorRevert } from './container-jobs.repository.js';

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
  assert.match(source, /const nextHasDriverCommission = isVendorExecution \? false/i);
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

test('query komisi, utilisasi, dan ketersediaan armada mengecualikan vendor', () => {
  const commissions = read('../driver-commissions/driver-commissions.repository.js');
  const reports = read('../reports/reports.repository.js');
  const fleet = read('../operations/fleet-assignment/fleet-assignment.repository.js');

  assert.match(commissions, /coalesce\(cj\.execution_source, 'internal'\) = 'internal'/i);
  assert.match(reports, /const clauses = \[\.\.\.dateFilter\.clauses, "coalesce\(cj\.execution_source, 'internal'\) = 'internal'"\]/i);
  assert.match(reports, /const isInternal = \(row\.execution_source \|\| row\.executionSource \|\| 'internal'\) !== 'vendor'/i);
  assert.match(fleet, /coalesce\(execution_source, 'internal'\) = 'internal'/i);
});
