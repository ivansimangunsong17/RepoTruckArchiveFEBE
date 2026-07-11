import {
  createAuthToken,
  needsPasswordRehash,
  readBearerToken,
  verifyAuthToken,
  verifyPassword,
} from './auth.utils.js';
import { findUserByEmail, findUserById, markUserLogin, updateUserPassword } from '../users/users.repository.js';

const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 20;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginRateLimits = new Map();
const failedLoginAttempts = new Map();

function ensureLoginPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload login harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const missing = ['email', 'password'].filter((field) => !payload[field]);
  if (missing.length) {
    const error = new Error(`Field login wajib belum lengkap: ${missing.join(', ')}.`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

function normalizeLoginEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function loginAttemptKey(payload, context = {}) {
  return `${context.ipAddress || 'unknown'}:${normalizeLoginEmail(payload.email)}`;
}

function loginError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function enforceLoginRateLimit(key) {
  const now = Date.now();
  const current = loginRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    loginRateLimits.set(key, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > MAX_LOGIN_ATTEMPTS_PER_WINDOW) {
    throw loginError('Terlalu banyak percobaan login. Coba lagi sebentar lagi.', 429, 'LOGIN_RATE_LIMITED');
  }
}

function enforceLoginLockout(key) {
  const current = failedLoginAttempts.get(key);
  if (!current?.lockedUntil) return;
  if (current.lockedUntil <= Date.now()) {
    failedLoginAttempts.delete(key);
    return;
  }
  throw loginError('Akun terkunci sementara karena terlalu banyak percobaan login gagal.', 429, 'LOGIN_LOCKED');
}

function recordFailedLogin(key) {
  const now = Date.now();
  const current = failedLoginAttempts.get(key);
  const next = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + LOGIN_FAILURE_WINDOW_MS, lockedUntil: null }
    : { ...current, count: current.count + 1 };

  if (next.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
    next.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
  failedLoginAttempts.set(key, next);
}

function clearFailedLogin(key) {
  failedLoginAttempts.delete(key);
}

export async function login(payload, context = {}) {
  ensureLoginPayload(payload);
  const attemptKey = loginAttemptKey(payload, context);
  enforceLoginRateLimit(attemptKey);
  enforceLoginLockout(attemptKey);

  const userRow = await findUserByEmail(payload.email, true);
  if (!userRow || !verifyPassword(payload.password, userRow.password_hash)) {
    recordFailedLogin(attemptKey);
    throw loginError('Email atau password tidak sesuai.', 401, 'INVALID_CREDENTIALS');
  }
  if (userRow.status !== 'Aktif') {
    recordFailedLogin(attemptKey);
    throw loginError('Akun user sedang nonaktif.', 403, 'USER_INACTIVE');
  }

  if (needsPasswordRehash(userRow.password_hash)) {
    await updateUserPassword(userRow.id, payload.password);
  }
  clearFailedLogin(attemptKey);
  const user = await markUserLogin(userRow.id);
  return {
    user,
    token: createAuthToken(user),
    tokenType: 'Bearer',
  };
}

export function logout() {
  return { success: true };
}

export async function getCurrentUser(headers) {
  const token = readBearerToken(headers);
  const payload = verifyAuthToken(token);
  const user = await findUserById(payload.sub);
  if (!user || user.status !== 'Aktif') {
    const error = new Error('User sesi tidak ditemukan atau nonaktif.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }
  return user;
}

export async function changePassword(headers, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload ubah password harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const currentPassword = String(payload.currentPassword || '').trim();
  const newPassword = String(payload.newPassword || '').trim();
  if (!currentPassword || !newPassword) {
    const error = new Error('Password saat ini dan password baru wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  if (newPassword.length < 8) {
    const error = new Error('Password baru minimal 8 karakter.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const token = readBearerToken(headers);
  const authPayload = verifyAuthToken(token);
  const userRow = await findUserById(authPayload.sub, true);
  if (!userRow || userRow.status !== 'Aktif') {
    const error = new Error('User sesi tidak ditemukan atau nonaktif.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  if (!verifyPassword(currentPassword, userRow.password_hash)) {
    const error = new Error('Password saat ini tidak sesuai.');
    error.statusCode = 400;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  const user = await updateUserPassword(userRow.id, newPassword);
  return { user };
}
