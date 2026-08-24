import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import { getContainerJobExpense } from '../container-jobs/container-jobs.service.js';
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
  fetchContainerJobExpensesForReconciliation,
  closeOperationalFundBatch,
  fetchOperationalFundBatches,
  fetchOperationalFundRequests,
  fetchOperationalFundTransactions,
  fetchOrderVerifications,
  fetchRpujRequests,
  createOperationalFundRequest,
  depositOperationalFund,
  fetchInvoicePayments,
  fetchSalesOrderOutstanding,
  rejectFinanceCorrection,
  approveOperationalFundRequest,
  reconcileContainerJobExpense,
  recordInvoicePayment,
  rejectOperationalFundRequest,
  rejectRpuj,
  requestFinanceCorrection,
  saveInvoiceNumber,
  saveOrderVerificationSoNumber,
  uploadInvoiceDocument,
  uploadOperationalFundTransferProof,
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

export async function operationalFundRequestsController(request, response) {
  const result = await fetchOperationalFundRequests(request.query);
  sendSuccess(response, result);
}

export async function operationalFundBatchesController(request, response) {
  const result = await fetchOperationalFundBatches(request.query);
  sendSuccess(response, result);
}

export async function operationalFundTransactionsController(request, response) {
  const result = await fetchOperationalFundTransactions(request.query);
  sendSuccess(response, result);
}

export async function closeOperationalFundBatchController(request, response) {
  const result = await closeOperationalFundBatch(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_CLOSE_OPERATIONAL_FUND_BATCH',
    module: 'finance',
    entityType: 'operational_fund_batch',
    entityId: request.params.id,
    afterData: result,
    metadata: { batchDate: result.batchDate, balance: result.balance },
  });
  sendSuccess(response, result, 'Batch rekening dropping berhasil ditutup.');
}

export async function createOperationalFundRequestController(request, response) {
  const result = await createOperationalFundRequest(request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'OPERATIONAL_FUND_REQUEST_SUBMITTED',
    module: 'finance',
    entityType: 'operational_fund_request',
    entityId: result.id,
    afterData: result,
    metadata: { requestDate: result.requestDate, amount: result.amount },
  });
  sendSuccess(response, result, 'Pengajuan saldo operasional berhasil dibuat.');
}

export async function depositOperationalFundController(request, response) {
  const result = await depositOperationalFund(request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_DEPOSIT_OPERATIONAL_FUND',
    module: 'finance',
    entityType: 'operational_fund_transaction',
    entityId: result.id,
    afterData: result,
    metadata: { requestDate: result.requestDate, amount: result.amount },
  });
  sendSuccess(response, result, 'Deposit saldo operasional berhasil dicatat.');
}

export async function approveOperationalFundRequestController(request, response) {
  const result = await approveOperationalFundRequest(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_APPROVE_OPERATIONAL_FUND',
    module: 'finance',
    entityType: 'operational_fund_request',
    entityId: request.params.id,
    afterData: result,
    metadata: { requestDate: result.requestDate, amount: result.amount },
  });
  sendSuccess(response, result, 'Saldo operasional disetujui Finance.');
}

export async function rejectOperationalFundRequestController(request, response) {
  const result = await rejectOperationalFundRequest(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_REJECT_OPERATIONAL_FUND',
    module: 'finance',
    entityType: 'operational_fund_request',
    entityId: request.params.id,
    afterData: result,
    metadata: { requestDate: result.requestDate, amount: result.amount, rejectionNote: request.body?.rejectionNote || request.body?.note || '' },
  });
  sendSuccess(response, result, 'Saldo operasional ditolak Finance.');
}

export async function uploadOperationalFundTransferProofController(request, response) {
  const result = await uploadOperationalFundTransferProof(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_UPLOAD_OPERATIONAL_FUND_TRANSFER_PROOF',
    module: 'finance',
    entityType: 'operational_fund_request',
    entityId: request.params.id,
    afterData: result,
    metadata: { requestDate: result.requestDate, amount: result.amount, fileName: result.transferProof },
  });
  sendSuccess(response, result, 'Bukti transfer saldo operasional berhasil diupload.');
}

export async function containerJobExpenseReconciliationController(request, response) {
  const result = await fetchContainerJobExpensesForReconciliation(request.query);
  sendSuccess(response, result);
}

export async function reconcileContainerJobExpenseController(request, response) {
  const before = await getContainerJobExpense(request.params.id);
  const result = await reconcileContainerJobExpense(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_RECONCILE_CONTAINER_JOB_EXPENSE',
    module: 'finance',
    entityType: 'container_job_expense',
    entityId: request.params.id,
    beforeData: before,
    afterData: result,
    metadata: {
      containerJobId: result.containerJobId,
      soNumber: result.soNumber,
      category: result.category,
      amount: result.amount,
      financeCheckStatus: result.financeCheckStatus,
    },
  });
  sendSuccess(response, result, 'Status cek biaya container job berhasil disimpan.');
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

export async function outstandingOrdersController(request, response) {
  const result = await fetchSalesOrderOutstanding(request.query);
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

export async function recordInvoicePaymentController(request, response) {
  const result = await recordInvoicePayment(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_RECORD_INVOICE_PAYMENT',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: {
      amount: result?.payment?.amount,
      totalPaid: result?.totalPaid,
      outstandingAmount: result?.outstandingAmount,
      billingStatus: result?.billingStatus,
    },
  });
  sendSuccess(response, result, 'Pembayaran berhasil dicatat.');
}

export async function invoicePaymentsController(request, response) {
  const result = await fetchInvoicePayments(request.params.id);
  sendSuccess(response, result);
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
