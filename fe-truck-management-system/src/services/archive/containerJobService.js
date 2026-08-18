import { httpClient } from '../api/httpClient';
import { deleteAttachmentFile, uploadAttachmentFile } from '../files/fileService';

const documentFields = [
  ['additionalCostDocument', 'additionalCostDocument'],
  ['spkDocument', 'spkDocument'],
  ['eirDocument', 'eirDocument'],
  ['repoEirDocument', 'repoEirDocument'],
  ['loadingVoucherDocument', 'loadingVoucherDocument'],
  ['tilaGatepassDocumentFile', 'tilaGatepassDocumentFile'],
  ['travelDocumentFile', 'travelDocumentFile'],
];

export function fetchContainerJobsPage({
  page = 1,
  pageSize = 8,
  query = '',
  status = '',
  requestStatus = '',
  rpujStage = '',
  documentStatus = '',
  tripDate = '',
  groupByOrder = false,
  entrySource = '',
  historicalPeriod = '',
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    query,
  });
  if (status) params.set('status', status);
  if (requestStatus) params.set('requestStatus', requestStatus);
  if (rpujStage) params.set('rpujStage', rpujStage);
  if (documentStatus) params.set('documentStatus', documentStatus);
  if (tripDate) params.set('tripDate', tripDate);
  if (groupByOrder) params.set('groupByOrder', 'true');
  if (entrySource) params.set('entrySource', entrySource);
  if (historicalPeriod) params.set('historicalPeriod', historicalPeriod);
  return httpClient.get(`/container-jobs?${params.toString()}`);
}

export function fetchContainerJob(id) {
  return httpClient.get(`/container-jobs/${id}`);
}

function getRawFile(file) {
  if (!file) return null;
  if (file instanceof File) return file;
  if (file.rawFile instanceof File) return file.rawFile;
  return null;
}

function getAttachmentPath(attachment) {
  return attachment?.path || attachment?.id || '';
}

async function uploadField(jobId, form, category, source, documentName = '') {
  const rawFile = getRawFile(source);
  const existingPath = source?.path || '';

  if (!rawFile) return null;

  const attachment = await uploadAttachmentFile({
    path: existingPath,
    entityType: 'container_job',
    entityId: jobId,
    category,
    file: rawFile,
    notes: documentName,
    uploadedByName: form.updatedBy || 'Operational',
  });
  return {
    attachment,
    created: !existingPath && Boolean(getAttachmentPath(attachment)),
  };
}

async function uploadJobDocuments(id, form) {
  const uploadedDocumentResults = await Promise.all(documentFields.map(([field, category]) => (
    uploadField(id, form, category, form[field])
  )));

  const uploadedOtherDocumentResults = await Promise.all((form.otherDocuments || [])
    .filter((document) => document && (document.name || document.file))
    .map((document) => uploadField(id, form, 'otherDocument', document.file, document.name || '')));

  return [...uploadedDocumentResults, ...uploadedOtherDocumentResults].filter(Boolean);
}

async function rollbackCreatedUploads(uploadResults) {
  await Promise.allSettled(uploadResults
    .filter((result) => result.created)
    .map((result) => deleteAttachmentFile(getAttachmentPath(result.attachment))));
}

export async function updateContainerJob(id, form) {
  if (form.status !== 'completed') {
    const saved = await httpClient.patch(`/container-jobs/${id}`, form);
    const uploadedDocuments = await uploadJobDocuments(id, form);
    return uploadedDocuments.length ? fetchContainerJob(id) : saved;
  }

  const uploadedDocuments = await uploadJobDocuments(id, form);
  try {
    return await httpClient.patch(`/container-jobs/${id}`, form);
  } catch (error) {
    await rollbackCreatedUploads(uploadedDocuments);
    throw error;
  }
}

export function generateContainerJobSpk(id, form = {}) {
  return httpClient.post(`/container-jobs/${id}/spk`, form);
}

export function cancelContainerJob(id, payloadOrUpdatedBy = 'Operational') {
  const payload = typeof payloadOrUpdatedBy === 'object'
    ? { status: 'cancelled', ...payloadOrUpdatedBy }
    : { status: 'cancelled', updatedBy: payloadOrUpdatedBy };

  return updateContainerJob(id, payload);
}

export function requestContainerJobCancellation(id, payload = {}) {
  return httpClient.patch(`/container-jobs/${id}/cancel-request`, payload);
}

export function reviewContainerJobCancellation(id, payload = {}) {
  return httpClient.patch(`/container-jobs/${id}/cancel-review`, payload);
}
