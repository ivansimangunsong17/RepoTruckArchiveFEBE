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

export function fetchMonthlyRevenueReport(params = {}) {
  return httpClient.get(`/reports/monthly-revenue${buildQuery(params)}`);
}

export function fetchMonthlyComparisonReport(params = {}) {
  return httpClient.get(`/reports/monthly-comparison${buildQuery(params)}`);
}

export function fetchSalesPerformanceReport(params = {}) {
  return httpClient.get(`/reports/sales-performance${buildQuery(params)}`);
}

export function fetchCustomerPerformanceReport(params = {}) {
  return httpClient.get(`/reports/customer-performance${buildQuery(params)}`);
}

export function fetchOperationReport(params = {}) {
  return httpClient.get(`/reports/operations${buildQuery(params)}`);
}

export function fetchUtilizationTrips(params = {}) {
  return httpClient.get(`/reports/utilization-trips${buildQuery(params)}`);
}

export function fetchDocumentReport(params = {}) {
  return httpClient.get(`/reports/documents${buildQuery(params)}`);
}

export function fetchDriverPerformanceReport(params = {}) {
  return httpClient.get(`/reports/driver-performance${buildQuery(params)}`);
}

export function fetchInputMonitoringReport(params = {}) {
  return httpClient.get(`/reports/input-monitoring${buildQuery(params)}`);
}
