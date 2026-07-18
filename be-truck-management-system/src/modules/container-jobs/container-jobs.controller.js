import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  createContainerJobSpk,
  getContainerJob,
  listContainerJobs,
  requestContainerJobCancellation,
  reviewContainerJobCancellation,
  saveContainerJob,
} from './container-jobs.service.js';

export async function listContainerJobsController(request, response) {
  const result = await listContainerJobs(request.query);
  sendSuccess(response, result);
}

export async function getContainerJobController(request, response) {
  const result = await getContainerJob(request.params.id);
  sendSuccess(response, result);
}

export async function updateContainerJobController(request, response) {
  const before = await getContainerJob(request.params.id);
  const saved = await saveContainerJob(request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_CONTAINER_JOB',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
  });
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
  }
  if (before.rpujStatus !== 'submitted' && saved.rpujStatus === 'submitted') {
    await safeRecordActivityLog(request, {
      action: 'OPERATIONAL_REQUEST_RPUJ',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: saved.id,
      beforeData: { rpujStatus: before.rpujStatus },
      afterData: { rpujStatus: saved.rpujStatus, rpujNotes: saved.rpujNotes },
      metadata: {
        salesOrderId: saved.orderId,
        soNumber: saved.soNumber,
      },
    });
  }
  sendSuccess(response, saved, 'Container Job berhasil diperbarui.');
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
