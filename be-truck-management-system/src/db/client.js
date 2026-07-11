import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const isDatabaseEnabled = Boolean(env.databaseUrl);

export const pool = isDatabaseEnabled
  ? new Pool({
      connectionString: env.databaseUrl,
    })
  : null;

export async function query(text, params) {
  if (!pool) {
    const error = new Error('DATABASE_URL belum dikonfigurasi.');
    error.statusCode = 503;
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }

  return pool.query(text, params);
}

export async function withTransaction(callback) {
  if (!pool) {
    const error = new Error('DATABASE_URL belum dikonfigurasi.');
    error.statusCode = 503;
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) await pool.end();
}
