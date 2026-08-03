export const SALES_ORDER_INVOICE_DOCUMENT_STATUSES = [
  'belum_upload',
  'siap_dikirim',
  'terkirim',
];

export const SALES_ORDER_INVOICE_DOCUMENT_DELIVERY_METHODS = [
  'email',
  'whatsapp',
  'lainnya',
];

const LEGACY_STATUS_MAP = {
  belum_upload: 'belum_upload',
  belum_unggah: 'belum_upload',
  dokumen_siap_dikirim: 'siap_dikirim',
  siap_dikirim: 'siap_dikirim',
  dokumen_terkirim: 'terkirim',
  terkirim: 'terkirim',
};

export function normalizeInvoiceDocumentStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (SALES_ORDER_INVOICE_DOCUMENT_STATUSES.includes(normalized)) return normalized;
  if (LEGACY_STATUS_MAP[normalized]) return LEGACY_STATUS_MAP[normalized];
  return 'belum_upload';
}

export function normalizeInvoiceDocumentDeliveryMethod(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SALES_ORDER_INVOICE_DOCUMENT_DELIVERY_METHODS.includes(normalized) ? normalized : null;
}
