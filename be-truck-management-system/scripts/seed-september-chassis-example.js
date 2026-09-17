import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

function assertDevDatabase() {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) throw new Error('DATABASE_URL belum dikonfigurasi.');
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Seed contoh September ditolak: NODE_ENV=production.');
  }
  const url = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`Seed contoh September ditolak: database bukan localhost (${url.hostname}).`);
  }
}

function atWib(dateKey, time) {
  return `${dateKey}T${time}+07:00`;
}

async function getColumns(client, table) {
  const result = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = $1
    `,
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function insertRow(client, table, row) {
  const columns = await getColumns(client, table);
  const entries = Object.entries(row).filter(([column]) => columns.has(column));
  const names = entries.map(([column]) => column);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const result = await client.query(
    `
      insert into ${table} (${names.join(', ')})
      values (${placeholders.join(', ')})
      returning *
    `,
    values,
  );
  return result.rows[0];
}

function lineItems({ size, price }) {
  const serviceName = size === '40FT' ? 'Jasa Angkut D40' : 'Jasa Angkut D20';
  return JSON.stringify([{ serviceName, qty: 1, price, total: price, containerType: size }]);
}

function salesOrder({ index, date, size, price }) {
  return {
    so_number: `SO-SEPT-CHS-${String(index).padStart(3, '0')}`,
    accurate_so_number: `SO-SEPT-CHS-${String(index).padStart(3, '0')}`,
    do_number: `DO-SEPT-CHS-${String(index).padStart(3, '0')}`,
    so_date: date,
    trip_date: date,
    received_at: atWib(date, '07:30:00'),
    customer_name: 'SEPTEMBER CHASSIS TEST',
    customer_pic: 'PIC September',
    customer_phone: '0812-1609-0001',
    customer_address: 'Cilegon',
    shipment_type: 'import',
    job_type: 'Trucking Container',
    job_description: 'Contoh ritasi September untuk pivot perubahan chassis',
    container_summary: `1x${size}`,
    line_items: lineItems({ size, price }),
    do20_quantity: size === '20FT' ? 1 : 0,
    do40_quantity: size === '40FT' ? 1 : 0,
    price,
    quantity: 1,
    unit: 'Container',
    total_amount: price,
    origin: 'Tanjung Priok',
    destination: 'Cilegon',
    status: 'completed',
    finance_verification_status: 'verified',
    payment_type: 'cash',
    sales_name: 'Sales Testing',
    created_by_name: 'Sales Testing',
    updated_by_name: 'Seed September Chassis',
    notes: 'Dummy September: contoh perubahan chassis tengah bulan.',
  };
}

function containerJob({ order, driver, vehicle, containerNumber, date, size, runningTime, completedTime }) {
  return {
    sales_order_id: order.id,
    container_number: containerNumber,
    container_size: size,
    container_type: 'Dry',
    destination: 'Cilegon',
    rpuj_status: 'approved',
    spk_number: `SPK-${order.so_number}`,
    eir_number: `EIR-${containerNumber}`,
    loading_voucher_number: `BM-${containerNumber}`,
    travel_document_number: `SJ-${containerNumber}`,
    driver_id: driver.id,
    vehicle_id: vehicle.id,
    assignment_snapshot: JSON.stringify({
      driver: driver.name,
      plateNumber: vehicle.plate_number,
      unitCode: vehicle.unit_code,
      vehicleDetail: `${vehicle.unit_code} - ${vehicle.brand} ${vehicle.vehicle_type}`,
    }),
    status: 'completed',
    received_at: atWib(date, '07:30:00'),
    running_at: atWib(date, runningTime),
    completed_at: atWib(date, completedTime),
    commission_status: 'with_commission',
    uj_amount_snapshot: size === '40FT' ? 500000 : 350000,
    uj_snapshot_source: 'seed_september_chassis_example',
    created_by_name: 'Sales Testing',
    updated_by_name: 'Operational Testing',
    created_at: atWib(date, '07:30:00'),
    updated_at: atWib(date, completedTime),
  };
}

assertDevDatabase();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('begin');

  const soNumbers = ['SO-SEPT-CHS-001', 'SO-SEPT-CHS-002', 'SO-SEPT-CHS-003', 'SO-SEPT-CHS-004'];
  const cleanupJobIds = await client.query(
    `
      select cj.id
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where so.so_number = any($1::text[])
    `,
    [soNumbers],
  );
  const jobIds = cleanupJobIds.rows.map((row) => row.id);
  if (jobIds.length) {
    await client.query('delete from attachments where entity_type = $1 and entity_id = any($2::uuid[])', ['container_job', jobIds]);
    await client.query('delete from container_jobs where id = any($1::uuid[])', [jobIds]);
  }
  await client.query('delete from sales_orders where so_number = any($1::text[])', [soNumbers]);

  const cleanupVehicleIds = await client.query(
    "select id from vehicles where plate_number in ('B 9301 SWP', 'B 9302 SWP')",
  );
  const vehicleIds = cleanupVehicleIds.rows.map((row) => row.id);
  if (vehicleIds.length) {
    await client.query(
      'delete from utilization_chassis_corrections where source_vehicle_id = any($1::uuid[]) or target_vehicle_id = any($1::uuid[])',
      [vehicleIds],
    );
    await client.query('delete from vehicles where id = any($1::uuid[])', [vehicleIds]);
  }
  await client.query("delete from kir_chassis where chassis_code in ('CHS-SEPT-40', 'CHS-SEPT-20')");
  await client.query("delete from drivers where name in ('DRIVER SEPTEMBER CHASSIS')");
  await client.query("delete from customers where name = 'SEPTEMBER CHASSIS TEST'");

  await insertRow(client, 'customers', {
    name: 'SEPTEMBER CHASSIS TEST',
    address: 'Cilegon',
    pic_name: 'PIC September',
    phone: '0812-1609-0001',
    contract_status: 'Aktif',
    sales_name: 'Sales Testing',
  });

  const driver = await insertRow(client, 'drivers', {
    name: 'DRIVER SEPTEMBER CHASSIS',
    nickname: 'SEPTCHS',
    phone: '081270009301',
    license_type: 'SIM B2 Umum',
    license_expiry_date: '2028-12-31',
    operational_status: 'Aktif',
    health_status: 'Aman',
    bank_name: 'BCA',
    bank_account_number: '93010001',
    bank_account_holder: 'DRIVER SEPTEMBER CHASSIS',
  });

  const chassis40 = await insertRow(client, 'kir_chassis', {
    chassis_code: 'CHS-SEPT-40',
    plate_number: 'B 9340 CHS',
    container_size: '40FT',
    kir_number: 'KIR-CHS-SEPT-40',
    kir_expiry_date: '2028-12-31',
    operational_status: 'Aktif',
  });
  const chassis20 = await insertRow(client, 'kir_chassis', {
    chassis_code: 'CHS-SEPT-20',
    plate_number: 'B 9320 CHS',
    container_size: '20FT',
    kir_number: 'KIR-CHS-SEPT-20',
    kir_expiry_date: '2028-12-31',
    operational_status: 'Aktif',
  });

  const sourceVehicle = await insertRow(client, 'vehicles', {
    unit_code: 'TRK-SEPT-401',
    plate_number: 'B 9301 SWP',
    brand: 'Hino',
    vehicle_type: '500 Ranger',
    container_size: '40FT',
    chassis_size: '40FT',
    production_year: 2022,
    operational_status: 'Aktif',
    default_driver_name: driver.name,
    default_driver_id: driver.id,
    current_chassis_id: chassis40.id,
    current_chassis_code: chassis40.chassis_code,
    kir_chassis_number: chassis40.chassis_code,
    stnk_number: 'STNK-SEPT-401',
    stnk_expiry_date: '2028-12-31',
    kir_number: 'KIR-SEPT-401',
    kir_expiry_date: '2028-12-31',
    received_date: '2024-01-01',
  });
  const targetVehicle = await insertRow(client, 'vehicles', {
    unit_code: 'TRK-SEPT-201',
    plate_number: 'B 9302 SWP',
    brand: 'Hino',
    vehicle_type: '500 Ranger',
    container_size: '20FT',
    chassis_size: '20FT',
    production_year: 2022,
    operational_status: 'Aktif',
    default_driver_name: driver.name,
    default_driver_id: driver.id,
    current_chassis_id: chassis20.id,
    current_chassis_code: chassis20.chassis_code,
    kir_chassis_number: chassis20.chassis_code,
    stnk_number: 'STNK-SEPT-201',
    stnk_expiry_date: '2028-12-31',
    kir_number: 'KIR-SEPT-201',
    kir_expiry_date: '2028-12-31',
    received_date: '2024-01-01',
  });

  const scenarios = [
    { index: 1, date: '2026-09-05', size: '40FT', price: 4200000, container: 'SEPTCHS0501', runningTime: '08:00:00', completedTime: '13:00:00' },
    { index: 2, date: '2026-09-12', size: '40FT', price: 4200000, container: 'SEPTCHS1201', runningTime: '07:00:00', completedTime: '12:15:00' },
    { index: 3, date: '2026-09-16', size: '20FT', price: 2200000, container: 'SEPTCHS1601', runningTime: '09:00:00', completedTime: '14:10:00' },
    { index: 4, date: '2026-09-22', size: '20FT', price: 2200000, container: 'SEPTCHS2201', runningTime: '08:30:00', completedTime: '15:00:00' },
  ];

  const jobs = [];
  for (const scenario of scenarios) {
    const order = await insertRow(client, 'sales_orders', salesOrder(scenario));
    const job = await insertRow(client, 'container_jobs', containerJob({
      order,
      driver,
      vehicle: sourceVehicle,
      containerNumber: scenario.container,
      date: scenario.date,
      size: scenario.size,
      runningTime: scenario.runningTime,
      completedTime: scenario.completedTime,
    }));
    jobs.push(job);
  }

  await insertRow(client, 'utilization_chassis_corrections', {
    source_vehicle_id: sourceVehicle.id,
    target_vehicle_id: targetVehicle.id,
    effective_from: '2026-09-16',
    effective_to: '2026-09-30',
    reason: 'Contoh testing: chassis unit B 9301 SWP berubah dari 40FT ke 20FT mulai 16 September.',
    note: 'Dipakai untuk melihat baris Sebelum Pindah dan Setelah Pindah di Pivot Utilisasi September.',
    created_by_name: 'Seed September Chassis',
    updated_by_name: 'Seed September Chassis',
  });

  await insertRow(client, 'activity_logs', {
    actor_name: 'Seed September Chassis',
    actor_role: 'admin',
    action: 'SEED_SEPTEMBER_CHASSIS_EXAMPLE',
    target: 'Pivot Utilisasi September',
    metadata: JSON.stringify({
      sourcePlateNumber: sourceVehicle.plate_number,
      targetPlateNumber: targetVehicle.plate_number,
      effectiveFrom: '2026-09-16',
      jobCount: jobs.length,
    }),
  });

  await client.query('commit');

  console.log(JSON.stringify({
    message: 'Contoh ritasi September untuk perubahan chassis berhasil dibuat.',
    sourceTruck: `${sourceVehicle.plate_number} (${sourceVehicle.unit_code})`,
    correction: '40FT -> 20FT efektif 2026-09-16 sampai 2026-09-30',
    jobs: scenarios.map((scenario) => ({
      soNumber: `SO-SEPT-CHS-${String(scenario.index).padStart(3, '0')}`,
      container: scenario.container,
      completedDate: scenario.date,
      size: scenario.size,
    })),
  }, null, 2));
} catch (error) {
  await client.query('rollback');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
