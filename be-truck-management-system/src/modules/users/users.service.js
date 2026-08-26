import {
  createUser,
  findUserById,
  findUsersPage,
  updateUser,
  updateUserPassword,
  updateUserStatus,
} from './users.repository.js';
import { invalidateActorStatus } from '../auth/actor-status-cache.js';

const allowedRoles = ['admin', 'sales', 'operational', 'pengamat', 'observer', 'finance'];
const allowedStatuses = ['Aktif', 'Nonaktif'];

function ensureObject(payload, label = 'Payload user') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error(`${label} harus berupa object.`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

function validateUserPayload(payload, { create = false } = {}) {
  ensureObject(payload);
  const required = create ? ['name', 'email'] : [];
  if (create && !payload.password) required.push('password');
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) {
    const error = new Error(`Field user wajib belum lengkap: ${missing.join(', ')}.`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (payload.role && !allowedRoles.includes(payload.role)) {
    const error = new Error('Role user tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  if (payload.status && !allowedStatuses.includes(payload.status)) {
    const error = new Error('Status user tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  if (payload.password && String(payload.password).length < 8) {
    const error = new Error('Password minimal 8 karakter.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

export function listUsers(query) {
  return findUsersPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || query.search || '',
    role: query.role || '',
    status: query.status || '',
  });
}

export async function getUser(id) {
  const user = await findUserById(id);
  if (!user) {
    const error = new Error('User tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  return user;
}

export function saveNewUser(payload) {
  validateUserPayload(payload, { create: true });
  return createUser(payload);
}

export async function saveUser(id, payload) {
  validateUserPayload(payload);
  const saved = await updateUser(id, payload);
  invalidateActorStatus(id);
  return saved;
}

export async function saveUserStatus(id, payload) {
  ensureObject(payload, 'Payload status user');
  if (!allowedStatuses.includes(payload.status)) {
    const error = new Error('Status user tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const saved = await updateUserStatus(id, payload.status);
  invalidateActorStatus(id);
  return saved;
}

export async function resetUserPassword(id, payload = {}) {
  const password = payload.password || `Reset-${new Date().getFullYear()}-${String(id).slice(0, 4)}`;
  const user = await updateUserPassword(id, password);
  return {
    user,
    temporaryPassword: password,
    resetRequired: true,
  };
}
