import {
  correctContainerJobExpenseRecord,
  createContainerJobExpenseRecord,
  generateContainerJobSpk,
  findAssignmentHistory,
  findContainerJobById,
  findContainerJobExpenseByIdRecord,
  findContainerJobExpenseLedger,
  findContainerJobExpensesByJobId,
  findContainerJobsPage,
  moveDroppingExpenseToAnotherJobBeforeFinanceCheckRecord,
  pickupComboRepoContainerJobs,
  pickupSingleRepoContainerJob,
  requestContainerJobCancellation as requestContainerJobCancellationRepository,
  resetContainerJobAssignment,
  reviewContainerJobCancellation as reviewContainerJobCancellationRepository,
  updateContainerJobExpenseProofRecord,
  updateContainerJob,
  updateDroppingExpenseBeforeFinanceCheckRecord,
  uploadAutoJourneyMoneyProofRecord,
  voidDroppingExpenseBeforeFinanceCheckRecord,
} from './container-jobs.repository.js';
export { canOperationalEditDroppingTransaction } from './container-jobs.mapper.js';
import { findSalesOrderById } from '../sales-orders/sales-orders.repository.js';
import { hasContainerSentRpuj } from '../sales-orders/sales-orders.rpuj-lock.js';
import { actorHasPermission } from '../../utils/permissions.js';
import {
  ensureCanManageHistoricalEntry,
  HISTORICAL_ENTRY_PERMISSION,
} from '../historical-entry/historical-entry.permissions.js';
import { ensureHistoricalPeriodEditable } from '../historical-entry/historical-entry.service.js';

const ADMIN_CORRECTION_REASON_MIN_LENGTH = 8;
// Ritasi susulan/backdate (Phase 2) sengaja TIDAK admin-only seperti historical entry -- Operational
// biasa boleh memakainya, asal alasannya diisi jelas (jadi jejak audit, bukan izin, adalah penjaganya).
const BACKDATE_REASON_MIN_LENGTH = 8;
const expenseCategories = new Set([
  'uj_awal',
  'top_up_uj',
  'tol',
  'parkir',
  'bongkar',
  'muat',
  'lolo',
  'inap',
  'terminal_depo',
  'tunggu',
  'uang_admin_tf',
  'reimbursement',
  'lainnya',
]);
const expenseGroups = new Set(['operational', 'reimbursement']);
const expensePaymentStatuses = new Set([
  'belum_dibayar',
  'pending_pembayaran',
  'sudah_dibayar',
  'batal',
  'ditahan_sopir',
  'dipakai_job_berikutnya',
]);

function getActorName(actor) {
  return actor?.name || actor?.email || 'System';
}

function ensureNotOperationalRole(actor, actionLabel) {
  if (actor?.role !== 'operational') return;
  const error = new Error(`${actionLabel} tidak tersedia untuk Operational. Gunakan Edit sebelum Finance validasi, atau minta koreksi ke Finance/Admin.`);
  error.statusCode = 403;
  error.code = 'OPERATIONAL_DROPPING_ACTION_DISABLED';
  throw error;
}

function canSalesAccessOrder(actor, order) {
  if (actor?.role !== 'sales') return true;
  if (!order) return false;
  if (order.createdByUserId) return order.createdByUserId === actor.sub;
  return String(order.createdBy || '').trim() === getActorName(actor);
}

export function listContainerJobs(query, actor = null) {
  const canManageHistoricalEntry = actorHasPermission(actor, HISTORICAL_ENTRY_PERMISSION);
  return findContainerJobsPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || '',
    status: query.status || '',
    requestStatus: query.requestStatus || '',
    rpujStage: query.rpujStage || '',
    documentStatus: query.documentStatus || '',
    tripDate: query.tripDate || '',
    completedDate: query.completedDate || '',
    groupByOrder: query.groupByOrder || '',
    entrySource: canManageHistoricalEntry ? query.entrySource || '' : 'realtime',
    historicalPeriod: canManageHistoricalEntry ? query.historicalPeriod || '' : '',
  });
}

