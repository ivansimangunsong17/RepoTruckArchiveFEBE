import { ROLE_PERMISSIONS } from '../modules/users/users.mapper.js';
import { readBearerToken, verifyAuthToken } from '../modules/auth/auth.utils.js';

function readRequestToken(request) {
  const headerToken = readBearerToken(request.headers);
  if (headerToken) return headerToken;
  return request.query?.access_token || '';
}

export function authorizeRoute(route, request) {
  if (route.public) return null;

  const payload = verifyAuthToken(readRequestToken(request));
  request.user = payload;

  if (route.authOnly) return payload;

  const permissions = Array.isArray(route.permissions)
    ? route.permissions
    : route.permission
      ? [route.permission]
      : [];
  if (!permissions.length) return payload;

  const rolePermissions = ROLE_PERMISSIONS[payload.role] || [];
  const allowed = permissions.some((permission) => rolePermissions.includes(permission));
  if (!allowed) {
    const error = new Error('Role pengguna tidak memiliki akses ke endpoint ini.');
    error.statusCode = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  return payload;
}
