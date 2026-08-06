import { ROLE_PERMISSIONS } from '../modules/users/users.mapper.js';

export function actorHasPermission(actor, permission) {
  if (!actor || !permission) return false;
  const actorPermissions = Array.isArray(actor.permissions) && actor.permissions.length
    ? actor.permissions
    : ROLE_PERMISSIONS[actor.role] || [];
  return actorPermissions.includes(permission);
}