function normalizeRole(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

function isAdmin(actor) {
  return normalizeRole(actor) === 'admin';
}

export function isAdminCorrectionMode(payload = {}) {
  return payload?.adminCorrectionMode === true || String(payload?.adminCorrectionMode || '').toLowerCase() === 'true';
}

export function adminCorrectionReason(payload = {}) {
  return normalizeText(payload?.adminCorrectionReason);
}

export function canUseAdminCorrection(actor, payload = {}) {
  return Boolean(
    isAdmin(actor)
      && isAdminCorrectionMode(payload)
      && adminCorrectionReason(payload).length >= ADMIN_CORRECTION_REASON_MIN_LENGTH
  );
}

function ensureAdminCorrectionContract(actor, payload = {}) {
  if (!isAdminCorrectionMode(payload)) return;
  if (!isAdmin(actor)) {
    const error = new Error('Mode koreksi admin hanya dapat digunakan oleh Admin.');
    error.statusCode = 403;
    error.code = 'ADMIN_CORRECTION_ADMIN_ONLY';
    throw error;
  }
  if (adminCorrectionReason(payload).length < ADMIN_CORRECTION_REASON_MIN_LENGTH) {
    const error = new Error(`Alasan koreksi admin wajib diisi minimal ${ADMIN_CORRECTION_REASON_MIN_LENGTH} karakter.`);
    error.statusCode = 400;
    error.code = 'ADMIN_CORRECTION_REASON_REQUIRED';
    throw error;
  }
}

export function isBackdateEntryPayload(payload = {}, currentJob = null) {
  return Object.prototype.hasOwnProperty.call(payload, 'isBackdateEntry')
    ? (payload.isBackdateEntry === true || String(payload.isBackdateEntry || '').toLowerCase() === 'true')
    : Boolean(currentJob?.isBackdateEntry);
}

export function backdateReason(payload = {}, currentJob = null) {
  return normalizeText(
    Object.prototype.hasOwnProperty.call(payload, 'backdateReason') ? payload.backdateReason : currentJob?.backdateReason,
  );
}

// Ritasi susulan/backdate (Phase 2): "wajib alasan" adalah satu-satunya penjaga selain audit log --
// tidak ada gerbang permission admin-only seperti historical entry, jadi validasi ini yang memastikan
// setiap ritasi backdate punya jejak KENAPA dia telat dicatat, bukan cuma "iya, ini backdate".
function ensureBackdateReasonRequired(payload, currentJob) {
  if (!isBackdateEntryPayload(payload, currentJob)) return;
  if (backdateReason(payload, currentJob).length >= BACKDATE_REASON_MIN_LENGTH) return;
  const error = new Error(`Alasan ritasi susulan/backdate wajib diisi minimal ${BACKDATE_REASON_MIN_LENGTH} karakter.`);
  error.statusCode = 400;
  error.code = 'BACKDATE_REASON_REQUIRED';
  throw error;
}

function shouldEnforceOperationalLock(actor, payload = {}) {
  return ['operational', 'admin'].includes(normalizeRole(actor)) && !canUseAdminCorrection(actor, payload);
}

function isDocumentOnlyActor(actor) {
  return actorHasPermission(actor, 'container_job.document.update')
    && !actorHasPermission(actor, 'container_job.update')
    && !actorHasPermission(actor, 'container_job.update_status')
    && !actorHasPermission(actor, 'container_job.assign');
}

export function isDocumentOnlyContainerJobUpdateActor(actor) {
  return isDocumentOnlyActor(actor);
}

function hasRpujNotesInput(payload = {}) {
  return Boolean(String(payload.rpujNotes || '').trim());
}

function hasRpujNotesChange(job, payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'rpujNotes')) return false;
  return normalizeText(payload.rpujNotes) !== normalizeText(job?.rpujNotes);
}

function hasDriverCommissionInput(payload = {}) {
  const explicitlyEdited = payload.driverCommissionEdited === true
    || String(payload.driverCommissionEdited || '').toLowerCase() === 'true';
  const unambiguousEnable = payload.hasDriverCommission === true
    && Number(payload.driverCommissionAmount || 0) > 0;
  return (explicitlyEdited || unambiguousEnable) && [
    'hasDriverCommission',
    'driverCommissionAmount',
    'driverCommissionSourceDestinationId',
    'driverCommissionNote',
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
}

function preserveCommissionUnlessExplicit(payload = {}, documentOnlyUpdate = false) {
  if (!documentOnlyUpdate && hasDriverCommissionInput(payload)) return payload;
  const preserved = { ...payload };
  delete preserved.hasDriverCommission;
  delete preserved.driverCommissionAmount;
  delete preserved.driverCommissionSourceDestinationId;
  delete preserved.driverCommissionNote;
  delete preserved.driverCommissionEdited;
  return preserved;
}

export function hasDriverCommissionChange(job = {}, payload = {}) {
  if (!hasDriverCommissionInput(payload)) return false;
  const nextEnabled = Object.prototype.hasOwnProperty.call(payload, 'hasDriverCommission')
    ? Boolean(payload.hasDriverCommission)
    : Boolean(job.hasDriverCommission);
  const currentEnabled = Boolean(job.hasDriverCommission);
  const nextAmount = Number(nextEnabled ? payload.driverCommissionAmount ?? job.driverCommissionAmount ?? 0 : 0);
  const currentAmount = Number(currentEnabled ? job.driverCommissionAmount || 0 : 0);
  const nextSource = normalizeText(nextEnabled ? payload.driverCommissionSourceDestinationId ?? job.driverCommissionSourceDestinationId : '');
  const currentSource = normalizeText(currentEnabled ? job.driverCommissionSourceDestinationId : '');
  const nextNote = normalizeText(nextEnabled ? payload.driverCommissionNote ?? job.driverCommissionNote : '');
  const currentNote = normalizeText(currentEnabled ? job.driverCommissionNote : '');

  return Boolean(
    nextEnabled !== currentEnabled
      || nextAmount !== currentAmount
      || nextSource !== currentSource
      || nextNote !== currentNote
  );
}

function normalizeText(value) {
  return String(value || '').trim();
}

function hasAssignmentChange(currentJob, payload = {}) {
  const nextDriverId = payload.driverId || null;
  const nextVehicleId = payload.vehicleId || null;
  const nextDriverName = String(payload.driver || '').trim();
  const nextPlateNumber = String(payload.plateNumber || '').trim();
  const currentDriverName = String(currentJob?.driver || currentJob?.assignment_snapshot?.driver || '').trim();
  const currentPlateNumber = String(currentJob?.plateNumber || currentJob?.assignment_snapshot?.plateNumber || '').trim();

  return Boolean(
    (nextDriverId && String(nextDriverId) !== String(currentJob?.driverId || ''))
    || (nextVehicleId && String(nextVehicleId) !== String(currentJob?.vehicleId || ''))
    || (nextDriverName && nextDriverName !== currentDriverName)
    || (nextPlateNumber && nextPlateNumber !== currentPlateNumber)
  );
}

function hasCompleteAssignmentPayload(payload = {}) {
  return Boolean(normalizeText(payload.driver) && normalizeText(payload.plateNumber));
}

function isRepoPickupPayload(job, payload = {}) {
  return job?.status === 'repo_stored' && ['received', 'running'].includes(payload.status);
}

export function hasRepoStorageHistory(job = {}) {
  return Boolean(
    job?.status === 'repo_stored'
      || job?.repoLocation
      || job?.repoStoredAt
      || job?.repoEirNumber
      || job?.repoPickedUpAt,
  );
}

function hasContainerNumberChange(currentJob, payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'containerNumber')) return false;
  return normalizeText(payload.containerNumber).toUpperCase() !== normalizeText(currentJob?.containerNumber).toUpperCase();
}

