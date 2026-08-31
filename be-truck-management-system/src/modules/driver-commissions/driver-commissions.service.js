import {
  approveDriverCommissionBatch,
  createDriverCommissionBatch,
  createDriverCommissionDeduction,
  findDriverCommissionBatchById,
  findDriverCommissionBatches,
  findDriverCommissionPeriodReport,
  findDriverCommissionPaymentById,
  findEligibleDriverCommissions,
  markDriverCommissionPaymentPaid,
  rejectDriverCommissionBatch,
  updateDriverCommissionDeduction,
  voidDriverCommissionDeduction,
  voidDriverCommissionPayment,
} from './driver-commissions.repository.js';
import { isCommissionWeekPeriod, normalizeCommissionPeriod } from './driver-commissions.period.js';
import { createAttachment } from '../attachments/attachments.service.js';

const VALID_BATCH_STATUSES = new Set(['draft', 'submitted', 'approved', 'rejected', 'paid']);
const DEDUCTION_TYPES = new Set(['hutang_sopir', 'kasbon', 'penalti', 'lainnya']);
const DEDUCTION_REASON_MIN_LENGTH = 8;

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

// Void sengaja admin-only (bukan permission finance.transfer_proof.upload yang dipakai
// approve/pay/upload-proof di modul ini) -- koreksi kalau Finance salah bayar sopir/nominal
// butuh persetujuan level lebih tinggi, alasan wajib.
export async function voidDriverCommissionPaymentRecord(id, payload = {}, actor = {}) {
  if (!actor || actor.role !== 'admin') {
    const error = new Error('Pembatalan pembayaran komisi sopir hanya dapat dilakukan oleh Admin.');
    error.statusCode = 403;
    error.code = 'DRIVER_COMMISSION_PAYMENT_VOID_FORBIDDEN';
    throw error;
  }
  if (!String(payload.reason || '').trim()) {
    const error = new Error('Alasan pembatalan wajib diisi.');
    error.statusCode = 400;
    error.code = 'DRIVER_COMMISSION_PAYMENT_VOID_REASON_REQUIRED';
    throw error;
  }
  const batch = await voidDriverCommissionPayment(id, payload, actor);
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

// Potongan komisi (hutang/kasbon/penalti/lainnya) cuma boleh dikelola Finance/Admin -- Operational
// cuma baca lewat report/batch detail yang sudah menyertakan gross/deduction/net & daftar potongan.
// Dicek eksplisit di sini sebagai lapis kedua (permission route jadi gerbang utama), mengikuti pola
// voidDriverCommissionPaymentRecord di atas.
function ensureCanManageDeduction(actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Potongan komisi sopir hanya dapat dikelola oleh Finance atau Admin.');
    error.statusCode = 403;
    error.code = 'DRIVER_COMMISSION_DEDUCTION_FORBIDDEN';
    throw error;
  }
}

function normalizeDeductionPayload(payload = {}) {
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Nominal potongan wajib lebih dari 0.');
    error.statusCode = 400;
    error.code = 'DRIVER_COMMISSION_DEDUCTION_AMOUNT_INVALID';
    throw error;
  }
  const reason = String(payload.reason || '').trim();
  if (reason.length < DEDUCTION_REASON_MIN_LENGTH) {
    const error = new Error(`Alasan potongan wajib diisi minimal ${DEDUCTION_REASON_MIN_LENGTH} karakter.`);
    error.statusCode = 400;
    error.code = 'DRIVER_COMMISSION_DEDUCTION_REASON_REQUIRED';
    throw error;
  }
  const deductionType = DEDUCTION_TYPES.has(payload.deductionType) ? payload.deductionType : 'lainnya';
  const operationalNote = String(payload.operationalNote || '').trim() || null;
  return { amount, reason, deductionType, operationalNote };
}

export async function recordDriverCommissionDeduction(paymentId, payload = {}, actor = {}) {
  ensureCanManageDeduction(actor);
  const normalized = normalizeDeductionPayload(payload);
  return createDriverCommissionDeduction(paymentId, normalized, actor);
}

export async function updateDriverCommissionDeductionRecord(deductionId, payload = {}, actor = {}) {
  ensureCanManageDeduction(actor);
  const normalized = normalizeDeductionPayload(payload);
  return updateDriverCommissionDeduction(deductionId, normalized, actor);
}

export async function voidDriverCommissionDeductionRecord(deductionId, payload = {}, actor = {}) {
  ensureCanManageDeduction(actor);
  const reason = String(payload.reason || '').trim();
  if (!reason) {
    const error = new Error('Alasan pembatalan potongan wajib diisi.');
    error.statusCode = 400;
    error.code = 'DRIVER_COMMISSION_DEDUCTION_VOID_REASON_REQUIRED';
    throw error;
  }
  return voidDriverCommissionDeduction(deductionId, { reason }, actor);
}
