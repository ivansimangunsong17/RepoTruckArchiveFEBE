import { httpClient } from '../api/httpClient';
import { getAuthToken } from '../auth/authTokenStore';
import { API_BASE_URL } from '../config/dataSource';
import { compressImageFile } from '../../utils/imageCompression';
import { validateFinalUploadFile } from '../../utils/fileValidation';

export async function createAttachmentDownloadUrl(path, { download = false } = {}) {
  if (!path) return null;

  const token = getAuthToken();
  const params = new URLSearchParams();
  if (token) params.set('access_token', token);
  if (download) params.set('download', '1');
  const query = params.toString();
  return `${API_BASE_URL}/attachments/${encodeURIComponent(path)}${query ? `?${query}` : ''}`;
}

export async function downloadAttachmentFile(path, fileName = 'Dokumen') {
  const url = await createAttachmentDownloadUrl(path, { download: true });
  if (!url) return;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'Dokumen';
  anchor.rel = 'noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File gagal dibaca.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadAttachmentFile({
  path,
  entityType,
  entityId,
  category,
  file,
  referenceNumber = '',
  documentDate = '',
  notes = '',
  uploadedByName = '',
}) {
  const payload = {
    entityType,
    entityId,
    category,
    referenceNumber,
    documentDate,
    notes,
    uploadedByName,
  };

  if (file && file instanceof File) {
    const uploadFile = await compressImageFile(file);
    const validationError = validateFinalUploadFile(uploadFile);
    if (validationError) throw new Error(validationError);
    const fileBase64 = await readFileAsDataUrl(uploadFile);
    payload.fileName = uploadFile.name;
    payload.mimeType = uploadFile.type;
    payload.fileSize = uploadFile.size;
    payload.fileBase64 = fileBase64;
  } else if (!path) {
    return null;
  }

  if (!path) return httpClient.post('/attachments/upload', payload);

  try {
    return await httpClient.patch(`/attachments/${encodeURIComponent(path)}`, payload);
  } catch (error) {
    if (error?.status !== 404) throw error;
    return httpClient.post('/attachments/upload', payload);
  }
}

export async function deleteAttachmentFile(path) {
  if (!path) return null;
  try {
    return await httpClient.delete(`/attachments/${encodeURIComponent(path)}`);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}
