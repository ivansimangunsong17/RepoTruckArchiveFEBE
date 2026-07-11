import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getAppliedVersions(client) {
  const result = await client.query('select version from schema_migrations');
  return new Set(result.rows.map((row) => row.version));
}

async function run() {
  if (!pool) throw new Error('DATABASE_URL belum dikonfigurasi. Isi .env backend terlebih dahulu.');

  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const applied = await getAppliedVersions(client);
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (applied.has(version)) {
        console.log(`skip ${file}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [version]);
        await client.query('commit');
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    client.release();
    await closePool();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
