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
  markRpujTransferUploaded,
  rejectRpujRequest,
  rejectFinanceCorrectionRequest,
  updateInvoiceNumber,
  updateOrderVerificationSoNumber,
} from './finance.repository.js';
import { createAttachment } from '../attachments/attachments.service.js';

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
  return updateInvoiceNumber(id, {
    invoiceNumber: payload.invoiceNumber,
    actorName: actor?.name || actor?.email || 'Finance',
  });
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
