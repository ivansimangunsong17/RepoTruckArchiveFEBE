import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(value) {
  return createHmac('sha256', env.authTokenSecret).update(value).digest('base64url');
}

export function hashPassword(password) {
  return bcrypt.hashSync(String(password || ''), env.passwordHashCost);
}

function hashLegacySha256(password) {
  return createHash('sha256').update(String(password || '')).digest('hex');
}

function isBcryptHash(passwordHash) {
  return /^\$2[aby]\$\d{2}\$/.test(String(passwordHash || ''));
}

function verifyLegacyPassword(password, passwordHash) {
  if (!LEGACY_SHA256_PATTERN.test(String(passwordHash || ''))) return false;
  const incoming = Buffer.from(hashLegacySha256(password));
  const expected = Buffer.from(String(passwordHash || ''));
  return incoming.length === expected.length && timingSafeEqual(incoming, expected);
}

export function verifyPassword(password, passwordHash) {
  if (isBcryptHash(passwordHash)) {
    try {
      return bcrypt.compareSync(String(password || ''), String(passwordHash || ''));
    } catch {
      return false;
    }
  }
  return verifyLegacyPassword(password, passwordHash);
}

export function needsPasswordRehash(passwordHash) {
  return !isBcryptHash(passwordHash);
}

export function createAuthToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encodedPayload = base64UrlEncode(payload);
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyAuthToken(token) {
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature || sign(encodedPayload) !== signature) {
    const error = new Error('Token auth tidak valid.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const payload = base64UrlDecode(encodedPayload);
  if (!payload.exp || payload.exp < Date.now()) {
    const error = new Error('Sesi auth sudah kedaluwarsa.');
    error.statusCode = 401;
    error.code = 'SESSION_EXPIRED';
    throw error;
  }
  return payload;
}

export function readBearerToken(headers = {}) {
  const authorization = headers.authorization || headers.Authorization || '';
  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
}
