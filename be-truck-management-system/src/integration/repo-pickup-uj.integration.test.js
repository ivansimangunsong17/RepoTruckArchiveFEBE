// Integrasi UJ Repo (Phase 3) terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi DAN lolos scratch-db-guard (database
// scratch lokal), bukan database dev/production, karena test ini menulis data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prepareScratchDatabase } from '../test-support/scratch-db-guard.js';

const scratch = await prepareScratchDatabase();

if (scratch.skip) {
  test('repo UJ integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: scratch.skip }, () => {});
} else {
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, withTransaction, closePool } = await import('../db/client.js');
  const {
    pickupComboRepoContainerJobs,
    pickupSingleRepoContainerJob,
    syncAutoJourneyMoneyExpense,
  } = await import('../modules/container-jobs/container-jobs.repository.js');
  const { lockRepoPickupMovementForJob, reconcileRepoPickupMovement } = await import('../modules/container-jobs/repo-pickup-lifecycle.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(2, '0')}`;

  async function cloneRow(table, templateSql, overrides) {
    const result = await query(
      `
        insert into ${table}
        select (jsonb_populate_record(null::${table}, to_jsonb(t) || $1::jsonb)).*
        from (${templateSql}) t
        returning *
      `,
      [JSON.stringify({ id: crypto.randomUUID(), ...overrides })],
    );
    return result.rows[0];
  }

  async function createRepoStoredJob({ ujSnapshot = 123000 } = {}) {
    const number = `PHU${nextTag()}`.padEnd(11, '0').slice(0, 11);
    return cloneRow('container_jobs', `
      select * from container_jobs
      where coalesce(execution_source, 'internal') = 'internal'
      order by created_at limit 1
    `, {
      status: 'repo_stored',
      container_number: number,
      container_size: '20FT',
      repo_location: `Repo Test ${tag}`,
      driver_id: null,
      vehicle_id: null,
      entry_source: 'realtime',
      is_backdate_entry: false,
      running_at: null,
      completed_at: null,
      cancelled_at: null,
      repo_picked_up_at: null,
      rpuj_status: 'pending',
      uj_amount_snapshot: ujSnapshot,
    });
  }

  async function createDriver() {
    const name = `SOPIR TEST ${nextTag()}`;
    return cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', {
      name, nik: null, operational_status: 'Aktif', archived_at: null,
    });
  }

  async function createVehicle(size) {
    const code = nextTag();
    return cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', {
      plate_number: `B ${code} TST`,
      unit_code: `TST-${code}`,
      engine_number: null,
      kir_number: null,
      vin: null,
      container_size: size,
      current_chassis_id: null,
      operational_status: 'Aktif',
      archived_at: null,
    });
  }

  async function repoUjDebits(movementId) {
    const result = await query(
      "select * from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1 and status = 'posted'",
      [String(movementId)],
    );
    return result.rows;
  }

  async function jobFinancialState(jobId) {
    const job = await query('select uj_amount_snapshot, uj_snapshot_source from container_jobs where id = $1', [jobId]);
    const expenses = await query('select count(*)::int as n from container_job_expenses where container_job_id = $1', [jobId]);
    const ledger = await query('select count(*)::int as n from operational_fund_transactions where container_job_id = $1', [jobId]);
    return { ...job.rows[0], expenses: expenses.rows[0].n, ledger: ledger.rows[0].n };
  }

  function pickupPayload(driver, vehicle, extra = {}) {
    return { pickupConfirmed: true, repoPickedUpAt: new Date().toISOString(), driverId: driver.id, vehicleId: vehicle.id, updatedBy: 'Integration Test', ...extra };
  }

  test.after(async () => {
    await closePool();
  });

  test('single Repo UJ 150000: satu movement, satu debit 150000, UJ job asli tidak berubah', async () => {
    const job = await createRepoStoredJob();
    const driver = await createDriver();
    const vehicle = await createVehicle('20FT');
    const before = await jobFinancialState(job.id);

    const result = await pickupSingleRepoContainerJob(job.id, pickupPayload(driver, vehicle, { repoUjAmount: 150000 }));

    assert.equal(Number(result.movement.repo_uj_amount), 150000);
    const debits = await repoUjDebits(result.movement.id);
    assert.equal(debits.length, 1);
    assert.equal(Number(debits[0].amount), 150000);
    assert.equal(debits[0].transaction_type, 'debit');
    assert.equal(debits[0].category, 'uj_order');
    assert.equal(debits[0].container_job_id, null);
    assert.equal(debits[0].driver_name, driver.name);
    assert.match(debits[0].description, new RegExp(`UJ Repo - ${vehicle.plate_number} - ${job.container_number}`));
    assert.equal(result.repoUjTransaction.id, debits[0].id);
    // Debit -> movement dan movement -> debit.
    const movement = await query('select * from container_pickup_movements where id = $1', [debits[0].source_ref_id]);
    assert.equal(movement.rows[0].id, result.movement.id);
    // UJ Container Job asli tidak disentuh.
    assert.deepEqual(await jobFinancialState(job.id), before);
  });

  test('combo 2x20 UJ 175000: satu movement, dua item, satu debit 175000', async () => {
    const jobs = [await createRepoStoredJob(), await createRepoStoredJob()];
    const driver = await createDriver();
    const vehicle = await createVehicle('40FT');
    const before = await Promise.all(jobs.map((job) => jobFinancialState(job.id)));

    const result = await pickupComboRepoContainerJobs(pickupPayload(driver, vehicle, {
      containerJobIds: jobs.map((job) => job.id),
      repoUjAmount: 175000,
    }));

    const items = await query('select * from container_pickup_items where movement_id = $1', [result.movement.id]);
    assert.equal(items.rows.length, 2);
    assert.equal(Number(result.movement.repo_uj_amount), 175000);
    const debits = await repoUjDebits(result.movement.id);
    assert.equal(debits.length, 1);
    assert.equal(Number(debits[0].amount), 175000);
    assert.match(debits[0].description, /^UJ Repo Combo 2x20/);
    assert.deepEqual(await Promise.all(jobs.map((job) => jobFinancialState(job.id))), before);
  });

  test('UJ 200000 tersimpan apa adanya di movement dan ledger', async () => {
    const job = await createRepoStoredJob();
    const result = await pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT'), { repoUjAmount: '200000' }));
    const stored = await query('select repo_uj_amount from container_pickup_movements where id = $1', [result.movement.id]);
    assert.equal(Number(stored.rows[0].repo_uj_amount), 200000);
    assert.equal(Number((await repoUjDebits(result.movement.id))[0].amount), 200000);
  });

  test('submit ulang dan submit bersamaan tidak menggandakan movement maupun debit', async () => {
    const job = await createRepoStoredJob();
    const payload = pickupPayload(await createDriver(), await createVehicle('20FT'), { repoUjAmount: 150000 });

    const outcomes = await Promise.allSettled([
      pickupSingleRepoContainerJob(job.id, payload),
      pickupSingleRepoContainerJob(job.id, payload),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    await assert.rejects(pickupSingleRepoContainerJob(job.id, payload), (error) => error.statusCode === 409);

    const movements = await query(
      'select cpm.id from container_pickup_items cpi join container_pickup_movements cpm on cpm.id = cpi.movement_id where cpi.container_job_id = $1',
      [job.id],
    );
    assert.equal(movements.rows.length, 1);
    assert.equal((await repoUjDebits(movements.rows[0].id)).length, 1);
  });

  test('database menolak debit UJ Repo kedua untuk movement yang sama', async () => {
    const job = await createRepoStoredJob();
    const result = await pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT'), { repoUjAmount: 150000 }));
    const [debit] = await repoUjDebits(result.movement.id);
    await assert.rejects(query(
      `insert into operational_fund_transactions (batch_id, transaction_date, transaction_type, category, amount, source, source_ref_id)
       values ($1, $2, 'debit', 'uj_order', 1, 'repo_uj', $3)`,
      [debit.batch_id, debit.transaction_date, debit.source_ref_id],
    ), (error) => error.code === '23505');
  });

  test('gagal posting ke rekening dropping (batch ditutup) membatalkan seluruh pickup', async () => {
    const job = await createRepoStoredJob();
    const closedDate = '2026-01-15';
    await query(
      `insert into operational_fund_batches (batch_date, status, created_by_name, updated_by_name)
       values ($1::date, 'closed', 'Integration Test', 'Integration Test')
       on conflict (batch_date) do update set status = 'closed'`,
      [closedDate],
    );
    const before = await jobFinancialState(job.id);

    await assert.rejects(
      pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT'), {
        repoUjAmount: 150000,
        runningAt: `${closedDate}T03:00:00.000Z`,
      })),
      { code: 'OPERATIONAL_FUND_BATCH_CLOSED' },
    );
    const items = await query('select count(*)::int as n from container_pickup_items where container_job_id = $1', [job.id]);
    assert.equal(items.rows[0].n, 0);
    const status = await query('select status from container_jobs where id = $1', [job.id]);
    assert.equal(status.rows[0].status, 'repo_stored');
    assert.deepEqual(await jobFinancialState(job.id), before);
  });

  test('UJ negatif ditolak tanpa membuat movement', async () => {
    const job = await createRepoStoredJob();
    await assert.rejects(
      pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT'), { repoUjAmount: -1 })),
      { code: 'REPO_UJ_AMOUNT_NEGATIVE' },
    );
    const items = await query('select count(*)::int as n from container_pickup_items where container_job_id = $1', [job.id]);
    assert.equal(items.rows[0].n, 0);
  });

  test('UJ 0: movement tersimpan dengan 0, tanpa debit rekening dropping', async () => {
    const job = await createRepoStoredJob();
    const result = await pickupSingleRepoContainerJob(job.id, pickupPayload(await createDriver(), await createVehicle('20FT'), { repoUjAmount: 0 }));
    assert.equal(Number(result.movement.repo_uj_amount), 0);
    assert.equal(result.repoUjTransaction, null);
    assert.equal((await repoUjDebits(result.movement.id)).length, 0);
  });

  test('UJ otomatis Container Job biasa (non-Repo) tetap diposting seperti sebelumnya', async () => {
    const job = await createRepoStoredJob({ ujSnapshot: 111000 });
    await query("update container_jobs set status = 'received', repo_location = null where id = $1", [job.id]);
    const fresh = (await query('select * from container_jobs where id = $1', [job.id])).rows[0];
    await withTransaction((client) => syncAutoJourneyMoneyExpense(client, {
      job: fresh,
      nextStatus: 'running',
      nextEntrySource: 'realtime',
      runningAt: new Date().toISOString(),
      assignment: { driver: 'Sopir Biasa', plateNumber: 'B 1 ABC' },
      actorName: 'Integration Test',
    }));
    const ledger = await query(
      "select * from operational_fund_transactions where container_job_id = $1 and source = 'auto_uj_order' and status = 'posted'",
      [job.id],
    );
    assert.equal(ledger.rows.length, 1);
    assert.equal(Number(ledger.rows[0].amount), 111000);
    assert.equal(ledger.rows[0].category, 'uj_order');
  });

  test('lifecycle ae818ae: movement yang sudah mulai dengan semua job batal tetap completed', async () => {
    const jobs = [await createRepoStoredJob(), await createRepoStoredJob()];
    const result = await pickupComboRepoContainerJobs(pickupPayload(await createDriver(), await createVehicle('40FT'), {
      containerJobIds: jobs.map((job) => job.id),
      repoUjAmount: 175000,
    }));
    await query("update container_jobs set status = 'cancelled' where id = any($1::uuid[])", [jobs.map((job) => job.id)]);
    const reconciled = await withTransaction(async (client) => {
      const locked = await lockRepoPickupMovementForJob(client, jobs[1].id);
      return reconcileRepoPickupMovement(client, locked);
    });
    assert.equal(reconciled.status, 'completed');
    // Debit UJ Repo tetap satu dan tidak ikut berubah karena lifecycle.
    assert.equal((await repoUjDebits(result.movement.id)).length, 1);
  });
}
