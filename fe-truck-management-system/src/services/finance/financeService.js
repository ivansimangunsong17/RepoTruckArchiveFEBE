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

export function fetchFinanceCompletedTrips(params = {}) {
  return httpClient.get(`/finance/completed-trips${buildQuery(params)}`);
}

export function fetchFinanceCompletedTripDetail(id) {
  return httpClient.get(`/finance/completed-trips/${encodeURIComponent(id)}`);
}
