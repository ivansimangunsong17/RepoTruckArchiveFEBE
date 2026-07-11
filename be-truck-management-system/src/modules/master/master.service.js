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

export async function saveMasterRow(resource, payload, id) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload master data harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return upsertMasterRow(resource, payload, id);
}

export function removeMasterRow(resource, id) {
  return archiveMasterRow(resource, id);
}
