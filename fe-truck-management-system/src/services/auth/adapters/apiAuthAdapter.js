import { USER_ROLES } from '../../../constants/roles';
import { httpClient } from '../../api/httpClient';
import { clearAuthToken, getAuthToken, setAuthToken } from '../authTokenStore';

function normalizeRole(role) {
  if (role === 'pengamat' || role === 'audit') return USER_ROLES.OBSERVER;
  return role || USER_ROLES.OBSERVER;
}

function mapApiUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName || user.name || user.email,
    role: normalizeRole(user.role),
    status: user.status || 'active',
    permissions: user.permissions || [],
  };
}

export function isConfigured() {
  return true;
}

export async function getSession() {
  const token = getAuthToken();
  return token ? { access_token: token } : null;
}

export function getCurrentUser() {
  return httpClient.get('/auth/me', { auth: true }).then(mapApiUser);
}

export function getCurrentProfile() {
  return getCurrentUser();
}

export async function getSessionUser(session) {
  if (!session?.access_token) return null;
  try {
    return await getCurrentUser();
  } catch {
    clearAuthToken();
    return null;
  }
}

export async function login(email, password) {
  const result = await httpClient.post('/auth/login', { email, password }, { auth: false });
  setAuthToken(result.token);
  return mapApiUser(result.user);
}

export async function logout() {
  try {
    await httpClient.post('/auth/logout', null, { auth: true });
  } finally {
    clearAuthToken();
  }
}

export function onAuthStateChange() {
  return () => {};
}

export async function changePassword(currentPassword, newPassword) {
  const result = await httpClient.post('/auth/change-password', {
    currentPassword,
    newPassword,
  }, { auth: true });
  return mapApiUser(result.user);
}

export async function requestPasswordReset() {
  throw new Error('Reset password membutuhkan ID user. Gunakan User Management untuk reset password backend.');
}
