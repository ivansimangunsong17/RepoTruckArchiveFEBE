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
  });
}

function normalizeRole(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

function hasRpujNotesInput(payload = {}) {
  return Boolean(String(payload.rpujNotes || '').trim());
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

function hasContainerNumberChange(currentJob, payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'containerNumber')) return false;
  return normalizeText(payload.containerNumber).toUpperCase() !== normalizeText(currentJob?.containerNumber).toUpperCase();
}

export function isInitialContainerNumberInput(currentJob, payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'containerNumber')) return false;
  return !normalizeText(currentJob?.containerNumber) && Boolean(normalizeText(payload.containerNumber));
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
    const error = new Error('Container yang sedang dititipkan Repo perlu proses pengambilan/re-assign khusus.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_STORED_LOCKED';
    throw error;
  }
}

function ensureOperationalCanEditContainerNumber(actor, job, payload = {}) {
  if (normalizeRole(actor) !== 'operational') return;
  if (!hasContainerNumberChange(job, payload)) return;
  if (isInitialContainerNumberInput(job, payload) && !['completed', 'cancelled'].includes(job?.status)) return;
  if (!['running', 'completed', 'cancelled'].includes(job?.status) && job?.rpujStatus !== 'paid') return;

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
  if (job?.status === 'repo_stored' && hasAssignmentChange(job, payload)) {
    const error = new Error('Driver dan truck untuk container titipan Repo tidak bisa diubah dari form update biasa.');
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

function ensureRepoStoragePayload(job, payload = {}) {
  if (payload.status !== 'repo_stored') return;

  const containerNumber = normalizeText(payload.containerNumber || job?.containerNumber);
  const driver = normalizeText(payload.driver || job?.driver);
  const plateNumber = normalizeText(payload.plateNumber || job?.plateNumber);
  const repoLocation = normalizeText(payload.repoLocation);
  const repoReason = normalizeText(payload.repoReason);

  if (!containerNumber || !driver || !plateNumber) {
    const error = new Error('Container baru bisa dititipkan Repo setelah nomor container, truck, dan sopir terisi.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_REPO_ASSIGNMENT_REQUIRED';
    throw error;
  }

  if (repoLocation.length < 3) {
    const error = new Error('Lokasi penitipan Repo wajib diisi.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_REPO_LOCATION_REQUIRED';
    throw error;
  }

  if (repoReason.length < 8) {
    const error = new Error('Alasan penitipan Repo wajib diisi minimal 8 karakter.');
    error.statusCode = 400;
    error.code = 'CONTAINER_JOB_REPO_REASON_REQUIRED';
    throw error;
  }
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
  const payloadForUpdate = preserveLockedOtherCost(actor, currentJob, normalizedPayload);
  ensureOperationalCanChangeStatus(actor, currentJob, payloadForUpdate);
  ensureRepoStoragePayload(currentJob, payloadForUpdate);
  ensureOperationalCanEditContainerNumber(actor, currentJob, payloadForUpdate);
  ensureOperationalCanInputOtherCost(actor, currentJob, payloadForUpdate);
  ensureOperationalCanEditAssignment(actor, currentJob, payloadForUpdate);
  ensureOperationalCanEditDocuments(actor, currentJob, payloadForUpdate);

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
