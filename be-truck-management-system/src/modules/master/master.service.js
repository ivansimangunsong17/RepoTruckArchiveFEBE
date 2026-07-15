import {
  archiveMasterRow,
  findAllMasterRows,
  findMasterRowById,
  findMasterRows,
  upsertMasterRow,
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
  if (!payload.kirChassisNumber) return payload;

  const chassisRows = await listMasterRows('kir-chassis');
  const chassis = chassisRows.find((row) => isSameChassis(row, payload.kirChassisNumber));
  if (!chassis) {
    const error = new Error('Chassis yang dipilih tidak ditemukan di master chassis.');
    error.statusCode = 400;
    error.code = 'CHASSIS_NOT_FOUND';
    throw error;
  }

  return {
    ...payload,
    capacity: chassis.capacity || payload.capacity || '20FT',
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
  const totalUj20ft = qty20ft * uj20ft;
  const totalUj40ft = qty40ft * uj40ft;

  return {
    destinationId: destination.id,
    destinationName: destination.name,
    uj20ft,
    uj40ft,
    qty20ft,
    qty40ft,
    totalUj20ft,
    totalUj40ft,
    totalRecommendedUj: totalUj20ft + totalUj40ft,
  };
}