export function isInitialContainerNumberInput(currentJob, payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'containerNumber')) return false;
  return !normalizeText(currentJob?.containerNumber) && Boolean(normalizeText(payload.containerNumber));
}

export function isContainerNumberLockedForOperational(job, payload = {}) {
  if (!hasContainerNumberChange(job, payload)) return false;
  if (job?.status === 'repo_stored') return true;
  if (isInitialContainerNumberInput(job, payload) && !['completed', 'cancelled'].includes(job?.status)) return false;
  return ['running', 'completed', 'cancelled'].includes(job?.status) || job?.rpujStatus === 'paid';
}

export function isOtherCostLockedForRepoPickup(job, payload = {}) {
  return Boolean(job?.status === 'repo_stored' && isRepoPickupPayload(job, payload) && hasRpujNotesChange(job, payload));
}

export function isDriverCommissionLockedForOperational(actor, job, payload = {}) {
  if (!shouldEnforceOperationalLock(actor, payload)) return false;
  if (!hasDriverCommissionChange(job, payload)) return false;

  const lockedStatuses = new Set(['completed', 'cancelled']);
  const lockedRpujStatuses = new Set(['approved', 'paid']);
  return lockedStatuses.has(job?.status) || lockedRpujStatuses.has(job?.rpujStatus);
}

export function hasOperationalDocumentChange(currentJob, payload = {}) {
  const documentFields = [
    ['eirNumber', 'eirNumber'],
    ['loadingVoucher', 'loadingVoucher'],
    ['tilaGatepassDocument', 'tilaGatepassDocument'],
    ['travelDocument', 'travelDocument'],
  ];

  return documentFields.some(([payloadKey, jobKey]) => (
    Object.prototype.hasOwnProperty.call(payload, payloadKey)
    && Boolean(normalizeText(currentJob?.[jobKey]))
    && normalizeText(payload[payloadKey]) !== normalizeText(currentJob?.[jobKey])
  ));
}

function normalizeTimelineValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).trim();
  return date.toISOString();
}

export function hasCompletedTimelineChange(currentJob, payload = {}) {
  const timelineFields = [
    ['runningAt', 'runningAt'],
    ['completedAt', 'completedAt'],
  ];

  return timelineFields.some(([payloadKey, jobKey]) => (
    Object.prototype.hasOwnProperty.call(payload, payloadKey)
    && normalizeTimelineValue(payload[payloadKey]) !== normalizeTimelineValue(currentJob?.[jobKey])
  ));
}

