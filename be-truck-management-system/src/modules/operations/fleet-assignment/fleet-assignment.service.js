import { updateVehicleDefaultDriver } from '../../master/master.repository.js';
import {
  getVehicleAssignmentHistory,
  listFleetAssignments,
  updateFleetVehicleChassis,
} from './fleet-assignment.repository.js';

const FLEET_ASSIGNMENT_REASON_MIN_LENGTH = 8;

function requireReason(payload) {
  const reason = String(payload.reason || '').trim();
  if (reason.length < FLEET_ASSIGNMENT_REASON_MIN_LENGTH) {
    const error = new Error(`Alasan wajib diisi minimal ${FLEET_ASSIGNMENT_REASON_MIN_LENGTH} karakter.`);
    error.statusCode = 400;
    error.code = 'FLEET_ASSIGNMENT_REASON_REQUIRED';
    throw error;
  }
  return reason;
}

export function getFleetAssignments(filters = {}) {
  return listFleetAssignments(filters);
}

export async function setFleetVehicleDefaultDriver(vehicleId, payload = {}) {
  const driverId = String(payload.defaultDriverId || payload.driverId || '').trim();
  if (!driverId) {
    const error = new Error('Sopir default wajib dipilih.');
    error.statusCode = 400;
    error.code = 'FLEET_ASSIGNMENT_DRIVER_REQUIRED';
    throw error;
  }
  const reason = requireReason(payload);
  const note = String(payload.note || '').trim();
  const { before, after } = await updateVehicleDefaultDriver(vehicleId, driverId);
  return { before, after, reason, note };
}

export async function setFleetVehicleChassis(vehicleId, payload = {}) {
  const chassisId = String(payload.chassisId || '').trim();
  if (!chassisId) {
    const error = new Error('Chassis wajib dipilih.');
    error.statusCode = 400;
    error.code = 'FLEET_ASSIGNMENT_CHASSIS_REQUIRED';
    throw error;
  }
  const reason = requireReason(payload);
  const note = String(payload.note || '').trim();
  const { before, after } = await updateFleetVehicleChassis(vehicleId, chassisId);
  return { before, after, reason, note };
}

export function getFleetVehicleHistory(vehicleId) {
  return getVehicleAssignmentHistory(vehicleId);
}
