import { randomUUID } from 'node:crypto';
import {
  approveFinanceCorrectionRequest,
  approveRpujRequest,
  createFinanceCorrectionRequest,
  closeOperationalFundBatchRecord,
  depositOperationalFundRecord,
  createOperationalFundRequestRecord,
  getCompletedTripDetail,
  getCompletedTripsPage,
  getDebitNoteOrdersPage,
  getDebitNoteOutstandingPage,
  getFinanceCorrectionRequestsBySalesOrder,
  getFinanceCorrectionRequestsPage,
  getFinanceDashboard,
  getInvoiceOrderDetail,
  getInvoiceOrdersPage,
  getCustomerOutstandingRollupPage,
  getCustomerOutstandingRollupExport,
  getSalesOrderOutstandingPage,
  getContainerJobExpensesReconciliationPage,
  getOperationalFundRequestsPage,
  getOperationalFundBatchesPage,
  getOperationalFundTransactionsPage,
  getOrderVerificationsPage,
  getRpujRequestsPage,
  approveOperationalFundRequestRecord,
  listDebitNotePayments,
  listSalesOrderPayments,
  markInvoiceDocumentUploaded,
  markOperationalFundTransferUploadedRecord,
  markRpujTransferUploaded,
  reconcileContainerJobExpenseRecord,
  recordCustomerInvoicePayments,
  recordDebitNotePayment,
  recordSalesOrderPayment,
  rejectOperationalFundRequestRecord,
  rejectRpujRequest,
  rejectFinanceCorrectionRequest,
  reopenOperationalFundBatchRecord,
  createManualRevenueLine,
  createContainerJobExpenseTransferProofRecord,
  deleteContainerJobExpenseTransferProofRecord,
  listContainerJobExpenseTransferProofs,
  updateContainerJobExpenseTransferProofRecord,
  updateDebitNoteNumber,
  updateInvoiceNumber,
  updateManualRevenueLine,
  updateOrderVerificationSoNumber,
  voidDebitNotePayment,
  voidManualRevenueLine,
  activateManualRevenueLine,
  voidSalesOrderPayment,
} from './finance.repository.js';
import {
  createAttachment,
  deleteAttachment,
  listAttachments,
  updateAttachment,
} from '../attachments/attachments.service.js';
import { env } from '../../config/env.js';

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
    dateBasis: query.dateBasis || '',
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

function normalizeOperationalFundRequestDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const normalized = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const error = new Error('Tanggal pengajuan saldo operasional tidak valid.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_DATE_INVALID';
    throw error;
  }
  return normalized;
}

function normalizeOperationalFundAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Nominal saldo operasional wajib lebih dari 0.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_AMOUNT_INVALID';
    throw error;
  }
  return Math.round(amount);
}

