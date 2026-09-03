import { sendSuccess } from '../../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../../activity-logs/activity-logs.service.js';
import {
  getFleetAssignments,
  getFleetVehicleHistory,
  setFleetVehicleChassis,
  setFleetVehicleDefaultDriver,
} from './fleet-assignment.service.js';
import { recordVehicleAssignmentHistory } from './fleet-assignment.repository.js';

async function safeRecordVehicleAssignmentHistory(payload) {
  try {
    await recordVehicleAssignmentHistory(payload);
  } catch (error) {
    console.error('Gagal mencatat vehicle_assignment_history', error);
  }
}

export async function listFleetAssignmentsController(request, response) {
  const result = await getFleetAssignments(request.query);
  sendSuccess(response, result);
}

export async function updateFleetDefaultDriverController(request, response) {
  const { before, after, reason, note } = await setFleetVehicleDefaultDriver(request.params.vehicleId, request.body);
  const actorName = request.user?.name || '';
  const actorRole = request.user?.role || '';

  await safeRecordVehicleAssignmentHistory({
    vehicleId: after.id,
    changeType: 'default_driver',
    previousDriverId: before.defaultDriverId,
    previousDriverName: before.defaultDriver,
    nextDriverId: after.defaultDriverId,
    nextDriverName: after.defaultDriver,
    reason,
    note,
    actorName,
    actorRole,
  });

  await safeRecordActivityLog(request, {
    action: 'UPDATE_FLEET_DEFAULT_DRIVER',
    module: 'fleet_assignment',
    entityType: 'vehicle',
    entityId: after.id,
    beforeData: { defaultDriverId: before.defaultDriverId, defaultDriver: before.defaultDriver },
    afterData: { defaultDriverId: after.defaultDriverId, defaultDriver: after.defaultDriver },
    metadata: {
      vehicleId: after.id,
      plateNumber: after.plateNumber,
      unitCode: after.unitCode,
      previousDefaultDriverId: before.defaultDriverId,
      previousDefaultDriverName: before.defaultDriver,
      nextDefaultDriverId: after.defaultDriverId,
      nextDefaultDriverName: after.defaultDriver,
      reason,
      note,
    },
  });

  sendSuccess(response, after, 'Assignment armada diperbarui. Berlaku untuk ritasi baru berikutnya.');
}

export async function updateFleetChassisController(request, response) {
  const { before, after, reason, note } = await setFleetVehicleChassis(request.params.vehicleId, request.body);
  const actorName = request.user?.name || '';
  const actorRole = request.user?.role || '';

  await safeRecordVehicleAssignmentHistory({
    vehicleId: after.id,
    changeType: 'chassis',
    previousChassisId: before.currentChassisId,
    previousChassisCode: before.currentChassisCode,
    nextChassisId: after.currentChassisId,
    nextChassisCode: after.currentChassisCode,
    reason,
    note,
    actorName,
    actorRole,
  });

  await safeRecordActivityLog(request, {
    action: 'UPDATE_FLEET_CHASSIS',
    module: 'fleet_assignment',
    entityType: 'vehicle',
    entityId: after.id,
    beforeData: { currentChassisId: before.currentChassisId, currentChassisCode: before.currentChassisCode },
    afterData: { currentChassisId: after.currentChassisId, currentChassisCode: after.currentChassisCode },
    metadata: {
      vehicleId: after.id,
      previousChassisId: before.currentChassisId,
      previousChassisCode: before.currentChassisCode,
      nextChassisId: after.currentChassisId,
      nextChassisCode: after.currentChassisCode,
      reason,
      note,
    },
  });

  sendSuccess(response, after, 'Assignment armada diperbarui. Berlaku untuk ritasi baru berikutnya.');
}

export async function getFleetVehicleHistoryController(request, response) {
  const rows = await getFleetVehicleHistory(request.params.vehicleId);
  sendSuccess(response, rows);
}
