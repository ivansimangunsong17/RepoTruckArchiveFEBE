import { withTransaction } from '../../db/client.js';
import {
  archiveMasterRow,
  clearVehicleDefaultDriver,
  findAllMasterRows,
  findMasterRowById,
  findMasterRows,
  findMasterViewerNotes,
  findVehicleChassisSizeMismatches,
  recordDefaultDriverHistory,
  releaseDriverDefaultAssignments,
  syncVehicleDefaultDriverName,
  updateVehicleChassis,
  updateVehicleDefaultDriver,
  upsertMasterRow,
  upsertMasterViewerNote,
} from './master.repository.js';
import { getResourceConfig } from './master.mapper.js';

const TRUCK_DEFAULT_DRIVER_REASON_MIN_LENGTH = 8;

function parseFilters(query = {}) {
  return Object.entries(query).reduce((filters, [key, value]) => {
    if (['page', 'pageSize', 'query'].includes(key) || !value) return filters;
    filters[key] = value;
    return filters;
  }, {});
}

export function listMasterRows(resource) {
  return findAllMasterRows(resource);
}

export function listMasterRowsPage(resource, query) {
  return findMasterRows(resource, {
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || '',
    filters: parseFilters(query),
  });
}

export function sanitizeMasterResultForActor(resource, result, actor = {}) {
  if (resource !== 'end-users' || String(actor.role || '').toLowerCase() !== 'sales') return result;
  const sanitizeRow = (row = {}) => {
    const sanitized = { ...row };
    delete sanitized.address;
    delete sanitized.googleMapsUrl;
    delete sanitized.latitude;
    delete sanitized.longitude;
    return sanitized;
  };
  if (Array.isArray(result)) return result.map(sanitizeRow);
  if (Array.isArray(result?.data)) return { ...result, data: result.data.map(sanitizeRow) };
  return sanitizeRow(result);
}

export async function getMasterRow(resource, id) {
  const row = await findMasterRowById(resource, id);
  if (!row) {
    const error = new Error('Data master tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'MASTER_NOT_FOUND';
    throw error;
  }
  return row;
}

function normalizeLookupValue(value) {
  return String(value || '').trim().toLowerCase();
}

function isSameChassis(chassis, value) {
  const normalizedValue = normalizeLookupValue(value);
  if (!normalizedValue) return false;
  return [
    chassis.id,
    chassis.chassisCode,
    chassis.kirNumber,
    chassis.plateNumber,
  ].some((candidate) => normalizeLookupValue(candidate) === normalizedValue);
}

const TRUCK_CHASSIS_LOCKED_STATUSES = ['Maintenance', 'Tidak Aktif'];

export function isSameTruckChassis(currentTruck = {}, nextChassis = '') {
  return normalizeLookupValue(currentTruck.kirChassisNumber) === normalizeLookupValue(nextChassis);
}

// Truck Maintenance/Tidak Aktif tetap boleh diedit (termasuk diaktifkan kembali) selama chassis tidak
// diganti -- updateVehicleChassis menolak unit tidak eligible, jadi sinkron chassis hanya dilewati
// untuk kasus "chassis sama". Penggantian chassis pada status itu tetap ditolak di updateVehicleChassis.
export function shouldKeepChassisOfIneligibleTruck(currentTruck = null, payload = {}) {
  return Boolean(
    currentTruck
    && TRUCK_CHASSIS_LOCKED_STATUSES.includes(currentTruck.status)
    && isSameTruckChassis(currentTruck, payload.kirChassisNumber),
  );
}

async function normalizeTruckPayload(payload) {
  const normalizedPayload = {
    ...payload,
    kirHeadNumber: payload.kirNumber || payload.kirHeadNumber || '',
  };

  if (!normalizedPayload.kirChassisNumber) return normalizedPayload;

  const chassisRows = await listMasterRows('kir-chassis');
  const chassis = chassisRows.find((row) => isSameChassis(row, normalizedPayload.kirChassisNumber));
  if (!chassis) {
    const error = new Error('Chassis yang dipilih tidak ditemukan di master chassis.');
    error.statusCode = 400;
    error.code = 'CHASSIS_NOT_FOUND';
    throw error;
  }

  return {
    ...normalizedPayload,
    capacity: chassis.capacity || normalizedPayload.capacity || '20FT',
  };
}

async function normalizePayloadForResource(resource, payload) {
  if (resource === 'trucks') return normalizeTruckPayload(payload);
  return payload;
}

export function shouldDetachDriverFromUnit(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'cuti' || normalized === 'tidak aktif';
}

function driverIdentityNames(...drivers) {
  return drivers.flatMap((driver) => [
    driver?.name,
    driver?.nickname,
  ]);
}

function hasOwnField(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key);
}

