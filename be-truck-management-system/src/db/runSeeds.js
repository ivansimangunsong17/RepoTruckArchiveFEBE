import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedsDir = path.join(__dirname, 'seeds');

async function run() {
  if (!pool) throw new Error('DATABASE_URL belum dikonfigurasi. Isi .env backend terlebih dahulu.');

  const client = await pool.connect();
  try {
    const files = (await readdir(seedsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = await readFile(path.join(seedsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('commit');
        console.log(`seeded ${file}`);
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
