import { httpClient } from '../api/httpClient';

function normalizeApiRole(role) {
  if (role === 'pengamat') return 'observer';
  return role || '';
}

function mapApiLog(log) {
  return {
    id: log.id,
    time: log.createdAt,
    user: log.actorName || 'System',
    role: normalizeApiRole(log.actorRole),
    action: log.action,
    target: log.target,
    module: log.module || log.target || '',
    entityType: log.entityType || '',
    entityId: log.entityId || '',
    beforeData: log.beforeData || null,
    afterData: log.afterData || null,
    metadata: log.metadata || {},
  };
}

export function isActivityLogDatabaseEnabled() {
  return true;
}

export async function fetchActivityLogPage({
  page = 1,
  pageSize = 10,
  query = '',
  role = '',
  action = '',
  module = '',
  dateFrom = '',
  dateTo = '',
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    query,
  });
  if (role) params.set('role', role === 'observer' ? 'pengamat' : role);
  if (action) params.set('action', action);
  if (module) params.set('module', module);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  const result = await httpClient.get(`/activity-logs?${params.toString()}`);
  return {
    total: result.total || 0,
    rows: (result.rows || []).map(mapApiLog),
  };
}
