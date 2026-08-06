import { httpClient } from '../api/httpClient';

export function fetchHistoricalEntryPeriod(period) {
  return httpClient.get(`/historical-entry/periods/${encodeURIComponent(period)}`);
}

export function updateHistoricalEntryPeriod(period, payload = {}) {
  return httpClient.patch(`/historical-entry/periods/${encodeURIComponent(period)}`, payload);
}
