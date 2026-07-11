export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  SALES: 'sales',
  OPERATIONAL: 'operational',
  OBSERVER: 'observer',
});

export const ALL_ROLES = Object.values(USER_ROLES);

export const ROLE_LABELS = {
  admin: 'Admin',
  sales: 'Sales',
  operational: 'Operational',
  observer: 'Management',
  audit: 'Management',
};

export const ROLE_PERMISSIONS = {
  admin: [
    'master.manage',
    'users.manage',
    'orders.read',
    'operations.read',
    'documents.operational.read',
    'commercial.read',
    'reports.read',
    'reports.export',
  ],
  sales: [
    'orders.create',
    'orders.update',
    'orders.cancel',
    'orders.read',
    'commercial.read',
  ],
  operational: [
    'orders.read',
    'operations.read',
    'operations.update',
    'documents.operational.read',
  ],
  observer: [
    'orders.read',
    'operations.read',
    'commercial.read',
    'reports.read',
    'reports.export',
  ],
};

const BACKEND_PERMISSION_ALIASES = {
  'master.manage': ['master_data.read', 'master_data.create', 'master_data.update', 'master_data.delete'],
  'users.manage': ['user.read', 'user.create', 'user.update', 'user.disable', 'user.reset_password'],
  'orders.create': ['sales_order.create'],
  'orders.update': ['sales_order.update'],
  'orders.cancel': ['sales_order.cancel'],
  'orders.read': ['sales_order.read'],
  'operations.read': ['container_job.read'],
  'operations.update': ['container_job.update', 'container_job.update_status', 'container_job.assign'],
  'documents.operational.read': ['document.read'],
  'reports.read': ['report.read'],
  'reports.export': ['report.read'],
};

function hasBackendPermission(user, permission) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  if (!permissions.length) return false;
  const accepted = [permission, ...(BACKEND_PERMISSION_ALIASES[permission] || [])];
  return accepted.some((item) => permissions.includes(item));
}

export function hasPermission(subject, permission) {
  if (subject && typeof subject === 'object') {
    return hasBackendPermission(subject, permission) || Boolean(ROLE_PERMISSIONS[subject.role]?.includes(permission));
  }
  return Boolean(ROLE_PERMISSIONS[subject]?.includes(permission));
}
