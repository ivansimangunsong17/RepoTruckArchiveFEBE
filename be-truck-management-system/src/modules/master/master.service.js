import {
  archiveMasterRow,
  findAllMasterRows,
  findMasterRowById,
  findMasterRows,
  findMasterViewerNotes,
  upsertMasterRow,
  upsertMasterViewerNote,
} from './master.repository.js';

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

export async function saveMasterRow(resource, payload, id) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload master data harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const normalizedPayload = await normalizePayloadForResource(resource, payload);
  return upsertMasterRow(resource, normalizedPayload, id);
}

export function removeMasterRow(resource, id) {
  return archiveMasterRow(resource, id);
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
  const totalUj20ft = qty20ft * uj20ft;
  const totalUj40ft = qty40ft * uj40ft;

  return {
    destinationId: destination.id,
    destinationName: destination.name,
    uj20ft,
    uj40ft,
    driverCommissionAmount,
    qty20ft,
    qty40ft,
    totalUj20ft,
    totalUj40ft,
    totalRecommendedUj: totalUj20ft + totalUj40ft,
  };
}