// Sopir default Master Truck ditentukan oleh defaultDriverId (bukan teks nama). Mengembalikan null
// bila tidak ada perubahan. Unit legacy (nama tanpa id) tetap dipertahankan kecuali Admin
// mengosongkan sopir secara eksplisit (defaultDriverId dan defaultDriver sama-sama kosong).
export function resolveDefaultDriverChange(payload = {}, current = null) {
  if (!hasOwnField(payload, 'defaultDriverId')) return null;
  const nextId = String(payload.defaultDriverId || '').trim() || null;
  const currentId = current?.defaultDriverId || null;
  if (nextId) return nextId === currentId ? null : { type: 'set', driverId: nextId };
  if (currentId) return { type: 'clear' };
  const legacyName = String(current?.defaultDriver || '').trim();
  const explicitlyCleared = hasOwnField(payload, 'defaultDriver') && !String(payload.defaultDriver || '').trim();
  return legacyName && explicitlyCleared ? { type: 'clear' } : null;
}

// Chassis truck sengaja DIPISAH dari generic upsertMasterRow -- kir_chassis_number (teks lama)
// harus disinkronkan lewat updateVehicleChassis (fungsi yang sama dipakai Assignment Armada) supaya
// validasi eligibility & exclusivity (lepas dari truck lain) selalu jalan, bukan cuma tulis teks
// bebas seperti sebelumnya. Setelah sinkron, kirChassisNumber di payload diisi ulang dengan nilai
// yang SUDAH benar supaya generic update field lain (plat, status, dokumen, dst) tidak menimpanya
// balik dengan nilai basi. Sopir default juga diproses lewat updateVehicleDefaultDriver (validasi
// eligibility + lepas dari truck lain) di transaksi yang sama, sehingga ID dan nama selalu
// tersimpan bersamaan dan tidak ada data parsial bila salah satu langkah gagal.
async function saveTruckRow(payload, id, actor = {}) {
  const hasChassisField = hasOwnField(payload, 'kirChassisNumber');
  const syncChassis = hasChassisField && Boolean(id || String(payload.kirChassisNumber || '').trim());
  const context = {
    source: 'master_truck',
    actorName: actor.name || null,
    actorRole: actor.role || null,
  };

  return withTransaction(async (client) => {
    const currentResult = id
      ? await client.query('select * from vehicles where id = $1 and archived_at is null for update', [id])
      : { rows: [] };
    const current = currentResult.rows[0] ? getResourceConfig('trucks').toApi(currentResult.rows[0]) : null;
    const keepChassisOfIneligibleTruck = shouldKeepChassisOfIneligibleTruck(current, payload);

    let saved;
    if (!id) {
      const { kirChassisNumber, ...restPayload } = payload;
      saved = await upsertMasterRow('trucks', syncChassis ? restPayload : payload, id, client);
      if (syncChassis) saved = (await updateVehicleChassis(saved.id, kirChassisNumber, context, client)).after;
    } else if (syncChassis && !keepChassisOfIneligibleTruck) {
      const { after } = await updateVehicleChassis(id, payload.kirChassisNumber, context, client);
      saved = await upsertMasterRow('trucks', { ...payload, kirChassisNumber: after.kirChassisNumber }, id, client);
    } else {
      saved = await upsertMasterRow('trucks', payload, id, client);
    }

    const change = resolveDefaultDriverChange(payload, current);
    if (!change) return saved;

    const result = change.type === 'set'
      ? await updateVehicleDefaultDriver(saved.id, change.driverId, client)
      : await clearVehicleDefaultDriver(saved.id, client);
    await recordDefaultDriverHistory([
      {
        vehicleId: result.after.id,
        previousDriverId: result.before.defaultDriverId,
        previousDriverName: result.before.defaultDriver,
        nextDriverId: result.after.defaultDriverId,
        nextDriverName: result.after.defaultDriver,
      },
      ...result.detached.map((detached) => ({
        vehicleId: detached.id,
        previousDriverId: detached.previousDriverId,
        previousDriverName: detached.previousDriverName,
        reason: `Sopir dipindahkan ke ${result.after.unitCode || result.after.plateNumber}`,
      })),
    ], context, client);
    return result.after;
  });
}

// Status sopir dan pelepasan hubungan sopir default disimpan di satu transaksi. Hanya kolom
// default_driver_* di vehicles yang disentuh -- container_jobs dan histori ritasi tidak berubah.
async function saveDriverRow(payload, id, actor = {}) {
  const currentDriver = id ? await findMasterRowById('drivers', id) : null;
  return withTransaction(async (client) => {
    const saved = await upsertMasterRow('drivers', payload, id, client);
    if (shouldDetachDriverFromUnit(saved.status)) {
      const released = await releaseDriverDefaultAssignments(saved.id, driverIdentityNames(currentDriver, saved), client);
      await recordDefaultDriverHistory(released.map((vehicle) => ({
        vehicleId: vehicle.id,
        previousDriverId: vehicle.previousDriverId,
        previousDriverName: vehicle.previousDriverName,
      })), {
        source: 'master_truck',
        reason: `Sopir berstatus ${saved.status}`,
        actorName: actor.name || null,
        actorRole: actor.role || null,
      }, client);
    } else {
      await syncVehicleDefaultDriverName(saved.id, saved.name, client);
    }
    return saved;
  });
}

