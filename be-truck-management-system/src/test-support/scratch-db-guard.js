// Gerbang database SCRATCH untuk integration test yang menulis data.
// - ATMS_SCRATCH_DATABASE_URL kosong  -> test di-skip (opt-in).
// - Diisi tapi identitas target tidak valid -> test GAGAL keras, tidak pernah fallback ke DATABASE_URL.
// Identitas divalidasi dua tahap: statis (URL, nama DB, konfirmasi nama, beda dari .env) lalu
// live (current_database, role bukan superuser, tabel penanda, migrasi lengkap).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export const SCRATCH_DATABASE_NAME_PATTERN = /^atms_scratch_[a-z0-9_]{1,40}$/;
export const SCRATCH_MARKER_PURPOSE = 'atms-integration-scratch';

function guardError(message) {
  const error = new Error(`[scratch-db-guard] ${message}`);
  error.code = 'SCRATCH_DATABASE_GUARD';
  return error;
}

function databaseIdentity(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    // localhost/127.0.0.1/::1 menunjuk server yang sama, jadi diperlakukan identik.
    const host = LOCAL_HOSTS.has(hostname) ? 'local' : hostname;
    return `${host}:${parsed.port || '5432'}/${decodeURIComponent(parsed.pathname.slice(1))}`;
  } catch {
    return null;
  }
}

function readDotenvDatabaseUrl(envFile) {
  if (!existsSync(envFile)) return '';
  return dotenv.parse(readFileSync(envFile)).DATABASE_URL || '';
}

// Validasi tanpa koneksi. Mengembalikan { skip } bila opt-in tidak aktif, { url, databaseName } bila
// lolos, dan melempar error bila variabel diisi tetapi target tidak bisa dipastikan scratch.
export function validateScratchDatabaseConfig(environment = process.env, { envFile = path.join(backendRoot, '.env') } = {}) {
  const url = String(environment.ATMS_SCRATCH_DATABASE_URL || '').trim();
  if (!url) return { skip: 'ATMS_SCRATCH_DATABASE_URL belum diisi (opt-in).' };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw guardError('ATMS_SCRATCH_DATABASE_URL bukan URL yang valid.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw guardError('ATMS_SCRATCH_DATABASE_URL harus memakai skema postgres:// atau postgresql://.');
  }
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw guardError(`Host scratch harus lokal (localhost/127.0.0.1/::1), bukan "${parsed.hostname}".`);
  }
  if (!parsed.port) throw guardError('Port scratch wajib ditulis eksplisit di URL.');
  if (!parsed.username || !parsed.password) {
    throw guardError('User dan password wajib ada di URL agar pg tidak memakai PGUSER/PGPASSWORD dari environment.');
  }
  if (parsed.searchParams.has('host') || parsed.searchParams.has('options')) {
    throw guardError('Parameter host/options di query string tidak diizinkan pada URL scratch.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!SCRATCH_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw guardError(`Nama database "${databaseName}" tidak cocok dengan pola ${SCRATCH_DATABASE_NAME_PATTERN}.`);
  }
  const confirmedName = String(environment.ATMS_SCRATCH_DATABASE_NAME || '').trim();
  if (confirmedName !== databaseName) {
    throw guardError('ATMS_SCRATCH_DATABASE_NAME wajib diisi dan sama persis dengan nama database di URL.');
  }

  const scratchIdentity = databaseIdentity(url);
  const otherUrls = [
    ['DATABASE_URL di environment', environment.DATABASE_URL],
    ['DATABASE_URL di .env backend', readDotenvDatabaseUrl(envFile)],
  ];
  for (const [label, otherUrl] of otherUrls) {
    if (otherUrl && databaseIdentity(otherUrl) === scratchIdentity) {
      throw guardError(`Target scratch sama dengan ${label}. Gunakan database scratch terpisah.`);
    }
  }

  return { url, databaseName };
}

function expectedMigrationVersions() {
  const migrationsDir = path.join(backendRoot, 'src/db/migrations');
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.replace(/\.sql$/, ''));
}

// Validasi live dengan koneksi terpisah (bukan pool aplikasi). Melempar bila ada yang tidak cocok.
export async function verifyScratchDatabaseIdentity({ url, databaseName }) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000, application_name: 'atms-scratch-guard' });
  try {
    await client.connect();
  } catch (error) {
    throw guardError(`Database scratch tidak bisa dihubungi: ${error.message}`);
  }
  try {
    const identity = await client.query(`
      select current_database() as database_name, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls
      from pg_roles r where r.rolname = current_user
    `);
    const row = identity.rows[0];
    if (!row || row.database_name !== databaseName) {
      throw guardError(`current_database() = "${row?.database_name}" tidak sama dengan "${databaseName}".`);
    }
    if (row.rolsuper || row.rolcreaterole || row.rolcreatedb || row.rolbypassrls) {
      throw guardError('Role test terlalu berkuasa (superuser/createrole/createdb/bypassrls). Pakai role least privilege.');
    }

    const marker = await client.query(`select to_regclass('public.atms_scratch_identity') as marker`);
    if (!marker.rows[0]?.marker) throw guardError('Tabel penanda public.atms_scratch_identity tidak ada.');
    const markerRow = await client.query(
      'select database_name, purpose from public.atms_scratch_identity',
    );
    if (
      markerRow.rows.length !== 1
      || markerRow.rows[0].database_name !== databaseName
      || markerRow.rows[0].purpose !== SCRATCH_MARKER_PURPOSE
    ) {
      throw guardError('Isi tabel penanda scratch tidak cocok dengan database target.');
    }

    const applied = await client.query('select version from schema_migrations');
    const appliedVersions = new Set(applied.rows.map((migration) => migration.version));
    const missing = expectedMigrationVersions().filter((version) => !appliedVersions.has(version));
    if (missing.length) {
      throw guardError(`Migrasi scratch belum lengkap (${missing.length} kurang, mis. ${missing[0]}).`);
    }
  } finally {
    await client.end();
  }
}

// Dipanggil di awal file integration test SEBELUM modul aplikasi di-import.
export async function prepareScratchDatabase(environment = process.env) {
  const config = validateScratchDatabaseConfig(environment);
  if (config.skip) return config;
  await verifyScratchDatabaseIdentity(config);
  // Modul aplikasi membaca DATABASE_URL lewat config/env.js. .env backend dimatikan untuk proses
  // test ini supaya tidak ada nilai dev (DATABASE_URL, kredensial Hino, UPLOAD_DIR) yang ikut terbaca.
  const disabledDotenvPath = path.join(backendRoot, '.env.scratch-disabled');
  if (existsSync(disabledDotenvPath)) throw guardError('File .env.scratch-disabled tidak boleh ada.');
  environment.DOTENV_CONFIG_PATH = disabledDotenvPath;
  environment.DATABASE_URL = config.url;
  environment.UPLOAD_DIR = path.join(backendRoot, 'uploads', 'scratch-test');
  return config;
}
