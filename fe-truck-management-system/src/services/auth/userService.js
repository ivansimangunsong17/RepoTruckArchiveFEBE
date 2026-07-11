import { httpClient } from '../api/httpClient';

function normalizeRole(role) {
  return role === 'pengamat' || role === 'audit' ? 'observer' : role;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName || row.name || row.email,
    role: normalizeRole(row.role),
    status: row.status,
    permissions: row.permissions || [],
  };
}

export async function getProfile(userId) {
  return httpClient.get(`/users/${userId}`).then(mapUser);
}

export async function getCurrentProfile() {
  return httpClient.get('/auth/me').then(mapUser);
}

export async function getAll() {
  const result = await httpClient.get('/users?page=1&pageSize=100');
  return result.rows || [];
}

export async function getById(id) {
  return httpClient.get(`/users/${id}`).then(mapUser);
}

export async function getByRole(role) {
  const backendRole = role === 'observer' ? 'pengamat' : role;
  const result = await httpClient.get(`/users?page=1&pageSize=100&role=${encodeURIComponent(backendRole)}`);
  return (result.rows || []).map(mapUser);
}

export async function update(id, payload) {
  return httpClient.patch(`/users/${id}`, payload).then(mapUser);
}

export async function requestPasswordReset(email) {
  const result = await httpClient.get(`/users?page=1&pageSize=1&query=${encodeURIComponent(email)}`);
  const user = (result.rows || []).find((row) => row.email === email);
  if (!user?.id) throw new Error('User tidak ditemukan.');
  return httpClient.post(`/users/${user.id}/reset-password`, {});
}