function normalizeOperationalFundPurpose(value) {
  const purpose = String(value || '').trim();
  if (purpose.length > 500) {
    const error = new Error('Keterangan saldo operasional maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_PURPOSE_TOO_LONG';
    throw error;
  }
  return purpose;
}

export function fetchOperationalFundRequests(query = {}) {
  return getOperationalFundRequestsPage({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    query: query.query || query.search || '',
    status: query.status || '',
  });
}

export function fetchOperationalFundBatches(query = {}) {
  return getOperationalFundBatchesPage({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    status: query.status || '',
  });
}

export function fetchOperationalFundTransactions(query = {}) {
  return getOperationalFundTransactionsPage({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    query: query.query || query.search || '',
    transactionType: query.transactionType || query.type || '',
    category: query.category || '',
    batchId: query.batchId || '',
    batchDate: query.batchDate || '',
    status: query.status || 'posted',
  });
}

export function createOperationalFundRequest(payload = {}, actor) {
  return createOperationalFundRequestRecord({
    requestDate: normalizeOperationalFundRequestDate(payload.requestDate || payload.date),
    amount: normalizeOperationalFundAmount(payload.amount),
    purpose: normalizeOperationalFundPurpose(payload.purpose || payload.notes),
    actorName: actor?.name || actor?.email || 'Operational',
  });
}

export async function depositOperationalFund(payload = {}, actor) {
  const actorName = actor?.name || actor?.email || 'Finance';
  const requestDate = normalizeOperationalFundRequestDate(payload.requestDate || payload.date);
  const amount = normalizeOperationalFundAmount(payload.amount);
  const purpose = normalizeOperationalFundPurpose(payload.purpose || payload.notes || 'Deposit saldo operasional harian dari Finance');
  if (!payload.fileName || !payload.fileBase64) {
    const error = new Error('Bukti transfer deposit saldo wajib diupload.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_DEPOSIT_PROOF_REQUIRED';
    throw error;
  }
  const transactionId = randomUUID();
  const attachment = await createAttachment({
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    fileSize: payload.fileSize,
    fileBase64: payload.fileBase64,
    entityType: 'operational_fund_transaction',
    entityId: transactionId,
    category: 'transferProof',
    uploadedByName: actorName,
    notes: payload.purpose || payload.notes || 'Bukti transfer deposit saldo operasional',
  });
  return depositOperationalFundRecord({
    id: transactionId,
    requestDate,
    amount,
    purpose,
    proofAttachmentId: attachment.id,
    actorName,
  });
}

export function closeOperationalFundBatch(id, payload = {}, actor) {
  const closeNote = String(payload.closeNote || payload.note || '').trim();
  if (closeNote.length > 500) {
    const error = new Error('Catatan close batch maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_BATCH_CLOSE_NOTE_TOO_LONG';
    throw error;
  }
  return closeOperationalFundBatchRecord(id, {
    closeNote,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export function reopenOperationalFundBatch(id, payload = {}, actor) {
  if (!actor || actor.role !== 'admin') {
    const error = new Error('Membuka kembali batch rekening dropping hanya dapat dilakukan oleh Admin.');
    error.statusCode = 403;
    error.code = 'OPERATIONAL_FUND_BATCH_REOPEN_FORBIDDEN';
    throw error;
  }
  const reason = String(payload.reason || '').trim();
  if (!reason) {
    const error = new Error('Alasan membuka kembali batch wajib diisi.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_BATCH_REOPEN_REASON_REQUIRED';
    throw error;
  }
  if (reason.length > 500) {
    const error = new Error('Alasan membuka kembali batch maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_BATCH_REOPEN_REASON_TOO_LONG';
    throw error;
  }
  return reopenOperationalFundBatchRecord(id, {
    reason,
    actorName: actor?.name || actor?.email || 'Admin',
  });
}

export function approveOperationalFundRequest(id, payload = {}, actor) {
  return approveOperationalFundRequestRecord(id, {
    ...payload,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export function rejectOperationalFundRequest(id, payload = {}, actor) {
  const rejectionNote = String(payload.rejectionNote || payload.note || '').trim();
  if (!rejectionNote) {
    const error = new Error('Catatan reject saldo operasional wajib diisi.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_REJECTION_NOTE_REQUIRED';
    throw error;
  }
  if (rejectionNote.length > 500) {
    const error = new Error('Catatan reject saldo operasional maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'OPERATIONAL_FUND_REJECTION_NOTE_TOO_LONG';
    throw error;
  }
  return rejectOperationalFundRequestRecord(id, {
    rejectionNote,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export async function uploadOperationalFundTransferProof(id, payload = {}, actor) {
  const actorName = actor?.name || actor?.email || 'Finance';
  const attachment = await createAttachment({
    ...payload,
    entityType: 'operational_fund_request',
    entityId: id,
    category: 'operationalFundTransferProof',
    uploadedByName: actorName,
    notes: payload.notes || 'Bukti transfer saldo operasional',
  });
  const request = await markOperationalFundTransferUploadedRecord(id, {
    actorName,
    transferProofAttachmentId: attachment.id,
  });
  return { ...request, transferProofFile: attachment, transferProof: attachment.fileName || request.transferProof };
}

export function fetchContainerJobExpensesForReconciliation(query = {}) {
  return getContainerJobExpensesReconciliationPage({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    query: query.query || query.search || '',
    paymentStatus: query.paymentStatus || '',
    financeCheckStatus: query.financeCheckStatus || query.status || '',
  });
}

export async function reconcileContainerJobExpense(id, payload = {}, actor, dependencies = {}) {
  const financeCheckStatus = String(payload.financeCheckStatus || payload.status || '').trim();
  if (!['belum_dicek', 'sudah_dicek', 'perlu_klarifikasi', 'dikoreksi'].includes(financeCheckStatus)) {
    const error = new Error('Status cek Finance biaya container job tidak valid.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_FINANCE_STATUS_INVALID';
    throw error;
  }
  const financeNote = String(payload.financeNote || payload.note || '').trim();
  if (financeCheckStatus === 'perlu_klarifikasi' && !financeNote) {
    const error = new Error('Catatan klarifikasi biaya container job wajib diisi.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_FINANCE_NOTE_REQUIRED';
    throw error;
  }
  if (financeNote.length > 500) {
    const error = new Error('Catatan cek Finance biaya container job maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_FINANCE_NOTE_TOO_LONG';
    throw error;
  }
  const adminFeeAmount = Number(payload.adminFeeAmount || 0);
  if (!Number.isFinite(adminFeeAmount) || adminFeeAmount < 0) {
    const error = new Error('Biaya admin transfer tidak valid.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_ADMIN_FEE_INVALID';
    throw error;
  }
  const adminFeeNote = String(payload.adminFeeNote || '').trim();
  if (adminFeeNote.length > 500) {
    const error = new Error('Catatan biaya admin transfer maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_ADMIN_FEE_NOTE_TOO_LONG';
    throw error;
  }
  const adjustmentNote = String(payload.adjustmentNote || payload.financeNote || '').trim();
  if (adjustmentNote.length > 500) {
    const error = new Error('Catatan penyesuaian maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_ADJUSTMENT_NOTE_TOO_LONG';
    throw error;
  }
  const actorName = actor?.name || actor?.email || 'Finance';
  const createAttachmentFn = dependencies.createAttachment || createAttachment;
  const deleteAttachmentFn = dependencies.deleteAttachment || deleteAttachment;
  const reconcileRecordFn = dependencies.reconcileRecord || reconcileContainerJobExpenseRecord;
  let proofAttachmentId = payload.proofAttachmentId || null;
  let createdProofAttachment = null;
  if (!proofAttachmentId && payload.fileName && payload.fileBase64) {
    createdProofAttachment = await createAttachmentFn({
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
      fileBase64: payload.fileBase64,
      entityType: 'container_job_expense',
      entityId: id,
      category: 'expensePaymentProof',
      uploadedByName: actorName,
      notes: payload.proofNote || payload.financeNote || 'Bukti pembayaran biaya rekening dropping',
    });
    proofAttachmentId = createdProofAttachment.id;
  }
  try {
    return await reconcileRecordFn(id, {
      financeCheckStatus,
      financeNote,
      proofAttachmentId,
      adminFeeAmount,
      adminFeeNote,
      adjustmentNote: adjustmentNote || null,
      actorName,
    });
  } catch (error) {
    if (createdProofAttachment?.id) {
      await deleteAttachmentFn(
        createdProofAttachment.id,
        actor || { name: actorName },
        'Rollback bukti pembayaran karena rekonsiliasi biaya gagal',
      ).catch((cleanupError) => {
        console.error(`Cleanup bukti rekonsiliasi gagal: ${cleanupError.message}`);
      });
    }
    throw error;
  }
}

function normalizeTransferProofPayload(payload = {}, { requireFile = false } = {}) {
  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Nominal bukti transfer wajib lebih dari 0.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_AMOUNT_INVALID';
    throw error;
  }
  const transferDate = String(payload.transferDate || payload.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) {
    const error = new Error('Tanggal bukti transfer tidak valid.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_DATE_INVALID';
    throw error;
  }
  const note = String(payload.note || '').trim();
  if (note.length > 500) {
    const error = new Error('Catatan bukti transfer maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_NOTE_TOO_LONG';
    throw error;
  }
  if (requireFile && (!payload.fileName || !payload.fileBase64)) {
    const error = new Error('File bukti transfer wajib diupload.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_FILE_REQUIRED';
    throw error;
  }
  return { amount: Math.round(amount), transferDate, note };
}

export function fetchContainerJobExpenseTransferProofs(id) {
  return listContainerJobExpenseTransferProofs(id);
}

export async function addContainerJobExpenseTransferProof(id, payload = {}, actor, dependencies = {}) {
  const normalized = normalizeTransferProofPayload(payload, { requireFile: true });
  const actorName = actor?.name || actor?.email || 'Finance';
  const createAttachmentFn = dependencies.createAttachment || createAttachment;
  const createRecordFn = dependencies.createRecord || createContainerJobExpenseTransferProofRecord;
  const deleteAttachmentFn = dependencies.deleteAttachment || deleteAttachment;
  const attachment = await createAttachmentFn({
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    fileSize: payload.fileSize,
    fileBase64: payload.fileBase64,
    entityType: 'container_job_expense',
    entityId: id,
    category: 'expensePaymentProof',
    uploadedByName: actorName,
    notes: normalized.note || 'Bukti transfer UJ',
  });
  try {
    return await createRecordFn(id, { ...normalized, attachmentId: attachment.id, actorName });
  } catch (error) {
    await deleteAttachmentFn(attachment.id, actor || { name: actorName }, 'Rollback bukti transfer UJ gagal disimpan').catch(() => {});
    throw error;
  }
}

export async function editContainerJobExpenseTransferProof(id, proofId, payload = {}, actor, dependencies = {}) {
  const normalized = normalizeTransferProofPayload(payload);
  const actorName = actor?.name || actor?.email || 'Finance';
  const updateRecordFn = dependencies.updateRecord || updateContainerJobExpenseTransferProofRecord;
  const updateAttachmentFn = dependencies.updateAttachment || updateAttachment;
  const saved = await updateRecordFn(id, proofId, { ...normalized, actorName });
  if (payload.fileBase64) {
    const attachment = await updateAttachmentFn(saved.attachmentId, {
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
      fileBase64: payload.fileBase64,
      notes: normalized.note || 'Bukti transfer UJ',
      uploadedByName: actorName,
    });
    return { ...saved, attachment };
  }
  return saved;
}

export async function removeContainerJobExpenseTransferProof(id, proofId, actor, dependencies = {}) {
  const actorName = actor?.name || actor?.email || 'Finance';
  const deleteRecordFn = dependencies.deleteRecord || deleteContainerJobExpenseTransferProofRecord;
  const deleteAttachmentFn = dependencies.deleteAttachment || deleteAttachment;
  const deleted = await deleteRecordFn(id, proofId, { actorName });
  await deleteAttachmentFn(deleted.attachmentId, actor || { name: actorName }, 'Bukti transfer UJ dihapus oleh Finance');
  return deleted;
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

export function fetchSalesOrderOutstanding(query = {}) {
  return getSalesOrderOutstandingPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || query.search || '',
    agingBucket: query.agingBucket || '',
    dataReviewStatus: query.dataReviewStatus || '',
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
  });
}

export function fetchCustomerOutstandingRollup(query = {}) {
  return getCustomerOutstandingRollupPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || query.search || '',
    agingBucket: query.agingBucket || '',
    sortBy: query.sortBy || '',
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
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
  if (['debit_note', 'debitnote', 'debitnotepdf', 'debit_note_pdf'].includes(normalized)) return 'debitNotePdf';
  return '';
}

export async function uploadInvoiceDocument(id, payload = {}, actor, dependencies = {}) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Upload dokumen invoice hanya dapat dilakukan oleh Finance atau Admin.');
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
    const error = new Error('Dokumen invoice wajib berupa PDF.');
    error.statusCode = 400;
    error.code = 'INVOICE_DOCUMENT_PDF_REQUIRED';
    throw error;
  }

  const actorName = actor?.name || actor?.email || 'Finance';
  const getInvoiceOrderDetailFn = dependencies.getInvoiceOrderDetail || getInvoiceOrderDetail;
  const listAttachmentsFn = dependencies.listAttachments || listAttachments;
  const createAttachmentFn = dependencies.createAttachment || createAttachment;
  const updateAttachmentFn = dependencies.updateAttachment || updateAttachment;
  const markInvoiceDocumentUploadedFn = dependencies.markInvoiceDocumentUploaded || markInvoiceDocumentUploaded;
  const invoiceOrder = await getInvoiceOrderDetailFn(id);
  if (!invoiceOrder) {
    const error = new Error('Sales Order selesai untuk invoice tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'FINANCE_INVOICE_ORDER_NOT_FOUND';
    throw error;
  }

  const existingAttachments = await listAttachmentsFn('sales_order', id);
  const existing = existingAttachments
    .filter((attachment) => attachment.category === category)
    .sort((left, right) => new Date(right.uploadedAt || right.createdAt || 0) - new Date(left.uploadedAt || left.createdAt || 0))[0];
  const attachmentPayload = {
    ...payload,
    entityType: 'sales_order',
    entityId: id,
    category,
    uploadedByName: actorName,
    notes: payload.notes || (
      category === 'invoicePdf'
        ? 'Invoice dari Accurate'
        : category === 'debitNotePdf'
          ? 'Dokumen Debit Note'
          : 'Faktur Pajak dari Accurate'
    ),
  };
  // Dokumen billing Finance memakai batas ukurannya sendiri; PDF disimpan apa adanya tanpa kompresi.
  const uploadOptions = { maxUploadBytes: env.financeDocumentMaxUploadBytes };
  const attachment = existing
    ? await updateAttachmentFn(existing.id, attachmentPayload, uploadOptions)
    : await createAttachmentFn(attachmentPayload, uploadOptions);
  const invoice = await markInvoiceDocumentUploadedFn(id, { category, actorName });
  return { ...invoice, uploadedDocument: attachment };
}

export async function recordInvoicePayment(id, payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Pembayaran invoice hanya dapat dicatat oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'FINANCE_INVOICE_PAYMENT_FORBIDDEN';
    throw error;
  }
  const actorName = actor?.name || actor?.email || 'Finance';

  let proofAttachmentId = payload.proofAttachmentId || null;
  if (!proofAttachmentId && payload.proofFile) {
    const attachment = await createAttachment({
      ...payload.proofFile,
      entityType: 'sales_order',
      entityId: id,
      category: 'paymentProof',
      uploadedByName: actorName,
      notes: payload.proofFile.notes || 'Bukti transfer pembayaran invoice',
    });
    proofAttachmentId = attachment.id;
  }

  return recordSalesOrderPayment(id, {
    amount: payload.amount,
    paymentDate: payload.paymentDate,
    referenceNumber: payload.referenceNumber,
    proofAttachmentId,
    note: payload.note,
    idempotencyKey: payload.idempotencyKey,
    actorUserId: actor?.id || null,
    actorName,
  });
}

export function exportCustomerOutstandingRollup(query = {}) {
  return getCustomerOutstandingRollupExport({
    query: query.query || query.search || '',
    agingBucket: query.agingBucket || '',
    sortBy: query.sortBy || '',
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
  });
}

export async function recordCustomerInvoicePaymentAllocations(payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Pembayaran invoice hanya dapat dicatat oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'FINANCE_INVOICE_PAYMENT_FORBIDDEN';
    throw error;
  }
  const actorName = actor?.name || actor?.email || 'Finance';
  const allocations = Array.isArray(payload.allocations) ? payload.allocations : [];
  if (!allocations.length) {
    const error = new Error('Minimal satu invoice wajib dipilih untuk alokasi pembayaran.');
    error.statusCode = 400;
    error.code = 'CUSTOMER_PAYMENT_ALLOCATIONS_REQUIRED';
    throw error;
  }
  const totalAmount = Number(payload.totalAmount || 0);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    const error = new Error('Total transfer wajib lebih dari 0.');
    error.statusCode = 400;
    error.code = 'CUSTOMER_PAYMENT_TOTAL_AMOUNT_INVALID';
    throw error;
  }
  const allocationTotal = allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
  if (!Number.isFinite(allocationTotal) || allocationTotal <= 0) {
    const error = new Error('Total alokasi pembayaran wajib lebih dari 0.');
    error.statusCode = 400;
    error.code = 'CUSTOMER_PAYMENT_ALLOCATION_AMOUNT_INVALID';
    throw error;
  }
  if (allocationTotal > totalAmount) {
    const error = new Error('Total alokasi tidak boleh melebihi total transfer.');
    error.statusCode = 409;
    error.code = 'CUSTOMER_PAYMENT_ALLOCATION_EXCEEDS_TRANSFER';
    throw error;
  }

  let proofAttachmentId = payload.proofAttachmentId || null;
  if (!proofAttachmentId && payload.proofFile) {
    const attachment = await createAttachment({
      ...payload.proofFile,
      entityType: 'sales_order',
      entityId: allocations[0]?.salesOrderId || allocations[0]?.id || null,
      category: 'paymentProof',
      uploadedByName: actorName,
      notes: payload.proofFile.notes || 'Bukti transfer pembayaran customer multi-invoice',
    });
    proofAttachmentId = attachment.id;
  }

  return recordCustomerInvoicePayments({
    totalAmount,
    paymentDate: payload.paymentDate,
    referenceNumber: payload.referenceNumber,
    proofAttachmentId,
    note: payload.note,
    allocations,
    idempotencyKey: payload.idempotencyKey,
    actorUserId: actor?.id || null,
    actorName,
  });
}

export function fetchInvoicePayments(id) {
  return listSalesOrderPayments(id);
}

// Ini jalur koreksi resmi kalau Finance salah catat pembayaran -- alasan wajib diisi.
// reason divalidasi lagi di repository, tapi dicek juga di sini supaya error-nya jelas
// sebelum masuk transaksi database.
export async function voidInvoicePayment(id, paymentId, payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Pembatalan pembayaran invoice hanya dapat dilakukan oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'FINANCE_INVOICE_PAYMENT_VOID_FORBIDDEN';
    throw error;
  }
  if (!String(payload.reason || '').trim()) {
    const error = new Error('Alasan pembatalan wajib diisi.');
    error.statusCode = 400;
    error.code = 'FINANCE_INVOICE_PAYMENT_VOID_REASON_REQUIRED';
    throw error;
  }
  return voidSalesOrderPayment(id, paymentId, {
    reason: payload.reason,
    actorName: actor?.name || actor?.email || 'Admin',
  });
}

const REVENUE_LINE_CHARGE_TYPES = ['inap', 'waiting_charge', 'extra_trip', 'storage', 'other'];

function ensureCanManageRevenueLine(actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Revenue line hanya dapat dikelola oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'REVENUE_LINE_FORBIDDEN';
    throw error;
  }
}

function normalizeRevenueLinePayload(payload = {}) {
  const chargeType = REVENUE_LINE_CHARGE_TYPES.includes(payload.chargeType) ? payload.chargeType : 'inap';
  const description = String(payload.description || '').trim();
  if (!description) {
    const error = new Error('Deskripsi revenue line wajib diisi.');
    error.statusCode = 400;
    error.code = 'REVENUE_LINE_DESCRIPTION_REQUIRED';
    throw error;
  }
  const quantity = Number(payload.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('Quantity revenue line wajib lebih dari 0.');
    error.statusCode = 400;
    error.code = 'REVENUE_LINE_QUANTITY_INVALID';
    throw error;
  }
  const unit = String(payload.unit || '').trim();
  if (!unit) {
    const error = new Error('Satuan revenue line wajib diisi (mis. malam, hari, rit).');
    error.statusCode = 400;
    error.code = 'REVENUE_LINE_UNIT_REQUIRED';
    throw error;
  }
  const unitPrice = Number(payload.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    const error = new Error('Harga satuan revenue line wajib lebih dari 0.');
    error.statusCode = 400;
    error.code = 'REVENUE_LINE_UNIT_PRICE_INVALID';
    throw error;
  }
  return {
    containerJobId: payload.containerJobId || null,
    chargeType,
    description,
    quantity,
    unit,
    unitPrice,
    note: payload.note || null,
    status: payload.status === 'draft' ? 'draft' : 'active',
  };
}

export function createRevenueLine(id, payload = {}, actor) {
  ensureCanManageRevenueLine(actor);
  return createManualRevenueLine(id, {
    ...normalizeRevenueLinePayload(payload),
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export function updateRevenueLine(id, lineId, payload = {}, actor) {
  ensureCanManageRevenueLine(actor);
  return updateManualRevenueLine(id, lineId, {
    ...normalizeRevenueLinePayload(payload),
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export function activateRevenueLine(id, lineId, actor) {
  ensureCanManageRevenueLine(actor);
  return activateManualRevenueLine(id, lineId, {
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export function voidRevenueLine(id, lineId, payload = {}, actor) {
  ensureCanManageRevenueLine(actor);
  if (!String(payload.reason || '').trim()) {
    const error = new Error('Alasan pembatalan wajib diisi.');
    error.statusCode = 400;
    error.code = 'REVENUE_LINE_VOID_REASON_REQUIRED';
    throw error;
  }
  return voidManualRevenueLine(id, lineId, {
    reason: payload.reason,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export function fetchDebitNoteOrders(query = {}) {
  return getDebitNoteOrdersPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || query.search || '',
    status: query.status || '',
  });
}

export function fetchDebitNoteOutstanding(query = {}) {
  return getDebitNoteOutstandingPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || query.search || '',
    agingBucket: query.agingBucket || '',
  });
}

export function saveDebitNoteNumber(id, payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Nomor Debit Note hanya dapat diinput oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'FINANCE_DEBIT_NOTE_NUMBER_FORBIDDEN';
    throw error;
  }
  return updateDebitNoteNumber(id, {
    debitNoteNumber: payload.debitNoteNumber,
    actorName: actor?.name || actor?.email || 'Finance',
  });
}

export async function recordDebitNotePaymentForOrder(id, payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Pembayaran Debit Note hanya dapat dicatat oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'FINANCE_DEBIT_NOTE_PAYMENT_FORBIDDEN';
    throw error;
  }
  const actorName = actor?.name || actor?.email || 'Finance';

  let proofAttachmentId = payload.proofAttachmentId || null;
  if (!proofAttachmentId && payload.proofFile) {
    const attachment = await createAttachment({
      ...payload.proofFile,
      entityType: 'sales_order',
      entityId: id,
      category: 'paymentProof',
      uploadedByName: actorName,
      notes: payload.proofFile.notes || 'Bukti transfer pembayaran Debit Note',
    });
    proofAttachmentId = attachment.id;
  }

  return recordDebitNotePayment(id, {
    amount: payload.amount,
    paymentDate: payload.paymentDate,
    referenceNumber: payload.referenceNumber,
    proofAttachmentId,
    note: payload.note,
    idempotencyKey: payload.idempotencyKey,
    actorUserId: actor?.id || null,
    actorName,
  });
}

export function fetchDebitNotePayments(id) {
  return listDebitNotePayments(id);
}

export async function voidDebitNotePaymentForOrder(id, paymentId, payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Pembatalan pembayaran Debit Note hanya dapat dilakukan oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'FINANCE_DEBIT_NOTE_PAYMENT_VOID_FORBIDDEN';
    throw error;
  }
  if (!String(payload.reason || '').trim()) {
    const error = new Error('Alasan pembatalan wajib diisi.');
    error.statusCode = 400;
    error.code = 'FINANCE_DEBIT_NOTE_PAYMENT_VOID_REASON_REQUIRED';
    throw error;
  }
  return voidDebitNotePayment(id, paymentId, {
    reason: payload.reason,
    actorName: actor?.name || actor?.email || 'Admin',
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
