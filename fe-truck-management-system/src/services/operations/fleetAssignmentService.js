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

export function fetchFleetAssignments(params = {}) {
  return httpClient.get(`/operations/fleet-assignment${buildQuery(params)}`);
}

export function updateFleetDefaultDriver(vehicleId, payload = {}) {
  if (!vehicleId) throw new Error('Unit belum dipilih.');
  if (!payload.defaultDriverId) throw new Error('Sopir default wajib dipilih.');
  return httpClient.patch(`/operations/fleet-assignment/${vehicleId}/default-driver`, payload);
}

export function updateFleetChassis(vehicleId, payload = {}) {
  if (!vehicleId) throw new Error('Unit belum dipilih.');
  if (!payload.chassisId) throw new Error('Chassis wajib dipilih.');
  return httpClient.patch(`/operations/fleet-assignment/${vehicleId}/chassis`, payload);
}

export function fetchFleetAssignmentHistory(vehicleId) {
  if (!vehicleId) throw new Error('Unit belum dipilih.');
  return httpClient.get(`/operations/fleet-assignment/${vehicleId}/history`);
}
