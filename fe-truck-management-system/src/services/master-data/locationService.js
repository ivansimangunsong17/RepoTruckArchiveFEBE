import { httpClient } from '../api/httpClient';

export function fetchLocations({ destinationId = '', status = '', query = '' } = {}) {
  const params = new URLSearchParams();
  if (destinationId) params.set('destinationId', destinationId);
  if (status) params.set('status', status);
  if (query) params.set('query', query);
  const queryString = params.toString();
  return httpClient.get(`/locations${queryString ? `?${queryString}` : ''}`);
}
