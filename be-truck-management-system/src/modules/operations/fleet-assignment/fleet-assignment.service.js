import { updateVehicleChassis, updateVehicleDefaultDriver } from '../../master/master.repository.js';
import {
  getVehicleAssignmentHistory,
  listFleetAssignments,
} from './fleet-assignment.repository.js';

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
  const reason = String(payload.reason || '').trim();
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
  const reason = String(payload.reason || '').trim();
  const note = String(payload.note || '').trim();
  const { before, after } = await updateVehicleChassis(vehicleId, chassisId, {
    source: 'fleet_assignment',
    reason,
    note,
    actorName: payload.actorName || '',
    actorRole: payload.actorRole || '',
  });
  return { before, after, reason, note };
}

export function getFleetVehicleHistory(vehicleId) {
  return getVehicleAssignmentHistory(vehicleId);
}
