import {
  generateContainerJobSpk,
  findContainerJobById,
  findContainerJobsPage,
  requestContainerJobCancellation as requestContainerJobCancellationRepository,
  reviewContainerJobCancellation as reviewContainerJobCancellationRepository,
  updateContainerJob,
} from './container-jobs.repository.js';
import { findSalesOrderById } from '../sales-orders/sales-orders.repository.js';

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
  });
}

function normalizeRole(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

function hasRpujNotesInput(payload = {}) {
  return Boolean(String(payload.rpujNotes || '').trim());
}

function ensureOperationalCanInputOtherCost(actor, job, payload) {
  if (normalizeRole(actor) !== 'operational') return;
  if (!hasRpujNotesInput(payload)) return;

  const lockedStatuses = new Set(['completed', 'cancelled']);
  const lockedRpujStatuses = new Set(['submitted', 'approved', 'paid']);
  if (lockedStatuses.has(job?.status) || lockedRpujStatuses.has(job?.rpujStatus)) {
    const error = new Error('Biaya lainnya tidak bisa diinput lagi karena job sudah selesai/dibatalkan atau UJ sudah dikirimkan.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_OTHER_COST_LOCKED';
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

  const allowedStatuses = ['received', 'running', 'completed', 'cancelled'];
  if (normalizedPayload.status && !allowedStatuses.includes(normalizedPayload.status)) {
    const error = new Error('Status Container Job tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const currentJob = await getContainerJob(id);
  ensureOperationalCanInputOtherCost(actor, currentJob, normalizedPayload);

  return updateContainerJob(id, normalizedPayload);
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
