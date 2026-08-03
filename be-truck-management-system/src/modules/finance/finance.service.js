import {
  approveFinanceCorrectionRequest,
  approveRpujRequest,
  createFinanceCorrectionRequest,
  getCompletedTripDetail,
  getCompletedTripsPage,
  getFinanceCorrectionRequestsBySalesOrder,
  getFinanceCorrectionRequestsPage,
  getFinanceDashboard,
  getInvoiceOrderDetail,
  getInvoiceOrdersPage,
  getOrderVerificationsPage,
  getRpujRequestsPage,
  markInvoiceDocumentUploaded,
  markRpujTransferUploaded,
  rejectRpujRequest,
  rejectFinanceCorrectionRequest,
  updateInvoiceNumber,
  updateOrderVerificationSoNumber,
} from './finance.repository.js';
import {
  createAttachment,
  listAttachments,
  updateAttachment,
} from '../attachments/attachments.service.js';

function normalizeFinanceQuery(query = {}) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    customer: query.customer || '',
    destination: query.destination || '',
    containerSize: query.containerSize || query.size || '',
    documentStatus: query.documentStatus || '',
    invoiceStatus: query.invoiceStatus || '',
    query: query.query || query.search || '',
    invoiceDocumentFilter: query.invoiceDocumentFilter || query.documentFilter || '',
  };
}

export function fetchFinanceDashboard(query) {
  return getFinanceDashboard(normalizeFinanceQuery(query));
}

export function fetchOrderVerifications(query = {}) {
  return getOrderVerificationsPage({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    query: query.query || query.search || '',
    status: query.status || '',
  });
}

