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
  const { getUtilizationTripRows } = await import('../modules/reports/utilization-trips.repository.js');

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

  async function createJob(status = 'repo_stored', overrides = {}) {
    return cloneRow('container_jobs', `
      select * from container_jobs
      where coalesce(execution_source, 'internal') = 'internal'
      order by created_at limit 1
    `, {
      status,
      container_number: `CMB${nextTag()}`.padEnd(11, '0').slice(0, 11),
      container_size: '20FT',
      repo_location: `Repo Combo ${tag}`,
      repo_eir_number: `EIR-TITIP-${tag}`,
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
      ...overrides,
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

    // Movement Repo lain dengan truck combo 40FT yang sama (ukuran sah: combo 2x20) tetap ditolak.
    const otherRepo = [await createJob(), await createJob()];
    await assert.rejects(pickupComboRepoContainerJobs({
      pickupConfirmed: true, containerJobIds: otherRepo.map((job) => job.id), driverId: driver.id, vehicleId: vehicle.id,
      updatedBy: 'Integration Test', repoUjAmount: 0,
    }), { code: 'ASSIGNMENT_ALREADY_ACTIVE' });
    // Pickup single 20FT dengan truck combo 40FT yang sama: ukuran sah, tapi truck masih aktif.
    await assert.rejects(pickupSingleRepoContainerJob(otherRepo[0].id, {
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

  // --- Validasi ukuran truck vs container setelah pickup ---

  function routineForm(driver, vehicle, extra = {}) {
    return {
      status: 'running',
      driverId: driver.id,
      vehicleId: vehicle.id,
      driver: driver.name,
      plateNumber: vehicle.plate_number,
      updatedBy: 'Integration Test',
      ...extra,
    };
  }

  async function attachCompletionDocuments(jobId) {
    for (const category of ['spkDocument', 'eirDocument', 'repoEirDocument']) {
      await cloneRow('attachments', 'select * from attachments order by created_at limit 1', {
        entity_type: 'container_job', entity_id: jobId, category,
      });
    }
  }

  test('9. matriks kapasitas truck job biasa (A-F)', async () => {
    const assign = async (containerSize, truckSize) => {
      const job = await createJob('received', { container_size: containerSize });
      return updateContainerJob(job.id, routineForm(await createDriver(), await createVehicle(truckSize), { status: 'received' }))
        .then(() => 'allow', (error) => error.code);
    };
    assert.equal(await assign('20FT', '20FT'), 'allow'); // A
    assert.equal(await assign('20FT', '40FT'), 'allow'); // B
    assert.equal(await assign('20FT', 'COMBO'), 'allow'); // C
    assert.equal(await assign('40FT', '20FT'), 'VEHICLE_SIZE_MISMATCH'); // D
    assert.equal(await assign('40FT', '40FT'), 'allow'); // E
    assert.equal(await assign('40FT', 'COMBO'), 'allow'); // F
  });

  test('10. Repo single 20FT dengan truck 40FT: pickup, update, selesai normal; UJ/revenue satu; utilisasi +0', async () => {
    const [originalDriver, originalTruck] = [await createDriver(), await createVehicle('20FT')];
    const job = await createJob('repo_stored', {
      repo_stored_at: new Date().toISOString(),
      repo_released_driver_id: originalDriver.id,
      repo_released_vehicle_id: originalTruck.id,
    });
    const driver = await createDriver();
    const vehicle = await createVehicle('40FT');
    const picked = await pickupSingleRepoContainerJob(job.id, {
      pickupConfirmed: true, driverId: driver.id, vehicleId: vehicle.id, updatedBy: 'Integration Test', repoUjAmount: 150000,
    });
    assert.equal(picked.movement.status, 'running');
    assert.equal(picked.movement.vehicle_id, vehicle.id);

    await updateContainerJob(job.id, routineForm(driver, vehicle));
    await attachCompletionDocuments(job.id);
    await updateContainerJob(job.id, routineForm(driver, vehicle, { status: 'completed', completedAt: new Date().toISOString() }));
    assert.equal((await query('select status from container_jobs where id = $1', [job.id])).rows[0].status, 'completed');
    assert.equal((await query('select status from container_pickup_movements where id = $1', [picked.movement.id])).rows[0].status, 'completed');

    const uj = await query("select amount from operational_fund_transactions where source = 'repo_uj' and source_ref_id = $1 and status = 'posted'", [picked.movement.id]);
    assert.equal(uj.rows.length, 1);
    assert.equal(Number(uj.rows[0].amount), 150000);
    const revenue = await query("select total_amount from manual_revenue_lines where charge_type = 'repo' and container_job_id = $1 and status <> 'void'", [job.id]);
    assert.equal(revenue.rows.length, 1);
    assert.equal(Number(revenue.rows[0].total_amount), 300000);

    const trips = await getUtilizationTripRows({});
    assert.equal(trips.filter((row) => row.vehicleId === vehicle.id || row.driverId === driver.id).length, 0, 'Repo +0 truck/sopir');
    assert.equal(trips.filter((row) => row.jobId === job.id && row.vehicleId === originalTruck.id).length, 1, 'leg asli tetap 1');
  });

  test('14. matriks ukuran truck pickup Repo (single 20FT/40FT, combo 2x20)', async () => {
    const pickupSingle = async (containerSize, truckSize) => {
      const job = await createJob('repo_stored', { container_size: containerSize });
      return pickupSingleRepoContainerJob(job.id, {
        pickupConfirmed: true, driverId: (await createDriver()).id, vehicleId: (await createVehicle(truckSize)).id,
        updatedBy: 'Integration Test', repoUjAmount: 0,
      }).then(() => 'allow', (error) => error.code);
    };
    const pickupCombo = async (truckSize) => {
      const jobs = [await createJob(), await createJob()];
      return pickupComboRepoContainerJobs({
        pickupConfirmed: true, containerJobIds: jobs.map((job) => job.id), driverId: (await createDriver()).id,
        vehicleId: (await createVehicle(truckSize)).id, updatedBy: 'Integration Test', repoUjAmount: 0,
      }).then(() => 'allow', (error) => error.code);
    };
    assert.equal(await pickupSingle('20FT', '20FT'), 'allow');
    assert.equal(await pickupSingle('20FT', 'COMBO'), 'allow');
    assert.equal(await pickupSingle('20FT', '40FT'), 'allow');
    assert.equal(await pickupSingle('40FT', '40FT'), 'allow');
    assert.equal(await pickupSingle('40FT', 'COMBO'), 'allow');
    assert.equal(await pickupSingle('40FT', '20FT'), 'REPO_PICKUP_REQUIRES_40FT');
    assert.equal(await pickupCombo('40FT'), 'allow');
    assert.equal(await pickupCombo('COMBO'), 'allow');
    assert.equal(await pickupCombo('20FT'), 'REPO_PICKUP_COMBO_REQUIRES_40FT');
  });

  test('11. combo 2x20 dengan truck 40FT: kedua job bisa di-update dan diselesaikan normal', async () => {
    const { jobs, driver, vehicle, movement } = await startCombo();
    for (const job of jobs) {
      await updateContainerJob(job.id, routineForm(driver, vehicle));
    }
    for (const job of jobs) {
      await attachCompletionDocuments(job.id);
      await updateContainerJob(job.id, routineForm(driver, vehicle, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      }));
    }
    const rows = await query('select status from container_jobs where id = any($1::uuid[])', [jobs.map((job) => job.id)]);
    assert.deepEqual(rows.rows.map((row) => row.status), ['completed', 'completed']);
    const movementRow = await query('select status from container_pickup_movements where id = $1', [movement.id]);
    assert.equal(movementRow.rows[0].status, 'completed');
  });

  test('12. job combo yang dipindah ke truck 40FT lain (di luar combo) sah secara ukuran dan keluar dari grup', async () => {
    const { jobs, driver } = await startCombo();
    const otherTruck = await createVehicle('40FT');
    // Sopir combo masih aktif di job pasangan; job yang keluar grup tidak boleh ikut memakainya.
    await assert.rejects(
      updateContainerJob(jobs[0].id, routineForm(driver, otherTruck, { assignmentChangeReason: 'Truck combo diganti' })),
      { code: 'ASSIGNMENT_ALREADY_ACTIVE' },
    );
    await updateContainerJob(jobs[0].id, routineForm(await createDriver(), otherTruck, { assignmentChangeReason: 'Truck dan sopir combo diganti' }));
    const moved = (await query('select vehicle_id, assignment_group_id from container_jobs where id = $1', [jobs[0].id])).rows[0];
    assert.equal(moved.vehicle_id, otherTruck.id);
    assert.equal(moved.assignment_group_id, null);
  });

  test('13. API tidak bisa mengisi assignment_group_id untuk menumpang truck combo', async () => {
    const { driver, vehicle, movement } = await startCombo();
    const intruder = await createJob('received');
    await assert.rejects(
      updateContainerJob(intruder.id, routineForm(driver, vehicle, { status: 'received', assignmentGroupId: movement.id, assignment_group_id: movement.id })),
      { code: 'ASSIGNMENT_ALREADY_ACTIVE' },
    );
    const row = (await query('select assignment_group_id from container_jobs where id = $1', [intruder.id])).rows[0];
    assert.equal(row.assignment_group_id, null);
  });

}
