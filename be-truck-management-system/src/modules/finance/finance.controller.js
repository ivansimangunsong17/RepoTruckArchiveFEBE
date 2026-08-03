import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  approveFinanceCorrection,
  approveRpuj,
  fetchCompletedTripDetail,
  fetchCompletedTrips,
  fetchFinanceCorrectionHistory,
  fetchFinanceCorrections,
  fetchFinanceDashboard,
  fetchInvoiceOrderDetail,
  fetchInvoiceOrders,
  fetchOrderVerifications,
  fetchRpujRequests,
  rejectFinanceCorrection,
  rejectRpuj,
  requestFinanceCorrection,
  saveInvoiceNumber,
  saveOrderVerificationSoNumber,
  uploadInvoiceDocument,
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

export async function invoiceOrderDetailController(request, response) {
  const result = await fetchInvoiceOrderDetail(request.params.id);
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

export async function uploadInvoiceDocumentController(request, response) {
  const result = await uploadInvoiceDocument(request.params.id, {
    ...request.body,
    documentType: request.params.documentType || request.body?.documentType,
  }, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_UPLOAD_INVOICE_DOCUMENT',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: {
      soNumber: result?.soNumber,
      invoiceNumber: result?.invoiceNumber,
      documentType: request.params.documentType || request.body?.documentType,
      fileName: result?.uploadedDocument?.fileName,
      invoiceDocumentStatus: result?.invoiceDocumentStatus,
    },
  });
  sendSuccess(response, result, 'Dokumen invoice berhasil diupload.');
}

export async function financeCorrectionsController(request, response) {
  const result = await fetchFinanceCorrections(request.query);
  sendSuccess(response, result);
}

export async function financeCorrectionHistoryController(request, response) {
  const result = await fetchFinanceCorrectionHistory(request.params.id);
  sendSuccess(response, result);
}

export async function requestOrderSoCorrectionController(request, response) {
  const result = await requestFinanceCorrection(
    request.params.id,
    { ...request.body, correctionType: 'so_number' },
    request.user,
  );
  await safeRecordActivityLog(request, {
    action: result.status === 'applied' ? 'FINANCE_CORRECTION_APPLIED' : 'FINANCE_CORRECTION_REQUESTED',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: {
      correctionType: result.correctionType,
      currentValue: result.currentValue,
      requestedValue: result.requestedValue,
      status: result.status,
      requiresAdminApproval: result.requiresAdminApproval,
    },
  });
  sendSuccess(response, result, result.status === 'applied' ? 'Koreksi nomor SO berhasil diterapkan.' : 'Request koreksi nomor SO dikirim ke Admin.');
}

export async function requestInvoiceCorrectionController(request, response) {
  const result = await requestFinanceCorrection(
    request.params.id,
    { ...request.body, correctionType: 'invoice_number' },
    request.user,
  );
  await safeRecordActivityLog(request, {
    action: result.status === 'applied' ? 'FINANCE_CORRECTION_APPLIED' : 'FINANCE_CORRECTION_REQUESTED',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: {
      correctionType: result.correctionType,
      currentValue: result.currentValue,
      requestedValue: result.requestedValue,
      status: result.status,
      requiresAdminApproval: result.requiresAdminApproval,
    },
  });
  sendSuccess(response, result, result.status === 'applied' ? 'Koreksi nomor invoice berhasil diterapkan.' : 'Request koreksi nomor invoice dikirim ke Admin.');
}

export async function approveFinanceCorrectionController(request, response) {
  const result = await approveFinanceCorrection(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_CORRECTION_APPROVED',
    module: 'finance',
    entityType: 'finance_correction_request',
    entityId: request.params.id,
    afterData: result,
    metadata: {
      salesOrderId: result.salesOrderId,
      correctionType: result.correctionType,
      currentValue: result.currentValue,
      requestedValue: result.requestedValue,
      reviewNote: result.reviewNote,
    },
  });
  sendSuccess(response, result, 'Koreksi Finance disetujui dan diterapkan.');
}

export async function rejectFinanceCorrectionController(request, response) {
  const result = await rejectFinanceCorrection(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_CORRECTION_REJECTED',
    module: 'finance',
    entityType: 'finance_correction_request',
    entityId: request.params.id,
    afterData: result,
    metadata: {
      salesOrderId: result.salesOrderId,
      correctionType: result.correctionType,
      currentValue: result.currentValue,
      requestedValue: result.requestedValue,
      reviewNote: result.reviewNote,
    },
  });
  sendSuccess(response, result, 'Koreksi Finance ditolak.');
}

export async function completedTripsController(request, response) {
  const result = await fetchCompletedTrips(request.query);
  sendSuccess(response, result);
}

export async function completedTripDetailController(request, response) {
  const result = await fetchCompletedTripDetail(request.params.id);
  sendSuccess(response, result);
}
