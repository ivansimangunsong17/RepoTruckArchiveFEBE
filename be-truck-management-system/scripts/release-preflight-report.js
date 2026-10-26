// Laporan preflight release (READ-ONLY): migration yang belum dijalankan dan data yang butuh
// keputusan Finance/Operational sebelum GO-LIVE. Semua query berjalan di transaksi read-only lalu
// di-rollback; tidak ada data yang diubah. Kredensial tidak pernah dicetak.
// Pakai: node scripts/release-preflight-report.js --env <path ke .env backend production>
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envIndex = process.argv.indexOf('--env');
if (envIndex === -1 || !process.argv[envIndex + 1]) {
  console.error('Wajib: --env <path .env backend>');
  process.exit(2);
}
dotenv.config({ path: path.resolve(process.argv[envIndex + 1]), override: true, quiet: true });
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL tidak ditemukan di file env.');
  process.exit(2);
}

const migrationFiles = (await readdir(path.join(backendRoot, 'src', 'db', 'migrations')))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => file.replace(/\.sql$/, ''))
  .sort();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const report = {};
try {
  await client.query('begin transaction read only');
  report.database = (await client.query('select current_database() as name')).rows[0].name;
  const hasMigrationTable = (await client.query("select to_regclass('public.schema_migrations') is not null as present")).rows[0].present;
  const applied = hasMigrationTable
    ? new Set((await client.query('select version from schema_migrations')).rows.map((row) => row.version))
    : new Set();
  report.pendingMigrations = migrationFiles.filter((version) => !applied.has(version));
  report.appliedNotInRelease = [...applied].filter((version) => !migrationFiles.includes(version)).sort();

  // Container yang sudah dititip sebelum aturan Biaya Titip: tanpa Biaya Titip otomatis dan, setelah
  // deploy, tanpa Revenue Repo saat Ambil Titip. Butuh keputusan Finance.
  report.storedWithoutStorageFee = (await client.query(`
    select so.so_number, so.accurate_so_number, so.customer_name, cj.container_number,
           (cj.repo_stored_at at time zone 'Asia/Jakarta')::date as stored_date,
           so.debit_note_number is not null as debit_note_issued
    from container_jobs cj
    join sales_orders so on so.id = cj.sales_order_id
    where cj.status = 'repo_stored'
      and so.status <> 'cancelled'
      and coalesce(cj.execution_source, 'internal') = 'internal'
      and not exists (select 1 from container_job_expenses e where e.container_job_id = cj.id and e.source = 'repo_storage_fee')
      and not exists (select 1 from manual_revenue_lines m where m.container_job_id = cj.id and m.charge_type = 'repo' and m.status <> 'void')
    order by cj.repo_stored_at
  `)).rows;

  // Revenue Repo lama yang masih draft (tetap dikelola Finance lewat alur lama).
  report.legacyRepoRevenueDraft = (await client.query(`
    select count(*)::int as lines, coalesce(sum(total_amount), 0)::numeric as amount
    from manual_revenue_lines where charge_type = 'repo' and status = 'draft'
  `)).rows[0];

  // Nomor container yang saat ini ada di lebih dari satu job aktif/titip (data lama; guard baru
  // hanya mencegah input baru, tidak mengoreksi data ini).
  report.activeDuplicateContainers = (await client.query(`
    select upper(btrim(cj.container_number)) as container_number, count(*)::int as jobs,
           array_agg(so.so_number order by so.so_number) as so_numbers
    from container_jobs cj join sales_orders so on so.id = cj.sales_order_id
    where nullif(btrim(cj.container_number), '') is not null
      and cj.status in ('received', 'running', 'inap', 'repo_stored') and so.status <> 'cancelled'
    group by 1 having count(*) > 1
    order by 1
  `)).rows;

  // Job Ambil Titip yang penerima komisinya tercatat sebagai sopir pickup: akan tertahan di "Perlu Cek".
  report.commissionHeldPickupDriver = (await client.query(`
    select so.so_number, cj.container_number, cj.commission_driver_name
    from container_jobs cj
    join sales_orders so on so.id = cj.sales_order_id
    where cj.repo_picked_up_at is not null
      and cj.commission_driver_id is not null
      and coalesce(cj.has_driver_commission, false)
      and not exists (select 1 from driver_commission_items i where i.container_job_id = cj.id and i.voided_at is null)
      and cj.commission_driver_id is distinct from cj.repo_released_driver_id
      and cj.commission_driver_id in (
        select cpm.driver_id from container_pickup_items cpi
        join container_pickup_movements cpm on cpm.id = cpi.movement_id
        where cpi.container_job_id = cj.id and cpm.status <> 'cancelled'
      )
    order by so.so_number
  `)).rows;
  await client.query('rollback');
} finally {
  client.release();
  await pool.end();
}

const summary = {
  database: report.database,
  migrationsInRelease: migrationFiles.length,
  pendingMigrations: report.pendingMigrations,
  appliedNotInRelease: report.appliedNotInRelease,
  storedWithoutStorageFee: report.storedWithoutStorageFee.length,
  legacyRepoRevenueDraft: report.legacyRepoRevenueDraft,
  activeDuplicateContainers: report.activeDuplicateContainers.length,
  commissionHeldPickupDriver: report.commissionHeldPickupDriver.length,
};
console.log(JSON.stringify({ summary, details: report }, null, 2));
