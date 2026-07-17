import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  approveRpuj,
  fetchCompletedTripDetail,
  fetchCompletedTrips,
  fetchFinanceDashboard,
  fetchInvoiceOrders,
  fetchOrderVerifications,
  fetchRpujRequests,
  rejectRpuj,
  saveInvoiceNumber,
  saveOrderVerificationSoNumber,
  uploadRpujTransferProof,
} from './finance.service.js';

export async function financeDashboardController(request, response) {
  const result = await fetchFinanceDashboard(request.query);
  sendSuccess(response, result);
}

export async function orderVerificationsController(request, response) {
  const result = await fetchOrderVerifications(request.query);
  sendSuccess(response, result);
}

export async function updateOrderVerificationSoNumberController(request, response) {
  const result = await saveOrderVerificationSoNumber(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_INPUT_SO_NUMBER',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: { soNumber: result.soNumber },
  });
  await safeRecordActivityLog(request, {
    action: 'FINANCE_APPROVE_ORDER',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: { soNumber: result.soNumber },
  });
  sendSuccess(response, result, 'Nomor SO Accurate berhasil disimpan.');
}

export async function rpujRequestsController(request, response) {
  const result = await fetchRpujRequests(request.query);
  sendSuccess(response, result);
}

export async function approveRpujController(request, response) {
  const result = await approveRpuj(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_APPROVE_RPUJ',
    module: 'finance',
    entityType: 'container_job',
    entityId: request.params.id,
    afterData: result,
    metadata: { soNumber: result.soNumber },
  });
  sendSuccess(response, result, 'RPUJ disetujui Finance.');
}

export async function rejectRpujController(request, response) {
  const result = await rejectRpuj(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_REJECT_RPUJ',
    module: 'finance',
    entityType: 'container_job',
    entityId: request.params.id,
    afterData: result,
    metadata: { soNumber: result.soNumber, rejectionNote: request.body?.rejectionNote || request.body?.note || '' },
  });
  sendSuccess(response, result, 'RPUJ ditolak Finance.');
}

export async function uploadRpujTransferProofController(request, response) {
  const result = await uploadRpujTransferProof(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_UPLOAD_TRANSFER_PROOF',
    module: 'finance',
    entityType: 'container_job',
    entityId: request.params.id,
    afterData: result,
    metadata: { soNumber: result.soNumber, fileName: result.transferProof },
  });
  sendSuccess(response, result, 'Bukti transfer UJ berhasil diupload.');
}

export async function invoiceOrdersController(request, response) {
  const result = await fetchInvoiceOrders(request.query);
  sendSuccess(response, result);
}

export async function updateInvoiceNumberController(request, response) {
  const result = await saveInvoiceNumber(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_INPUT_INVOICE_NUMBER',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: { soNumber: result?.soNumber, invoiceNumber: result?.invoiceNumber },
  });
  sendSuccess(response, result, 'Nomor invoice berhasil disimpan.');
}

export async function completedTripsController(request, response) {
  const result = await fetchCompletedTrips(request.query);
  sendSuccess(response, result);
}

export async function completedTripDetailController(request, response) {
  const result = await fetchCompletedTripDetail(request.params.id);
  sendSuccess(response, result);
}
