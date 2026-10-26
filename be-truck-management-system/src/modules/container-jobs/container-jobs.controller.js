import { sendSuccess } from '../../utils/apiResponse.js';
import { actorHasPermission } from '../../utils/permissions.js';

export function rejectFinanceOperationalMutation(actor) {
  if (String(actor?.role || '').trim().toLowerCase() !== 'finance') return;
  const error = new Error('Finance hanya dapat melihat Container Job.');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  correctCommissionRecipient,
  correctContainerJobExpense,
  createContainerJobExpense,
  createContainerJobSpk,
  getContainerJob,
  getContainerJobExpense,
  listContainerJobAssignmentHistory,
  listContainerJobExpenseLedger,
  listContainerJobExpenses,
  listContainerJobs,
  moveDroppingExpenseToAnotherJobBeforeFinanceCheck,
  pickupComboRepoContainerJob,
  pickupRepoContainerJob,
  requestContainerJobCancellation,
  resetMisassignedContainerJob,
  reviewContainerJobCancellation,
  saveContainerJob,
  updateContainerJobExpenseProof,
  updateDroppingExpenseBeforeFinanceCheck,
  uploadAutoJourneyMoneyProof,
  voidDroppingExpenseBeforeFinanceCheck,
} from './container-jobs.service.js';

function isHistoricalRecord(record = {}) {
  return record?.entrySource === 'historical' || Boolean(record?.historicalPeriod);
}

function historicalMetadata(job = {}) {
  return {
    entrySource: job.entrySource || 'historical',
    historicalPeriod: job.historicalPeriod || '',
    historicalNotes: job.historicalNotes || '',
    salesOrderId: job.orderId,
    soNumber: job.soNumber,
    containerNumber: job.containerNumber,
  };
}

// Ritasi susulan/backdate (Phase 2) -- audit log WAJIB (bukan opsional seperti historical entry di
// atas) supaya setiap ritasi yang dicatat telat selalu tertelusuri: siapa, kapan, dan kenapa.
function isBackdateRecord(record = {}) {
  return Boolean(record?.isBackdateEntry);
}

function backdateMetadata(job = {}) {
  return {
    isBackdateEntry: true,
    backdateReason: job.backdateReason || '',
    createdAsCorrection: Boolean(job.createdAsCorrection),
    salesOrderId: job.orderId,
    soNumber: job.soNumber,
    containerNumber: job.containerNumber,
    status: job.status,
  };
}

const adminCorrectionAuditFields = {
  status: 'Status',
  containerNumber: 'No. Container',
  destination: 'Tujuan',
  ujAmountSnapshot: 'UJ (Uang Jalan)',
  plateNumber: 'Truck',
  driver: 'Sopir',
  runningAt: 'Waktu Mulai',
  completedAt: 'Waktu Selesai',
  rpujStatus: 'Status RPUJ',
  rpujNotes: 'Biaya Lainnya',
  hasDriverCommission: 'Komisi Sopir',
  driverCommissionAmount: 'Nominal Komisi',
  commissionDriverName: 'Penerima Komisi',
  eirNumber: 'No. EIR',
  loadingVoucher: 'Bon Muat/Bongkar',
  tilaGatepassDocument: 'TILA/Gatepass',
  travelDocument: 'Surat Jalan',
};

const documentOnlyPayloadFields = new Set([
  'updatedBy',
  'eirNumber',
  'eirDocument',
  'repoEirNumber',
  'repoEirDocument',
  'loadingVoucher',
  'loadingVoucherDocument',
  'tilaGatepassDocument',
  'tilaGatepassDocumentFile',
  'travelDocument',
  'travelDocumentFile',
  'otherDocuments',
  // Kompatibilitas frontend lama: service selalu membuang field ini untuk actor document-only.
  'hasDriverCommission',
  'driverCommissionAmount',
  'driverCommissionSourceDestinationId',
  'driverCommissionNote',
  'driverCommissionEdited',
]);

const documentOnlyAuditLabels = {
  eirNumber: 'EIR',
  eirDocument: 'EIR',
  repoEirNumber: 'EIR Titip',
  repoEirDocument: 'EIR Titip',
  loadingVoucher: 'Bon Muat/Bongkar',
  loadingVoucherDocument: 'Bon Muat/Bongkar',
  tilaGatepassDocument: 'TILA/Gatepass',
  tilaGatepassDocumentFile: 'TILA/Gatepass',
  travelDocument: 'Surat Jalan',
  travelDocumentFile: 'Surat Jalan',
  otherDocuments: 'Dokumen Lainnya',
};

