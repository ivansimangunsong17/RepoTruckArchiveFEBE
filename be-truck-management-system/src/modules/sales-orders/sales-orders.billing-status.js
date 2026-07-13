export const SALES_ORDER_BILLING_STATUSES = [
  'belum_invoice',
  'belum_dikirim',
  'belum_diterima',
  'belum_dikonfirmasi',
  'menunggu_pembayaran',
  'lunas',
];

const LEGACY_STATUS_MAP = {
  pending_invoice: 'belum_invoice',
  invoice_issued: 'belum_dikirim',
  waiting_payment: 'menunggu_pembayaran',
  paid: 'lunas',
};

export function normalizeSalesOrderBillingStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (SALES_ORDER_BILLING_STATUSES.includes(normalized)) return normalized;
  if (LEGACY_STATUS_MAP[normalized]) return LEGACY_STATUS_MAP[normalized];
  return 'belum_invoice';
}

export function isSalesOrderBillingStatus(value) {
  return SALES_ORDER_BILLING_STATUSES.includes(normalizeSalesOrderBillingStatus(value));
}

export function billingStatusRequiresInvoice(status) {
  return normalizeSalesOrderBillingStatus(status) !== 'belum_invoice';
}
