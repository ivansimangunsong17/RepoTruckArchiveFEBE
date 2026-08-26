import { findUserById } from '../users/users.repository.js';

// Token auth membawa role sejak login dan berlaku sampai 12 jam tanpa dicek ulang ke DB, jadi
// kalau admin menonaktifkan akun atau menurunkan role seseorang, token lama yang sudah beredar
// tetap membawa hak akses LAMA sampai token itu kedaluwarsa. Cache singkat ini dipakai
// auth.middleware.js untuk membaca status/role terbaru dari tabel users di setiap request tanpa
// membebani DB tiap kali -- dan langsung di-invalidate begitu users.service.js menyimpan
// perubahan status/role, supaya efeknya nyaris seketika, bukan menunggu TTL habis.
const ACTOR_STATUS_CACHE_TTL_MS = 30 * 1000;
const actorStatusCache = new Map();

export async function getFreshActorStatus(userId) {
  const cached = actorStatusCache.get(userId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < ACTOR_STATUS_CACHE_TTL_MS) {
    return cached;
  }
  const user = await findUserById(userId);
  const fresh = {
    status: user?.status || null,
    role: user?.role || null,
    fetchedAt: now,
  };
  actorStatusCache.set(userId, fresh);
  return fresh;
}

export function invalidateActorStatus(userId) {
  actorStatusCache.delete(userId);
}