export async function saveMasterRow(resource, payload, id, actor = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload master data harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const normalizedPayload = await normalizePayloadForResource(resource, payload);
  if (resource === 'trucks') return saveTruckRow(normalizedPayload, id, actor);
  if (resource === 'drivers') return saveDriverRow(normalizedPayload, id, actor);
  return upsertMasterRow(resource, normalizedPayload, id);
}

export function removeMasterRow(resource, id) {
  return archiveMasterRow(resource, id);
}

export function listVehicleChassisSizeMismatches() {
  return findVehicleChassisSizeMismatches();
}

// Aksi sadar terpisah dari edit master truck biasa -- Operational cuma boleh mengubah field ini
// (bukan seluruh data truck), dengan alasan wajib supaya perubahan "sopir tetap" truck selalu
// punya jejak kenapa. Validasi eligibility (truck/sopir aktif) ada di repository karena butuh lock
// baris di dalam transaksi yang sama dengan UPDATE-nya.
export async function setVehicleDefaultDriver(vehicleId, payload = {}) {
  const driverId = String(payload.defaultDriverId || payload.driverId || '').trim();
  if (!driverId) {
    const error = new Error('Sopir default wajib dipilih.');
    error.statusCode = 400;
    error.code = 'TRUCK_DEFAULT_DRIVER_DRIVER_REQUIRED';
    throw error;
  }
  const reason = String(payload.reason || '').trim();
  if (reason.length < TRUCK_DEFAULT_DRIVER_REASON_MIN_LENGTH) {
    const error = new Error(`Alasan wajib diisi minimal ${TRUCK_DEFAULT_DRIVER_REASON_MIN_LENGTH} karakter.`);
    error.statusCode = 400;
    error.code = 'TRUCK_DEFAULT_DRIVER_REASON_REQUIRED';
    throw error;
  }
  const { before, after } = await updateVehicleDefaultDriver(vehicleId, driverId);
  return { before, after, reason };
}

export async function getMasterViewerNote(resource, id) {
  await getMasterRow(resource, id);
  return findMasterViewerNotes(resource, id);
}

function assertViewerRole(user = {}) {
  if (user.role === 'observer' || user.role === 'pengamat') return;
  const error = new Error('Catatan monitoring hanya boleh diisi oleh Pengamat/Viewer.');
  error.statusCode = 403;
  error.code = 'VIEWER_NOTE_FORBIDDEN';
  throw error;
}

export async function saveMasterViewerNote(resource, id, payload, user) {
  assertViewerRole(user);
  await getMasterRow(resource, id);
  const documentKey = String(payload?.documentKey || payload?.document_key || 'general').trim() || 'general';
  if (documentKey.length > 80 || !/^[a-zA-Z0-9_.:-]+$/.test(documentKey)) {
    const error = new Error('Kode dokumen catatan tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const note = String(payload?.note || '').trim();
  if (note.length > 1000) {
    const error = new Error('Catatan monitoring maksimal 1000 karakter.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return upsertMasterViewerNote(resource, id, documentKey, note, user);
}

function parseQuantity(value) {
  const quantity = Number(value || 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

export async function calculateDestinationUj(id, query = {}) {
  const destination = await getMasterRow('destinations', id);
  const qty20ft = parseQuantity(query.qty20 ?? query.qty20ft ?? query.qty20FT);
  const qty40ft = parseQuantity(query.qty40 ?? query.qty40ft ?? query.qty40FT);
  const uj20ft = Number(destination.uj20ft || 0);
  const uj40ft = Number(destination.uj40ft || 0);
  const driverCommissionAmount = Number(destination.driverCommissionAmount || 0);
  const driverCommission20ftAmount = Number(destination.driverCommission20ftAmount || driverCommissionAmount || 0);
  const driverCommission40ftAmount = Number(destination.driverCommission40ftAmount || driverCommissionAmount || 0);
  const totalUj20ft = qty20ft * uj20ft;
  const totalUj40ft = qty40ft * uj40ft;

  return {
    destinationId: destination.id,
    destinationName: destination.name,
    uj20ft,
    uj40ft,
    driverCommissionAmount,
    driverCommission20ftAmount,
    driverCommission40ftAmount,
    qty20ft,
    qty40ft,
    totalUj20ft,
    totalUj40ft,
    totalRecommendedUj: totalUj20ft + totalUj40ft,
  };
}
