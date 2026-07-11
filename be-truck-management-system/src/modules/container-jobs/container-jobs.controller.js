import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import { createContainerJobSpk, getContainerJob, listContainerJobs, saveContainerJob } from './container-jobs.service.js';

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
  const saved = await saveContainerJob(request.params.id, request.body);
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
  sendSuccess(response, saved, 'SPK berhasil digenerate.');
}
