import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import { getContainerJobExpense } from '../container-jobs/container-jobs.service.js';
import {
  approveFinanceCorrection,
  addContainerJobExpenseTransferProof,
  approveRpuj,
  fetchCompletedTripDetail,
  fetchCompletedTrips,
  fetchDebitNoteOrders,
  fetchDebitNoteOutstanding,
  fetchDebitNotePayments,
  fetchFinanceCorrectionHistory,
  fetchFinanceCorrections,
  fetchFinanceDashboard,
  fetchInvoiceOrderDetail,
  fetchInvoiceOrders,
  fetchContainerJobExpensesForReconciliation,
  fetchContainerJobExpenseTransferProofs,
  closeOperationalFundBatch,
  fetchOperationalFundBatches,
  fetchOperationalFundRequests,
  fetchOperationalFundTransactions,
  fetchOrderVerifications,
  fetchRpujRequests,
  createOperationalFundRequest,
  createRevenueLine,
  depositOperationalFund,
  fetchInvoicePayments,
  fetchCustomerOutstandingRollup,
  exportCustomerOutstandingRollup,
  fetchSalesOrderOutstanding,
  rejectFinanceCorrection,
  approveOperationalFundRequest,
  reconcileContainerJobExpense,
  editContainerJobExpenseTransferProof,
  removeContainerJobExpenseTransferProof,
  recordCustomerInvoicePaymentAllocations,
  recordDebitNotePaymentForOrder,
  recordInvoicePayment,
  rejectOperationalFundRequest,
  rejectRpuj,
  reopenOperationalFundBatch,
  requestFinanceCorrection,
  saveDebitNoteNumber,
  saveInvoiceNumber,
  saveOrderVerificationSoNumber,
  updateRevenueLine,
  uploadInvoiceDocument,
  uploadOperationalFundTransferProof,
  uploadRpujTransferProof,
  voidDebitNotePaymentForOrder,
  voidInvoicePayment,
  voidRevenueLine,
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
  sendSuccess(response, result, 'Nomor SO Finance berhasil disimpan.');
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

export async function reopenOperationalFundBatchController(request, response) {
  const result = await reopenOperationalFundBatch(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_REOPEN_OPERATIONAL_FUND_BATCH',
    module: 'finance',
    entityType: 'operational_fund_batch',
    entityId: request.params.id,
    beforeData: { status: 'closed', closedAt: result.previousClosedAt, closedByName: result.previousClosedByName },
    afterData: result.batch,
    metadata: {
      batchDate: result.batch.batchDate,
      reason: request.body?.reason,
      carryForwardVoided: result.carryForwardVoided,
      carryForwardAmount: result.carryForwardAmount,
    },
  });
  sendSuccess(response, result.batch, 'Batch rekening dropping berhasil dibuka kembali.');
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
      proofAttachmentId: result.proofAttachmentId || null,
      proofFileName: result.proofAttachment?.name || request.body?.fileName || null,
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

export async function outstandingByCustomerController(request, response) {
  const result = await fetchCustomerOutstandingRollup(request.query);
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

export async function containerJobExpenseTransferProofsController(request, response) {
  const result = await fetchContainerJobExpenseTransferProofs(request.params.id);
  sendSuccess(response, result);
}

export async function addContainerJobExpenseTransferProofController(request, response) {
  const result = await addContainerJobExpenseTransferProof(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_ADD_UJ_TRANSFER_PROOF', module: 'finance',
    entityType: 'container_job_expense_transfer_proof', entityId: result.id, afterData: result,
    metadata: { containerJobExpenseId: request.params.id, amount: result.amount, transferDate: result.transferDate },
  });
  sendSuccess(response, result, 'Bukti transfer UJ berhasil ditambahkan.', 201);
}

export async function editContainerJobExpenseTransferProofController(request, response) {
  const result = await editContainerJobExpenseTransferProof(
    request.params.id, request.params.proofId, request.body, request.user,
  );
  await safeRecordActivityLog(request, {
    action: 'FINANCE_UPDATE_UJ_TRANSFER_PROOF', module: 'finance',
    entityType: 'container_job_expense_transfer_proof', entityId: result.id, afterData: result,
    metadata: { containerJobExpenseId: request.params.id, amount: result.amount, transferDate: result.transferDate },
  });
  sendSuccess(response, result, 'Bukti transfer UJ berhasil diperbarui.');
}

export async function deleteContainerJobExpenseTransferProofController(request, response) {
  const result = await removeContainerJobExpenseTransferProof(
    request.params.id, request.params.proofId, request.user,
  );
  await safeRecordActivityLog(request, {
    action: 'FINANCE_DELETE_UJ_TRANSFER_PROOF', module: 'finance',
    entityType: 'container_job_expense_transfer_proof', entityId: result.id, beforeData: result, afterData: null,
    metadata: { containerJobExpenseId: request.params.id, amount: result.amount, transferDate: result.transferDate },
  });
  sendSuccess(response, result, 'Bukti transfer UJ berhasil dihapus.');
}

export async function outstandingByCustomerExportController(request, response) {
  const result = await exportCustomerOutstandingRollup(request.query);
  sendSuccess(response, result);
}

export async function recordCustomerInvoicePaymentController(request, response) {
  const result = await recordCustomerInvoicePaymentAllocations(request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_RECORD_CUSTOMER_INVOICE_PAYMENT',
    module: 'finance',
    entityType: 'customer_payment',
    entityId: result?.payments?.[0]?.id || null,
    afterData: result,
    metadata: {
      totalAmount: result?.totalAmount,
      allocatedAmount: result?.allocatedAmount,
      unallocatedAmount: result?.unallocatedAmount,
      invoiceCount: result?.payments?.length || 0,
      proofAttachmentId: result?.proofAttachmentId || null,
    },
  });
  sendSuccess(response, result, 'Pembayaran customer berhasil dialokasikan.');
}

