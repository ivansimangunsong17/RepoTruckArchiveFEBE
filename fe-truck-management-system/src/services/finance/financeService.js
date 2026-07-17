import { httpClient } from '../api/httpClient';

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

export function fetchFinanceRpujRequests(params = {}) {
  return httpClient.get(`/finance/rpuj-requests${buildQuery(params)}`);
}

export function approveFinanceRpuj(id) {
  return httpClient.patch(`/finance/rpuj-requests/${encodeURIComponent(id)}/approve`, {});
}

export function rejectFinanceRpuj(id, rejectionNote = '') {
  return httpClient.patch(`/finance/rpuj-requests/${encodeURIComponent(id)}/reject`, { rejectionNote });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File gagal dibaca.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadFinanceRpujTransferProof(id, file) {
  const fileBase64 = await readFileAsDataUrl(file);
  return httpClient.post(`/finance/rpuj-requests/${encodeURIComponent(id)}/transfer-proof`, {
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    fileBase64,
  });
}

export function fetchFinanceInvoices(params = {}) {
  return httpClient.get(`/finance/invoices${buildQuery(params)}`);
}

export function updateFinanceInvoiceNumber(id, invoiceNumber) {
  return httpClient.patch(`/finance/invoices/${encodeURIComponent(id)}/number`, { invoiceNumber });
}

export function fetchFinanceCompletedTrips(params = {}) {
  return httpClient.get(`/finance/completed-trips${buildQuery(params)}`);
}

export function fetchFinanceCompletedTripDetail(id) {
  return httpClient.get(`/finance/completed-trips/${encodeURIComponent(id)}`);
}