function ensureOperationalCanChangeStatus(actor, job, payload = {}) {
  if (!shouldEnforceOperationalLock(actor, payload)) return;
  if (!payload.status || payload.status === job?.status) return;

  if (job?.status === 'completed' && payload.status === 'cancelled') return;

  if (job?.status === 'completed' || job?.status === 'cancelled') {
    const error = new Error('Status pekerjaan yang sudah selesai atau dibatalkan tidak bisa diubah lagi.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_STATUS_LOCKED';
    throw error;
  }

  if (job?.status === 'running' && payload.status === 'received') {
    const error = new Error('Status pekerjaan yang sudah berjalan tidak bisa dikembalikan ke Belum Jalan.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_STATUS_REGRESSION';
    throw error;
  }

  if (job?.status === 'repo_stored') {
    if (isRepoPickupPayload(job, payload)) {
      if (!hasCompleteAssignmentPayload(payload)) {
        const error = new Error('Container titip hanya bisa diambil setelah truck dan sopir perjalanan lanjutan diisi.');
        error.statusCode = 409;
        error.code = 'CONTAINER_JOB_REPO_PICKUP_ASSIGNMENT_REQUIRED';
        throw error;
      }
      return;
    }
    const error = new Error('Container titip perlu proses pengambilan/re-assign khusus.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_STORED_LOCKED';
    throw error;
  }

  // Keluar dari inap tidak butuh reassignment -- sopir/truck tetap terkunci ke job ini
  // selama inap (beda dari repo_stored yang melepas assignment).
  if (job?.status === 'inap' && !['running', 'completed', 'cancelled'].includes(payload.status)) {
    const error = new Error('Container yang sedang inap hanya bisa dilanjutkan (Sedang Jalan) atau diselesaikan.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_INAP_INVALID_TRANSITION';
    throw error;
  }
}

function ensureOperationalCanEditContainerNumber(actor, job, payload = {}) {
  if (!shouldEnforceOperationalLock(actor, payload)) return;
  if (!isContainerNumberLockedForOperational(job, payload)) return;

  const error = new Error('No. Container yang sudah terisi tidak bisa diubah setelah pekerjaan berjalan, selesai, dibatalkan, atau UJ ditransfer.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_CONTAINER_NUMBER_LOCKED';
  throw error;
}

function ensureOperationalCanEditDocuments(actor, job, payload = {}) {
  if (!shouldEnforceOperationalLock(actor, payload)) return;
  if (job?.status !== 'completed') return;
  if (!hasOperationalDocumentChange(job, payload)) return;

  const error = new Error('Dokumen operasional tidak bisa diubah lagi setelah pekerjaan selesai.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_DOCUMENTS_LOCKED';
  throw error;
}

function ensureOperationalCanEditCompletedTimeline(actor, job, payload = {}) {
  if (!shouldEnforceOperationalLock(actor, payload)) return;
  if (job?.status !== 'completed') return;
  if (!hasCompletedTimelineChange(job, payload)) return;

  const error = new Error('Waktu mulai dan selesai hanya bisa direvisi Admin setelah pekerjaan selesai.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_TIMELINE_LOCKED';
  throw error;
}

function ensureOperationalCanInputOtherCost(actor, job, payload) {
  if (!shouldEnforceOperationalLock(actor, payload)) return;
  if (!hasRpujNotesInput(payload)) return;

  const lockedStatuses = new Set(['completed', 'cancelled']);
  const lockedRpujStatuses = new Set(['submitted', 'approved', 'paid']);
  const currentNotes = normalizeText(job?.rpujNotes);
  const nextNotes = normalizeText(payload?.rpujNotes);
  const notesChanged = nextNotes !== currentNotes;
  if ((lockedStatuses.has(job?.status) || lockedRpujStatuses.has(job?.rpujStatus)) && notesChanged) {
    const error = new Error('Biaya lainnya tidak bisa diinput lagi karena job sudah selesai/dibatalkan atau UJ sudah dikirimkan.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_OTHER_COST_LOCKED';
    throw error;
  }
}

function ensureOperationalCanInputDriverCommission(actor, job, payload) {
  if (!isDriverCommissionLockedForOperational(actor, job, payload)) return;

  const error = new Error('Komisi sopir tidak bisa diubah lagi karena job sudah selesai/dibatalkan atau UJ sudah disetujui/dibayar.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_DRIVER_COMMISSION_LOCKED';
  throw error;
}

function ensureRepoPickupOtherCostLocked(actor, job, payload = {}) {
  if (canUseAdminCorrection(actor, payload)) return;
  if (!isOtherCostLockedForRepoPickup(job, payload)) return;

  const error = new Error('Biaya lainnya tidak bisa diubah saat ambil container titip.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_REPO_PICKUP_OTHER_COST_LOCKED';
  throw error;
}

function isCompletingMissingAssignment(job, payload = {}) {
  const currentComplete = Boolean(normalizeText(job?.driver) && normalizeText(job?.plateNumber));
  const nextComplete = Boolean(normalizeText(payload.driver) && normalizeText(payload.plateNumber));
  return !currentComplete && nextComplete;
}

function preserveLockedOtherCost(actor, job, payload) {
  if (!shouldEnforceOperationalLock(actor, payload)) return payload;

  const lockedStatuses = new Set(['completed', 'cancelled']);
  const lockedRpujStatuses = new Set(['submitted', 'approved', 'paid']);
  if (!lockedStatuses.has(job?.status) && !lockedRpujStatuses.has(job?.rpujStatus)) return payload;

  return {
    ...payload,
    rpujNotes: job?.rpujNotes || '',
  };
}

function ensureOperationalCanEditAssignment(actor, job, payload) {
  if (!shouldEnforceOperationalLock(actor, payload)) return;
  if (job?.status === 'repo_stored' && hasAssignmentChange(job, payload) && !isRepoPickupPayload(job, payload)) {
    const error = new Error('Driver dan truck untuk container titip tidak bisa diubah dari form update biasa.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_ASSIGNMENT_LOCKED';
    throw error;
  }
  if (job?.rpujStatus !== 'paid' && job?.status !== 'completed' && job?.status !== 'cancelled') return;
  if (!hasAssignmentChange(job, payload)) return;
  if (job?.status !== 'completed' && job?.status !== 'cancelled' && isCompletingMissingAssignment(job, payload)) return;

  const error = new Error('Driver dan truck tidak bisa diubah lagi setelah UJ ditransfer atau pekerjaan selesai.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_ASSIGNMENT_LOCKED';
  throw error;
}

// Sekali ritasi sudah berjalan (bukan lagi 'received'), pergantian sopir/truck tetap boleh
// dilakukan Operational -- tapi alasan wajib diisi supaya ada jejak "kenapa" di riwayat assignment,
// beda dengan lock total ensureOperationalCanEditAssignment di atas (yang baru menutup total
// setelah completed/cancelled/RPUJ paid).
function ensureAssignmentChangeReasonRequired(actor, job, payload) {
  if (!shouldEnforceOperationalLock(actor, payload)) return;
  if (!hasAssignmentChange(job, payload)) return;
  if (isCompletingMissingAssignment(job, payload)) return;
  if (job?.status === 'received') return;
  if (normalizeText(payload.assignmentChangeReason)) return;

  const error = new Error('Alasan perubahan sopir/truck wajib diisi karena ritasi sudah berjalan.');
  error.statusCode = 400;
  error.code = 'CONTAINER_JOB_ASSIGNMENT_REASON_REQUIRED';
  throw error;
}

export function ensureRepoStoragePayload(job, payload = {}) {
  if (payload.status !== 'repo_stored') return;

  if (hasRepoStorageHistory(job)) {
    const error = new Error('Container yang pernah dititipkan tidak bisa dititipkan ulang.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_ALREADY_STORED';
    throw error;
  }

  if (job?.status !== 'running') {
    const error = new Error('Container hanya bisa dititipkan saat status pekerjaan Sedang Jalan.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_REQUIRES_RUNNING_STATUS';
    throw error;
  }

  const containerNumber = normalizeText(payload.containerNumber || job?.containerNumber);
  const driver = normalizeText(payload.driver || job?.driver);
  const plateNumber = normalizeText(payload.plateNumber || job?.plateNumber);
  const repoLocation = normalizeText(payload.repoLocation);
  const repoReason = normalizeText(payload.repoReason);
  const repoEirNumber = normalizeText(payload.repoEirNumber);
  const repoContainerCondition = normalizeText(payload.repoContainerCondition);
  const hasRepoEirReceipt = Boolean(job?.repoEirDocument);

  if (!containerNumber || !driver || !plateNumber) {
    const error = new Error('Container baru bisa dititipkan setelah nomor container, truck, dan sopir terisi.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_ASSIGNMENT_REQUIRED';
    throw error;
  }

  if (repoLocation.length < 3) {
    const error = new Error('Depo Penitipan wajib dipilih.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_REPO_LOCATION_REQUIRED';
    throw error;
  }

  if (repoReason.length < 8) {
    const error = new Error('Alasan penitipan container wajib diisi minimal 8 karakter.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_REPO_REASON_REQUIRED';
    throw error;
  }

  if (!repoEirNumber) {
    const error = new Error('Nomor EIR Titip wajib diisi.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_REPO_EIR_NUMBER_REQUIRED';
    throw error;
  }

  if (!['empty', 'loaded'].includes(repoContainerCondition)) {
    const error = new Error('Status container wajib dipilih: Kosong atau Isi.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_REPO_CONDITION_REQUIRED';
    throw error;
  }

  if (!hasRepoEirReceipt) {
    const error = new Error('Dokumen EIR Titip wajib diupload sebagai tanda terima container.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_REPO_EIR_REQUIRED';
    throw error;
  }
}

export function ensureInapPayload(job, payload = {}) {
  if (payload.status !== 'inap') return;

  if (job?.status !== 'running') {
    const error = new Error('Container hanya bisa ditandai inap saat status pekerjaan Sedang Jalan.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_INAP_REQUIRES_RUNNING_STATUS';
    throw error;
  }

  const inapReason = normalizeText(payload.inapReason);
  if (inapReason.length < 8) {
    const error = new Error('Alasan inap wajib diisi minimal 8 karakter.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_INAP_REASON_REQUIRED';
    throw error;
  }
}

export function isRepoCancellationLockedForOperational(actor, job, payload = {}) {
  return Boolean(shouldEnforceOperationalLock(actor, payload) && payload.status === 'cancelled' && hasRepoStorageHistory(job));
}

function ensureRepoHistoryCanCancel(actor, job, payload = {}) {
  if (!isRepoCancellationLockedForOperational(actor, job, payload)) return;

  const error = new Error('Container yang sudah masuk flow titip tidak bisa dibatalkan dari detail operational.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_REPO_CANCEL_LOCKED';
  throw error;
}

export async function getContainerJob(id) {
  const job = await findContainerJobById(id);
  if (!job) {
    const error = new Error('Container Job tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'CONTAINER_JOB_NOT_FOUND';
    throw error;
  }
  return job;
}

export function listContainerJobExpenses(id) {
  return findContainerJobExpensesByJobId(id);
}

export function listContainerJobAssignmentHistory(id) {
  return findAssignmentHistory(id);
}

export function getContainerJobExpense(expenseId) {
  return findContainerJobExpenseByIdRecord(expenseId);
}

export function listContainerJobExpenseLedger(query = {}) {
  return findContainerJobExpenseLedger({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || '',
    financeCheckStatus: query.financeCheckStatus || '',
    paymentStatus: query.paymentStatus || '',
    ledgerStatus: query.ledgerStatus || '',
    dateFrom: query.dateFrom || '',
    dateTo: query.dateTo || '',
  });
}

function normalizeExpenseAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Nominal biaya wajib lebih dari 0.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_AMOUNT_INVALID';
    throw error;
  }
  return Math.round(amount);
}

function normalizeExpenseCategory(value) {
  const category = String(value || '').trim();
  if (!expenseCategories.has(category)) {
    const error = new Error('Kategori biaya Container Job tidak valid.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_CATEGORY_INVALID';
    throw error;
  }
  return category;
}

function normalizeExpenseGroup(value) {
  const group = String(value || '').trim();
  if (!expenseGroups.has(group)) {
    const error = new Error('Jenis biaya (operational/reimbursement) wajib dipilih.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_GROUP_INVALID';
    throw error;
  }
  return group;
}

function normalizeExpensePaymentStatus(value) {
  const status = String(value || 'belum_dibayar').trim();
  if (!expensePaymentStatuses.has(status)) {
    const error = new Error('Status pembayaran biaya Container Job tidak valid.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_PAYMENT_STATUS_INVALID';
    throw error;
  }
  return status;
}

function normalizeExpenseText(value, field, maxLength = 500) {
  const text = String(value || '').trim();
  if (text.length > maxLength) {
    const error = new Error(`${field} maksimal ${maxLength} karakter.`);
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_TEXT_TOO_LONG';
    throw error;
  }
  return text;
}

export function createContainerJobExpense(id, payload = {}, actor) {
  const paymentStatus = normalizeExpensePaymentStatus(payload.paymentStatus);
  const category = normalizeExpenseCategory(payload.category);
  return createContainerJobExpenseRecord(id, {
    category,
    expenseGroup: normalizeExpenseGroup(payload.expenseGroup),
    amount: normalizeExpenseAmount(payload.amount),
    description: normalizeExpenseText(payload.description, 'Keterangan biaya'),
    recipientType: normalizeExpenseText(payload.recipientType || 'driver', 'Tipe penerima', 80) || 'driver',
    recipientName: normalizeExpenseText(payload.recipientName, 'Nama penerima', 160),
    paymentStatus,
    paidAt: payload.paidAt || null,
    proofAttachmentId: payload.proofAttachmentId || null,
    idempotencyKey: normalizeExpenseText(payload.idempotencyKey, 'Idempotency key', 100) || null,
    paidByName: getActorName(actor),
    actorName: getActorName(actor),
  });
}

export function correctContainerJobExpense(id, expenseId, payload = {}, actor) {
  const paymentStatus = normalizeExpensePaymentStatus(payload.paymentStatus);
  return correctContainerJobExpenseRecord(id, expenseId, {
    category: normalizeExpenseCategory(payload.category),
    amount: normalizeExpenseAmount(payload.amount),
    description: normalizeExpenseText(payload.description, 'Keterangan biaya'),
    recipientType: normalizeExpenseText(payload.recipientType || 'driver', 'Tipe penerima', 80) || 'driver',
    recipientName: normalizeExpenseText(payload.recipientName, 'Nama penerima', 160),
    paymentStatus,
    paidAt: payload.paidAt || null,
    proofAttachmentId: payload.proofAttachmentId || null,
    paidByName: getActorName(actor),
    actorName: getActorName(actor),
  });
}

export function updateContainerJobExpenseProof(id, expenseId, payload = {}, actor) {
  if (!payload.proofAttachmentId) {
    const error = new Error('Bukti pembayaran wajib diupload.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_PROOF_REQUIRED';
    throw error;
  }

  return updateContainerJobExpenseProofRecord(id, expenseId, {
    paidAt: payload.paidAt || null,
    proofAttachmentId: payload.proofAttachmentId,
    paidByName: getActorName(actor),
    actorName: getActorName(actor),
  });
}

export function updateDroppingExpenseBeforeFinanceCheck(id, expenseId, payload = {}, actor) {
  const paymentStatus = normalizeExpensePaymentStatus(payload.paymentStatus);
  return updateDroppingExpenseBeforeFinanceCheckRecord(id, expenseId, {
    category: normalizeExpenseCategory(payload.category),
    amount: normalizeExpenseAmount(payload.amount),
    description: normalizeExpenseText(payload.description, 'Keterangan biaya'),
    recipientType: normalizeExpenseText(payload.recipientType || 'driver', 'Tipe penerima', 80) || 'driver',
    recipientName: normalizeExpenseText(payload.recipientName, 'Nama penerima', 160),
    paymentStatus,
    paidAt: payload.paidAt || null,
    proofAttachmentId: payload.proofAttachmentId || null,
    paidByName: getActorName(actor),
    actorName: getActorName(actor),
  });
}

export function moveDroppingExpenseToAnotherJobBeforeFinanceCheck(id, expenseId, payload = {}, actor) {
  ensureNotOperationalRole(actor, 'Pindah ritasi');
  const targetContainerJobId = normalizeExpenseText(payload.targetContainerJobId, 'Ritasi tujuan', 100);
  if (!targetContainerJobId) {
    const error = new Error('Ritasi tujuan wajib dipilih.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_MOVE_TARGET_REQUIRED';
    throw error;
  }
  return moveDroppingExpenseToAnotherJobBeforeFinanceCheckRecord(id, expenseId, targetContainerJobId, {
    actorName: getActorName(actor),
  });
}

export function voidDroppingExpenseBeforeFinanceCheck(id, expenseId, payload = {}, actor) {
  ensureNotOperationalRole(actor, 'Void transaksi');
  return voidDroppingExpenseBeforeFinanceCheckRecord(id, expenseId, {
    voidReason: normalizeExpenseText(payload.voidReason || payload.reason, 'Alasan void', 500),
    actorName: getActorName(actor),
  });
}

function hasDriverAssignmentChange(currentJob, payload = {}) {
  const nextDriverId = payload.driverId || null;
  const nextDriverName = normalizeText(payload.driver);
  const currentDriverName = normalizeText(currentJob?.driver || currentJob?.assignment_snapshot?.driver);
  return Boolean(
    (nextDriverId && String(nextDriverId) !== String(currentJob?.driverId || ''))
    || (nextDriverName && nextDriverName !== currentDriverName)
  );
}

export function ensureCompletedCommissionDriverAction(currentJob = {}, payload = {}) {
  if (!isAdminCorrectionMode(payload)) return;
  if (currentJob.status !== 'completed' || !currentJob.hasDriverCommission) return;
  if (!hasDriverAssignmentChange(currentJob, payload)) return;

  const action = normalizeText(payload.commissionDriverAction).toLowerCase();
  if (['move', 'keep'].includes(action)) return;

  const error = new Error('Pilih perlakuan komisi: pindahkan ke sopir baru atau tetap pada sopir sebelumnya.');
  error.statusCode = 400;
  error.code = 'CONTAINER_JOB_COMMISSION_DRIVER_ACTION_REQUIRED';
  error.details = { allowedActions: ['move', 'keep'] };
  throw error;
}

export function resetMisassignedContainerJob(id, payload = {}, actor) {
  if (!actor || !['operational', 'admin'].includes(actor.role)) {
    const error = new Error('Reset ritasi hanya dapat dilakukan oleh Operational atau Admin.');
    error.statusCode = 403;
    error.code = 'CONTAINER_JOB_RESET_FORBIDDEN';
    throw error;
  }
  const reason = normalizeExpenseText(payload.reason || payload.resetReason, 'Alasan reset', 500);
  if (reason.length < BACKDATE_REASON_MIN_LENGTH) {
    const error = new Error(`Alasan reset ritasi wajib diisi minimal ${BACKDATE_REASON_MIN_LENGTH} karakter.`);
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_RESET_REASON_REQUIRED';
    throw error;
  }
  return resetContainerJobAssignment(id, {
    reason,
    actorName: getActorName(actor),
  });
}

export function uploadAutoJourneyMoneyProof(id, expenseId, payload = {}, actor) {
  if (!payload.proofAttachmentId) {
    const error = new Error('Bukti transfer UJ wajib diupload.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXPENSE_PROOF_REQUIRED';
    throw error;
  }
  return uploadAutoJourneyMoneyProofRecord(id, expenseId, {
    proofAttachmentId: payload.proofAttachmentId,
    actorName: getActorName(actor),
  });
}

export async function saveContainerJob(id, payload, actor) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload Container Job harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const normalizedPayload = { ...payload };
  if (
    Object.prototype.hasOwnProperty.call(normalizedPayload, 'executionSource')
    && !['internal', 'vendor'].includes(normalizedPayload.executionSource)
  ) {
    const error = new Error('Sumber pelaksanaan Container Job tidak valid.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_EXECUTION_SOURCE_INVALID';
    throw error;
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, 'tilaGatepassDocument')
    || Object.prototype.hasOwnProperty.call(payload, 'unloadingVoucher')
    || Object.prototype.hasOwnProperty.call(payload, 'weighingDocument')
  ) {
    normalizedPayload.tilaGatepassDocument = payload.tilaGatepassDocument || payload.unloadingVoucher || payload.weighingDocument || '';
  }

  const allowedStatuses = ['received', 'running', 'repo_stored', 'completed', 'cancelled', 'inap'];
  if (normalizedPayload.status && !allowedStatuses.includes(normalizedPayload.status)) {
    const error = new Error('Status Container Job tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const currentJob = await getContainerJob(id);
  const nextExecutionSource = normalizedPayload.executionSource || currentJob.executionSource || 'internal';
  const isVendorExecution = nextExecutionSource === 'vendor';
  if (isVendorExecution) {
    normalizedPayload.executionSource = 'vendor';
    normalizedPayload.driverId = null;
    normalizedPayload.driver = '';
    normalizedPayload.vehicleId = null;
    normalizedPayload.plateNumber = '';
  }
  ensureAdminCorrectionContract(actor, normalizedPayload);
  ensureCompletedCommissionDriverAction(currentJob, normalizedPayload);
  ensureBackdateReasonRequired(normalizedPayload, currentJob);
  const documentOnlyUpdate = isDocumentOnlyActor(actor);
  if (!documentOnlyUpdate) {
    ensureCanManageHistoricalEntry(actor, {
      payload: normalizedPayload,
      currentRecord: currentJob,
      entityLabel: 'Data historis Container Job',
    });
    await ensureHistoricalPeriodEditable(
      normalizedPayload.historicalPeriod || currentJob.historicalPeriod,
      'Container data lama',
    );
  }
  ensureRepoPickupOtherCostLocked(actor, currentJob, normalizedPayload);
  ensureRepoHistoryCanCancel(actor, currentJob, normalizedPayload);
  const payloadForUpdate = preserveCommissionUnlessExplicit(
    preserveLockedOtherCost(actor, currentJob, normalizedPayload),
    documentOnlyUpdate,
  );
  ensureOperationalCanChangeStatus(actor, currentJob, payloadForUpdate);
  if (!documentOnlyUpdate) {
    ensureRepoStoragePayload(currentJob, payloadForUpdate);
    ensureInapPayload(currentJob, payloadForUpdate);
    ensureOperationalCanEditContainerNumber(actor, currentJob, payloadForUpdate);
    ensureOperationalCanInputOtherCost(actor, currentJob, payloadForUpdate);
    ensureOperationalCanInputDriverCommission(actor, currentJob, payloadForUpdate);
    if (!isVendorExecution) {
      ensureOperationalCanEditAssignment(actor, currentJob, payloadForUpdate);
      ensureAssignmentChangeReasonRequired(actor, currentJob, payloadForUpdate);
    }
    ensureOperationalCanEditCompletedTimeline(actor, currentJob, payloadForUpdate);
  }
  ensureOperationalCanEditDocuments(actor, currentJob, payloadForUpdate);

  return updateContainerJob(id, {
    ...payloadForUpdate,
    actorRole: actor?.role || '',
    documentOnlyUpdate,
  });
}

function normalizeRepoPickupPayload(payload = {}, actor) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload pickup container titip harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return {
    ...payload,
    updatedBy: payload.updatedBy || getActorName(actor),
  };
}

export function pickupRepoContainerJob(id, payload = {}, actor) {
  return pickupSingleRepoContainerJob(id, normalizeRepoPickupPayload(payload, actor));
}

export function pickupComboRepoContainerJob(payload = {}, actor) {
  const normalizedPayload = normalizeRepoPickupPayload(payload, actor);
  return pickupComboRepoContainerJobs(normalizedPayload);
}

export function createContainerJobSpk(id, payload = {}) {
  return generateContainerJobSpk(id, payload);
}

export async function requestContainerJobCancellation(id, actor, payload = {}) {
  const job = await getContainerJob(id);
  const order = await findSalesOrderById(job.orderId);
  if (!canSalesAccessOrder(actor, order)) {
    const error = new Error('Container Job ini bukan milik akun sales Anda.');
    error.statusCode = 403;
    error.code = 'CONTAINER_JOB_OWNER_FORBIDDEN';
    throw error;
  }
  if (actor?.role === 'sales' && hasContainerSentRpuj(job)) {
    const error = new Error('Pembatalan tidak dapat diajukan Sales karena RPUJ sudah dikirim. Hubungi Admin untuk melakukan pembatalan.');
    error.statusCode = 403;
    error.code = 'CONTAINER_JOB_RPUJ_LOCKED_ADMIN_ONLY';
    throw error;
  }

  return requestContainerJobCancellationRepository(id, {
    cancelRequestNote: payload.cancelRequestNote || '',
    cancelRequestedByName: getActorName(actor),
    cancelRequestedByRole: actor?.role || 'sales',
  });
}

export async function reviewContainerJobCancellation(id, actor, payload = {}) {
  if (!actor || !['operational', 'admin'].includes(actor.role)) {
    const error = new Error('Approval pembatalan hanya dapat dilakukan oleh Operational atau Admin.');
    error.statusCode = 403;
    error.code = 'CONTAINER_JOB_CANCEL_REVIEW_FORBIDDEN';
    throw error;
  }

  return reviewContainerJobCancellationRepository(id, {
    approved: Boolean(payload.approved),
    cancelRequestNote: payload.cancelRequestNote || '',
    cancelReviewNote: payload.cancelReviewNote || '',
    cancelSource: payload.cancelSource || 'sales',
    cancelReviewedByName: getActorName(actor),
  });
}