export function isDocumentOnlyActor(actor) {
  if (String(actor?.role || '').trim().toLowerCase() === 'sales') {
    return actorHasPermission(actor, 'container_job.document.update');
  }
  return actorHasPermission(actor, 'container_job.document.update')
    && !actorHasPermission(actor, 'container_job.update')
    && !actorHasPermission(actor, 'container_job.update_status')
    && !actorHasPermission(actor, 'container_job.assign');
}

export function assertDocumentOnlyPayload(actor, payload = {}) {
  if (!isDocumentOnlyActor(actor)) return;
  const disallowedFields = Object.keys(payload || {}).filter((field) => !documentOnlyPayloadFields.has(field));
  if (disallowedFields.length) {
    const error = new Error('Akses ini hanya boleh mengubah dokumen operational.');
    error.statusCode = 403;
    error.code = 'CONTAINER_JOB_DOCUMENT_UPDATE_ONLY';
    error.details = { disallowedFields };
    throw error;
  }
}

export function isAdminCorrectionPayload(payload = {}) {
  return payload.adminCorrectionMode === true || String(payload.adminCorrectionMode || '').toLowerCase() === 'true';
}

export function adminCorrectionMetadata(payload = {}, job = {}) {
  if (!isAdminCorrectionPayload(payload)) return {};
  return {
    adminCorrection: true,
    adminCorrectionReason: String(payload.adminCorrectionReason || '').trim(),
    salesOrderId: job.orderId,
    soNumber: job.soNumber,
    containerNumber: job.containerNumber,
    ...(payload.commissionDriverAction ? {
      commissionDriverAction: String(payload.commissionDriverAction).trim().toLowerCase(),
    } : {}),
  };
}

function documentOnlyMetadata(payload = {}, job = {}) {
  const categories = Array.from(new Set(
    Object.keys(payload || {})
      .map((field) => documentOnlyAuditLabels[field])
      .filter(Boolean),
  ));
  if (!categories.length) return {};
  return {
    documentOnly: true,
    salesOrderId: job.orderId,
    soNumber: job.soNumber,
    containerNumber: job.containerNumber,
    documentCategories: categories,
  };
}

function normalizeAuditValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function adminCorrectionChanges(before = {}, after = {}) {
  return Object.entries(adminCorrectionAuditFields)
    .filter(([field]) => normalizeAuditValue(before[field]) !== normalizeAuditValue(after[field]))
    .map(([field, label]) => ({
      field,
      label,
      before: before[field] ?? null,
      after: after[field] ?? null,
    }));
}

// Phase 8: audit terpisah khusus "sumber rekomendasi tarif" (uj_source_destination_id /
// driver_commission_source_destination_id) -- paling sering berubah dari null ke terisi saat UJ
// dibekukan otomatis ketika job pertama kali jalan (syncAutoJourneyMoneyExpense), tapi juga
// tercatat kalau berubah lewat koreksi admin. Terpisah dari adminCorrectionChanges supaya
// perubahan sumber tarif tetap tercatat walau bukan lewat mode koreksi admin.
const tariffSourceAuditFields = {
  ujSourceDestinationId: 'Sumber Tarif UJ',
  driverCommissionSourceDestinationId: 'Sumber Tarif Komisi Sopir',
};

export function tariffSourceChanges(before = {}, after = {}) {
  return Object.entries(tariffSourceAuditFields)
    .filter(([field]) => normalizeAuditValue(before[field]) !== normalizeAuditValue(after[field]))
    .map(([field, label]) => ({
      field,
      label,
      before: before[field] ?? null,
      after: after[field] ?? null,
    }));
}

export async function listContainerJobsController(request, response) {
  const result = await listContainerJobs(request.query, request.user);
  sendSuccess(response, result);
}

export async function getContainerJobController(request, response) {
  const result = await getContainerJob(request.params.id);
  sendSuccess(response, result);
}

export async function listContainerJobExpensesController(request, response) {
  const result = await listContainerJobExpenses(request.params.id);
  sendSuccess(response, result);
}

export async function listContainerJobExpenseLedgerController(request, response) {
  const result = await listContainerJobExpenseLedger(request.query);
  sendSuccess(response, result);
}

