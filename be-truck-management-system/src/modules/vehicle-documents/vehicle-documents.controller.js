import { sendError, sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  createVehicleDocument,
  deleteVehicleDocument,
  getVehicleDocument,
  listVehicleDocuments,
  resolveVehicleDocumentFile,
  streamVehicleDocument,
  updateVehicleDocument,
} from './vehicle-documents.service.js';

function withoutFilePayload(payload = {}) {
  const { fileBase64, ...safePayload } = payload || {};
  return safePayload;
}

export async function listVehicleDocumentsController(request, response) {
  const rows = await listVehicleDocuments(request.params.vehicleId);
  sendSuccess(response, rows);
}

export async function createVehicleDocumentController(request, response) {
  const saved = await createVehicleDocument(request.params.vehicleId, request.body, request.user?.name);
  await safeRecordActivityLog(request, {
    action: 'CREATE_VEHICLE_DOCUMENT',
    module: 'vehicle_documents',
    entityType: 'vehicle_document',
    entityId: saved.id,
    afterData: saved,
    metadata: withoutFilePayload(request.body),
  });
  sendSuccess(response, saved, 'Dokumen kendaraan berhasil disimpan.', 201);
}

export async function updateVehicleDocumentController(request, response) {
  const before = await getVehicleDocument(request.params.vehicleId, request.params.documentId);
  const saved = await updateVehicleDocument(request.params.vehicleId, request.params.documentId, request.body);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_VEHICLE_DOCUMENT',
    module: 'vehicle_documents',
    entityType: 'vehicle_document',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
    metadata: withoutFilePayload(request.body),
  });
  sendSuccess(response, saved, 'Dokumen kendaraan berhasil diperbarui.');
}

export async function deleteVehicleDocumentController(request, response) {
  const before = await getVehicleDocument(request.params.vehicleId, request.params.documentId);
  const deleted = await deleteVehicleDocument(
    request.params.vehicleId,
    request.params.documentId,
    request.user,
    request.query?.reason,
  );
  await safeRecordActivityLog(request, {
    action: 'DELETE_VEHICLE_DOCUMENT',
    module: 'vehicle_documents',
    entityType: 'vehicle_document',
    entityId: request.params.documentId,
    beforeData: before || deleted,
    afterData: null,
    metadata: {
      vehicleId: request.params.vehicleId,
      documentType: deleted.documentType,
      trashId: deleted.trashId,
    },
  });
  sendSuccess(response, deleted, 'Dokumen kendaraan dipindahkan ke recycle bin.');
}

export async function downloadVehicleDocumentController(request, response) {
  const document = await getVehicleDocument(request.params.vehicleId, request.params.documentId);
  if (!document) {
    sendError(response, { code: 'VEHICLE_DOCUMENT_NOT_FOUND', message: 'Dokumen kendaraan tidak ditemukan.' }, 404);
    return;
  }
  const filePath = await resolveVehicleDocumentFile(document);
  if (!filePath) {
    sendError(response, { code: 'VEHICLE_DOCUMENT_FILE_MISSING', message: 'File dokumen kendaraan tidak tersedia di storage.' }, 404);
    return;
  }
  await safeRecordActivityLog(request, {
    action: 'DOWNLOAD_VEHICLE_DOCUMENT',
    module: 'vehicle_documents',
    entityType: 'vehicle_document',
    entityId: document.id,
    metadata: {
      vehicleId: request.params.vehicleId,
      documentType: document.documentType,
    },
  });
  streamVehicleDocument(response, document, filePath);
}