export async function invoicePaymentsController(request, response) {
  const result = await fetchInvoicePayments(request.params.id);
  sendSuccess(response, result);
}

export async function voidInvoicePaymentController(request, response) {
  const before = await fetchInvoicePayments(request.params.id);
  const result = await voidInvoicePayment(request.params.id, request.params.paymentId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_VOID_INVOICE_PAYMENT',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    beforeData: before.find((payment) => payment.id === request.params.paymentId) || null,
    afterData: result,
    metadata: {
      paymentId: request.params.paymentId,
      reason: request.body?.reason,
      totalPaid: result?.totalPaid,
      outstandingAmount: result?.outstandingAmount,
      billingStatus: result?.billingStatus,
    },
  });
  sendSuccess(response, result, 'Pembayaran berhasil dibatalkan.');
}

export async function createRevenueLineController(request, response) {
  const result = await createRevenueLine(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_CREATE_REVENUE_LINE',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result?.line,
    metadata: {
      chargeType: result?.line?.chargeType,
      description: result?.line?.description,
      totalAmount: result?.line?.totalAmount,
      billingAmount: result?.billingAmount,
    },
  });
  sendSuccess(response, result, 'Revenue line berhasil ditambahkan.');
}

export async function updateRevenueLineController(request, response) {
  const result = await updateRevenueLine(request.params.id, request.params.lineId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_UPDATE_REVENUE_LINE',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result?.line,
    metadata: {
      lineId: request.params.lineId,
      totalAmount: result?.line?.totalAmount,
      billingAmount: result?.billingAmount,
    },
  });
  sendSuccess(response, result, 'Revenue line berhasil diperbarui.');
}

export async function voidRevenueLineController(request, response) {
  const result = await voidRevenueLine(request.params.id, request.params.lineId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_VOID_REVENUE_LINE',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result?.line,
    metadata: {
      lineId: request.params.lineId,
      reason: request.body?.reason,
      billingAmount: result?.billingAmount,
    },
  });
  sendSuccess(response, result, 'Revenue line berhasil dibatalkan.');
}

export async function debitNoteOrdersController(request, response) {
  const result = await fetchDebitNoteOrders(request.query);
  sendSuccess(response, result);
}

export async function debitNoteOutstandingController(request, response) {
  const result = await fetchDebitNoteOutstanding(request.query);
  sendSuccess(response, result);
}

export async function updateDebitNoteNumberController(request, response) {
  const result = await saveDebitNoteNumber(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_INPUT_DEBIT_NOTE_NUMBER',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: { soNumber: result?.soNumber, debitNoteNumber: result?.debitNoteNumber },
  });
  sendSuccess(response, result, 'Nomor Debit Note berhasil disimpan.');
}

export async function recordDebitNotePaymentController(request, response) {
  const result = await recordDebitNotePaymentForOrder(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_RECORD_DEBIT_NOTE_PAYMENT',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    afterData: result,
    metadata: {
      amount: result?.payment?.amount,
      totalPaid: result?.totalPaid,
      outstandingAmount: result?.outstandingAmount,
    },
  });
  sendSuccess(response, result, 'Pembayaran Debit Note berhasil dicatat.');
}

export async function debitNotePaymentsController(request, response) {
  const result = await fetchDebitNotePayments(request.params.id);
  sendSuccess(response, result);
}

export async function voidDebitNotePaymentController(request, response) {
  const before = await fetchDebitNotePayments(request.params.id);
  const result = await voidDebitNotePaymentForOrder(request.params.id, request.params.paymentId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'FINANCE_VOID_DEBIT_NOTE_PAYMENT',
    module: 'finance',
    entityType: 'sales_order',
    entityId: request.params.id,
    beforeData: before.find((payment) => payment.id === request.params.paymentId) || null,
    afterData: result,
    metadata: {
      paymentId: request.params.paymentId,
      reason: request.body?.reason,
      totalPaid: result?.totalPaid,
      outstandingAmount: result?.outstandingAmount,
    },
  });
  sendSuccess(response, result, 'Pembayaran Debit Note berhasil dibatalkan.');
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
