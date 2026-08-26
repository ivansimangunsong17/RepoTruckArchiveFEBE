import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  approveSubmittedDriverCommissionBatch,
  getDriverCommissionBatch,
  getDriverCommissionPeriodReport,
  listDriverCommissionBatches,
  payDriverCommissionPayment,
  previewEligibleDriverCommissions,
  rejectSubmittedDriverCommissionBatch,
  submitDriverCommissionBatch,
  uploadDriverCommissionPaymentProof,
  voidDriverCommissionPaymentRecord,
} from './driver-commissions.service.js';

export function driverCommissionBatchAuditSnapshot(batch = {}) {
  return {
    id: batch.id,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
    status: batch.status,
    submittedByUserId: batch.submittedByUserId || null,
    submittedByName: batch.submittedByName || '',
    submittedAt: batch.submittedAt,
    reviewedByUserId: batch.reviewedByUserId || null,
    reviewedByName: batch.reviewedByName || '',
    reviewedAt: batch.reviewedAt,
    rejectionNote: batch.rejectionNote || '',
    totalItems: batch.totalItems || 0,
    totalAmount: batch.totalAmount || 0,
    payments: (batch.payments || []).map((payment) => ({
      id: payment.id,
      driverId: payment.driverId || null,
      driverName: payment.driverName || '',
      status: payment.status,
      totalItems: payment.totalItems || 0,
      totalAmount: payment.totalAmount || 0,
      paidAt: payment.paidAt,
      paidByName: payment.paidByName || '',
      paymentProofAttachmentId: payment.paymentProofAttachmentId || null,
    })),
  };
}

export function driverCommissionPaymentAuditSnapshot(batch = {}, paymentId = '') {
  const batchSnapshot = driverCommissionBatchAuditSnapshot(batch);
  const payment = batchSnapshot.payments.find((item) => item.id === paymentId) || null;
  return {
    batch: {
      id: batchSnapshot.id,
      periodStart: batchSnapshot.periodStart,
      periodEnd: batchSnapshot.periodEnd,
      status: batchSnapshot.status,
      totalItems: batchSnapshot.totalItems,
      totalAmount: batchSnapshot.totalAmount,
    },
    payment,
  };
}

export async function eligibleDriverCommissionsController(request, response) {
  const result = await previewEligibleDriverCommissions(request.query);
  sendSuccess(response, result);
}

export async function driverCommissionPeriodReportController(request, response) {
  const result = await getDriverCommissionPeriodReport(request.query);
  sendSuccess(response, result);
}

export async function driverCommissionBatchesController(request, response) {
  const result = await listDriverCommissionBatches(request.query);
  sendSuccess(response, result);
}

export async function driverCommissionBatchDetailController(request, response) {
  const result = await getDriverCommissionBatch(request.params.id);
  sendSuccess(response, result);
}

export async function submitDriverCommissionBatchController(request, response) {
  const result = await submitDriverCommissionBatch(request.body || {}, request.user);
  await safeRecordActivityLog(request, {
    action: 'SUBMIT_DRIVER_COMMISSION_BATCH',
    module: 'driver_commissions',
    entityType: 'driver_commission_batch',
    entityId: result.id,
    afterData: driverCommissionBatchAuditSnapshot(result),
    metadata: {
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      totalItems: result.totalItems,
      totalAmount: result.totalAmount,
      paymentCount: result.payments?.length || 0,
    },
  });
  sendSuccess(response, result, 'Pengajuan komisi sopir berhasil dibuat.', 201);
}

export async function approveDriverCommissionBatchController(request, response) {
  const result = await approveSubmittedDriverCommissionBatch(request.params.id, request.user);
  await safeRecordActivityLog(request, {
    action: 'APPROVE_DRIVER_COMMISSION_BATCH',
    module: 'driver_commissions',
    entityType: 'driver_commission_batch',
    entityId: result.id,
    afterData: driverCommissionBatchAuditSnapshot(result),
    metadata: {
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      totalItems: result.totalItems,
      totalAmount: result.totalAmount,
      paymentCount: result.payments?.length || 0,
    },
  });
  sendSuccess(response, result, 'Pengajuan komisi sopir disetujui.');
}

export async function rejectDriverCommissionBatchController(request, response) {
  const result = await rejectSubmittedDriverCommissionBatch(request.params.id, request.body || {}, request.user);
  await safeRecordActivityLog(request, {
    action: 'REJECT_DRIVER_COMMISSION_BATCH',
    module: 'driver_commissions',
    entityType: 'driver_commission_batch',
    entityId: result.id,
    afterData: driverCommissionBatchAuditSnapshot(result),
    metadata: {
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      rejectionNote: result.rejectionNote,
      totalItems: result.totalItems,
      totalAmount: result.totalAmount,
    },
  });
  sendSuccess(response, result, 'Pengajuan komisi sopir ditolak.');
}

export async function payDriverCommissionPaymentController(request, response) {
  const result = await payDriverCommissionPayment(request.params.id, request.body || {}, request.user);
  await safeRecordActivityLog(request, {
    action: 'PAY_DRIVER_COMMISSION_PAYMENT',
    module: 'driver_commissions',
    entityType: 'driver_commission_payment',
    entityId: request.params.id,
    afterData: driverCommissionPaymentAuditSnapshot(result, request.params.id),
    metadata: {
      batchId: result.id,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      paymentId: request.params.id,
    },
  });
  sendSuccess(response, result, 'Pembayaran komisi sopir dicatat.');
}

export async function voidDriverCommissionPaymentController(request, response) {
  const result = await voidDriverCommissionPaymentRecord(request.params.id, request.body || {}, request.user);
  await safeRecordActivityLog(request, {
    action: 'VOID_DRIVER_COMMISSION_PAYMENT',
    module: 'driver_commissions',
    entityType: 'driver_commission_payment',
    entityId: request.params.id,
    afterData: driverCommissionPaymentAuditSnapshot(result, request.params.id),
    metadata: {
      batchId: result.id,
      paymentId: request.params.id,
      reason: request.body?.reason,
    },
  });
  sendSuccess(response, result, 'Pembayaran komisi sopir berhasil dibatalkan.');
}

export async function uploadDriverCommissionPaymentProofController(request, response) {
  const result = await uploadDriverCommissionPaymentProof(request.params.id, request.body || {}, request.user);
  await safeRecordActivityLog(request, {
    action: 'UPLOAD_DRIVER_COMMISSION_PAYMENT_PROOF',
    module: 'driver_commissions',
    entityType: 'driver_commission_payment',
    entityId: request.params.id,
    afterData: driverCommissionPaymentAuditSnapshot(result, request.params.id),
    metadata: {
      batchId: result.id,
      proofId: result.uploadedProof?.id,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      paymentId: request.params.id,
      fileName: result.uploadedProof?.fileNameOriginal || result.uploadedProof?.fileName || null,
    },
  });
  sendSuccess(response, result, 'Bukti transfer komisi sopir disimpan.');
}
