import { query } from '../../db/client.js';
import { getResourceConfig } from './master.mapper.js';

function buildWhere(config, { keyword = '', filters = {} } = {}) {
  const clauses = [];
  const params = [];

  if (config.archivedColumn) clauses.push(`${config.archivedColumn} is null`);

  const cleanKeyword = keyword.trim();
  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    const searchClauses = config.searchable.map((column) => `${column}::text ilike $${params.length}`);
    clauses.push(`(${searchClauses.join(' or ')})`);
  }

  Object.entries(filters || {}).forEach(([key, value]) => {
    const column = config.filters[key];
    if (!column || !value) return;
    params.push(value);
    clauses.push(`${column} = $${params.length}`);
  });

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

export async function findMasterRows(resource, options = {}) {
  const config = getResourceConfig(resource);
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  const { whereSql, params } = buildWhere(config, {
    keyword: options.query || '',
    filters: options.filters || {},
  });
  const offset = (page - 1) * pageSize;
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rowsResult, countResult] = await Promise.all([
    query(
      `
        select *
        from ${config.table}
        ${whereSql}
        order by ${config.orderColumn} desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from ${config.table} ${whereSql}`, params),
  ]);

  return {
    rows: rowsResult.rows.map(config.toApi),
    total: countResult.rows[0]?.total || 0,
  };
}

export async function findAllMasterRows(resource) {
  const config = getResourceConfig(resource);
  const result = await query(
    `
      select *
      from ${config.table}
      ${config.archivedColumn ? `where ${config.archivedColumn} is null` : ''}
      order by ${config.orderColumn} desc
    `,
  );
  return result.rows.map(config.toApi);
}

export async function findMasterRowById(resource, id) {
  const config = getResourceConfig(resource);
  const result = await query(
    `
      select *
      from ${config.table}
      where id = $1
        ${config.archivedColumn ? `and ${config.archivedColumn} is null` : ''}
    `,
    [id],
  );
  return result.rows[0] ? config.toApi(result.rows[0]) : null;
}

export async function upsertMasterRow(resource, payload, id) {
  const config = getResourceConfig(resource);
  const data = config.toDb(payload);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    const error = new Error('Payload tidak memiliki data untuk disimpan.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (id) {
    const setSql = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
    const result = await query(
      `
        update ${config.table}
        set ${setSql}, updated_at = now()
        where id = $${entries.length + 1}
        returning *
      `,
      [...entries.map(([, value]) => value), id],
    );
    if (!result.rows[0]) {
      const error = new Error('Data master tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'MASTER_NOT_FOUND';
      throw error;
    }
    return config.toApi(result.rows[0]);
  }

  const columns = entries.map(([key]) => key);
  const placeholders = entries.map((_, index) => `$${index + 1}`);
  const result = await query(
    `
      insert into ${config.table} (${columns.join(', ')})
      values (${placeholders.join(', ')})
      returning *
    `,
    entries.map(([, value]) => value),
  );
  return config.toApi(result.rows[0]);
}

export async function archiveMasterRow(resource, id) {
  const config = getResourceConfig(resource);
  const result = await query(
    `
      update ${config.table}
      set ${config.archivedColumn} = now(),
          updated_at = now()
      where id = $1
      returning id
    `,
    [id],
  );
  if (!result.rows[0]) {
    const error = new Error('Data master tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'MASTER_NOT_FOUND';
    throw error;
  }
}
