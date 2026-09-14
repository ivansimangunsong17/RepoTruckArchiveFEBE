import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const keepTables = new Set(['schema_migrations', 'system_settings', 'users']);
const seedDate = process.env.SEED_DATE || '2026-09-13';

function assertDevDatabase() {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) throw new Error('DATABASE_URL belum dikonfigurasi.');
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Cleanup ditolak: NODE_ENV=production.');
  }
  const url = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`Cleanup ditolak: database bukan localhost (${url.hostname}).`);
  }
}

function addDays(dateKey, offset) {
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function atWib(dateKey, time = '08:00:00') {
  return `${dateKey}T${time}+07:00`;
}

function toDateKey(value) {
  if (!value) return value;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }
  return String(value).slice(0, 10);
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

async function countRows(client, tables) {
  const counts = {};
  for (const table of tables) {
    const result = await client.query(`select count(*)::int as count from ${table}`);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

function buildLineItem({ description, qty, size, price }) {
  const amount = Number(price || 0);
  return { description, qty, size, price: amount, total: qty * amount };
}

function makeOrderPayload({
  soNumber,
  doNumber,
  date,
  customer,
  shipmentType,
  destination,
  salesName,
  qty20 = 0,
  qty40 = 0,
  price20 = 2100000,
  price40 = 3200000,
  status = 'running',
  vendor = false,
  vendorName = '',
  vendorNote = '',
}) {
  const totalQty = qty20 + qty40;
  const lineItems = [
    qty20 ? buildLineItem({ description: `Jasa Angkut ${destination} 20FT`, qty: qty20, size: '20FT', price: price20 }) : null,
    qty40 ? buildLineItem({ description: `Jasa Angkut ${destination} 40FT`, qty: qty40, size: '40FT', price: price40 }) : null,
  ].filter(Boolean);
  const totalAmount = lineItems.reduce((total, item) => total + item.total, 0);
  return {
    so_number: soNumber,
    do_number: doNumber,
    so_date: date,
    trip_date: date,
    received_at: atWib(date, '07:30:00'),
    customer_name: customer,
    customer_pic: 'PIC Operasional',
    customer_phone: '021-5551-0000',
    customer_address: destination,
    shipment_type: shipmentType,
    job_type: 'Trucking Container',
    job_description: `${shipmentType.toUpperCase()} ${customer} ke ${destination}`,
    container_summary: [qty20 ? `${qty20}x20FT` : '', qty40 ? `${qty40}x40FT` : ''].filter(Boolean).join(' + '),
    line_items: JSON.stringify(lineItems),
    do20_quantity: qty20,
    do40_quantity: qty40,
    price: totalQty ? Math.round(totalAmount / totalQty) : 0,
    quantity: totalQty || 1,
    unit: 'Container',
    total_amount: totalAmount,
    origin: 'Tanjung Priok',
    destination,
    status,
    sales_name: salesName,
    created_by_name: salesName,
    updated_by_name: 'Operational Demo',
    is_vendor_order: vendor,
    vendor_name: vendorName,
    vendor_note: vendorNote,
    notes: vendor ? `Order dicatat sebagai vendor. ${vendorNote}` : 'Data dummy realistis untuk UAT.',
  };
}

function makeContainerJobs({ order, drivers, vehicles, destination, qty, size, statuses, startIndex = 1 }) {
  const availableVehicles = vehicles.filter((vehicle) => vehicle.container_size === size);
  const jobs = [];
  const tripDate = toDateKey(order.trip_date);
  for (let index = 0; index < qty; index += 1) {
    const vehicle = availableVehicles[index % availableVehicles.length];
    const driver = drivers.find((row) => row.name === vehicle?.default_driver_name) || drivers[index % drivers.length];
    const status = statuses[index] || 'received';
    const sequence = String(startIndex + index).padStart(2, '0');
    const receivedAt = atWib(tripDate, '07:30:00');
    const runningAt = ['running', 'completed', 'inap', 'repo_stored'].includes(status) ? atWib(tripDate, `${String(8 + (index % 5)).padStart(2, '0')}:15:00`) : null;
    const completedAt = status === 'completed' ? atWib(tripDate, `${String(14 + (index % 5)).padStart(2, '0')}:30:00`) : null;
    const containerNumber = status === 'received'
      ? null
      : `${size === '20FT' ? 'TCLU' : 'MSCU'}${String(order.so_number.replace(/\D/g, '').slice(-4) || '0000')}${sequence}`;
    jobs.push({
      sales_order_id: order.id,
      container_number: containerNumber,
      container_size: size,
      container_type: 'Dry',
      destination,
      rpuj_status: status === 'received' ? 'pending' : 'approved',
      spk_number: status === 'received' ? null : `SPK-${order.so_number}-${sequence}`,
      loading_voucher_number: status === 'completed' ? `BM-${order.so_number}-${sequence}` : null,
      travel_document_number: status === 'completed' ? `SJ-${order.so_number}-${sequence}` : null,
      driver_id: status === 'received' ? null : driver?.id,
      vehicle_id: status === 'received' ? null : vehicle?.id,
      assignment_snapshot: status === 'received' ? '{}' : JSON.stringify({
        driver: driver?.name,
        plateNumber: vehicle?.plate_number,
        vehicleDetail: `${vehicle?.unit_code} - ${vehicle?.brand} ${vehicle?.vehicle_type}`,
      }),
      status,
      received_at: receivedAt,
      running_at: runningAt,
      completed_at: completedAt,
      commission_status: status === 'cancelled' ? 'no_commission' : 'with_commission',
      uj_amount_snapshot: size === '20FT' ? 350000 : 500000,
      uj_snapshot_source: 'seed_dummy',
      created_by_name: order.created_by_name,
      updated_by_name: 'Operational Demo',
      created_at: receivedAt,
      updated_at: completedAt || runningAt || receivedAt,
    });
  }
  return jobs;
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

  await client.query(`
    delete from users
    where email ilike '%@example.test'
       or name ilike 'Sprint2C %'
       or name ilike '%Dummy%'
  `);

  await client.query(
    `
      insert into system_settings (setting_key, setting_value)
      values ('archive', $1::jsonb)
      on conflict (setting_key) do update
      set setting_value = excluded.setting_value,
          updated_at = now()
    `,
    [JSON.stringify({ companyName: 'PT Armada Baru', scope: 'Clean dev database realistic daily ops seed', seedDate })],
  );

  await insertRows(client, 'customers', [
    { name: 'PAK DIDI', address: 'Karawang', pic_name: 'Pak Didi', phone: '0812-1000-0001', contract_status: 'Aktif', sales_name: 'Sales Didi' },
    { name: 'ELI PAKU HAJI', address: 'Paku Haji, Tangerang', pic_name: 'Eli', phone: '0812-1000-0002', contract_status: 'Aktif', sales_name: 'Sales Ellie' },
    { name: 'INDOBARAT', address: 'Purwakarta', pic_name: 'Pak IBR', phone: '0812-1000-0003', contract_status: 'Aktif', sales_name: 'Sales IBR' },
    { name: 'DAKI LOGISTICS', address: 'Jawilan', pic_name: 'Pak Daki', phone: '0812-1000-0004', contract_status: 'Aktif', sales_name: 'Sales Daki' },
    { name: 'MJ TANGERANG', address: 'Tangerang', pic_name: 'Pak MJ', phone: '0812-1000-0005', contract_status: 'Aktif', sales_name: 'Sales MJ' },
    { name: 'NUANSA BREBES', address: 'Brebes', pic_name: 'Pak Nuansa', phone: '0812-1000-0006', contract_status: 'Aktif', sales_name: 'Sales Nuansa' },
  ]);

  const driverNames = [
    'AGUS', 'HIPZI', 'NAJI', 'RANDI', 'DODI', 'RIYANTO', 'ERLAN', 'RUSMANA', 'TARYO', 'ALI',
    'ROZI', 'SUITO', 'ENDANG', 'AKUNG', 'JUMADI', 'RENDI', 'MOPED', 'IQBAL', 'NANANG', 'ASEP',
  ];
  const drivers = await insertRows(client, 'drivers', driverNames.map((name, index) => ({
    name,
    nickname: name,
    phone: `0812${String(70000000 + index).padStart(8, '0')}`,
    license_type: index % 3 === 0 ? 'SIM B1 Umum' : 'SIM B2 Umum',
    license_expiry_date: '2028-09-30',
    operational_status: index < 17 ? 'Aktif' : 'Standby',
    health_status: 'Aman',
    bank_name: index % 2 === 0 ? 'BCA' : 'Mandiri',
    bank_account_number: `12345${String(1000 + index)}`,
    bank_account_holder: name,
  })));

  const chassis = await insertRows(client, 'kir_chassis', Array.from({ length: 20 }, (_, index) => {
    const number = index + 1;
    const size = number <= 12 ? '20FT' : '40FT';
    return {
      chassis_code: `CHS-${String(number).padStart(3, '0')}`,
      plate_number: `B ${9200 + number} CHS`,
      container_size: size,
      kir_number: `KIR-CHS-${String(number).padStart(3, '0')}`,
      kir_expiry_date: '2027-12-31',
      received_date: '2024-01-01',
      operational_status: 'Aktif',
      notes: `Seed chassis ${size}`,
    };
  }));
  const chassisByIndex = new Map(chassis.map((row, index) => [index + 1, row]));

  const vehicles = await insertRows(client, 'vehicles', Array.from({ length: 20 }, (_, index) => {
    const number = index + 1;
    const size = number <= 12 ? '20FT' : '40FT';
    const driver = drivers[index];
    const chassisRow = chassisByIndex.get(number);
    return {
      unit_code: `TRK-${String(number).padStart(3, '0')}`,
      plate_number: `B ${9100 + number} BEL`,
      brand: number % 2 === 0 ? 'Mitsubishi Fuso' : 'Hino',
      vehicle_type: number % 2 === 0 ? 'Fighter FM 65' : '500 Ranger',
      container_size: size,
      chassis_size: size,
      production_year: 2020 + (number % 4),
      operational_status: number >= 19 ? 'Maintenance' : 'Aktif',
      default_driver_name: driver?.name,
      default_driver_id: driver?.id,
      current_chassis_id: chassisRow?.id,
      current_chassis_code: chassisRow?.chassis_code,
      kir_chassis_number: chassisRow?.chassis_code,
      stnk_number: `STNK-${String(number).padStart(3, '0')}`,
      stnk_expiry_date: '2027-12-31',
      kir_number: `KIR-HEAD-${String(number).padStart(3, '0')}`,
      kir_expiry_date: '2027-12-31',
      received_date: '2024-01-01',
      notes: number >= 19 ? 'Dummy maintenance unit' : 'Dummy active unit',
    };
  }));

  await insertRows(client, 'kir_heads', vehicles.map((vehicle) => ({
    unit_code: `HEAD-${vehicle.unit_code}`,
    plate_number: vehicle.plate_number,
    kir_number: `KIR-${vehicle.unit_code}`,
    kir_expiry_date: '2027-12-31',
    operational_status: vehicle.operational_status,
  })));

  await insertRows(client, 'vehicle_assignment_history', vehicles.map((vehicle, index) => ({
    vehicle_id: vehicle.id,
    change_type: 'chassis',
    next_chassis_id: chassisByIndex.get(index + 1)?.id,
    next_chassis_code: chassisByIndex.get(index + 1)?.chassis_code,
    reason: 'Setup data dummy clean',
    note: 'Chassis awal untuk UAT',
    changed_by_name: 'System',
    changed_by_role: 'admin',
  })));

  await insertRows(client, 'depots', [
    { name: 'Depo Marunda', code: 'MRD', address: 'Marunda', operational_status: 'Aktif', depot_type: 'storage' },
    { name: 'Depo Cakung', code: 'CKG', address: 'Cakung', operational_status: 'Aktif', depot_type: 'storage' },
  ]);

  await insertRows(client, 'terminals', [
    { name: 'JICT', code: 'JICT', port_area: 'Tanjung Priok', operational_status: 'Aktif' },
    { name: 'NPCT1', code: 'NPCT1', port_area: 'Tanjung Priok', operational_status: 'Aktif' },
  ]);

  await insertRows(client, 'destination_locations', [
    { name: 'Karawang', area: 'Karawang', address: 'Karawang', operational_status: 'Aktif', uj_20ft: 350000, uj_40ft: 500000, driver_commission_20ft: 60000, driver_commission_40ft: 85000 },
    { name: 'Paku Haji', area: 'Tangerang', address: 'Paku Haji', operational_status: 'Aktif', uj_20ft: 420000, uj_40ft: 580000, driver_commission_20ft: 65000, driver_commission_40ft: 90000 },
    { name: 'Purwakarta', area: 'PWK', address: 'Purwakarta', operational_status: 'Aktif', uj_20ft: 450000, uj_40ft: 650000, driver_commission_20ft: 70000, driver_commission_40ft: 100000 },
    { name: 'Jawilan', area: 'Serang', address: 'Jawilan', operational_status: 'Aktif', uj_20ft: 400000, uj_40ft: 560000, driver_commission_20ft: 65000, driver_commission_40ft: 90000 },
    { name: 'Tangerang', area: 'Tangerang', address: 'Tangerang', operational_status: 'Aktif', uj_20ft: 320000, uj_40ft: 480000, driver_commission_20ft: 55000, driver_commission_40ft: 80000 },
    { name: 'Cikampek', area: 'Cikampek', address: 'Cikampek', operational_status: 'Aktif', uj_20ft: 380000, uj_40ft: 540000, driver_commission_20ft: 60000, driver_commission_40ft: 85000 },
  ]);

  await insertRows(client, 'stid_masters', [
    { name: 'STID Armada Priok', code: 'STID-ARMADA', address: 'Tanjung Priok', operational_status: 'Aktif' },
  ]);

  await insertRows(client, 'end_users', [
    { name: 'End User Karawang', code: 'EU-KRW', address: 'Karawang', pic_name: 'Pak User', phone: '0812-2000-0001', operational_status: 'Aktif' },
    { name: 'End User Paku Haji', code: 'EU-PHJ', address: 'Paku Haji', pic_name: 'Bu User', phone: '0812-2000-0002', operational_status: 'Aktif' },
  ]);

  const dayMinus4 = addDays(seedDate, -4);
  const dayMinus3 = addDays(seedDate, -3);
  const dayMinus2 = addDays(seedDate, -2);
  const dayMinus1 = addDays(seedDate, -1);
  const dayPlus1 = addDays(seedDate, 1);

  const orderDefinitions = [
    makeOrderPayload({ soNumber: 'SO-DMY-0909-001', doNumber: 'DO-WAHIB-001', date: dayMinus4, customer: 'PAK WAHIB', shipmentType: 'import', destination: 'Cikande', salesName: 'Sales Didi', qty20: 3, status: 'cancelled' }),
    makeOrderPayload({ soNumber: 'SO-DMY-0909-002', doNumber: 'DO-ELI-001', date: dayMinus4, customer: 'ELI PAKU HAJI', shipmentType: 'import', destination: 'Karawang', salesName: 'Sales Ellie', qty20: 5, status: 'completed' }),
    makeOrderPayload({ soNumber: 'SO-DMY-1009-001', doNumber: 'DO-MJ-001', date: dayMinus3, customer: 'MJ TANGERANG', shipmentType: 'import', destination: 'Tangerang', salesName: 'Sales MJ', qty40: 2, status: 'completed' }),
    makeOrderPayload({ soNumber: 'SO-DMY-1109-001', doNumber: 'DO-DAKI-001', date: dayMinus2, customer: 'DAKI LOGISTICS', shipmentType: 'export', destination: 'Jawilan', salesName: 'Sales Daki', qty20: 4, status: 'completed' }),
    makeOrderPayload({ soNumber: 'SO-DMY-1209-001', doNumber: 'DO-NUANSA-001', date: dayMinus1, customer: 'NUANSA BREBES', shipmentType: 'export', destination: 'Brebes', salesName: 'Sales Nuansa', qty40: 5, status: 'waiting_operational', vendor: true, vendorName: 'Vendor Brebes Jaya', vendorNote: 'Order vendor hanya pencatatan, tidak dibuat ritasi.' }),
    makeOrderPayload({ soNumber: 'SO-DMY-1309-001', doNumber: 'DO-IBR-001', date: seedDate, customer: 'INDOBARAT', shipmentType: 'export', destination: 'Purwakarta', salesName: 'Sales IBR', qty40: 8, status: 'running' }),
    makeOrderPayload({ soNumber: 'SO-DMY-1309-002', doNumber: 'DO-ELI-002', date: seedDate, customer: 'ELI PAKU HAJI', shipmentType: 'import', destination: 'Paku Haji', salesName: 'Sales Ellie', qty20: 5, status: 'running' }),
    makeOrderPayload({ soNumber: 'SO-DMY-1309-003', doNumber: 'DO-DIDI-001', date: seedDate, customer: 'PAK DIDI', shipmentType: 'import', destination: 'Karawang', salesName: 'Sales Didi', qty20: 4, status: 'running' }),
    makeOrderPayload({ soNumber: 'SO-DMY-1409-001', doNumber: 'DO-ELI-003', date: dayPlus1, customer: 'ELI PAKU HAJI', shipmentType: 'import', destination: 'Paku Haji', salesName: 'Sales Ellie', qty20: 8, status: 'waiting_operational' }),
    makeOrderPayload({ soNumber: 'SO-DMY-1409-002', doNumber: 'DO-CPI-001', date: dayPlus1, customer: 'CPI VOKSEL', shipmentType: 'export', destination: 'Karawang', salesName: 'Sales CPI', qty40: 2, status: 'waiting_operational' }),
  ];

  const orders = await insertRows(client, 'sales_orders', orderDefinitions);
  const orderBySo = Object.fromEntries(orders.map((order) => [order.so_number, order]));
  const activeVehicles = vehicles.filter((vehicle) => vehicle.operational_status === 'Aktif');
  const jobs = [
    ...makeContainerJobs({ order: orderBySo['SO-DMY-0909-002'], drivers, vehicles: activeVehicles, destination: 'Karawang', qty: 5, size: '20FT', statuses: Array(5).fill('completed') }),
    ...makeContainerJobs({ order: orderBySo['SO-DMY-1009-001'], drivers, vehicles: activeVehicles, destination: 'Tangerang', qty: 2, size: '40FT', statuses: Array(2).fill('completed') }),
    ...makeContainerJobs({ order: orderBySo['SO-DMY-1109-001'], drivers, vehicles: activeVehicles, destination: 'Jawilan', qty: 4, size: '20FT', statuses: Array(4).fill('completed') }),
    ...makeContainerJobs({ order: orderBySo['SO-DMY-1309-001'], drivers, vehicles: activeVehicles, destination: 'Purwakarta', qty: 8, size: '40FT', statuses: ['completed', 'completed', 'completed', 'running', 'running', 'running', 'received', 'received'] }),
    ...makeContainerJobs({ order: orderBySo['SO-DMY-1309-002'], drivers, vehicles: activeVehicles, destination: 'Paku Haji', qty: 5, size: '20FT', statuses: ['completed', 'running', 'running', 'received', 'received'], startIndex: 9 }),
    ...makeContainerJobs({ order: orderBySo['SO-DMY-1309-003'], drivers, vehicles: activeVehicles, destination: 'Karawang', qty: 4, size: '20FT', statuses: ['received', 'received', 'received', 'received'], startIndex: 14 }),
  ];
  await insertRows(client, 'container_jobs', jobs);

  await insertRows(client, 'attachments', [
    { entity_type: 'sales_order', entity_id: orderBySo['SO-DMY-1309-001']?.id, category: 'customerReference', file_name: 'DO-IBR-001.pdf', storage_path: 'dummy/do-ibr-001.pdf', mime_type: 'application/pdf', file_size: 120000, uploaded_by_name: 'Sales IBR' },
    { entity_type: 'sales_order', entity_id: orderBySo['SO-DMY-1309-002']?.id, category: 'customerReference', file_name: 'DO-ELI-002.pdf', storage_path: 'dummy/do-eli-002.pdf', mime_type: 'application/pdf', file_size: 110000, uploaded_by_name: 'Sales Ellie' },
  ].filter((row) => row.entity_id));

  await insertRows(client, 'activity_logs', [
    { actor_name: 'System', actor_role: 'Admin', action: 'RESET_DEV_DATABASE', target: 'Database Dev', metadata: JSON.stringify({ seedDate, trucks: 20, purpose: 'Data dummy realistis untuk UAT order harian' }) },
  ]);

  await client.query('commit');

  const finalTables = await getTables(client);
  const counts = await countRows(client, finalTables);
  console.log(JSON.stringify({
    seedDate,
    summary: {
      trucks: counts.vehicles || 0,
      drivers: counts.drivers || 0,
      salesOrders: counts.sales_orders || 0,
      containerJobs: counts.container_jobs || 0,
      customers: counts.customers || 0,
    },
    counts,
  }, null, 2));
} catch (error) {
  await client.query('rollback');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
