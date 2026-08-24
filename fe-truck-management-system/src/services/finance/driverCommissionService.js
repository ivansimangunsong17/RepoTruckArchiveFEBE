import { httpClient } from '../api/httpClient';
import { compressImageFile } from '../../utils/imageCompression';
import { validateArchiveFile, validateFinalUploadFile } from '../../utils/fileValidation';

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export function fetchEligibleDriverCommissions(params = {}) {
  return httpClient.get(`/driver-commissions/eligible${buildQuery(params)}`);
}

export function fetchDriverCommissionBatches(params = {}) {
  return httpClient.get(`/driver-commissions/batches${buildQuery(params)}`);
}

export function fetchDriverCommissionPeriodReport(params = {}) {
  return httpClient.get(`/driver-commissions/period-report${buildQuery(params)}`);
}

export function fetchDriverCommissionBatchDetail(id) {
  return httpClient.get(`/driver-commissions/batches/${encodeURIComponent(id)}`);
}

export function submitDriverCommissionBatch(payload = {}) {
  return httpClient.post('/driver-commissions/batches', payload);
}

export function approveDriverCommissionBatch(id) {
  return httpClient.patch(`/driver-commissions/batches/${encodeURIComponent(id)}/approve`, {});
}

export function rejectDriverCommissionBatch(id, rejectionNote = '') {
  return httpClient.patch(`/driver-commissions/batches/${encodeURIComponent(id)}/reject`, { rejectionNote });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function readFileWithFileReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File gagal dibaca. Tutup file dari aplikasi lain lalu pilih ulang.'));
    reader.readAsDataURL(file);
  });
}

async function readFileAsDataUrl(file) {
  if (typeof file?.arrayBuffer === 'function') {
    try {
      const buffer = await file.arrayBuffer();
      return `data:${file.type || 'application/octet-stream'};base64,${arrayBufferToBase64(buffer)}`;
    } catch {
      return readFileWithFileReader(file);
    }
  }
  return readFileWithFileReader(file);
}

export async function uploadDriverCommissionTransferProof(id, file, payload = {}) {
  const uploadFile = file?.type?.startsWith('image/') ? await compressImageFile(file) : file;
  const validationError = validateArchiveFile(uploadFile, { label: 'Bukti transfer komisi' })
    || validateFinalUploadFile(uploadFile, { label: 'Bukti transfer komisi' });
  if (validationError) throw new Error(validationError);

  const fileBase64 = await readFileAsDataUrl(uploadFile);
  return httpClient.post(`/driver-commissions/payments/${encodeURIComponent(id)}/transfer-proof`, {
    ...payload,
    fileName: uploadFile.name,
    mimeType: uploadFile.type || 'application/octet-stream',
    fileSize: uploadFile.size,
    fileBase64,
  });
}
