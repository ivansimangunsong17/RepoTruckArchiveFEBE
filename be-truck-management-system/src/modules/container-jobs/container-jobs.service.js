import {
  generateContainerJobSpk,
  findContainerJobById,
  findContainerJobsPage,
  requestContainerJobCancellation as requestContainerJobCancellationRepository,
  reviewContainerJobCancellation as reviewContainerJobCancellationRepository,
  updateContainerJob,
} from './container-jobs.repository.js';
import { findSalesOrderById } from '../sales-orders/sales-orders.repository.js';
import { hasContainerSentRpuj } from '../sales-orders/sales-orders.rpuj-lock.js';
import { ensureCanManageHistoricalEntry } from '../historical-entry/historical-entry.permissions.js';
import { ensureHistoricalPeriodEditable } from '../historical-entry/historical-entry.service.js';

function getActorName(actor) {
  return actor?.name || actor?.email || 'System';
}

function canSalesAccessOrder(actor, order) {
  if (actor?.role !== 'sales') return true;
  if (!order) return false;
  if (order.createdByUserId) return order.createdByUserId === actor.sub;
  return String(order.createdBy || '').trim() === getActorName(actor);
}

export function listContainerJobs(query) {
  return findContainerJobsPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || '',
    status: query.status || '',
    requestStatus: query.requestStatus || '',
    rpujStage: query.rpujStage || '',
    documentStatus: query.documentStatus || '',
    tripDate: query.tripDate || '',
  });
}

function normalizeRole(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

function hasRpujNotesInput(payload = {}) {
  return Boolean(String(payload.rpujNotes || '').trim());
}

function hasRpujNotesChange(job, payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'rpujNotes')) return false;
  return normalizeText(payload.rpujNotes) !== normalizeText(job?.rpujNotes);
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

function hasRepoPickupAssignmentChange(job, payload = {}) {
  const releasedDriverId = job?.repoReleasedDriverId || job?.repo_released_driver_id || job?.driverId || null;
  const releasedVehicleId = job?.repoReleasedVehicleId || job?.repo_released_vehicle_id || job?.vehicleId || null;
  const releasedDriverName = normalizeText(job?.driver || job?.assignment_snapshot?.driver);
  const releasedPlateNumber = normalizeText(job?.plateNumber || job?.assignment_snapshot?.plateNumber);
  const nextDriverId = payload.driverId || null;
  const nextVehicleId = payload.vehicleId || null;
  const nextDriverName = normalizeText(payload.driver);
  const nextPlateNumber = normalizeText(payload.plateNumber);

  return Boolean(
    (nextDriverId && String(nextDriverId) !== String(releasedDriverId || ''))
    || (nextVehicleId && String(nextVehicleId) !== String(releasedVehicleId || ''))
    || (nextDriverName && nextDriverName !== releasedDriverName)
    || (nextPlateNumber && nextPlateNumber !== releasedPlateNumber)
  );
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
  if (normalizeRole(actor) !== 'operational') return;
  if (!payload.status || payload.status === job?.status) return;

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
        const error = new Error('Container titip hanya bisa diambil setelah truck dan sopir baru diassign.');
        error.statusCode = 409;
        error.code = 'CONTAINER_JOB_REPO_PICKUP_ASSIGNMENT_REQUIRED';
        throw error;
      }
      if (!hasRepoPickupAssignmentChange(job, payload)) {
        const error = new Error('Ambil container titip wajib memakai assignment truck/sopir baru.');
        error.statusCode = 409;
        error.code = 'CONTAINER_JOB_REPO_PICKUP_REASSIGN_REQUIRED';
        throw error;
      }
      return;
    }
    const error = new Error('Container titip perlu proses pengambilan/re-assign khusus.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_STORED_LOCKED';
    throw error;
  }
}