export async function listContainerJobAssignmentHistoryController(request, response) {
  const result = await listContainerJobAssignmentHistory(request.params.id);
  sendSuccess(response, result);
}

export async function correctCommissionRecipientController(request, response) {
  const result = await correctCommissionRecipient(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'CORRECT_DRIVER_COMMISSION_RECIPIENT',
    module: 'driver_commissions',
    entityType: 'container_job',
    entityId: request.params.id,
    beforeData: result.before,
    afterData: result.after,
    metadata: {
      reason: String(request.body?.reason || '').trim(),
      batchId: result.batchId,
      batchStatus: result.batchStatus,
      salesOrderId: result.job?.orderId,
      soNumber: result.job?.soNumber,
      containerNumber: result.job?.containerNumber,
    },
  });
  sendSuccess(response, result.job, 'Penerima komisi berhasil dikoreksi');
}

export async function createContainerJobExpenseController(request, response) {
  const result = await createContainerJobExpense(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'OPERATIONAL_CREATE_CONTAINER_JOB_EXPENSE',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: request.params.id,
    afterData: result,
    metadata: {
      expenseId: result.id,
      category: result.category,
      amount: result.amount,
      paymentStatus: result.paymentStatus,
    },
  });
  sendSuccess(response, result, 'Transaksi biaya Container Job berhasil dicatat.');
}

export async function correctContainerJobExpenseController(request, response) {
  const before = await getContainerJobExpense(request.params.expenseId);
  const result = await correctContainerJobExpense(request.params.id, request.params.expenseId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'OPERATIONAL_CORRECT_CONTAINER_JOB_EXPENSE',
    module: 'container_jobs',
    entityType: 'container_job_expense',
    entityId: request.params.expenseId,
    beforeData: before,
    afterData: result,
    metadata: {
      containerJobId: request.params.id,
      category: result.category,
      amount: result.amount,
      paymentStatus: result.paymentStatus,
      financeCheckStatus: result.financeCheckStatus,
    },
  });
  sendSuccess(response, result, 'Koreksi transaksi biaya Container Job berhasil dikirim.');
}

export async function updateContainerJobExpenseProofController(request, response) {
  rejectFinanceOperationalMutation(request.user);
  const before = await getContainerJobExpense(request.params.expenseId);
  const result = await updateContainerJobExpenseProof(request.params.id, request.params.expenseId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'OPERATIONAL_UPLOAD_CONTAINER_JOB_EXPENSE_PROOF',
    module: 'container_jobs',
    entityType: 'container_job_expense',
    entityId: request.params.expenseId,
    beforeData: before,
    afterData: result,
    metadata: {
      containerJobId: request.params.id,
      financeCheckStatus: result.financeCheckStatus,
      proofAttachmentId: result.proofAttachmentId,
    },
  });
  sendSuccess(response, result, 'Bukti biaya berhasil disimpan untuk validasi Finance.');
}

export async function updateDroppingExpenseController(request, response) {
  const before = await getContainerJobExpense(request.params.expenseId);
  const result = await updateDroppingExpenseBeforeFinanceCheck(request.params.id, request.params.expenseId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'OPERATIONAL_UPDATE_DROPPING_EXPENSE',
    module: 'container_jobs',
    entityType: 'container_job_expense',
    entityId: request.params.expenseId,
    beforeData: before,
    afterData: result,
    metadata: {
      containerJobId: request.params.id,
      category: result.category,
      amount: result.amount,
      paymentStatus: result.paymentStatus,
      financeCheckStatus: result.financeCheckStatus,
    },
  });
  sendSuccess(response, result, 'Transaksi biaya berhasil diperbarui.');
}

export async function moveDroppingExpenseController(request, response) {
  const before = await getContainerJobExpense(request.params.expenseId);
  const result = await moveDroppingExpenseToAnotherJobBeforeFinanceCheck(request.params.id, request.params.expenseId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'OPERATIONAL_MOVE_DROPPING_EXPENSE',
    module: 'container_jobs',
    entityType: 'container_job_expense',
    entityId: request.params.expenseId,
    beforeData: before,
    afterData: result,
    metadata: {
      previousContainerJobId: before.containerJobId,
      nextContainerJobId: result.containerJobId,
    },
  });
  sendSuccess(response, result, 'Transaksi biaya berhasil dipindahkan ke ritasi lain.');
}

