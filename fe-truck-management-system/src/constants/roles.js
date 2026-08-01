export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  SALES: 'sales',
  OPERATIONAL: 'operational',
  OBSERVER: 'observer',
  FINANCE: 'finance',
});

export const ALL_ROLES = Object.values(USER_ROLES);

export const ROLE_LABELS = {
  admin: 'Admin',
  sales: 'Sales',
  operational: 'Operational',
  observer: 'Viewer',
  audit: 'Viewer',
  finance: 'Finance',
};

export const ROLE_PERMISSIONS = {
  admin: [
    'master.manage',
    'vehicle.read',
    'vehicle.create',
    'vehicle.update',
    'vehicle.delete',
    'vehicle_document.read',
    'vehicle_document.create',
    'vehicle_document.update',
    'vehicle_document.delete',
    'users.manage',
    'orders.update',
    'orders.cancel',
    'orders.read',
    'operations.read',
    'documents.operational.read',
    'commercial.read',
    'reports.read',
    'reports.export',
    'finance.read',
    'finance.order_verification.read',
    'finance.order_verification.update',
    'finance.rpuj_approval.read',
    'finance.rpuj_approval.approve',
    'finance.rpuj_approval.reject',
    'finance.transfer_proof.upload',
    'finance.invoice.read',
    'finance.invoice.update_number',
    'finance.correction.read',
    'finance.correction.request',
    'finance.correction.approve',
  ],
  sales: [
    'orders.create',
    'orders.update',
    'orders.cancel',
    'orders.read',
    'commercial.read',
    'vehicle.read',
    'vehicle_document.read',
  ],
  operational: [
    'orders.read',
    'operations.read',
    'operations.update',
    'vehicle.read',
    'vehicle_document.read',
    'vehicle_document.create',
    'vehicle_document.update',
    'documents.operational.read',
  ],
  observer: [
    'orders.read',
    'operations.read',
    'commercial.read',
    'vehicle.read',
    'vehicle_document.read',
    'reports.read',
    'reports.export',
  ],
  finance: [
    'finance.read',
    'finance.order_verification.read',
    'finance.order_verification.update',
    'finance.rpuj_approval.read',
    'finance.rpuj_approval.approve',
    'finance.rpuj_approval.reject',
    'finance.transfer_proof.upload',
    'finance.invoice.read',
    'finance.invoice.update_number',
    'finance.correction.read',
    'finance.correction.request',
    'documents.operational.read',
  ],
};

const BACKEND_PERMISSION_ALIASES = {
  'master.manage': ['master_data.read', 'master_data.create', 'master_data.update', 'master_data.delete'],
  'vehicle.read': ['vehicle.read', 'master_data.read'],
  'vehicle.create': ['vehicle.create', 'master_data.create'],
  'vehicle.update': ['vehicle.update', 'master_data.update'],
  'vehicle.delete': ['vehicle.delete', 'master_data.delete'],
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
  'finance.read': ['finance.read'],
  'finance.order_verification.read': ['finance.order_verification.read', 'finance.read'],
  'finance.order_verification.update': ['finance.order_verification.update'],
  'finance.rpuj_approval.read': ['finance.rpuj_approval.read', 'finance.read'],
  'finance.rpuj_approval.approve': ['finance.rpuj_approval.approve'],
  'finance.rpuj_approval.reject': ['finance.rpuj_approval.reject'],
  'finance.transfer_proof.upload': ['finance.transfer_proof.upload'],
  'finance.invoice.read': ['finance.invoice.read', 'finance.read'],
  'finance.invoice.update_number': ['finance.invoice.update_number'],
  'finance.correction.read': ['finance.correction.read', 'finance.read'],
  'finance.correction.request': ['finance.correction.request'],
  'finance.correction.approve': ['finance.correction.approve'],
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
