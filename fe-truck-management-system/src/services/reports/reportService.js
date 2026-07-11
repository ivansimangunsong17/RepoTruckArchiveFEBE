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

export function fetchDashboardReport() {
  return httpClient.get('/reports/dashboard');
}

export function fetchSalesOrderReport(params = {}) {
  return httpClient.get(`/reports/sales-orders${buildQuery(params)}`);
}

export function fetchOperationReport(params = {}) {
  return httpClient.get(`/reports/operations${buildQuery(params)}`);
}

export function fetchDocumentReport(params = {}) {
  return httpClient.get(`/reports/documents${buildQuery(params)}`);
}

export function fetchDriverPerformanceReport(params = {}) {
  return httpClient.get(`/reports/driver-performance${buildQuery(params)}`);
}