export async function voidDroppingExpenseController(request, response) {
  const before = await getContainerJobExpense(request.params.expenseId);
  const result = await voidDroppingExpenseBeforeFinanceCheck(request.params.id, request.params.expenseId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'OPERATIONAL_VOID_DROPPING_EXPENSE',
    module: 'container_jobs',
    entityType: 'container_job_expense',
    entityId: request.params.expenseId,
    beforeData: before,
    afterData: result,
    metadata: {
      containerJobId: request.params.id,
      voidReason: request.body?.voidReason || request.body?.reason || '',
    },
  });
  sendSuccess(response, result, 'Transaksi biaya berhasil dibatalkan.');
}

export async function uploadAutoJourneyMoneyProofController(request, response) {
  rejectFinanceOperationalMutation(request.user);
  const before = await getContainerJobExpense(request.params.expenseId);
  const result = await uploadAutoJourneyMoneyProof(request.params.id, request.params.expenseId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'OPERATIONAL_UPLOAD_UJ_TRANSFER_PROOF',
    module: 'container_jobs',
    entityType: 'container_job_expense',
    entityId: request.params.expenseId,
    beforeData: before,
    afterData: result,
    metadata: {
      containerJobId: request.params.id,
      proofAttachmentId: result.proofAttachmentId,
    },
  });
  sendSuccess(response, result, 'Bukti transfer UJ berhasil diupload.');
}

// Jejak audit saat user tetap menyimpan nomor container yang terdeteksi berpotensi duplikat.
async function recordConfirmedContainerNumberReuse(request, before, saved) {
  const confirmed = request.body?.confirmPossibleDuplicateContainer === true
    || String(request.body?.confirmPossibleDuplicateContainer || '').toLowerCase() === 'true';
  if (!confirmed || !saved?.containerNumber || saved.containerNumber === before?.containerNumber) return;
  await safeRecordActivityLog(request, {
    action: 'CONFIRM_CONTAINER_NUMBER_REUSE',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: saved.id,
    beforeData: { containerNumber: before?.containerNumber || '' },
    afterData: { containerNumber: saved.containerNumber },
    metadata: {
      salesOrderId: saved.orderId,
      soNumber: saved.soNumber,
      containerNumber: saved.containerNumber,
    },
  });
}

