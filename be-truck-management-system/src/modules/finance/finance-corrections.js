export const financeCorrectionTypes = {
  soNumber: 'so_number',
  invoiceNumber: 'invoice_number',
};

export const financeCorrectionStatuses = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  applied: 'applied',
};

const correctionTypeAliases = {
  so: financeCorrectionTypes.soNumber,
  so_number: financeCorrectionTypes.soNumber,
  soNumber: financeCorrectionTypes.soNumber,
  nomor_so: financeCorrectionTypes.soNumber,
  invoice: financeCorrectionTypes.invoiceNumber,
  invoice_number: financeCorrectionTypes.invoiceNumber,
  invoiceNumber: financeCorrectionTypes.invoiceNumber,
  no_invoice: financeCorrectionTypes.invoiceNumber,
};

export function normalizeFinanceCorrectionType(value) {
  const type = correctionTypeAliases[String(value || '').trim()];
  if (!type) {
    const error = new Error('Jenis koreksi Finance tidak valid.');
    error.statusCode = 400;
    error.code = 'FINANCE_CORRECTION_TYPE_INVALID';
    throw error;
  }
  return type;
}

export function getFinanceCorrectionField(type) {
  const normalizedType = normalizeFinanceCorrectionType(type);
  return normalizedType === financeCorrectionTypes.invoiceNumber ? 'invoice_number' : 'so_number';
}

export function validateFinanceCorrectionInput(payload = {}) {
  const correctionType = normalizeFinanceCorrectionType(payload.correctionType || payload.type);
  const requestedValue = String(payload.requestedValue || payload.newValue || payload.value || '').trim();
  const reason = String(payload.reason || payload.note || '').trim();

  if (!requestedValue) {
    const error = new Error(correctionType === financeCorrectionTypes.invoiceNumber
      ? 'Nomor invoice baru wajib diisi.'
      : 'Nomor SO baru wajib diisi.');
    error.statusCode = 400;
    error.code = 'FINANCE_CORRECTION_VALUE_REQUIRED';
    throw error;
  }

  if (!reason) {
    const error = new Error('Alasan koreksi wajib diisi.');
    error.statusCode = 400;
    error.code = 'FINANCE_CORRECTION_REASON_REQUIRED';
    throw error;
  }

  if (reason.length > 500) {
    const error = new Error('Alasan koreksi maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'FINANCE_CORRECTION_REASON_TOO_LONG';
    throw error;
  }

  return { correctionType, requestedValue, reason };
}

export function isFinanceCorrectionAdminApprovalRequired(order = {}, correctionType) {
  const type = normalizeFinanceCorrectionType(correctionType);
  const status = String(order.status || '').toLowerCase();
  const billingStatus = String(order.billing_status || order.billingStatus || '').toLowerCase();
  const activeJobsCount = Number(order.active_jobs_count || order.activeJobsCount || 0);
  const invoiceNumber = String(order.invoice_number || order.invoiceNumber || '').trim();

  if (type === financeCorrectionTypes.invoiceNumber) return true;
  if (status === 'completed' || status === 'cancelled') return true;
  if (activeJobsCount > 0) return true;
  if (invoiceNumber) return true;
  return Boolean(billingStatus && billingStatus !== 'belum_invoice' && billingStatus !== 'pending_invoice');
}

export function mapFinanceCorrectionRequest(row = {}) {
  return {
    id: row.id,
    salesOrderId: row.sales_order_id,
    soNumber: row.so_number || '',
    invoiceNumber: row.invoice_number || '',
    correctionType: row.correction_type,
    currentValue: row.current_value || '',
    requestedValue: row.requested_value || '',
    reason: row.reason || '',
    status: row.status || financeCorrectionStatuses.pending,
    requiresAdminApproval: Boolean(row.requires_admin_approval),
    requestedByName: row.requested_by_name || '',
    requestedByRole: row.requested_by_role || '',
    requestedAt: row.requested_at,
    reviewedByName: row.reviewed_by_name || '',
    reviewedByRole: row.reviewed_by_role || '',
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note || '',
    appliedAt: row.applied_at,
    customer: row.customer_name || '',
    destination: row.destination || '',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
