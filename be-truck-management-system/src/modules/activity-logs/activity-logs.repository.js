import { query } from '../../db/client.js';
import { mapActivityLog, toActivityLogDb } from './activity-logs.mapper.js';

const columns = 'id, actor_name, actor_role, action, target, metadata, created_at';

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildWhere({
  query: keyword = '',
  actorRole = '',
  target = '',
  module = '',
  action = '',
  dateFrom = '',
  dateTo = '',
} = {}) {
  const clauses = [];
  const params = [];
  const cleanKeyword = keyword.trim();

  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    clauses.push(`(actor_name ilike $${params.length} or action ilike $${params.length} or target ilike $${params.length} or metadata::text ilike $${params.length})`);
  }
  if (actorRole) {
    params.push(actorRole);
    clauses.push(`actor_role = $${params.length}`);
  }
  if (action) {
    params.push(action);
    clauses.push(`action = $${params.length}`);
  }
  if (module) {
    params.push(module);
    clauses.push(`(target = $${params.length} or metadata->>'module' = $${params.length})`);
  } else if (target) {
    params.push(target);
    clauses.push(`target = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    clauses.push(`created_at >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    clauses.push(`created_at < ($${params.length}::date + interval '1 day')`);
  }

  return { whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

export async function findActivityLogsPage(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildWhere(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rowsResult, countResult] = await Promise.all([
    query(
      `
        select ${columns}
        from activity_logs
        ${whereSql}
        order by created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from activity_logs ${whereSql}`, params),
  ]);

  return {
    rows: rowsResult.rows.map(mapActivityLog),
    total: countResult.rows[0]?.total || 0,
  };
}

export async function createActivityLog(payload) {
  const data = toActivityLogDb(payload);
  const entries = Object.entries(data);
  const result = await query(
    `
      insert into activity_logs (${entries.map(([key]) => key).join(', ')})
      values (${entries.map((_, index) => `$${index + 1}`).join(', ')})
      returning ${columns}
    `,
    entries.map(([, value]) => value),
  );
  return mapActivityLog(result.rows[0]);
}
