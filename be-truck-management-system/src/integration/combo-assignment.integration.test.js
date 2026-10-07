// Integrasi constraint assignment aktif (combo 2x20) terhadap PostgreSQL sungguhan.
// Opt-in: hanya jalan kalau ATMS_SCRATCH_DATABASE_URL diisi -- arahkan ke database SCRATCH
// (salinan dev), bukan database dev/production, karena test ini menulis data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

const databaseUrl = process.env.ATMS_SCRATCH_DATABASE_URL;

if (!databaseUrl) {
  test('combo assignment integration skipped without ATMS_SCRATCH_DATABASE_URL', { skip: 'opt-in' }, () => {});
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

  async function createJob(status = 'repo_stored') {
    return cloneRow('container_jobs', `
      select * from container_jobs
      where coalesce(execution_source, 'internal') = 'internal'
      order by created_at limit 1
    `, {
      status,
      container_number: `CMB${nextTag()}`.padEnd(11, '0').slice(0, 11),
      container_size: '20FT',
      repo_location: `Repo Combo ${tag}`,
      driver_id: null,
      vehicle_id: null,
      assignment_group_id: null,
      entry_source: 'realtime',
      is_backdate_entry: false,
      running_at: null,
      completed_at: null,
      cancelled_at: null,
      repo_picked_up_at: null,
      rpuj_status: 'pending',
      uj_amount_snapshot: 123000,
    });
  }

  async function createDriver() {
    return cloneRow('drivers', 'select * from drivers where archived_at is null order by created_at limit 1', {
      name: `SOPIR COMBO ${nextTag()}`, nik: null, operational_status: 'Aktif', archived_at: null,
    });
  }

  async function createVehicle(size = '40FT') {
    const code = nextTag();
    return cloneRow('vehicles', 'select * from vehicles where archived_at is null order by created_at limit 1', {
      plate_number: `B ${code} CMB`,
      unit_code: `CMB-${code}`,
      engine_number: null,
      kir_number: null,
      vin: null,
      container_size: size,
      current_chassis_id: null,
      operational_status: 'Aktif',
      archived_at: null,
    });
  }

  // Assignment aktif "biasa" langsung di DB (tanpa grup), untuk menguji constraint apa adanya.
  function assignActive(jobId, { driverId = null, vehicleId = null } = {}) {
    return query(
      "update container_jobs set status = 'running', driver_id = $2, vehicle_id = $3 where id = $1",
      [jobId, driverId, vehicleId],
    );
  }

  const isActiveConflict = (constraint) => (error) => error.code === '23P01' && error.constraint === constraint;

  async function startCombo() {
    const jobs = [await createJob(), await createJob()];
    const driver = await createDriver();
    const vehicle = await createVehicle('40FT');
    const result = await pickupComboRepoContainerJobs({
      pickupConfirmed: true,
      containerJobIds: jobs.map((job) => job.id),
      driverId: driver.id,
      vehicleId: vehicle.id,
      updatedBy: 'Integration Test',
      repoUjAmount: 175000,
    });
    return { jobs, driver, vehicle, movement: result.movement };
  }

  test.after(async () => {
    await closePool();
  });

  test('1. dua job biasa tidak boleh memakai driver/truck aktif yang sama', async () => {
    const [jobA, jobB] = [await createJob('received'), await createJob('received')];
    const driver = await createDriver();
    const vehicle = await createVehicle('20FT');
    await assignActive(jobA.id, { driverId: driver.id, vehicleId: vehicle.id });
    await assert.rejects(assignActive(jobB.id, { driverId: driver.id }), isActiveConflict('ex_container_jobs_driver_active'));
    await assert.rejects(assignActive(jobB.id, { vehicleId: vehicle.id }), isActiveConflict('ex_container_jobs_vehicle_active'));
  });

  test('2. pickup Repo single ditolak kalau driver/truck masih aktif di job lain', async () => {
    const other = await createJob('received');
    const job = await createJob();
    const driver = await createDriver();
    const vehicle = await createVehicle('20FT');
    await assignActive(other.id, { driverId: driver.id, vehicleId: vehicle.id });

    await assert.rejects(pickupSingleRepoContainerJob(job.id, {
      pickupConfirmed: true, driverId: driver.id, vehicleId: vehicle.id, updatedBy: 'Integration Test', repoUjAmount: 150000,
    }), (error) => error.code === 'ASSIGNMENT_ALREADY_ACTIVE' && error.statusCode === 409);
    const status = await query('select status from container_jobs where id = $1', [job.id]);
    assert.equal(status.rows[0].status, 'repo_stored');
  });

  test('3. combo 2x20: dua job satu movement boleh berbagi driver/truck aktif', async () => {
    const { jobs, driver, vehicle, movement } = await startCombo();
    const rows = await query(
      'select status, driver_id, vehicle_id, assignment_group_id from container_jobs where id = any($1::uuid[])',
      [jobs.map((job) => job.id)],
    );
    assert.equal(rows.rows.length, 2);
    for (const row of rows.rows) {
      assert.equal(row.status, 'running');
      assert.equal(row.driver_id, driver.id);
      assert.equal(row.vehicle_id, vehicle.id);
      assert.equal(row.assignment_group_id, movement.id);
    }
  });

  test('4. selama combo aktif, job/movement lain tidak boleh memakai driver/truck itu', async () => {
    const { driver, vehicle } = await startCombo();
    const unrelated = await createJob('received');
    await assert.rejects(assignActive(unrelated.id, { driverId: driver.id }), isActiveConflict('ex_container_jobs_driver_active'));
    await assert.rejects(assignActive(unrelated.id, { vehicleId: vehicle.id }), isActiveConflict('ex_container_jobs_vehicle_active'));

    const otherRepo = await createJob();
    await assert.rejects(pickupSingleRepoContainerJob(otherRepo.id, {
      pickupConfirmed: true, driverId: driver.id, vehicleId: vehicle.id, updatedBy: 'Integration Test', repoUjAmount: 0,
    }), { code: 'ASSIGNMENT_ALREADY_ACTIVE' });
  });

  test('5. driver/truck baru bebas setelah SEMUA job combo terminal', async () => {
    const { jobs, driver, vehicle } = await startCombo();
    const unrelated = await createJob('received');

    await query("update container_jobs set status = 'completed' where id = $1", [jobs[0].id]);
    // Satu job combo masih jalan -> masih terkunci.
    await assert.rejects(assignActive(unrelated.id, { driverId: driver.id }), isActiveConflict('ex_container_jobs_driver_active'));

    await query("update container_jobs set status = 'cancelled' where id = $1", [jobs[1].id]);
    await assignActive(unrelated.id, { driverId: driver.id, vehicleId: vehicle.id });
    const row = await query('select driver_id, vehicle_id from container_jobs where id = $1', [unrelated.id]);
    assert.equal(row.rows[0].driver_id, driver.id);
    assert.equal(row.rows[0].vehicle_id, vehicle.id);
  });

  test('6. pickup bersamaan dengan driver yang sama: hanya satu yang berhasil', async () => {
    const [jobA, jobB] = [await createJob(), await createJob()];
    const driver = await createDriver();
    const [vehicleA, vehicleB] = [await createVehicle('20FT'), await createVehicle('20FT')];
    const outcomes = await Promise.allSettled([
      pickupSingleRepoContainerJob(jobA.id, { pickupConfirmed: true, driverId: driver.id, vehicleId: vehicleA.id, updatedBy: 'A', repoUjAmount: 0 }),
      pickupSingleRepoContainerJob(jobB.id, { pickupConfirmed: true, driverId: driver.id, vehicleId: vehicleB.id, updatedBy: 'B', repoUjAmount: 0 }),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.equal(rejected.reason.code, 'ASSIGNMENT_ALREADY_ACTIVE');
    const active = await query(
      "select count(*)::int as n from container_jobs where driver_id = $1 and status = 'running'",
      [driver.id],
    );
    assert.equal(active.rows[0].n, 1);
  });

  test('7. job combo yang driver-nya diganti keluar dari grup dan tidak bisa menumpang lagi', async () => {
    const { jobs, driver, vehicle, movement } = await startCombo();
    const otherDriver = await createDriver();
    const otherVehicle = await createVehicle('20FT');

    // Ganti sopir saja tanpa truck: job keluar grup tapi masih memakai truck pasangan -> ditolak.
    await assert.rejects(
      query('update container_jobs set driver_id = $2 where id = $1', [jobs[0].id, otherDriver.id]),
      isActiveConflict('ex_container_jobs_vehicle_active'),
    );
    await query('update container_jobs set driver_id = $2, vehicle_id = $3 where id = $1', [jobs[0].id, otherDriver.id, otherVehicle.id]);
    assert.notEqual(vehicle.id, otherVehicle.id);
    const moved = await query('select assignment_group_id from container_jobs where id = $1', [jobs[0].id]);
    assert.equal(moved.rows[0].assignment_group_id, null);
    const partner = await query('select assignment_group_id from container_jobs where id = $1', [jobs[1].id]);
    assert.equal(partner.rows[0].assignment_group_id, movement.id);

    // Kembali ke driver combo tanpa grup -> bentrok dengan pasangan yang masih aktif.
    await assert.rejects(
      query('update container_jobs set driver_id = $2 where id = $1', [jobs[0].id, driver.id]),
      isActiveConflict('ex_container_jobs_driver_active'),
    );
  });

  test('8. update rutin job combo (driver/truck sama) lolos pengecekan aplikasi; job lain tetap ditolak', async () => {
    const jobs = [await createJob(), await createJob()];
    const driver = await createDriver();
    const vehicle = await createVehicle('COMBO');
    await pickupComboRepoContainerJobs({
      pickupConfirmed: true,
      containerJobIds: jobs.map((job) => job.id),
      driverId: driver.id,
      vehicleId: vehicle.id,
      updatedBy: 'Integration Test',
      repoUjAmount: 0,
    });
    const form = {
      status: 'running',
      driverId: driver.id,
      vehicleId: vehicle.id,
      driver: driver.name,
      plateNumber: vehicle.plate_number,
      updatedBy: 'Integration Test',
    };
    await updateContainerJob(jobs[0].id, form);

    const unrelated = await createJob('received');
    await assert.rejects(updateContainerJob(unrelated.id, form), { code: 'ASSIGNMENT_ALREADY_ACTIVE' });
  });
}