export async function updateContainerJobController(request, response) {
  const before = await getContainerJob(request.params.id);
  assertDocumentOnlyPayload(request.user, request.body);
  const saved = await saveContainerJob(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: isDocumentOnlyActor(request.user) ? 'UPDATE_CONTAINER_JOB_DOCUMENTS' : 'UPDATE_CONTAINER_JOB',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
    metadata: {
      ...adminCorrectionMetadata(request.body, saved),
      ...documentOnlyMetadata(request.body, saved),
    },
  });
  await recordConfirmedContainerNumberReuse(request, before, saved);
  if (isAdminCorrectionPayload(request.body)) {
    const changes = adminCorrectionChanges(before, saved);
    await safeRecordActivityLog(request, {
      action: 'ADMIN_CORRECTION_CONTAINER_JOB',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: saved.id,
      beforeData: Object.fromEntries(changes.map((item) => [item.field, item.before])),
      afterData: Object.fromEntries(changes.map((item) => [item.field, item.after])),
      metadata: {
        ...adminCorrectionMetadata(request.body, saved),
        changedFields: changes.map((item) => item.label),
      },
    });
    const commissionDriverAction = String(request.body.commissionDriverAction || '').trim().toLowerCase();
    if (['move', 'keep'].includes(commissionDriverAction)) {
      await safeRecordActivityLog(request, {
        action: commissionDriverAction === 'move'
          ? 'MOVE_DRIVER_COMMISSION_RECIPIENT'
          : 'KEEP_DRIVER_COMMISSION_RECIPIENT',
        module: 'driver_commissions',
        entityType: 'container_job',
        entityId: saved.id,
        beforeData: {
          driverId: before.commissionDriverId || before.driverId || null,
          driverName: before.commissionDriverName || before.driver || '',
        },
        afterData: {
          driverId: saved.commissionDriverId || null,
          driverName: saved.commissionDriverName || '',
        },
        metadata: {
          ...adminCorrectionMetadata(request.body, saved),
          batchId: saved.commissionBatchId || null,
          batchStatus: saved.commissionBatchStatus || 'unsubmitted',
          amount: saved.commissionLockedAmount || saved.driverCommissionAmount || 0,
        },
      });
      if (commissionDriverAction === 'move' && saved.commissionBatchStatus === 'submitted' && saved.commissionBatchId) {
        await safeRecordActivityLog(request, {
          action: 'MARK_COMMISSION_BATCH_CHANGED',
          module: 'driver_commissions',
          entityType: 'driver_commission_batch',
          entityId: saved.commissionBatchId,
          beforeData: {
            driverId: before.commissionDriverId || before.driverId || null,
            driverName: before.commissionDriverName || before.driver || '',
          },
          afterData: {
            driverId: saved.commissionDriverId || null,
            driverName: saved.commissionDriverName || '',
          },
          metadata: {
            ...adminCorrectionMetadata(request.body, saved),
            containerJobId: saved.id,
            batchStatus: saved.commissionBatchStatus,
          },
        });
      }
    }
  }
  const tariffChanges = tariffSourceChanges(before, saved);
  if (tariffChanges.length) {
    await safeRecordActivityLog(request, {
      action: 'UPDATE_CONTAINER_JOB_TARIFF_SOURCE',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: saved.id,
      beforeData: Object.fromEntries(tariffChanges.map((item) => [item.field, item.before])),
      afterData: Object.fromEntries(tariffChanges.map((item) => [item.field, item.after])),
      metadata: {
        salesOrderId: saved.orderId,
        soNumber: saved.soNumber,
        containerNumber: saved.containerNumber,
        changedFields: tariffChanges.map((item) => item.label),
      },
    });
  }
  if (isHistoricalRecord(before) || isHistoricalRecord(saved)) {
    await safeRecordActivityLog(request, {
      action: 'UPDATE_HISTORICAL_CONTAINER_JOB',
      module: 'historical_entry',
      entityType: 'container_job',
      entityId: saved.id,
      beforeData: before,
      afterData: saved,
      metadata: historicalMetadata(saved),
    });
  }
  if (isBackdateRecord(before) || isBackdateRecord(saved)) {
    await safeRecordActivityLog(request, {
      action: 'UPDATE_BACKDATE_CONTAINER_JOB',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: saved.id,
      beforeData: before,
      afterData: saved,
      metadata: backdateMetadata(saved),
    });
  }
  if (before.status !== saved.status) {
    await safeRecordActivityLog(request, {
      action: 'UPDATE_JOB_STATUS',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: saved.id,
      beforeData: { status: before.status },
      afterData: { status: saved.status },
      metadata: {
        fromStatus: before.status,
        toStatus: saved.status,
        salesOrderId: saved.orderId,
      },
    });
    if (saved.status === 'cancelled') {
      await safeRecordActivityLog(request, {
        action: 'CANCEL_CONTAINER_JOB',
        module: 'container_jobs',
        entityType: 'container_job',
        entityId: saved.id,
        beforeData: {
          status: before.status,
          cancelReason: before.cancelReason || null,
          cancelSource: before.cancelSource || null,
        },
        afterData: {
          status: saved.status,
          cancelledAt: saved.cancelledAt,
          cancelledByName: saved.cancelledByName,
          cancelReason: saved.cancelReason,
          cancelSource: saved.cancelSource,
        },
        metadata: {
          salesOrderId: saved.orderId,
          soNumber: saved.soNumber,
          containerNumber: saved.containerNumber,
          reason: saved.cancelReason,
          source: saved.cancelSource,
        },
      });
    }
    if (saved.status === 'repo_stored') {
      await safeRecordActivityLog(request, {
        action: 'STORE_CONTAINER_JOB_REPO',
        module: 'container_jobs',
        entityType: 'container_job',
        entityId: saved.id,
        beforeData: {
          status: before.status,
          driverId: before.driverId,
          vehicleId: before.vehicleId,
          driver: before.driver,
          plateNumber: before.plateNumber,
        },
        afterData: {
          status: saved.status,
          repoLocation: saved.repoLocation,
          repoStoredAt: saved.repoStoredAt,
          repoEirNumber: saved.repoEirNumber,
          repoReason: saved.repoReason,
          repoNotes: saved.repoNotes,
          repoContainerCondition: saved.repoContainerCondition,
          repoCreatedByName: saved.repoCreatedByName,
          repoReleasedDriverId: saved.repoReleasedDriverId,
          repoReleasedVehicleId: saved.repoReleasedVehicleId,
        },
        metadata: {
          salesOrderId: saved.orderId,
          soNumber: saved.soNumber,
          containerNumber: saved.containerNumber,
          repoLocation: saved.repoLocation,
          repoEirNumber: saved.repoEirNumber,
          repoContainerCondition: saved.repoContainerCondition,
          reason: saved.repoReason,
        },
      });
    }
    if (before.status === 'repo_stored' && saved.status !== 'repo_stored') {
      await safeRecordActivityLog(request, {
        action: 'PICKUP_CONTAINER_JOB_REPO',
        module: 'container_jobs',
        entityType: 'container_job',
        entityId: saved.id,
        beforeData: {
          status: before.status,
          repoLocation: before.repoLocation,
          repoStoredAt: before.repoStoredAt,
          repoReason: before.repoReason,
          driverId: before.driverId,
          vehicleId: before.vehicleId,
          driver: before.driver,
          plateNumber: before.plateNumber,
        },
        afterData: {
          status: saved.status,
          driverId: saved.driverId,
          vehicleId: saved.vehicleId,
          driver: saved.driver,
          plateNumber: saved.plateNumber,
          repoPickedUpAt: saved.repoPickedUpAt,
          repoPickedUpByName: saved.repoPickedUpByName,
          updatedBy: saved.updatedBy,
          updatedAt: saved.updatedAt,
        },
        metadata: {
          salesOrderId: saved.orderId,
          soNumber: saved.soNumber,
          containerNumber: saved.containerNumber,
          repoLocation: before.repoLocation,
        },
      });
    }
    if (saved.status === 'inap' && before.status !== 'inap') {
      await safeRecordActivityLog(request, {
        action: 'INAP_CONTAINER_JOB',
        module: 'container_jobs',
        entityType: 'container_job',
        entityId: saved.id,
        beforeData: { status: before.status },
        afterData: {
          status: saved.status,
          inapStartedAt: saved.inapStartedAt,
          inapReason: saved.inapReason,
          inapNotes: saved.inapNotes,
          inapCreatedByName: saved.inapCreatedByName,
        },
        metadata: {
          salesOrderId: saved.orderId,
          soNumber: saved.soNumber,
          containerNumber: saved.containerNumber,
          reason: saved.inapReason,
        },
      });
    }
    if (before.status === 'inap' && saved.status !== 'inap') {
      await safeRecordActivityLog(request, {
        action: 'RESUME_CONTAINER_JOB_FROM_INAP',
        module: 'container_jobs',
        entityType: 'container_job',
        entityId: saved.id,
        beforeData: {
          status: before.status,
          inapStartedAt: before.inapStartedAt,
          inapReason: before.inapReason,
        },
        afterData: {
          status: saved.status,
          inapEndedAt: saved.inapEndedAt,
        },
        metadata: {
          salesOrderId: saved.orderId,
          soNumber: saved.soNumber,
          containerNumber: saved.containerNumber,
        },
      });
    }
  }
  if (before.rpujStatus !== 'submitted' && saved.rpujStatus === 'submitted') {
    await safeRecordActivityLog(request, {
      action: 'OPERATIONAL_REQUEST_RPUJ',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: saved.id,
      beforeData: { rpujStatus: before.rpujStatus },
      afterData: {
        rpujStatus: saved.rpujStatus,
        rpujNotes: saved.rpujNotes,
        hasDriverCommission: saved.hasDriverCommission,
        driverCommissionAmount: saved.driverCommissionAmount,
      },
      metadata: {
        salesOrderId: saved.orderId,
        soNumber: saved.soNumber,
        hasDriverCommission: saved.hasDriverCommission,
        driverCommissionAmount: saved.driverCommissionAmount,
      },
    });
  }
  sendSuccess(response, saved, 'Container Job berhasil diperbarui.');
}

