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
  if (request.params.resource === 'trucks') {
    await safeRecordActivityLog(request, {
      action: 'CREATE_VEHICLE',
      module: 'vehicles',
      entityType: 'vehicle',
      entityId: saved.id,
      afterData: saved,
    });
  } else if (isDestinationResource(request.params.resource)) {
    await safeRecordActivityLog(request, {
      action: 'CREATE_DESTINATION',
      module: 'master_data',
      entityType: 'destination',
      entityId: saved.id,
      afterData: saved,
    });
  }
  sendSuccess(response, saved, 'Data master berhasil disimpan.', 201);
}

export async function updateMasterController(request, response) {
  const before = request.params.resource === 'trucks' || isDestinationResource(request.params.resource)
    ? await getMasterRow(request.params.resource, request.params.id)
    : null;
  const saved = await saveMasterRow(request.params.resource, request.body, request.params.id);
  if (request.params.resource === 'trucks') {
    await safeRecordActivityLog(request, {
      action: 'UPDATE_VEHICLE',
      module: 'vehicles',
      entityType: 'vehicle',
      entityId: saved.id,
      beforeData: before,
      afterData: saved,
    });
  } else if (isDestinationResource(request.params.resource)) {
    await safeRecordActivityLog(request, {
      action: destinationUjChanged(before, saved) ? 'UPDATE_DESTINATION_UJ' : 'UPDATE_DESTINATION',
      module: 'master_data',
      entityType: 'destination',
      entityId: saved.id,
      beforeData: before,
      afterData: saved,
    });
  }
  sendSuccess(response, saved, 'Data master berhasil diperbarui.');
}

export async function archiveMasterController(request, response) {
  const before = request.params.resource === 'trucks' || isDestinationResource(request.params.resource)
    ? await getMasterRow(request.params.resource, request.params.id)
    : null;
  await removeMasterRow(request.params.resource, request.params.id);
  if (request.params.resource === 'trucks') {
    await safeRecordActivityLog(request, {
      action: 'DELETE_VEHICLE',
      module: 'vehicles',
      entityType: 'vehicle',
      entityId: request.params.id,
      beforeData: before,
      afterData: null,
    });
  } else if (isDestinationResource(request.params.resource)) {
    await safeRecordActivityLog(request, {
      action: 'DELETE_DESTINATION',
      module: 'master_data',
      entityType: 'destination',
      entityId: request.params.id,
      beforeData: before,
      afterData: null,
    });
  }
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
