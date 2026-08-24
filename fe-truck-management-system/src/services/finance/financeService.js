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

export function fetchFinanceDashboard(params = {}) {
  return httpClient.get(`/finance/dashboard${buildQuery(params)}`);
}

export function fetchFinanceOrderVerifications(params = {}) {
  return httpClient.get(`/finance/order-verifications${buildQuery(params)}`);
}

export function updateFinanceOrderSoNumber(id, soNumber) {
  return httpClient.patch(`/finance/order-verifications/${encodeURIComponent(id)}/so-number`, { soNumber });
}

export function addFinanceOrderLineItem(id, payload = {}) {
  return httpClient.post(`/finance/order-verifications/${encodeURIComponent(id)}/line-items`, payload);
}

export function fetchFinanceOrderCorrections(id) {
  return httpClient.get(`/finance/order-verifications/${encodeURIComponent(id)}/corrections`);
}

export function requestFinanceOrderSoCorrection(id, payload = {}) {
  return httpClient.post(`/finance/order-verifications/${encodeURIComponent(id)}/corrections`, payload);
}

export function fetchFinanceRpujRequests(params = {}) {
  return httpClient.get(`/finance/rpuj-requests${buildQuery(params)}`);
}

export function fetchOperationalFundRequests(params = {}) {
  return httpClient.get(`/finance/operational-fund-requests${buildQuery(params)}`);
}

export function fetchOperationalFundBatches(params = {}) {
  return httpClient.get(`/finance/operational-fund-batches${buildQuery(params)}`);
}

export function fetchOperationalFundTransactions(params = {}) {
  return httpClient.get(`/finance/operational-fund-transactions${buildQuery(params)}`);
}

export function createOperationalFundRequest(payload = {}) {
  return httpClient.post('/finance/operational-fund-requests', payload);
}

function getRawFile(file) {
  if (!file) return null;
  if (typeof File !== 'undefined' && file instanceof File) return file;
  if (typeof File !== 'undefined' && file.rawFile instanceof File) return file.rawFile;
  return null;
}

export async function depositOperationalFund(payload = {}) {
  const proofFile = getRawFile(payload.proofFile);
  if (!proofFile) {
    return httpClient.post('/finance/operational-fund-deposits', payload);
  }

  const uploadFile = await compressImageFile(proofFile);
  const validationError = validateFinalUploadFile(uploadFile);
  if (validationError) throw new Error(validationError);
  const fileBase64 = await readFileAsDataUrl(uploadFile);
  return httpClient.post('/finance/operational-fund-deposits', {
    requestDate: payload.requestDate,
    amount: payload.amount,
    purpose: payload.purpose,
    fileName: uploadFile.name,
    mimeType: uploadFile.type,
    fileSize: uploadFile.size,
    fileBase64,
  });
}

export function approveOperationalFundRequest(id) {
  return httpClient.patch(`/finance/operational-fund-requests/${encodeURIComponent(id)}/approve`, {});
}

export function rejectOperationalFundRequest(id, rejectionNote = '') {
  return httpClient.patch(`/finance/operational-fund-requests/${encodeURIComponent(id)}/reject`, { rejectionNote });
}

export function closeOperationalFundBatch(id, payload = {}) {
  return httpClient.patch(`/finance/operational-fund-batches/${encodeURIComponent(id)}/close`, payload);
}

export function fetchFinanceContainerJobExpenses(params = {}) {
  return httpClient.get(`/finance/container-job-expenses${buildQuery(params)}`);
}

export function reconcileFinanceContainerJobExpense(id, payload = {}) {
  return httpClient.patch(`/finance/container-job-expenses/${encodeURIComponent(id)}/reconcile`, payload);
}

export function approveFinanceRpuj(id) {
  return httpClient.patch(`/finance/rpuj-requests/${encodeURIComponent(id)}/approve`, {});
}