export async function pickupRepoContainerJobController(request, response) {
  const result = await pickupRepoContainerJob(request.params.id, request.body || {}, request.user);
  const job = result.jobs?.[0] || null;
  if (job) {
    await safeRecordActivityLog(request, {
      action: 'PICKUP_CONTAINER_JOB_REPO',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: job.id,
      afterData: job,
      metadata: {
        movementId: result.movement?.id,
        pickupType: result.movement?.pickup_type || 'single',
        salesOrderId: job.orderId,
        soNumber: job.soNumber,
        containerNumber: job.containerNumber,
      },
    });
  }
  return sendSuccess(response, result);
}

export async function pickupComboRepoContainerJobController(request, response) {
  const result = await pickupComboRepoContainerJob(request.body || {}, request.user);
  await safeRecordActivityLog(request, {
    action: 'PICKUP_CONTAINER_JOB_REPO_COMBO',
    module: 'container_jobs',
    entityType: 'container_pickup_movement',
    entityId: result.movement?.id,
    afterData: {
      movement: result.movement,
      jobs: result.jobs,
    },
    metadata: {
      movementId: result.movement?.id,
      pickupType: result.movement?.pickup_type || 'combo_2x20',
      containerJobIds: (result.jobs || []).map((job) => job.id),
      containerNumbers: (result.jobs || []).map((job) => job.containerNumber),
      vehicleId: result.movement?.vehicle_id,
      driverId: result.movement?.driver_id,
    },
  });
  return sendSuccess(response, result);
}