function ensureOperationalCanEditContainerNumber(actor, job, payload = {}) {
  if (normalizeRole(actor) !== 'operational') return;
  if (!isContainerNumberLockedForOperational(job, payload)) return;

  const error = new Error('No. Container yang sudah terisi tidak bisa diubah setelah pekerjaan berjalan, selesai, dibatalkan, atau UJ ditransfer.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_CONTAINER_NUMBER_LOCKED';
  throw error;
}

function ensureOperationalCanEditDocuments(actor, job, payload = {}) {
  if (normalizeRole(actor) !== 'operational') return;
  if (job?.status !== 'completed') return;
  if (!hasOperationalDocumentChange(job, payload)) return;

  const error = new Error('Dokumen operasional tidak bisa diubah lagi setelah pekerjaan selesai.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_DOCUMENTS_LOCKED';
  throw error;
}

function ensureOperationalCanEditCompletedTimeline(actor, job, payload = {}) {
  if (normalizeRole(actor) !== 'operational') return;
  if (job?.status !== 'completed') return;
  if (!hasCompletedTimelineChange(job, payload)) return;

  const error = new Error('Waktu mulai dan selesai hanya bisa direvisi Admin setelah pekerjaan selesai.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_TIMELINE_LOCKED';
  throw error;
}

function ensureOperationalCanInputOtherCost(actor, job, payload) {
  if (normalizeRole(actor) !== 'operational') return;
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

function ensureRepoPickupOtherCostLocked(job, payload = {}) {
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
  if (normalizeRole(actor) !== 'operational') return payload;

  const lockedStatuses = new Set(['completed', 'cancelled']);
  const lockedRpujStatuses = new Set(['submitted', 'approved', 'paid']);
  if (!lockedStatuses.has(job?.status) && !lockedRpujStatuses.has(job?.rpujStatus)) return payload;

  return {
    ...payload,
    rpujNotes: job?.rpujNotes || '',
  };
}

function ensureOperationalCanEditAssignment(actor, job, payload) {
  if (normalizeRole(actor) !== 'operational') return;
  if (job?.status === 'repo_stored' && hasAssignmentChange(job, payload) && !isRepoPickupPayload(job, payload)) {
    const error = new Error('Driver dan truck untuk container titip tidak bisa diubah dari form update biasa.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_ASSIGNMENT_LOCKED';
    throw error;
  }
  if (job?.rpujStatus !== 'paid' && job?.status !== 'completed') return;
  if (!hasAssignmentChange(job, payload)) return;
  if (job?.status !== 'completed' && isCompletingMissingAssignment(job, payload)) return;

  const error = new Error('Driver dan truck tidak bisa diubah lagi setelah UJ ditransfer atau pekerjaan selesai.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_ASSIGNMENT_LOCKED';
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

export function isRepoCancellationLockedForOperational(actor, job, payload = {}) {
  return Boolean(normalizeRole(actor) === 'operational' && payload.status === 'cancelled' && hasRepoStorageHistory(job));
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

export async function saveContainerJob(id, payload, actor) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload Container Job harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const normalizedPayload = {
    ...payload,
    tilaGatepassDocument: payload.tilaGatepassDocument || payload.unloadingVoucher || payload.weighingDocument || '',
  };

  const allowedStatuses = ['received', 'running', 'repo_stored', 'completed', 'cancelled'];
  if (normalizedPayload.status && !allowedStatuses.includes(normalizedPayload.status)) {
    const error = new Error('Status Container Job tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const currentJob = await getContainerJob(id);
  ensureCanManageHistoricalEntry(actor, {
    payload: normalizedPayload,
    currentRecord: currentJob,
    entityLabel: 'Data historis Container Job',
  });
  await ensureHistoricalPeriodEditable(
    normalizedPayload.historicalPeriod || currentJob.historicalPeriod,
    'Container data lama',
  );
  ensureRepoPickupOtherCostLocked(currentJob, normalizedPayload);
  ensureRepoHistoryCanCancel(actor, currentJob, normalizedPayload);
  const payloadForUpdate = preserveLockedOtherCost(actor, currentJob, normalizedPayload);
  ensureOperationalCanChangeStatus(actor, currentJob, payloadForUpdate);
  ensureRepoStoragePayload(currentJob, payloadForUpdate);
  ensureOperationalCanEditContainerNumber(actor, currentJob, payloadForUpdate);
  ensureOperationalCanInputOtherCost(actor, currentJob, payloadForUpdate);
  ensureOperationalCanEditAssignment(actor, currentJob, payloadForUpdate);
  ensureOperationalCanEditDocuments(actor, currentJob, payloadForUpdate);
  ensureOperationalCanEditCompletedTimeline(actor, currentJob, payloadForUpdate);

  return updateContainerJob(id, payloadForUpdate);
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
