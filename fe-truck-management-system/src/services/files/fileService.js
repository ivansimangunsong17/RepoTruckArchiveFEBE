import { httpClient } from '../api/httpClient';
import { getAuthToken } from '../auth/authTokenStore';
import { API_BASE_URL } from '../config/dataSource';

export async function createAttachmentDownloadUrl(path, { download = false } = {}) {
  if (!path) return null;

  const token = getAuthToken();
  const params = new URLSearchParams();
  if (token) params.set('access_token', token);
  if (download) params.set('download', '1');
  const query = params.toString();
  return `${API_BASE_URL}/attachments/${encodeURIComponent(path)}${query ? `?${query}` : ''}`;
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
    const fileBase64 = await readFileAsDataUrl(file);
    payload.fileName = file.name;
    payload.mimeType = file.type;
    payload.fileSize = file.size;
    payload.fileBase64 = fileBase64;
  } else if (!path) {
    return null;
  }

  return path
    ? httpClient.patch(`/attachments/${encodeURIComponent(path)}`, payload)
    : httpClient.post('/attachments/upload', payload);
}

export function deleteAttachmentFile(path) {
  if (!path) return null;
  return httpClient.delete(`/attachments/${encodeURIComponent(path)}`);
}
