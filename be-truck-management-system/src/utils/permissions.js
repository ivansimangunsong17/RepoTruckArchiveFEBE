import { ROLE_PERMISSIONS } from '../modules/users/users.mapper.js';

export function isAdminRole(role) {
  return String(role || '').trim().toLowerCase() === 'admin';
}

export function actorHasPermission(actor, permission) {
  if (!actor || !permission) return false;
  if (isAdminRole(actor.role)) return true;
  const actorPermissions = Array.isArray(actor.permissions) && actor.permissions.length
    ? actor.permissions
    : ROLE_PERMISSIONS[actor.role] || [];
  return actorPermissions.includes(permission);
}
