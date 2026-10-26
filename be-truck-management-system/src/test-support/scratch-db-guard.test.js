import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateScratchDatabaseConfig } from './scratch-db-guard.js';

const scratchUrl = 'postgresql://atms_scratch_app:secret@127.0.0.1:5433/atms_scratch_20261025';
const noEnvFile = { envFile: path.join(tmpdir(), 'atms-scratch-guard-missing.env') };

function validate(overrides = {}, options = noEnvFile) {
  return validateScratchDatabaseConfig({
    ATMS_SCRATCH_DATABASE_URL: scratchUrl,
    ATMS_SCRATCH_DATABASE_NAME: 'atms_scratch_20261025',
    ...overrides,
  }, options);
}

test('tanpa ATMS_SCRATCH_DATABASE_URL test di-skip dan tidak fallback ke DATABASE_URL', () => {
  const result = validateScratchDatabaseConfig({ DATABASE_URL: 'postgresql://dev:dev@localhost:5432/truck_management' }, noEnvFile);
  assert.ok(result.skip);
  assert.equal(result.url, undefined);
});

test('URL scratch lokal dengan nama terkonfirmasi diterima', () => {
  assert.deepEqual(validate(), { url: scratchUrl, databaseName: 'atms_scratch_20261025' });
});

test('target scratch yang tidak bisa dipastikan ditolak keras', () => {
  const rejects = (overrides) => assert.throws(() => validate(overrides), { code: 'SCRATCH_DATABASE_GUARD' });
  rejects({ ATMS_SCRATCH_DATABASE_URL: 'bukan-url' });
  rejects({ ATMS_SCRATCH_DATABASE_URL: 'mysql://u:p@127.0.0.1:5433/atms_scratch_20261025' });
  rejects({ ATMS_SCRATCH_DATABASE_URL: 'postgresql://u:p@db.prod.example:5433/atms_scratch_20261025' });
  rejects({ ATMS_SCRATCH_DATABASE_URL: 'postgresql://u:p@127.0.0.1/atms_scratch_20261025' });
  rejects({ ATMS_SCRATCH_DATABASE_URL: 'postgresql://127.0.0.1:5433/atms_scratch_20261025' });
  rejects({ ATMS_SCRATCH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/atms_scratch_20261025?host=10.0.0.5' });
  rejects({ ATMS_SCRATCH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/truck_management', ATMS_SCRATCH_DATABASE_NAME: 'truck_management' });
  rejects({ ATMS_SCRATCH_DATABASE_NAME: '' });
  rejects({ ATMS_SCRATCH_DATABASE_NAME: 'atms_scratch_lain' });
});

test('target scratch yang sama dengan DATABASE_URL environment atau .env ditolak', () => {
  assert.throws(
    () => validate({ DATABASE_URL: 'postgresql://dev:dev@127.0.0.1:5433/atms_scratch_20261025' }),
    { code: 'SCRATCH_DATABASE_GUARD' },
  );

  const dir = mkdtempSync(path.join(tmpdir(), 'atms-scratch-guard-'));
  const envFile = path.join(dir, '.env');
  writeFileSync(envFile, 'DATABASE_URL=postgresql://dev:dev@localhost:5433/atms_scratch_20261025\n');
  assert.throws(() => validate({}, { envFile }), { code: 'SCRATCH_DATABASE_GUARD' });
});
