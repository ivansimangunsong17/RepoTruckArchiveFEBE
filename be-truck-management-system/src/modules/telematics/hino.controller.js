import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  generateHinoToken,
  getCachedHinoVehicleCatalog,
  getHinoTelematicsStatus,
  getLiveHinoVehiclePositions,
  linkHinoVehicleMapping,
  syncHinoVehicleCatalog,
  syncHinoVehiclePositions,
  syncHinoVehicles,
  unlinkHinoVehicleMapping,
} from './hino.service.js';

export async function hinoTelematicsStatusController(_request, response) {
  const result = await getHinoTelematicsStatus();
  sendSuccess(response, result);
}

export async function liveHinoVehiclePositionsController(_request, response) {
  const result = await getLiveHinoVehiclePositions();
  sendSuccess(response, result);
}

export async function cachedHinoVehiclesController(_request, response) {
  const result = await getCachedHinoVehicleCatalog();
  sendSuccess(response, result);
}

export async function syncHinoVehiclesController(request, response) {
  const result = await syncHinoVehicles({
    force: Boolean(request.body?.force),
    forceTokenRefresh: Boolean(request.body?.forceTokenRefresh),
  });
  sendSuccess(response, result, 'Sync HINO CONNECT selesai.');
}

export async function syncHinoVehicleCatalogController(request, response) {
  const result = await syncHinoVehicleCatalog({
    force: Boolean(request.body?.force),
    forceTokenRefresh: Boolean(request.body?.forceTokenRefresh),
  });
  sendSuccess(response, result, 'Sync daftar kendaraan HINO selesai.');
}

export async function syncHinoVehiclePositionsController(request, response) {
  const result = await syncHinoVehiclePositions({
    force: Boolean(request.body?.force),
    forceTokenRefresh: Boolean(request.body?.forceTokenRefresh),
  });
  sendSuccess(response, result, 'Sync posisi kendaraan HINO selesai.');
}

export async function generateHinoTokenController(request, response) {
  const result = await generateHinoToken({
    forceRefresh: Boolean(request.body?.forceRefresh),
  });
  sendSuccess(response, result, 'Token HINO CONNECT berhasil dibuat.');
}

export async function linkHinoVehicleController(request, response) {
  const result = await linkHinoVehicleMapping(request.params.hinoVehicleId, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'LINK_HINO_VEHICLE',
    module: 'telematics',
    entityType: 'hino_vehicle_link',
    entityId: request.params.hinoVehicleId,
    beforeData: result.before,
    afterData: result.after,
    metadata: {
      hinoVehicleId: request.params.hinoVehicleId,
      vehicleId: request.body?.vehicleId || null,
    },
  });
  sendSuccess(response, result.after, 'Kendaraan HINO berhasil dihubungkan ke truck Armada.');
}

export async function unlinkHinoVehicleController(request, response) {
  const result = await unlinkHinoVehicleMapping(request.params.hinoVehicleId);
  await safeRecordActivityLog(request, {
    action: 'UNLINK_HINO_VEHICLE',
    module: 'telematics',
    entityType: 'hino_vehicle_link',
    entityId: request.params.hinoVehicleId,
    beforeData: result.before,
    afterData: result.after,
    metadata: {
      hinoVehicleId: request.params.hinoVehicleId,
    },
  });
  sendSuccess(response, result.after, 'Hubungan kendaraan HINO dengan truck Armada berhasil dilepas.');
}
