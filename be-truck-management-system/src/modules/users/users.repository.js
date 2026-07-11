import { query } from '../../db/client.js';
import { hashPassword } from '../auth/auth.utils.js';
import { mapUser, toUserDb } from './users.mapper.js';

const userColumns = 'id, name, email, role, status, last_login_at, created_at, updated_at';
const userColumnsWithPassword = `${userColumns}, password_hash`;

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildWhere({ query: keyword = '', role = '', status = '' } = {}) {
  const clauses = [];
  const params = [];
  const cleanKeyword = keyword.trim();

  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    clauses.push(`(name ilike $${params.length} or email ilike $${params.length})`);
  }
  if (role) {
    params.push(role);
    clauses.push(`role = $${params.length}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }

  return { whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

export async function findUsersPage(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildWhere(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rowsResult, countResult] = await Promise.all([
    query(
      `
        select ${userColumns}
        from users
        ${whereSql}
        order by created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from users ${whereSql}`, params),
  ]);

  return {
    rows: rowsResult.rows.map(mapUser),
    total: countResult.rows[0]?.total || 0,
  };
}

export async function findUserById(id, includePassword = false) {
  const result = await query(
    `select ${includePassword ? userColumnsWithPassword : userColumns} from users where id = $1`,
    [id],
  );
  return includePassword ? result.rows[0] || null : mapUser(result.rows[0]);
}

export async function findUserByEmail(email, includePassword = false) {
  const result = await query(
    `select ${includePassword ? userColumnsWithPassword : userColumns} from users where email = $1`,
    [String(email || '').trim().toLowerCase()],
  );
  return includePassword ? result.rows[0] || null : mapUser(result.rows[0]);
}

export async function createUser(payload) {
  const data = toUserDb(payload, hashPassword(payload.password || 'password'));
  const entries = Object.entries(data);
  const result = await query(
    `
      insert into users (${entries.map(([key]) => key).join(', ')})
      values (${entries.map((_, index) => `$${index + 1}`).join(', ')})
      returning ${userColumns}
    `,
    entries.map(([, value]) => value),
  );
  return mapUser(result.rows[0]);
}

export async function updateUser(id, payload) {
  const data = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.email !== undefined) data.email = String(payload.email || '').trim().toLowerCase();
  if (payload.role !== undefined) data.role = payload.role;
  if (payload.status !== undefined) data.status = payload.status;
  if (payload.password) data.password_hash = hashPassword(payload.password);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    const error = new Error('Payload user tidak memiliki data untuk disimpan.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const result = await query(
    `
      update users
      set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(', ')},
          updated_at = now()
      where id = $${entries.length + 1}
      returning ${userColumns}
    `,
    [...entries.map(([, value]) => value), id],
  );
  if (!result.rows[0]) {
    const error = new Error('User tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  return mapUser(result.rows[0]);
}

export async function updateUserStatus(id, status) {
  const result = await query(
    `
      update users
      set status = $1,
          updated_at = now()
      where id = $2
      returning ${userColumns}
    `,
    [status, id],
  );
  if (!result.rows[0]) {
    const error = new Error('User tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  return mapUser(result.rows[0]);
}

export async function updateUserPassword(id, password) {
  const result = await query(
    `
      update users
      set password_hash = $1,
          updated_at = now()
      where id = $2
      returning ${userColumns}
    `,
    [hashPassword(password), id],
  );
  if (!result.rows[0]) {
    const error = new Error('User tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  return mapUser(result.rows[0]);
}

export async function markUserLogin(id) {
  const result = await query(
    `
      update users
      set last_login_at = now(),
          updated_at = now()
      where id = $1
      returning ${userColumns}
    `,
    [id],
  );
  return mapUser(result.rows[0]);
}
