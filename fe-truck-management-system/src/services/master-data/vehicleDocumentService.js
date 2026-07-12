import { httpClient } from '../api/httpClient';
import { getAuthToken } from '../auth/authTokenStore';
import { API_BASE_URL } from '../config/dataSource';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File gagal dibaca.'));
    reader.readAsDataURL(file);
  });
}

async function toPayload(form) {
  const payload = {
    documentType: form.documentType,
    documentNumber: form.documentNumber,
    issuedDate: form.issuedDate,
    expiredDate: form.expiredDate,
    notes: form.notes,
  };

  if (form.file instanceof File) {
    payload.fileName = form.file.name;
    payload.mimeType = form.file.type;
    payload.fileSize = form.file.size;
    payload.fileBase64 = await readFileAsDataUrl(form.file);
  }

  return payload;
}

export function fetchVehicleDocuments(vehicleId) {
  return httpClient.get(`/vehicles/${vehicleId}/documents`);
}

export async function createVehicleDocument(vehicleId, form) {
  return httpClient.post(`/vehicles/${vehicleId}/documents`, await toPayload(form));
}

export async function updateVehicleDocument(vehicleId, documentId, form) {
  return httpClient.put(`/vehicles/${vehicleId}/documents/${documentId}`, await toPayload(form));
}

export function deleteVehicleDocument(vehicleId, documentId) {
  return httpClient.delete(`/vehicles/${vehicleId}/documents/${documentId}`);
}

export function createVehicleDocumentDownloadUrl(vehicleId, documentId) {
  const token = getAuthToken();
  const query = token ? `?access_token=${encodeURIComponent(token)}` : '';
  return `${API_BASE_URL}/vehicles/${vehicleId}/documents/${documentId}/download${query}`;
}