export async function resetMisassignedContainerJobController(request, response) {
  const before = await getContainerJob(request.params.id);
  const saved = await resetMisassignedContainerJob(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'RESET_MISASSIGNED_CONTAINER_JOB',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
    metadata: {
      salesOrderId: saved.orderId,
      soNumber: saved.soNumber,
      containerNumber: before.containerNumber,
      fromStatus: before.status,
      toStatus: saved.status,
      previousDriverId: before.driverId,
      previousDriver: before.driver,
      previousVehicleId: before.vehicleId,
      previousPlateNumber: before.plateNumber,
      reason: request.body?.reason || request.body?.resetReason || '',
    },
  });
  sendSuccess(response, saved, 'Ritasi berhasil direset dan siap diinput ulang.');
}

export async function generateContainerJobSpkController(request, response) {
  const before = await getContainerJob(request.params.id);
  const saved = await createContainerJobSpk(request.params.id, request.body);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_CONTAINER_JOB',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
    metadata: { changedField: 'spkNumber' },
  });
  await safeRecordActivityLog(request, {
    action: 'GENERATE_SPK',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: saved.id,
    beforeData: { spkNumber: before.spkNumber || null },
    afterData: { spkNumber: saved.spkNumber },
    metadata: { salesOrderId: saved.orderId, soNumber: saved.soNumber },
  });
  sendSuccess(response, saved, 'SPK berhasil digenerate.');
}

export async function requestCancelContainerJobController(request, response) {
  const before = await getContainerJob(request.params.id);
  const saved = await requestContainerJobCancellation(request.params.id, request.user, request.body);
  await safeRecordActivityLog(request, {
    action: 'REQUEST_CANCEL_CONTAINER_JOB',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: request.params.id,
    beforeData: before,
    afterData: saved,
  });
  sendSuccess(response, saved, 'Permintaan pembatalan Container Job berhasil diajukan.');
}

export async function reviewCancelContainerJobController(request, response) {
  const before = await getContainerJob(request.params.id);
  const saved = await reviewContainerJobCancellation(request.params.id, request.user, request.body);
  await safeRecordActivityLog(request, {
    action: request.body?.approved ? 'APPROVE_CANCEL_CONTAINER_JOB' : 'REJECT_CANCEL_CONTAINER_JOB',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: request.params.id,
    beforeData: before,
    afterData: saved,
  });
  if (request.body?.approved) {
    await safeRecordActivityLog(request, {
      action: 'CANCEL_CONTAINER_JOB',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: saved.id,
      beforeData: {
        status: before.status,
        cancelRequestStatus: before.cancelRequestStatus,
        cancelRequestNote: before.cancelRequestNote || null,
      },
      afterData: {
        status: saved.status,
        cancelledAt: saved.cancelledAt,
        cancelledByName: saved.cancelledByName,
        cancelReason: saved.cancelReason,
        cancelSource: saved.cancelSource,
      },
      metadata: {
        salesOrderId: saved.orderId,
        soNumber: saved.soNumber,
        containerNumber: saved.containerNumber,
        reason: saved.cancelReason,
        source: saved.cancelSource,
      },
    });
  }
  sendSuccess(response, saved, request.body?.approved ? 'Pembatalan Container Job disetujui.' : 'Pembatalan Container Job ditolak.');
}