export function saveOrderVerificationSoNumber(id, payload = {}, actor) {
  return updateOrderVerificationSoNumber(id, {
    soNumber: payload.soNumber,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export function fetchRpujRequests(query = {}) {
  return getRpujRequestsPage({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    query: query.query || query.search || '',
    status: query.status || '',
  });
}

export function approveRpuj(id, payload = {}, actor) {
  return approveRpujRequest(id, {
    ...payload,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export function rejectRpuj(id, payload = {}, actor) {
  const rejectionNote = String(payload.rejectionNote || payload.note || '').trim();
  if (!rejectionNote) {
    const error = new Error('Catatan reject RPUJ wajib diisi.');
    error.statusCode = 400;
    error.code = 'RPUJ_REJECTION_NOTE_REQUIRED';
    throw error;
  }
  if (rejectionNote.length > 500) {
    const error = new Error('Catatan reject RPUJ maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'RPUJ_REJECTION_NOTE_TOO_LONG';
    throw error;
  }
  return rejectRpujRequest(id, {
    rejectionNote,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export async function uploadRpujTransferProof(id, payload = {}, actor) {
  const actorName = actor?.name || actor?.email || 'Finance';
  const attachment = await createAttachment({
    ...payload,
    entityType: 'container_job',
    entityId: id,
    category: 'rpujTransferProof',
    uploadedByName: actorName,
    notes: payload.notes || 'Bukti transfer UJ',
  });
  const request = await markRpujTransferUploaded(id, { actorName });
  return { ...request, transferProofFile: attachment, transferProof: attachment.fileName || request.transferProof };
}

export function fetchInvoiceOrders(query = {}) {
  return getInvoiceOrdersPage({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    query: query.query || query.search || '',
    status: query.status || '',
    invoiceDocumentFilter: query.invoiceDocumentFilter || query.documentFilter || '',
  });
}

export async function fetchInvoiceOrderDetail(id) {
  const invoice = await getInvoiceOrderDetail(id);
  if (!invoice) {
    const error = new Error('Detail invoice tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'FINANCE_INVOICE_NOT_FOUND';
    throw error;
  }
  return invoice;
}

export function saveInvoiceNumber(id, payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Nomor invoice hanya dapat diinput oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'FINANCE_INVOICE_NUMBER_FORBIDDEN';
    throw error;
  }
  return updateInvoiceNumber(id, {
    invoiceNumber: payload.invoiceNumber,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

function normalizeInvoiceUploadType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['invoice', 'invoicepdf', 'invoice_pdf'].includes(normalized)) return 'invoicePdf';
  if (['tax_invoice', 'taxinvoice', 'taxinvoicepdf', 'tax_invoice_pdf', 'faktur_pajak', 'faktur'].includes(normalized)) return 'taxInvoicePdf';
  return '';
}

export async function uploadInvoiceDocument(id, payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Upload Invoice dan Faktur Pajak hanya dapat dilakukan oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'FINANCE_INVOICE_UPLOAD_FORBIDDEN';
    throw error;
  }

  const category = normalizeInvoiceUploadType(payload.documentType || payload.category);
  if (!category) {
    const error = new Error('Jenis dokumen invoice tidak valid.');
    error.statusCode = 400;
    error.code = 'INVALID_INVOICE_DOCUMENT_TYPE';
    throw error;
  }

  const mimeType = payload.mimeType || '';
  if (mimeType !== 'application/pdf') {
    const error = new Error('Invoice dan Faktur Pajak wajib berupa PDF.');
    error.statusCode = 400;
    error.code = 'INVOICE_DOCUMENT_PDF_REQUIRED';
    throw error;
  }

  const actorName = actor?.name || actor?.email || 'Finance';
  const invoiceOrder = await getInvoiceOrderDetail(id);
  if (!invoiceOrder) {
    const error = new Error('Sales Order selesai untuk invoice tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'FINANCE_INVOICE_ORDER_NOT_FOUND';
    throw error;
  }

  const existingAttachments = await listAttachments('sales_order', id);
  const existing = existingAttachments
    .filter((attachment) => attachment.category === category)
    .sort((left, right) => new Date(right.uploadedAt || right.createdAt || 0) - new Date(left.uploadedAt || left.createdAt || 0))[0];
  const attachmentPayload = {
    ...payload,
    entityType: 'sales_order',
    entityId: id,
    category,
    uploadedByName: actorName,
    notes: payload.notes || (category === 'invoicePdf' ? 'Invoice dari Accurate' : 'Faktur Pajak dari Accurate'),
  };
  const attachment = existing
    ? await updateAttachment(existing.id, attachmentPayload)
    : await createAttachment(attachmentPayload);
  const invoice = await markInvoiceDocumentUploaded(id, { category, actorName });
  return { ...invoice, uploadedDocument: attachment };
}

export function requestFinanceCorrection(id, payload = {}, actor) {
  return createFinanceCorrectionRequest(id, {
    ...payload,
    actorName: actor?.name || actor?.email || 'Finance',
    actorRole: actor?.role || 'finance',
  });
}

export function fetchFinanceCorrectionHistory(id) {
  return getFinanceCorrectionRequestsBySalesOrder(id);
}

export function fetchFinanceCorrections(query = {}) {
  return getFinanceCorrectionRequestsPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || query.search || '',
    status: query.status || '',
    correctionType: query.correctionType || query.type || '',
  });
}

export function approveFinanceCorrection(id, payload = {}, actor) {
  return approveFinanceCorrectionRequest(id, {
    reviewNote: payload.reviewNote || payload.note || '',
    actorName: actor?.name || actor?.email || 'Admin',
    actorRole: actor?.role || 'admin',
  });
}

export function rejectFinanceCorrection(id, payload = {}, actor) {
  return rejectFinanceCorrectionRequest(id, {
    reviewNote: payload.reviewNote || payload.note || '',
    actorName: actor?.name || actor?.email || 'Admin',
    actorRole: actor?.role || 'admin',
  });
}

export function fetchCompletedTrips(query) {
  return getCompletedTripsPage(normalizeFinanceQuery(query));
}

export async function fetchCompletedTripDetail(id) {
  const trip = await getCompletedTripDetail(id);
  if (!trip) {
    const error = new Error('Perjalanan selesai tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'FINANCE_TRIP_NOT_FOUND';
    throw error;
  }
  return trip;
}
