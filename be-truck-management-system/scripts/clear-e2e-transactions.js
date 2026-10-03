import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const keepTables = new Set([
  'schema_migrations',
  'system_settings',
  'users',
  'customers',
  'drivers',
  'vehicles',
  'kir_heads',
  'kir_chassis',
  'depots',
  'terminals',
  'destination_locations',
  'stid_masters',
  'end_users',
  'locations',
]);

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

async function getCounts(client, tables) {
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
  const transactionTables = tables.filter((table) => !keepTables.has(table));
  if (transactionTables.length) {
    await client.query(`truncate table ${transactionTables.join(', ')} restart identity cascade`);
  }

  await client.query(`
    delete from users
    where lower(email) not in (
      'admin@demo.com',
      'finance@demo.com',
      'operational@demo.com',
      'pengamat@demo.com',
      'sales@demo.com'
    )
  `);

  await client.query('delete from terminals');
  await client.query(`
    insert into terminals (name, code, port_area, operational_status, notes)
    values
      ('Terminal Testing Inap', 'PT-TERMINAL-TEST', 'Tanjung Priok', 'Aktif', 'Terminal utama E2E'),
      ('Terminal Testing Inap 2', 'PT-TERMINAL-TEST', 'Marunda', 'Aktif', 'Terminal kedua PT yang sama')
    on conflict do nothing
  `);

  await client.query(`
    insert into stid_masters (name, code, address, operational_status)
    values ('STID Testing E2E', 'STID-E2E', 'Tanjung Priok', 'Aktif')
    on conflict do nothing
  `);

  await client.query(`
    insert into end_users (name, code, address, pic_name, phone, operational_status)
    values ('End User Testing E2E', 'EU-E2E', 'Cilegon', 'PIC Testing', '081210000099', 'Aktif')
    on conflict do nothing
  `);

  await client.query('commit');

  const masterCounts = await getCounts(client, [...keepTables].filter((table) => tables.includes(table)));
  const remainingTransactionCounts = await getCounts(client, transactionTables);
  const nonEmptyTransactions = Object.fromEntries(
    Object.entries(remainingTransactionCounts).filter(([, count]) => count !== 0),
  );
  console.log(JSON.stringify({ masterCounts, nonEmptyTransactions }, null, 2));
} catch (error) {
  await client.query('rollback');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
