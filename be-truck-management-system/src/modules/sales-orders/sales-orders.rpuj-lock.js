const SENT_RPUJ_STATUSES = new Set(['submitted', 'approved', 'paid', 'rejected']);

export function hasContainerSentRpuj(container = {}) {
  const status = String(container.rpujStatus || container.rpuj_status || '').trim().toLowerCase();
  return Boolean(
    container.rpujRequestedAt
    || container.rpuj_requested_at
    || SENT_RPUJ_STATUSES.has(status)
  );
}

export function isSalesOrderLockedByRpuj(order = {}) {
  const containers = Array.isArray(order.containers) ? order.containers : [];
  return containers.some(hasContainerSentRpuj);
}

export function isSalesOrderLockedByFinanceNumber(order = {}) {
  const soNumber = String(order.soNumber || order.so_number || '').trim();
  const verificationStatus = String(order.financeVerificationStatus || order.finance_verification_status || '').trim().toLowerCase();
  return Boolean(soNumber || verificationStatus === 'verified');
}
