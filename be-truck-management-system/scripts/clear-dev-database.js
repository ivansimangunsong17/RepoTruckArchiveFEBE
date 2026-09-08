import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const keepTables = new Set(['schema_migrations', 'system_settings', 'users']);

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
  `);

  await client.query(`
    insert into system_settings (setting_key, setting_value)
    values (
      'archive',
      '{"companyName":"PT Armada Baru","scope":"Clean dev database untuk UAT"}'::jsonb
    )
    on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = now()
  `);

  await insertRows(client, 'customers', [
    { name: 'PT Tirta Amerta Jaya Logistik', address: 'Cikarang, Jawa Barat', pic_name: 'Pak Andi', phone: '021-5551-0101', contract_status: 'Aktif', sales_name: 'Sales Ellie' },
    { name: 'PT MSC Mediterranean Shipping Indonesia', address: 'Jakarta Utara', pic_name: 'Bu Rina', phone: '021-5551-0202', contract_status: 'Aktif', sales_name: 'Sales Ellie' },
    { name: 'PAK WAHIB', address: 'Bekasi, Jawa Barat', pic_name: 'Pak Wahib', phone: '0812-0000-0303', contract_status: 'Aktif', sales_name: 'Sales Didi' },
  ]);

  const drivers = await insertRows(client, 'drivers', [
    { name: 'Driver Andi Dummy', phone: '0812-1000-0001', license_type: 'SIM B2 Umum', license_expiry_date: '2027-09-01', operational_status: 'Aktif', health_status: 'Aman', bank_name: 'BCA', bank_account_number: '1234567890', bank_account_holder: 'Driver Andi Dummy' },
    { name: 'Driver Budi Dummy', phone: '0812-1000-0002', license_type: 'SIM B2 Umum', license_expiry_date: '2027-09-01', operational_status: 'Aktif', health_status: 'Aman', bank_name: 'Mandiri', bank_account_number: '2234567890', bank_account_holder: 'Driver Budi Dummy' },
    { name: 'Driver Candra Dummy', phone: '0812-1000-0003', license_type: 'SIM B2 Umum', license_expiry_date: '2027-09-01', operational_status: 'Aktif', health_status: 'Aman', bank_name: 'BRI', bank_account_number: '3234567890', bank_account_holder: 'Driver Candra Dummy' },
  ]);

  const chassis = await insertRows(client, 'kir_chassis', [
    { chassis_code: 'CHS-DMY-20-01', plate_number: 'B 9201 CDM', container_size: '20FT', kir_number: 'KIR-CHS-20-01', kir_expiry_date: '2027-09-01', operational_status: 'Aktif', notes: 'Dummy chassis 20FT' },
    { chassis_code: 'CHS-DMY-40-01', plate_number: 'B 9401 CDM', container_size: '40FT', kir_number: 'KIR-CHS-40-01', kir_expiry_date: '2027-09-01', operational_status: 'Aktif', notes: 'Dummy chassis 40FT' },
  ]);
  const chassisByCode = Object.fromEntries(chassis.map((row) => [row.chassis_code, row]));

  const driverByName = Object.fromEntries(drivers.map((row) => [row.name, row]));
  const vehicles = await insertRows(client, 'vehicles', [
    { unit_code: 'TRK-DMY-01', plate_number: 'B 9101 DMY', brand: 'Hino', vehicle_type: '500 Ranger', container_size: '20FT', production_year: 2021, operational_status: 'Aktif', default_driver_name: 'Driver Andi Dummy', default_driver_id: driverByName['Driver Andi Dummy']?.id, current_chassis_id: chassisByCode['CHS-DMY-20-01']?.id, current_chassis_code: 'CHS-DMY-20-01' },
    { unit_code: 'TRK-DMY-02', plate_number: 'B 9102 DMY', brand: 'Hino', vehicle_type: '500 Ranger', container_size: '40FT', production_year: 2021, operational_status: 'Aktif', default_driver_name: 'Driver Budi Dummy', default_driver_id: driverByName['Driver Budi Dummy']?.id, current_chassis_id: chassisByCode['CHS-DMY-40-01']?.id, current_chassis_code: 'CHS-DMY-40-01' },
    { unit_code: 'TRK-DMY-03', plate_number: 'B 9103 DMY', brand: 'Hino', vehicle_type: '500 Ranger', container_size: '20FT', production_year: 2022, operational_status: 'Aktif', default_driver_name: 'Driver Candra Dummy', default_driver_id: driverByName['Driver Candra Dummy']?.id },
  ]);

  const vehiclesByPlate = Object.fromEntries(vehicles.map((row) => [row.plate_number, row]));
  await insertRows(client, 'kir_heads', [
    { unit_code: 'HEAD-DMY-01', plate_number: 'B 9101 DMY', kir_number: 'KIR-HEAD-001', kir_expiry_date: '2027-09-01', operational_status: 'Aktif' },
    { unit_code: 'HEAD-DMY-02', plate_number: 'B 9102 DMY', kir_number: 'KIR-HEAD-002', kir_expiry_date: '2027-09-01', operational_status: 'Aktif' },
    { unit_code: 'HEAD-DMY-03', plate_number: 'B 9103 DMY', kir_number: 'KIR-HEAD-003', kir_expiry_date: '2027-09-01', operational_status: 'Aktif' },
  ]);

  await insertRows(client, 'vehicle_assignment_history', [
    {
      vehicle_id: vehiclesByPlate['B 9101 DMY']?.id,
      change_type: 'chassis',
      next_chassis_id: chassisByCode['CHS-DMY-20-01']?.id,
      next_chassis_code: 'CHS-DMY-20-01',
      reason: 'Setup data dummy clean',
      note: 'Chassis awal untuk UAT',
      changed_by_name: 'System',
      changed_by_role: 'admin',
    },
    {
      vehicle_id: vehiclesByPlate['B 9102 DMY']?.id,
      change_type: 'chassis',
      next_chassis_id: chassisByCode['CHS-DMY-40-01']?.id,
      next_chassis_code: 'CHS-DMY-40-01',
      reason: 'Setup data dummy clean',
      note: 'Chassis awal untuk UAT',
      changed_by_name: 'System',
      changed_by_role: 'admin',
    },
  ].filter((row) => row.vehicle_id));

  await insertRows(client, 'depots', [
    { name: 'Depo Dummy Cakung', code: 'D-CGK', address: 'Cakung', operational_status: 'Aktif' },
    { name: 'Depo Dummy Marunda', code: 'D-MRD', address: 'Marunda', operational_status: 'Aktif' },
  ]);

  await insertRows(client, 'terminals', [
    { name: 'JICT Dummy', code: 'JICT-DMY', port_area: 'Tanjung Priok', operational_status: 'Aktif' },
    { name: 'NPCT1 Dummy', code: 'NPCT-DMY', port_area: 'Tanjung Priok', operational_status: 'Aktif' },
  ]);

  await insertRows(client, 'destination_locations', [
    { name: 'Cikarang Dummy', area: 'Cikarang', address: 'Cikarang', operational_status: 'Aktif', uj_20ft: 300000, uj_40ft: 450000, driver_commission_20ft: 50000, driver_commission_40ft: 75000 },
    { name: 'Karawang Dummy', area: 'Karawang', address: 'Karawang', operational_status: 'Aktif', uj_20ft: 350000, uj_40ft: 500000, driver_commission_20ft: 60000, driver_commission_40ft: 85000 },
    { name: 'Bekasi Dummy', area: 'Bekasi', address: 'Bekasi', operational_status: 'Aktif', uj_20ft: 250000, uj_40ft: 400000, driver_commission_20ft: 45000, driver_commission_40ft: 70000 },
  ]);

  await insertRows(client, 'stid_masters', [
    { name: 'STID Dummy Armada', code: 'STID-DMY', address: 'Tanjung Priok', operational_status: 'Aktif' },
  ]);

  await insertRows(client, 'end_users', [
    { name: 'End User Dummy', code: 'EU-DMY', address: 'Cikarang', pic_name: 'Pak User', phone: '0812-2000-0001', operational_status: 'Aktif' },
  ]);

  await client.query('commit');

  const finalTables = await getTables(client);
  const counts = await countRows(client, finalTables);
  console.log(JSON.stringify(counts, null, 2));
} catch (error) {
  await client.query('rollback');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
