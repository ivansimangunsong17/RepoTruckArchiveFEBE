import { readBearerToken, verifyAuthToken } from '../modules/auth/auth.utils.js';
import { actorHasPermission } from '../utils/permissions.js';
import { getFreshActorStatus } from '../modules/auth/actor-status-cache.js';

function readRequestToken(request) {
  const headerToken = readBearerToken(request.headers);
  if (headerToken) return headerToken;
  return request.query?.access_token || '';
}

export function ensureRoutePermission(route, actor) {
  if (route.authOnly) return actor;

  const permissions = Array.isArray(route.permissions)
    ? route.permissions
    : route.permission
      ? [route.permission]
      : [];
  if (!permissions.length) return actor;

  const allowed = permissions.some((permission) => actorHasPermission(actor, permission));
  if (!allowed) {
    const error = new Error('Role pengguna tidak memiliki akses ke endpoint ini.');
    error.statusCode = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  return actor;
}

export async function authorizeRoute(route, request) {
  if (route.public) return null;

  const payload = verifyAuthToken(readRequestToken(request));

  // Token bisa membawa role selama 12 jam tanpa dicek ulang -- getFreshActorStatus membaca
  // status/role terbaru dari tabel users (lewat cache singkat) supaya user yang baru dinonaktifkan
  // atau diturunkan rolenya tidak tetap punya akses lama sampai tokennya kedaluwarsa.
  const fresh = await getFreshActorStatus(payload.sub);
  if (!fresh.role || fresh.status !== 'Aktif') {
    const error = new Error('User sesi tidak ditemukan atau nonaktif.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }
  const actor = payload.role === fresh.role ? payload : { ...payload, role: fresh.role };
  request.user = actor;

  return ensureRoutePermission(route, actor);
}
