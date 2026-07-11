import { httpClient } from '../api/httpClient';
import { uploadAttachmentFile } from '../files/fileService';

const documentFields = [
  ['spkDocument', 'spkDocument'],
  ['eirDocument', 'eirDocument'],
  ['loadingVoucherDocument', 'loadingVoucherDocument'],
  ['unloadingVoucherDocument', 'unloadingVoucherDocument'],
  ['travelDocumentFile', 'travelDocumentFile'],
  ['weighingDocumentFile', 'weighingDocumentFile'],
];

export function fetchContainerJobsPage({
  page = 1,
  pageSize = 8,
  query = '',
  status = '',
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    query,
  });
  if (status) params.set('status', status);
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

async function uploadField(jobId, form, category, source, documentName = '') {
  const rawFile = getRawFile(source);
  const existingPath = source?.path || '';

  if (!rawFile) {
    if (!existingPath) return null;
    return uploadAttachmentFile({
      path: existingPath,
      entityType: 'container_job',
      entityId: jobId,
      category,
      notes: documentName,
      uploadedByName: form.updatedBy || 'Operational',
    });
  }

  return uploadAttachmentFile({
    path: existingPath,
    entityType: 'container_job',
    entityId: jobId,
    category,
    file: rawFile,
    notes: documentName,
    uploadedByName: form.updatedBy || 'Operational',
  });
}

async function uploadJobDocuments(id, form) {
  await Promise.all(documentFields.map(([field, category]) => (
    uploadField(id, form, category, form[field])
  )));

  await Promise.all((form.otherDocuments || [])
    .filter((document) => document && (document.name || document.file))
    .map((document) => uploadField(id, form, 'otherDocument', document.file, document.name || '')));
}

export async function updateContainerJob(id, form) {
  await uploadJobDocuments(id, form);
  return httpClient.patch(`/container-jobs/${id}`, form);
}

export function generateContainerJobSpk(id, form = {}) {
  return httpClient.post(`/container-jobs/${id}/spk`, form);
}

export function cancelContainerJob(id, updatedBy = 'Operational') {
  return updateContainerJob(id, { status: 'cancelled', updatedBy });
}
