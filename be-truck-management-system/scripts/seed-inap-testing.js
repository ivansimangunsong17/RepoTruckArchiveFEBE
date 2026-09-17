import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const keepTables = new Set(['schema_migrations', 'system_settings', 'users']);

function assertDevDatabase() {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) throw new Error('DATABASE_URL belum dikonfigurasi.');
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Seed INAP ditolak: NODE_ENV=production.');
  }
  const url = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`Seed INAP ditolak: database bukan localhost (${url.hostname}).`);
  }
}

function atWib(dateKey, time) {
  return `${dateKey}T${time}+07:00`;
}

async function getTables(client) {
  const result = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = current_schema()
      and table_type = 'BASE TABLE'
    order by table_name
  `);
  return result.rows.map((row) => row.table_name);
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

async function insertRows(client, table, rows) {
  if (!rows.length) return [];
  const columns = await getColumns(client, table);
  const inserted = [];

  for (const row of rows) {
    const entries = Object.entries(row).filter(([column]) => columns.has(column));
    if (!entries.length) continue;
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
    inserted.push(result.rows[0]);
  }

  return inserted;
}

async function countRows(client, table) {
  const result = await client.query(`select count(*)::int as count from ${table}`);
  return result.rows[0].count;
}

function lineItems({ size = '20FT', price = 2200000 }) {
  const serviceName = size === '40FT' ? 'Jasa Angkut D40' : 'Jasa Angkut D20';
  return JSON.stringify([{ serviceName, qty: 1, price, total: price, containerType: size }]);
}

function salesOrder({ soNumber, doNumber, date, customer, destination, size = '20FT', price = 2200000, status = 'running' }) {
  return {
    so_number: soNumber,
    accurate_so_number: soNumber,
    do_number: doNumber,
    so_date: date,
    trip_date: date,
    received_at: atWib(date, '07:30:00'),
    customer_name: customer,
    customer_pic: 'PIC Testing',
    customer_phone: '0812-0000-TEST',
    customer_address: destination,
    shipment_type: 'import',
    job_type: 'Trucking Container',
    job_description: `Testing INAP ${customer} ke ${destination}`,
    container_summary: `1x${size}`,
    line_items: lineItems({ size, price }),
    do20_quantity: size === '20FT' ? 1 : 0,
    do40_quantity: size === '40FT' ? 1 : 0,
    price,
    quantity: 1,
    unit: 'Container',
    total_amount: price,
    origin: 'Tanjung Priok',
    destination,
    status,
    finance_verification_status: 'verified',
    payment_type: 'cash',
    sales_name: 'Sales Testing',
    created_by_name: 'Sales Testing',
    updated_by_name: 'Seed INAP',
    notes: 'Data dummy kecil khusus testing flow INAP.',
  };
}

function containerJob({
  order,
  driver,
  vehicle,
  containerNumber,
  date,
  destination,
  size = '20FT',
  status = 'running',
  runningAt,
  completedAt = null,
  hasInap = false,
  inapStartedAt = null,
  inapEndedAt = null,
  inapReason = '',
  inapNotes = '',
}) {
  return {
    sales_order_id: order.id,
    container_number: containerNumber,
    container_size: size,
    container_type: 'Dry',
    destination,
    rpuj_status: 'approved',
    spk_number: `SPK-${order.so_number}`,
    eir_number: status === 'completed' ? `EIR-${containerNumber}` : null,
    loading_voucher_number: status === 'completed' ? `BM-${containerNumber}` : null,
    travel_document_number: status === 'completed' ? `SJ-${containerNumber}` : null,
    driver_id: driver.id,
    vehicle_id: vehicle.id,
    assignment_snapshot: JSON.stringify({
      driver: driver.name,
      plateNumber: vehicle.plate_number,
      unitCode: vehicle.unit_code,
      vehicleDetail: `${vehicle.unit_code} - ${vehicle.brand} ${vehicle.vehicle_type}`,
    }),
    status,
    received_at: atWib(date, '07:30:00'),
    running_at: runningAt,
    completed_at: completedAt,
    inap_started_at: hasInap ? inapStartedAt : null,
    inap_ended_at: hasInap ? inapEndedAt : null,
    inap_reason: hasInap ? inapReason : null,
    inap_notes: hasInap ? inapNotes : null,
    inap_created_by_name: hasInap ? 'Operational Testing' : null,
    commission_status: 'with_commission',
    uj_amount_snapshot: size === '40FT' ? 500000 : 350000,
    uj_snapshot_source: 'seed_inap_testing',
    created_by_name: 'Sales Testing',
    updated_by_name: 'Operational Testing',
    created_at: atWib(date, '07:30:00'),
    updated_at: completedAt || runningAt,
  };
}

assertDevDatabase();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('begin');

  const tables = await getTables(client);
  const truncateTables = tables.filter((table) => !keepTables.has(table));
  if (truncateTables.length) {
    await client.query(`truncate table ${truncateTables.join(', ')} restart identity cascade`);
  }

  await client.query(
    `
      insert into system_settings (setting_key, setting_value)
      values ('archive', $1::jsonb)
      on conflict (setting_key) do update
      set setting_value = excluded.setting_value,
          updated_at = now()
    `,
    [JSON.stringify({ companyName: 'PT Armada Testing', scope: 'INAP testing seed' })],
  );

  await insertRows(client, 'customers', [
    { name: 'INAP TEST CUSTOMER', address: 'Cilegon', pic_name: 'PIC Inap', phone: '0812-1000-0001', contract_status: 'Aktif', sales_name: 'Sales Testing' },
    { name: 'NON INAP LONG TRIP', address: 'Semarang', pic_name: 'PIC Long Trip', phone: '0812-1000-0002', contract_status: 'Aktif', sales_name: 'Sales Testing' },
  ]);

  const drivers = await insertRows(client, 'drivers', [
    { name: 'DRIVER INAP TEST 1', nickname: 'INAP1', phone: '081270000001', license_type: 'SIM B2 Umum', license_expiry_date: '2028-12-31', operational_status: 'Aktif', health_status: 'Aman', bank_name: 'BCA', bank_account_number: '123450001', bank_account_holder: 'DRIVER INAP TEST 1' },
    { name: 'DRIVER INAP TEST 2', nickname: 'INAP2', phone: '081270000002', license_type: 'SIM B2 Umum', license_expiry_date: '2028-12-31', operational_status: 'Aktif', health_status: 'Aman', bank_name: 'Mandiri', bank_account_number: '123450002', bank_account_holder: 'DRIVER INAP TEST 2' },
    { name: 'DRIVER LONG TRIP', nickname: 'LONG', phone: '081270000003', license_type: 'SIM B2 Umum', license_expiry_date: '2028-12-31', operational_status: 'Aktif', health_status: 'Aman', bank_name: 'BRI', bank_account_number: '123450003', bank_account_holder: 'DRIVER LONG TRIP' },
  ]);

  const chassis = await insertRows(client, 'kir_chassis', [
    { chassis_code: 'CHS-INAP-001', plate_number: 'B 9201 CHS', container_size: '20FT', kir_number: 'KIR-CHS-INAP-001', kir_expiry_date: '2028-12-31', operational_status: 'Aktif' },
    { chassis_code: 'CHS-INAP-002', plate_number: 'B 9202 CHS', container_size: '20FT', kir_number: 'KIR-CHS-INAP-002', kir_expiry_date: '2028-12-31', operational_status: 'Aktif' },
    { chassis_code: 'CHS-LONG-001', plate_number: 'B 9203 CHS', container_size: '40FT', kir_number: 'KIR-CHS-LONG-001', kir_expiry_date: '2028-12-31', operational_status: 'Aktif' },
  ]);

  const vehicles = await insertRows(client, 'vehicles', [
    { unit_code: 'TRK-INAP-001', plate_number: 'B 9101 INP', brand: 'Hino', vehicle_type: '500 Ranger', container_size: '20FT', chassis_size: '20FT', production_year: 2022, operational_status: 'Aktif', default_driver_name: drivers[0].name, default_driver_id: drivers[0].id, current_chassis_id: chassis[0].id, current_chassis_code: chassis[0].chassis_code, kir_chassis_number: chassis[0].chassis_code, stnk_number: 'STNK-INAP-001', stnk_expiry_date: '2028-12-31', kir_number: 'KIR-INAP-001', kir_expiry_date: '2028-12-31', received_date: '2024-01-01' },
    { unit_code: 'TRK-INAP-002', plate_number: 'B 9102 INP', brand: 'Hino', vehicle_type: '500 Ranger', container_size: '20FT', chassis_size: '20FT', production_year: 2022, operational_status: 'Aktif', default_driver_name: drivers[1].name, default_driver_id: drivers[1].id, current_chassis_id: chassis[1].id, current_chassis_code: chassis[1].chassis_code, kir_chassis_number: chassis[1].chassis_code, stnk_number: 'STNK-INAP-002', stnk_expiry_date: '2028-12-31', kir_number: 'KIR-INAP-002', kir_expiry_date: '2028-12-31', received_date: '2024-01-01' },
    { unit_code: 'TRK-LONG-001', plate_number: 'B 9140 LNG', brand: 'Mitsubishi Fuso', vehicle_type: 'Fighter', container_size: '40FT', chassis_size: '40FT', production_year: 2021, operational_status: 'Aktif', default_driver_name: drivers[2].name, default_driver_id: drivers[2].id, current_chassis_id: chassis[2].id, current_chassis_code: chassis[2].chassis_code, kir_chassis_number: chassis[2].chassis_code, stnk_number: 'STNK-LONG-001', stnk_expiry_date: '2028-12-31', kir_number: 'KIR-LONG-001', kir_expiry_date: '2028-12-31', received_date: '2024-01-01' },
  ]);

  await client.query(`
    update kir_chassis
    set container_size = '20FT'
    where chassis_code in ('CHS-INAP-001', 'CHS-INAP-002')
  `);
  await client.query(`
    update vehicles v
    set container_size = '20FT',
        chassis_size = '20FT',
        current_chassis_id = c.id,
        current_chassis_code = c.chassis_code,
        kir_chassis_number = c.chassis_code
    from kir_chassis c
    where v.plate_number = 'B 9101 INP'
      and c.chassis_code = 'CHS-INAP-001'
  `);
  await client.query(`
    update vehicles v
    set container_size = '20FT',
        chassis_size = '20FT',
        current_chassis_id = c.id,
        current_chassis_code = c.chassis_code,
        kir_chassis_number = c.chassis_code
    from kir_chassis c
    where v.plate_number = 'B 9102 INP'
      and c.chassis_code = 'CHS-INAP-002'
  `);

  await insertRows(client, 'destination_locations', [
    { name: 'Cilegon', area: 'Banten', address: 'Cilegon', operational_status: 'Aktif', uj_20ft: 450000, uj_40ft: 650000, driver_commission_20ft: 70000, driver_commission_40ft: 100000 },
    { name: 'Semarang', area: 'Jawa Tengah', address: 'Semarang', operational_status: 'Aktif', uj_20ft: 900000, uj_40ft: 1300000, driver_commission_20ft: 140000, driver_commission_40ft: 180000 },
  ]);

  await insertRows(client, 'depots', [
    { name: 'Depo Testing Inap', code: 'DPI', address: 'Cilegon', operational_status: 'Aktif', depot_type: 'storage' },
  ]);

  await insertRows(client, 'terminals', [
    { name: 'Terminal Testing Inap', code: 'TTI', port_area: 'Tanjung Priok', operational_status: 'Aktif' },
  ]);

  const orders = await insertRows(client, 'sales_orders', [
    salesOrder({ soNumber: 'SO-INAP-RUN-001', doNumber: 'DO-INAP-RUN-001', date: '2026-09-14', customer: 'INAP TEST CUSTOMER', destination: 'Cilegon', size: '20FT', price: 2200000, status: 'running' }),
    salesOrder({ soNumber: 'SO-INAP-DONE-001', doNumber: 'DO-INAP-DONE-001', date: '2026-09-12', customer: 'INAP TEST CUSTOMER', destination: 'Cilegon', size: '20FT', price: 2200000, status: 'completed' }),
    salesOrder({ soNumber: 'SO-LONG-NONINAP-001', doNumber: 'DO-LONG-NONINAP-001', date: '2026-09-10', customer: 'NON INAP LONG TRIP', destination: 'Semarang', size: '40FT', price: 4200000, status: 'completed' }),
  ]);

  const [runningOrder, completedInapOrder, longNonInapOrder] = orders;
  const jobs = await insertRows(client, 'container_jobs', [
    containerJob({
      order: runningOrder,
      driver: drivers[0],
      vehicle: vehicles[0],
      containerNumber: 'INAPRUN001',
      date: '2026-09-14',
      destination: 'Cilegon',
      size: '20FT',
      status: 'running',
      runningAt: atWib('2026-09-14', '08:00:00'),
    }),
    containerJob({
      order: completedInapOrder,
      driver: drivers[1],
      vehicle: vehicles[1],
      containerNumber: 'INAPDONE001',
      date: '2026-09-12',
      destination: 'Cilegon',
      size: '20FT',
      status: 'completed',
      runningAt: atWib('2026-09-12', '08:00:00'),
      completedAt: atWib('2026-09-13', '10:30:00'),
      hasInap: true,
      inapStartedAt: atWib('2026-09-12', '21:00:00'),
      inapEndedAt: atWib('2026-09-13', '06:00:00'),
      inapReason: 'Curfew malam, truk tidak boleh jalan sampai subuh',
      inapNotes: 'Parkir aman di rest area KM 57. Ini harus muncul di Finance sebagai Ritasi Inap.',
    }),
    containerJob({
      order: longNonInapOrder,
      driver: drivers[2],
      vehicle: vehicles[2],
      containerNumber: 'LONGNONINAP001',
      date: '2026-09-10',
      destination: 'Semarang',
      size: '40FT',
      status: 'completed',
      runningAt: atWib('2026-09-10', '06:00:00'),
      completedAt: atWib('2026-09-11', '09:30:00'),
      hasInap: false,
    }),
  ]);

  await insertRows(client, 'attachments', [
    { entity_type: 'container_job', entity_id: jobs[1].id, category: 'eirDocument', reference_number: 'EIR-INAPDONE001', file_name: 'eir-inapdone001.pdf', storage_path: 'dummy/eir-inapdone001.pdf', mime_type: 'application/pdf', file_size: 1000, uploaded_by_name: 'Operational Testing' },
    { entity_type: 'container_job', entity_id: jobs[1].id, category: 'travelDocumentFile', reference_number: 'SJ-INAPDONE001', file_name: 'sj-inapdone001.pdf', storage_path: 'dummy/sj-inapdone001.pdf', mime_type: 'application/pdf', file_size: 1000, uploaded_by_name: 'Operational Testing' },
    { entity_type: 'container_job', entity_id: jobs[2].id, category: 'eirDocument', reference_number: 'EIR-LONGNONINAP001', file_name: 'eir-longnoninap001.pdf', storage_path: 'dummy/eir-longnoninap001.pdf', mime_type: 'application/pdf', file_size: 1000, uploaded_by_name: 'Operational Testing' },
    { entity_type: 'container_job', entity_id: jobs[2].id, category: 'travelDocumentFile', reference_number: 'SJ-LONGNONINAP001', file_name: 'sj-longnoninap001.pdf', storage_path: 'dummy/sj-longnoninap001.pdf', mime_type: 'application/pdf', file_size: 1000, uploaded_by_name: 'Operational Testing' },
  ]);

  await insertRows(client, 'activity_logs', [
    { actor_name: 'Seed INAP', actor_role: 'admin', action: 'RESET_INAP_TEST_DATABASE', target: 'Database Dev', metadata: JSON.stringify({ salesOrders: 3, containerJobs: 3 }) },
  ]);

  await client.query('commit');

  const summary = {};
  for (const table of ['sales_orders', 'container_jobs', 'drivers', 'vehicles', 'customers', 'manual_revenue_lines', 'container_job_expenses']) {
    summary[table] = await countRows(client, table);
  }
  console.log(JSON.stringify({
    message: 'Database dev dibersihkan dan diisi seed kecil untuk testing INAP.',
    summary,
    scenarios: [
      'SO-INAP-RUN-001: ritasi running untuk dicoba Tandai Inap dari Operational.',
      'SO-INAP-DONE-001: ritasi completed dengan histori inap untuk pivot dan Finance.',
      'SO-LONG-NONINAP-001: ritasi >24 jam tapi bukan inap.',
    ],
  }, null, 2));
} catch (error) {
  await client.query('rollback');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
