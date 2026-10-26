// Regresi P0-1 (running -> inap -> running -> completed) terhadap PostgreSQL sungguhan, lewat service
// dengan payload yang sama seperti frontend (Tandai Inap / edit form / Selesai Inap / closing).
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard. Fixture dihapus di akhir.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('container job inap integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const { saveContainerJob } = await import('../modules/container-jobs/container-jobs.service.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  const operational = { role: 'operational', name: `Ops Inap ${tag}` };
  const startedAt = '2026-10-20T01:00:00.000Z';
  const ids = { salesOrders: [], drivers: [], vehicles: [], jobs: [] };

  async function cloneRow(table, templateSql, overrides) {
    const result = await query(
      `insert into ${table}
       select (jsonb_populate_record(null::${table}, to_jsonb(t) || $1::jsonb)).*
       from (${templateSql}) t returning *`,
      [JSON.stringify({ id: crypto.randomUUID(), ...overrides })],
    );
    assert.ok(result.rows[0], `Template ${table} tidak ditemukan -- jalankan seed sintetis di database scratch.`);
    return result.rows[0];
  }

  async function createRunningJob() {
    const driver = (await query(
      "insert into drivers (name, operational_status) values ($1, 'Bertugas') returning id, name",
      [`SOPIR INAP ${tag}`],
    )).rows[0];
    ids.drivers.push(driver.id);
    const vehicle = (await query(
      "insert into vehicles (unit_code, plate_number, container_size, operational_status) values ($1, $2, '20FT', 'Bertugas') returning id, plate_number",
      [`INP-${tag}`, `B ${tag} INP`],
    )).rows[0];
    ids.vehicles.push(vehicle.id);
    const so = await cloneRow('sales_orders', `
      select * from sales_orders
      where status <> 'cancelled' and coalesce(is_vendor_order, false) = false
      order by created_at limit 1
    `, {
      so_number: `SO-INP-${tag}`, accurate_so_number: null, finance_verification_status: 'pending_so',
      status: 'running', entry_source: 'realtime', historical_period: null, is_vendor_order: false,
      invoice_number: null, billing_status: 'belum_invoice', debit_note_document_uploaded_at: null,
    });
    ids.salesOrders.push(so.id);
    const job = await cloneRow('container_jobs', `
      select * from container_jobs
      where coalesce(execution_source, 'internal') = 'internal'
      order by created_at limit 1
    `, {
      sales_order_id: so.id,
      container_number: `IN${tag}001`,
      container_size: '20FT',
      execution_source: 'internal',
      status: 'running',
      running_at: startedAt,
      completed_at: null, cancelled_at: null, repo_stored_at: null, repo_picked_up_at: null,
      inap_started_at: null, inap_ended_at: null, inap_reason: null,
      driver_id: driver.id, vehicle_id: vehicle.id, assignment_group_id: null,
      assignment_snapshot: { driver: driver.name, plateNumber: vehicle.plate_number },
      // UJ sudah approved supaya test tidak menyentuh rekening dropping.
      rpuj_status: 'approved', spk_number: `SPK-${tag}`,
      entry_source: 'realtime', is_backdate_entry: false,
      has_driver_commission: false, driver_commission_amount: 0,
    });
    ids.jobs.push(job.id);
    return { job, driver, vehicle };
  }

  async function jobRow(id) {
    return (await query('select status, running_at, inap_started_at, inap_ended_at from container_jobs where id = $1', [id])).rows[0];
  }

  test.after(async () => {
    try {
      if (ids.jobs.length) await query("delete from attachments where entity_type = 'container_job' and entity_id = any($1::uuid[])", [ids.jobs]);
      if (ids.salesOrders.length) await query('delete from sales_orders where id = any($1::uuid[])', [ids.salesOrders]);
      if (ids.vehicles.length) await query('delete from vehicles where id = any($1::uuid[])', [ids.vehicles]);
      if (ids.drivers.length) await query('delete from drivers where id = any($1::uuid[])', [ids.drivers]);
    } finally {
      await closePool();
    }
  });

  test('running -> inap -> edit -> Selesai Inap -> closing tanpa mengirim ulang runningAt', async () => {
    const { job, driver, vehicle } = await createRunningJob();
    const assignment = { containerNumber: job.container_number, driver: driver.name, plateNumber: vehicle.plate_number };

    // Tandai Inap (payload OperationsPage.submitInap).
    await saveContainerJob(job.id, { status: 'inap', inapReason: 'Curfew malam di rest area KM 57', inapNotes: '', updatedBy: operational.name }, operational);
    let row = await jobRow(job.id);
    assert.equal(row.status, 'inap');
    assert.equal(new Date(row.running_at).toISOString(), startedAt);

    // Edit data job inap dari form (status tetap inap, tidak auto-resume).
    await saveContainerJob(job.id, { ...assignment, status: 'inap', notes: 'Update catatan', updatedBy: operational.name }, operational);
    row = await jobRow(job.id);
    assert.equal(row.status, 'inap');
    assert.equal(row.inap_ended_at, null);

    // Selesai Inap (payload OperationsPage.resumeFromInap, tanpa runningAt).
    await saveContainerJob(job.id, { ...assignment, status: 'running', updatedBy: operational.name }, operational);
    row = await jobRow(job.id);
    assert.equal(row.status, 'running');
    assert.equal(new Date(row.running_at).toISOString(), startedAt);
    assert.ok(row.inap_ended_at);

    // Closing tanpa runningAt.
    for (const category of ['spkDocument', 'eirDocument']) {
      await query(
        "insert into attachments (entity_type, entity_id, category, file_name) values ('container_job', $1, $2, $3)",
        [job.id, category, `${category}-${tag}.pdf`],
      );
    }
    const completedAt = '2026-10-21T03:00:00.000Z';
    await saveContainerJob(job.id, { ...assignment, status: 'completed', completedAt, updatedBy: operational.name }, operational);
    row = await jobRow(job.id);
    assert.equal(row.status, 'completed');
    assert.equal(new Date(row.running_at).toISOString(), startedAt);
  });
}
