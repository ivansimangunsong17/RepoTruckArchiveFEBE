import { httpClient } from '../api/httpClient';

export function fetchHinoStatus() {
  return httpClient.get('/telematics/hino/status');
}

export function generateHinoToken(payload = {}) {
  return httpClient.post('/telematics/hino/token', payload);
}

export function syncHinoVehicles(payload = {}) {
  return httpClient.post('/telematics/hino/vehicles/sync', payload);
}

export function syncHinoVehiclePositions(payload = {}) {
  return httpClient.post('/telematics/hino/vehiclepositions/sync', payload);
}

export function fetchHinoVehicles() {
  return httpClient.get('/telematics/hino/vehicles');
}

export function fetchLiveHinoVehiclePositions() {
  return httpClient.get('/telematics/vehicles/live');
}

export function linkHinoVehicle(hinoVehicleId, vehicleId) {
  if (!hinoVehicleId) throw new Error('Kendaraan HINO belum dipilih.');
  if (!vehicleId) throw new Error('Truck Armada wajib dipilih.');
  return httpClient.patch(`/telematics/hino/vehicles/${encodeURIComponent(hinoVehicleId)}/link`, { vehicleId });
}

export function unlinkHinoVehicle(hinoVehicleId) {
  if (!hinoVehicleId) throw new Error('Kendaraan HINO belum dipilih.');
  return httpClient.delete(`/telematics/hino/vehicles/${encodeURIComponent(hinoVehicleId)}/link`);
}