export function rejectFinanceRpuj(id, rejectionNote = '') {
  return httpClient.patch(`/finance/rpuj-requests/${encodeURIComponent(id)}/reject`, { rejectionNote });
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

export async function uploadFinanceRpujTransferProof(id, file) {
  const uploadFile = await compressImageFile(file);
  const validationError = validateFinalUploadFile(uploadFile);
  if (validationError) throw new Error(validationError);
  const fileBase64 = await readFileAsDataUrl(uploadFile);
  return httpClient.post(`/finance/rpuj-requests/${encodeURIComponent(id)}/transfer-proof`, {
    fileName: uploadFile.name,
    mimeType: uploadFile.type,
    fileSize: uploadFile.size,
    fileBase64,
  });
}

export async function uploadOperationalFundTransferProof(id, file) {
  const uploadFile = await compressImageFile(file);
  const validationError = validateFinalUploadFile(uploadFile);
  if (validationError) throw new Error(validationError);
  const fileBase64 = await readFileAsDataUrl(uploadFile);
  return httpClient.post(`/finance/operational-fund-requests/${encodeURIComponent(id)}/transfer-proof`, {
    fileName: uploadFile.name,
    mimeType: uploadFile.type,
    fileSize: uploadFile.size,
    fileBase64,
  });
}

export function fetchFinanceInvoices(params = {}) {
  return httpClient.get(`/finance/invoices${buildQuery(params)}`);
}

export function fetchFinanceInvoiceDetail(id) {
  return httpClient.get(`/finance/invoices/${encodeURIComponent(id)}`);
}

export function updateFinanceInvoiceNumber(id, invoiceNumber) {
  return httpClient.patch(`/finance/invoices/${encodeURIComponent(id)}/number`, { invoiceNumber });
}

export async function uploadFinanceInvoiceDocument(id, documentType, file) {
  const label = documentType === 'taxInvoice' ? 'Faktur Pajak' : 'Invoice';
  const validationError = validateArchiveFile(file, {
    label,
    allowedTypes: ['application/pdf'],
    allowedExtensions: ['pdf'],
    allowedLabel: 'PDF',
  }) || validateFinalUploadFile(file, { label });
  if (validationError) throw new Error(validationError);

  const fileBase64 = await readFileAsDataUrl(file);
  return httpClient.post(`/finance/invoices/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentType)}`, {
    fileName: file.name,
    mimeType: file.type || 'application/pdf',
    fileSize: file.size,
    fileBase64,
  });
}

export function fetchFinanceOutstanding(params = {}) {
  return httpClient.get(`/finance/outstanding${buildQuery(params)}`);
}

export function fetchFinanceInvoicePayments(id) {
  return httpClient.get(`/finance/invoices/${encodeURIComponent(id)}/payments`);
}

export async function recordFinanceInvoicePayment(id, payload = {}, proofFile) {
  const validationError = validateArchiveFile(proofFile, { label: 'Bukti transfer' })
    || validateFinalUploadFile(proofFile, { label: 'Bukti transfer' });
  if (validationError) throw new Error(validationError);

  const uploadFile = proofFile.type?.startsWith('image/') ? await compressImageFile(proofFile) : proofFile;
  const fileBase64 = await readFileAsDataUrl(uploadFile);
  return httpClient.post(`/finance/invoices/${encodeURIComponent(id)}/payments`, {
    ...payload,
    proofFile: {
      fileName: uploadFile.name,
      mimeType: uploadFile.type || 'application/octet-stream',
      fileSize: uploadFile.size,
      fileBase64,
    },
  });
}

export function fetchFinanceInvoiceCorrections(id) {
  return httpClient.get(`/finance/invoices/${encodeURIComponent(id)}/corrections`);
}

export function requestFinanceInvoiceCorrection(id, payload = {}) {
  return httpClient.post(`/finance/invoices/${encodeURIComponent(id)}/corrections`, payload);
}

export function fetchFinanceCorrections(params = {}) {
  return httpClient.get(`/finance/corrections${buildQuery(params)}`);
}

export function approveFinanceCorrection(id, reviewNote = '') {
  return httpClient.patch(`/finance/corrections/${encodeURIComponent(id)}/approve`, { reviewNote });
}

export function rejectFinanceCorrection(id, reviewNote = '') {
  return httpClient.patch(`/finance/corrections/${encodeURIComponent(id)}/reject`, { reviewNote });
}

export function fetchFinanceCompletedTrips(params = {}) {
  return httpClient.get(`/finance/completed-trips${buildQuery(params)}`);
}

export function fetchFinanceCompletedTripDetail(id) {
  return httpClient.get(`/finance/completed-trips/${encodeURIComponent(id)}`);
}
