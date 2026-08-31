import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  calculateDestinationUj,
  getMasterRow,
  getMasterViewerNote,
  listMasterRows,
  listMasterRowsPage,
  removeMasterRow,
  saveMasterRow,
  saveMasterViewerNote,
  setVehicleDefaultDriver,
} from './master.service.js';

function isDestinationResource(resource) {
  return resource === 'destinations';
}

function destinationUjChanged(before, after) {
  if (!before || !after) return false;
  return Number(before.uj20ft || 0) !== Number(after.uj20ft || 0)
    || Number(before.uj40ft || 0) !== Number(after.uj40ft || 0)
    || Number(before.driverCommission20ftAmount || 0) !== Number(after.driverCommission20ftAmount || 0)
    || Number(before.driverCommission40ftAmount || 0) !== Number(after.driverCommission40ftAmount || 0)
    || String(before.ujNotes || '') !== String(after.ujNotes || '');
}

// Nama action untuk trucks/destinations dipertahankan PERSIS seperti sebelumnya (dipakai di
// tempat lain, mis. filter activity log) -- resource master data lainnya (customers, drivers,
// end-users, kir-heads, kir-chassis, depots, terminals, stids, dst) sebelumnya sama sekali tidak
// tercatat di activity log; sekarang semua resource dicatat lewat action generik yang sama.
function resourceActionNames(resource, { before, after } = {}) {
  if (resource === 'trucks') {
    return { entityType: 'vehicle', create: 'CREATE_VEHICLE', update: 'UPDATE_VEHICLE', archive: 'DELETE_VEHICLE' };
  }
  if (isDestinationResource(resource)) {
    return {
      entityType: 'destination',
      create: 'CREATE_DESTINATION',
      update: destinationUjChanged(before, after) ? 'UPDATE_DESTINATION_UJ' : 'UPDATE_DESTINATION',
      archive: 'DELETE_DESTINATION',
    };
  }
  const upperSnake = String(resource || '').replace(/-/g, '_').toUpperCase();
  return {
    entityType: resource,
    create: `CREATE_MASTER_${upperSnake}`,
    update: `UPDATE_MASTER_${upperSnake}`,
    archive: `DELETE_MASTER_${upperSnake}`,
  };
}

export async function listMasterController(request, response) {
  const rows = await listMasterRows(request.params.resource);
  sendSuccess(response, rows);
}

export async function listMasterPageController(request, response) {
  const result = await listMasterRowsPage(request.params.resource, request.query);
  sendSuccess(response, result);
}

export async function getMasterController(request, response) {
  const row = await getMasterRow(request.params.resource, request.params.id);
  sendSuccess(response, row);
}

export async function createMasterController(request, response) {
  const saved = await saveMasterRow(request.params.resource, request.body);
  const names = resourceActionNames(request.params.resource);
  await safeRecordActivityLog(request, {
    action: names.create,
    module: names.entityType === 'vehicle' ? 'vehicles' : 'master_data',
    entityType: names.entityType,
    entityId: saved.id,
    afterData: saved,
  });
  sendSuccess(response, saved, 'Data master berhasil disimpan.', 201);
}

export async function updateMasterController(request, response) {
  const before = await getMasterRow(request.params.resource, request.params.id);
  const saved = await saveMasterRow(request.params.resource, request.body, request.params.id);
  const names = resourceActionNames(request.params.resource, { before, after: saved });
  await safeRecordActivityLog(request, {
    action: names.update,
    module: names.entityType === 'vehicle' ? 'vehicles' : 'master_data',
    entityType: names.entityType,
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
  });
  sendSuccess(response, saved, 'Data master berhasil diperbarui.');
}

export async function updateVehicleDefaultDriverController(request, response) {
  const { before, after, reason } = await setVehicleDefaultDriver(request.params.id, request.body);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_TRUCK_DEFAULT_DRIVER',
    module: 'vehicles',
    entityType: 'vehicle',
    entityId: after.id,
    beforeData: { defaultDriverId: before.defaultDriverId, defaultDriver: before.defaultDriver },
    afterData: { defaultDriverId: after.defaultDriverId, defaultDriver: after.defaultDriver },
    metadata: {
      truckId: after.id,
      plateNumber: after.plateNumber,
      unitCode: after.unitCode,
      previousDefaultDriverId: before.defaultDriverId,
      previousDefaultDriverName: before.defaultDriver,
      nextDefaultDriverId: after.defaultDriverId,
      nextDefaultDriverName: after.defaultDriver,
      reason,
    },
  });
  sendSuccess(response, after, 'Default sopir truck berhasil diperbarui.');
}

export async function archiveMasterController(request, response) {
  const before = await getMasterRow(request.params.resource, request.params.id);
  await removeMasterRow(request.params.resource, request.params.id);
  const names = resourceActionNames(request.params.resource);
  await safeRecordActivityLog(request, {
    action: names.archive,
    module: names.entityType === 'vehicle' ? 'vehicles' : 'master_data',
    entityType: names.entityType,
    entityId: request.params.id,
    beforeData: before,
    afterData: null,
  });
  sendSuccess(response, { id: request.params.id }, 'Data master berhasil diarsipkan.');
}

export async function calculateDestinationUjController(request, response) {
  const result = await calculateDestinationUj(request.params.id, request.query);
  sendSuccess(response, result);
}

export async function getMasterViewerNoteController(request, response) {
  const result = await getMasterViewerNote(request.params.resource, request.params.id);
  sendSuccess(response, result);
}

export async function updateMasterViewerNoteController(request, response) {
  const before = await getMasterViewerNote(request.params.resource, request.params.id);
  const saved = await saveMasterViewerNote(request.params.resource, request.params.id, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_MASTER_VIEWER_NOTE',
    module: 'master_data',
    entityType: request.params.resource,
    entityId: request.params.id,
    beforeData: before,
    afterData: saved,
  });
  sendSuccess(response, saved, 'Catatan monitoring berhasil disimpan.');
}
