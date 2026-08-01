import { httpClient } from '../api/httpClient';

const PASSWORD_MASK = '********';

function normalizeApiRole(role) {
  return role === 'pengamat' ? 'observer' : role;
}

function toBackendRole(role) {
  return role === 'observer' ? 'pengamat' : role;
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name || row.full_name,
    email: row.email,
    password: PASSWORD_MASK,
    role: normalizeApiRole(row.role),
    status: row.status === 'active' || row.status === 'Aktif' ? 'Aktif' : 'Nonaktif',
  };
}

function toApiUserPayload(row) {
  const payload = {
    name: row.name,
    email: row.email,
    role: toBackendRole(row.role),
    status: row.status || 'Aktif',
  };
  if (row.password && row.password !== PASSWORD_MASK && !String(row.password).includes('Ã¢â‚¬Â¢')) {
    payload.password = row.password;
  }
  return payload;
}

export async function fetchMaster(resource) {
  if (resource === 'users') {
    const result = await httpClient.get('/users?page=1&pageSize=100');
    return (result.rows || []).map(mapUser);
  }

  return httpClient.get(`/master/${resource}`);
}

export async function fetchMasterPage(resource, {
  page = 1,
  pageSize = 10,
  query = '',
  filters = {},
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    query,
  });

  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    params.set(key, resource === 'users' && key === 'role' ? toBackendRole(value) : value);
  });

  if (resource === 'users') {
    const result = await httpClient.get(`/users?${params.toString()}`);
    return {
      rows: (result.rows || []).map(mapUser),
      total: result.total || 0,
    };
  }

  return httpClient.get(`/master/${resource}/page?${params.toString()}`);
}

export async function saveMaster(resource, row, id) {
  if (resource === 'users') {
    const saved = id
      ? await httpClient.patch(`/users/${id}`, toApiUserPayload(row))
      : await httpClient.post('/users', toApiUserPayload(row));
    return mapUser(saved);
  }

  return id
    ? httpClient.patch(`/master/${resource}/${id}`, row)
    : httpClient.post(`/master/${resource}`, row);
}

export async function fetchMasterViewerNote(resource, id) {
  if (!resource || !id) return [];
  return httpClient.get(`/master/${resource}/${id}/viewer-note`);
}

export async function saveMasterViewerNote(resource, id, documentKey, note) {
  if (!resource || !id) throw new Error('Data master belum dipilih.');
  return httpClient.patch(`/master/${resource}/${id}/viewer-note`, { documentKey, note });
}

export async function archiveMaster(resource, id) {
  if (resource === 'users') {
    await httpClient.patch(`/users/${id}/status`, { status: 'Nonaktif' });
    return;
  }

  await httpClient.delete(`/master/${resource}/${id}`);
}

export function resetMasterUserPassword(row) {
  if (!row?.id) throw new Error('ID user wajib tersedia untuk reset password.');
  return httpClient.post(`/users/${row.id}/reset-password`, {});
}

export function calculateDestinationUj(destinationId, { qty20 = 0, qty40 = 0 } = {}) {
  const params = new URLSearchParams({
    qty20: String(qty20),
    qty40: String(qty40),
  });
  return httpClient.get(`/master/destinations/${destinationId}/calculate-uj?${params.toString()}`);
}
