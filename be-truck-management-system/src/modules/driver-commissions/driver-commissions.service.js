import {
  approveDriverCommissionBatch,
  createDriverCommissionBatch,
  findDriverCommissionBatchById,
  findDriverCommissionBatches,
  findDriverCommissionPeriodReport,
  findDriverCommissionPaymentById,
  findEligibleDriverCommissions,
  markDriverCommissionPaymentPaid,
  rejectDriverCommissionBatch,
} from './driver-commissions.repository.js';
import { isCommissionWeekPeriod, normalizeCommissionPeriod } from './driver-commissions.period.js';
import { createAttachment } from '../attachments/attachments.service.js';

const VALID_BATCH_STATUSES = new Set(['draft', 'submitted', 'approved', 'rejected', 'paid']);

function normalizeBatchStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return VALID_BATCH_STATUSES.has(status) ? status : '';
}

function notFound(message = 'Batch komisi sopir tidak ditemukan.') {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  return error;
}

function validationError(message, details = []) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  error.details = details;
  return error;
}

export function assertDriverCommissionProofPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Payload bukti transfer komisi wajib berupa object.');
  }

  const required = ['fileName', 'mimeType', 'fileBase64'];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) {
    throw validationError(`Bukti transfer komisi belum lengkap: ${missing.join(', ')}.`, missing);
  }
}

export async function previewEligibleDriverCommissions(query = {}) {
  const period = normalizeCommissionPeriod(query);
  return findEligibleDriverCommissions(period);
}

export async function getDriverCommissionPeriodReport(query = {}) {
  const period = normalizeCommissionPeriod(query);
  return findDriverCommissionPeriodReport(period);
}

export async function listDriverCommissionBatches(query = {}) {
  const period = {};
  if (query.periodStart || query.periodEnd || query.period_start || query.period_end) {
    Object.assign(period, normalizeCommissionPeriod(query));
  }

  return findDriverCommissionBatches({
    page: query.page,
    pageSize: query.pageSize,
    status: normalizeBatchStatus(query.status),
    ...period,
  });
}

export async function getDriverCommissionBatch(id) {
  const batch = await findDriverCommissionBatchById(id);
  if (!batch) throw notFound();
  return batch;
}

export async function submitDriverCommissionBatch(payload = {}, actor = {}) {
  const period = normalizeCommissionPeriod(payload);
  if (!isCommissionWeekPeriod(period)) {
    throw validationError('Pengajuan komisi wajib memakai periode Kamis sampai Rabu.');
  }
  return createDriverCommissionBatch(period, actor);
}

export async function approveSubmittedDriverCommissionBatch(id, actor = {}) {
  const batch = await approveDriverCommissionBatch(id, actor);
  if (!batch) throw notFound();
  return batch;
}

export async function rejectSubmittedDriverCommissionBatch(id, payload = {}, actor = {}) {
  const rejectionNote = String(payload.rejectionNote || payload.rejection_note || '').trim();
  const batch = await rejectDriverCommissionBatch(id, rejectionNote, actor);
  if (!batch) throw notFound();
  return batch;
}

export async function payDriverCommissionPayment(id, payload = {}, actor = {}) {
  const batch = await markDriverCommissionPaymentPaid(id, payload, actor);
  if (!batch) throw notFound('Payment komisi sopir tidak ditemukan.');
  return batch;
}

export async function uploadDriverCommissionPaymentProof(id, payload = {}, actor = {}) {
  assertDriverCommissionProofPayload(payload);
  const payment = await findDriverCommissionPaymentById(id);
  if (!payment) throw notFound('Payment komisi sopir tidak ditemukan.');
  if (!['approved', 'paid'].includes(payment.batchStatus)) {
    const error = new Error('Bukti transfer komisi hanya bisa diupload setelah batch approved.');
    error.statusCode = 409;
    error.code = 'DRIVER_COMMISSION_PROOF_INVALID_STATUS';
    throw error;
  }

  const actorName = actor?.name || actor?.email || 'Finance';
  const attachment = await createAttachment({
    ...payload,
    entityType: 'driver_commission_payment',
    entityId: id,
    category: 'driverCommissionTransferProof',
    uploadedByName: actorName,
    notes: payload.notes || payload.paymentNote || 'Bukti transfer komisi sopir',
  });
  const batch = await markDriverCommissionPaymentPaid(id, {
    paymentNote: payload.paymentNote || payload.notes || '',
    paymentProofAttachmentId: attachment.id,
  }, actor);
  if (!batch) throw notFound('Payment komisi sopir tidak ditemukan.');
  return { ...batch, uploadedProof: attachment };
}
