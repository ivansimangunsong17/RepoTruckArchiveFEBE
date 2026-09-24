import {
  archiveMasterRow,
  clearVehicleDefaultDriverByNames,
  findAllMasterRows,
  findMasterRowById,
  findMasterRows,
  findMasterViewerNotes,
  findVehicleChassisSizeMismatches,
  updateVehicleChassis,
  updateVehicleDefaultDriver,
  upsertMasterRow,
  upsertMasterViewerNote,
} from './master.repository.js';

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

export function isSameTruckChassis(currentTruck = {}, nextChassis = '') {
  return normalizeLookupValue(currentTruck.kirChassisNumber) === normalizeLookupValue(nextChassis);
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

// Chassis truck sengaja DIPISAH dari generic upsertMasterRow -- kir_chassis_number (teks lama)
// harus disinkronkan lewat updateVehicleChassis (fungsi yang sama dipakai Assignment Armada) supaya
// validasi eligibility & exclusivity (lepas dari truck lain) selalu jalan, bukan cuma tulis teks
// bebas seperti sebelumnya. Setelah sinkron, kirChassisNumber di payload diisi ulang dengan nilai
// yang SUDAH benar supaya generic update field lain (plat, status, dokumen, dst) tidak menimpanya
// balik dengan nilai basi.
async function saveTruckRow(payload, id) {
  const hasChassisField = Object.prototype.hasOwnProperty.call(payload, 'kirChassisNumber');

  if (!id) {
    if (!hasChassisField || !String(payload.kirChassisNumber || '').trim()) {
      return upsertMasterRow('trucks', payload, id);
    }
    const { kirChassisNumber, ...restPayload } = payload;
    const created = await upsertMasterRow('trucks', restPayload, id);
    const { after } = await updateVehicleChassis(created.id, kirChassisNumber);
    return after;
  }

  if (!hasChassisField) {
    return upsertMasterRow('trucks', payload, id);
  }

  const currentTruck = await findMasterRowById('trucks', id);
  if (currentTruck && isSameTruckChassis(currentTruck, payload.kirChassisNumber)) {
    return upsertMasterRow('trucks', payload, id);
  }

  const { after } = await updateVehicleChassis(id, payload.kirChassisNumber);
  return upsertMasterRow('trucks', { ...payload, kirChassisNumber: after.kirChassisNumber }, id);
}

export async function saveMasterRow(resource, payload, id) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload master data harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const currentDriver = resource === 'drivers' && id ? await findMasterRowById(resource, id) : null;
  const normalizedPayload = await normalizePayloadForResource(resource, payload);
  const saved = resource === 'trucks'
    ? await saveTruckRow(normalizedPayload, id)
    : await upsertMasterRow(resource, normalizedPayload, id);

  if (resource === 'drivers' && shouldDetachDriverFromUnit(saved.status)) {
    await clearVehicleDefaultDriverByNames(driverIdentityNames(currentDriver, saved));
  }

  return saved;
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
