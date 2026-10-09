// Integrasi timeline Repo (bug 2609/23-00250 / SKHU8711190) terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi -- arahkan ke database SCRATCH
// (salinan dev), bukan database dev/production, karena test ini menulis data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

const databaseUrl = process.env.ATMS_SCRATCH_DATABASE_URL;

if (!databaseUrl) {
  test('repo timeline integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: 'opt-in' }, () => {});
} else {
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';
  const { query, closePool } = await import('../db/client.js');
  const {
    pickupComboRepoContainerJobs,
    pickupSingleRepoContainerJob,
    updateContainerJob,
  } = await import('../modules/container-jobs/container-jobs.repository.js');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  let seq = 0;
  const nextTag = () => `${tag}${String(++seq).padStart(2, '0')}`;
  // Leg awal seperti produksi: jalan 23 Sep, dititip 23 Sep 21:34 WIB.
  const ORIGINAL_RUNNING_AT = '2026-09-23T03:00:00.000Z';
  const REPO_STORED_AT = '2026-09-23T14:34:00.000Z';
  const BAD_COMPLETED_AT = '2026-09-29T03:00:00.000Z';

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

  async function createRepoStoredJob() {
    const number = `RTL${nextTag()}`.padEnd(11, '0').slice(0, 11);
    const job = await cloneRow('container_jobs', `
      select * from container_jobs
      where coalesce(execution_source, 'internal') = 'internal'
      order by created_at limit 1
    `, {
      status: 'repo_stored',
      container_number: number,
      container_size: '20FT',
      repo_location: `Repo Timeline ${tag}`,
      repo_stored_at: REPO_STORED_AT,
      repo_eir_number: `EIR-TITIP-${number}`,
      driver_id: null,
      vehicle_id: null,
      entry_source: 'realtime',
      is_backdate_entry: false,
      running_at: ORIGINAL_RUNNING_AT,
      completed_at: null,
      cancelled_at: null,
      repo_picked_up_at: null,
      assignment_group_id: null,
      // UJ leg awal sudah dibayar saat perjalanan awal (kondisi nyata job yang dititip).
      rpuj_status: 'paid',
      spk_number: `SPK-${number}`,
    });
    // Dokumen penyelesaian realtime (SPK, EIR, EIR Titip) supaya jalur normal bisa dipakai.
    for (const category of ['spkDocument', 'eirDocument', 'repoEirDocument']) {
      await cloneRow('attachments', 'select * from attachments order by created_at limit 1', {
        entity_type: 'container_job', entity_id: job.id, category,
      });
    }
    return job;
  }

  async function createDriver() {
    return cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', {
      name: `SOPIR TL ${nextTag()}`, nik: null, operational_status: 'Aktif', archived_at: null,
    });
  }

  async function createVehicle(size) {
    const code = nextTag();
    return cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', {
      plate_number: `B ${code} TL`, unit_code: `TL-${code}`, engine_number: null, kir_number: null, vin: null,
      container_size: size, current_chassis_id: null, operational_status: 'Aktif', archived_at: null,
    });
  }

  const pickupPayload = (driver, vehicle, extra = {}) => ({
    pickupConfirmed: true, driverId: driver.id, vehicleId: vehicle.id, updatedBy: 'Integration Test', repoUjAmount: 150000, ...extra,
  });

  async function jobRow(id) {
    return (await query('select * from container_jobs where id = $1', [id])).rows[0];
  }

  async function movementRow(id) {
    return (await query('select * from container_pickup_movements where id = $1', [id])).rows[0];
  }

  // UJ, biaya, ledger, dan debit UJ Repo -- semuanya tidak boleh berubah karena penyelesaian.
  async function financialState(jobIds, movementId) {
    const jobs = await query(
      'select id, uj_amount_snapshot, uj_snapshot_source from container_jobs where id = any($1::uuid[]) order by id',
      [jobIds],
    );
    const expenses = await query('select count(*)::int as n, coalesce(sum(amount), 0)::numeric as total from container_job_expenses where container_job_id = any($1::uuid[])', [jobIds]);
    const ledger = await query('select count(*)::int as n from operational_fund_transactions where container_job_id = any($1::uuid[])', [jobIds]);
    const repoUj = await query(
      "select id, amount, status from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1 order by id",
      [String(movementId)],
    );
    const movement = await movementRow(movementId);
    return { jobs: jobs.rows, expenses: expenses.rows[0], ledger: ledger.rows[0], repoUj: repoUj.rows, repoUjAmount: movement.repo_uj_amount };
  }

  function completionForm(job, driver, vehicle, completedAt, extra = {}) {
    return {
      status: 'completed',
      containerNumber: job.container_number,
      driverId: driver.id,
      vehicleId: vehicle.id,
      // Form lama mengirim waktu mulai yang bisa saja salah; tidak boleh menimpa leg awal.
      runningAt: completedAt,
      completedAt,
      updatedBy: 'Integration Test',
      ...extra,
    };
  }

  test.after(async () => {
    await closePool();
  });

  test('B/C/D/E/F/H: single Repo menolak selesai sebelum pickup, lalu selesai valid tanpa mengubah leg awal', async () => {
    const job = await createRepoStoredJob();
    const driver = await createDriver();
    const vehicle = await createVehicle('20FT');
    const { movement } = await pickupSingleRepoContainerJob(job.id, pickupPayload(driver, vehicle));
    const picked = await jobRow(job.id);
    const before = await financialState([job.id], movement.id);

    // E/F: leg awal tetap, pickup Repo tercatat terpisah = started_at movement.
    assert.equal(picked.running_at.toISOString(), ORIGINAL_RUNNING_AT);
    assert.equal(picked.repo_picked_up_at.toISOString(), new Date(movement.started_at).toISOString());

    // B: selesai 29 Sep (setelah running_at awal, sebelum pickup 9 Okt) ditolak sebelum apa pun disimpan.
    await assert.rejects(
      () => updateContainerJob(job.id, completionForm(job, driver, vehicle, BAD_COMPLETED_AT)),
      (error) => error.code === 'CONTAINER_JOB_COMPLETION_INVALID_TIME' && /pickup Repo/.test(error.message),
    );
    const afterReject = await jobRow(job.id);
    assert.equal(afterReject.status, 'running');
    assert.equal(afterReject.completed_at, null);
    assert.equal(afterReject.running_at.toISOString(), ORIGINAL_RUNNING_AT);
    assert.equal((await movementRow(movement.id)).status, 'running');
    assert.equal((await movementRow(movement.id)).completed_at, null);

    // C: selesai 5 menit setelah pickup diterima.
    const validCompletedAt = new Date(new Date(movement.started_at).getTime() + 5 * 60 * 1000).toISOString();
    await updateContainerJob(job.id, completionForm(job, driver, vehicle, validCompletedAt));
    const completed = await jobRow(job.id);
    const completedMovement = await movementRow(movement.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.completed_at.toISOString(), validCompletedAt);
    // E: form mengirim runningAt baru, tapi running_at leg awal tidak tertimpa.
    assert.equal(completed.running_at.toISOString(), ORIGINAL_RUNNING_AT);
    assert.equal(completed.repo_stored_at.toISOString(), REPO_STORED_AT);
    assert.equal(completed.repo_picked_up_at.toISOString(), picked.repo_picked_up_at.toISOString());
    // D: movement selesai dengan waktu selesai job, tidak lebih awal dari started_at.
    assert.equal(completedMovement.status, 'completed');
    assert.equal(completedMovement.completed_at.toISOString(), validCompletedAt);
    assert.ok(completedMovement.completed_at >= completedMovement.started_at);
    // H: UJ Repo, UJ job asli, biaya, dan ledger tidak berubah.
    assert.deepEqual(await financialState([job.id], movement.id), before);
  });

  test('G: combo 2x20 selesai sekali setelah kedua job terminal, completed_at >= started_at', async () => {
    const jobs = [await createRepoStoredJob(), await createRepoStoredJob()];
    const driver = await createDriver();
    const vehicle = await createVehicle('40FT');
    const { movement } = await pickupComboRepoContainerJobs(pickupPayload(driver, vehicle, {
      containerJobIds: jobs.map((job) => job.id), repoUjAmount: 175000,
    }));
    const before = await financialState(jobs.map((job) => job.id), movement.id);
    const startedAt = new Date(movement.started_at).getTime();

    await assert.rejects(
      () => updateContainerJob(jobs[0].id, completionForm(jobs[0], driver, vehicle, BAD_COMPLETED_AT)),
      { code: 'CONTAINER_JOB_COMPLETION_INVALID_TIME' },
    );
    const first = new Date(startedAt + 3 * 60 * 1000).toISOString();
    const second = new Date(startedAt + 9 * 60 * 1000).toISOString();
    await updateContainerJob(jobs[0].id, completionForm(jobs[0], driver, vehicle, first));
    assert.equal((await movementRow(movement.id)).status, 'running');
    await updateContainerJob(jobs[1].id, completionForm(jobs[1], driver, vehicle, second));

    const done = await movementRow(movement.id);
    assert.equal(done.status, 'completed');
    assert.equal(done.completed_at.toISOString(), second);
    assert.ok(done.completed_at >= done.started_at);
    for (const job of jobs) {
      assert.equal((await jobRow(job.id)).running_at.toISOString(), ORIGINAL_RUNNING_AT);
    }
    assert.deepEqual(await financialState(jobs.map((job) => job.id), movement.id), before);
  });

  test('A: job normal tanpa Repo tetap boleh selesai di hari yang sama', async () => {
    const job = await createRepoStoredJob();
    // Jadikan job biasa yang sedang jalan (tanpa leg Repo).
    const driver = await createDriver();
    const vehicle = await createVehicle('20FT');
    await query(
      `update container_jobs set status = 'running', repo_stored_at = null, repo_location = null,
         driver_id = $2, vehicle_id = $3, running_at = $4 where id = $1`,
      [job.id, driver.id, vehicle.id, ORIGINAL_RUNNING_AT],
    );
    const sameDay = '2026-09-23T10:00:00.000Z';
    await updateContainerJob(job.id, completionForm(job, driver, vehicle, sameDay, { runningAt: ORIGINAL_RUNNING_AT }));
    const done = await jobRow(job.id);
    assert.equal(done.status, 'completed');
    assert.equal(done.completed_at.toISOString(), sameDay);
  });
}
