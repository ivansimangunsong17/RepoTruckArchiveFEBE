import { createActivityLog, findActivityLogsPage } from './activity-logs.repository.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'password_hash',
  'token',
  'access_token',
  'authorization',
  'fileBase64',
]);

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEYS.has(key) ? '[REDACTED]' : sanitizeValue(item),
  ]));
}

function readIpAddress(request) {
  const forwardedFor = request?.headers?.['x-forwarded-for'] || request?.headers?.['X-Forwarded-For'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();
  return request?.socket?.remoteAddress || null;
}

function readUserAgent(request) {
  return request?.headers?.['user-agent'] || request?.headers?.['User-Agent'] || null;
}

function actorFromRequest(request, fallback = {}) {
  const user = request?.user || {};
  return {
    actorUserId: fallback.actorUserId || user.sub || user.id || null,
    actorName: fallback.actorName || user.name || fallback.name || 'System',
    actorRole: fallback.actorRole || user.role || fallback.role || null,
  };
}

export function listActivityLogs(query) {
  return findActivityLogsPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || query.search || '',
    actorRole: query.actorRole || query.role || '',
    target: query.target || '',
    module: query.module || '',
    action: query.action || '',
    dateFrom: query.dateFrom || '',
    dateTo: query.dateTo || '',
  });
}

export function saveActivityLog(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload activity log harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  if (!payload.action) {
    const error = new Error('Action activity log wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return createActivityLog(payload);
}

export function recordActivityLog(request, payload = {}) {
  if (!payload.action) {
    const error = new Error('Action activity log wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const actor = actorFromRequest(request, payload);
  const metadata = sanitizeValue({
    ...(payload.metadata || {}),
    actorUserId: actor.actorUserId,
    module: payload.module || null,
    entityType: payload.entityType || null,
    entityId: payload.entityId || null,
    beforeData: payload.beforeData || null,
    afterData: payload.afterData || null,
    ipAddress: payload.ipAddress || readIpAddress(request),
    userAgent: payload.userAgent || readUserAgent(request),
  });

  return createActivityLog({
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    action: payload.action,
    target: payload.target || payload.module || payload.entityType || null,
    metadata,
  });
}

export async function safeRecordActivityLog(request, payload = {}) {
  try {
    return await recordActivityLog(request, payload);
  } catch (error) {
    console.error(`Activity log gagal dicatat: ${error.message}`);
    return null;
  }
}
