import * as apiAuthAdapter from './adapters/apiAuthAdapter';

export function isConfigured() {
  return apiAuthAdapter.isConfigured();
}

export async function getSession() {
  return apiAuthAdapter.getSession();
}

export async function getCurrentUser() {
  return apiAuthAdapter.getCurrentUser();
}

export async function getCurrentProfile() {
  return apiAuthAdapter.getCurrentProfile();
}

export async function getSessionUser(session) {
  return apiAuthAdapter.getSessionUser(session);
}

export async function login(email, password) {
  return apiAuthAdapter.login(email, password);
}

export async function logout() {
  return apiAuthAdapter.logout();
}

export function onAuthStateChange(callback) {
  return apiAuthAdapter.onAuthStateChange(callback);
}

export async function changePassword(currentPassword, newPassword, email) {
  return apiAuthAdapter.changePassword(currentPassword, newPassword, email);
}

export function requestPasswordReset(email) {
  return apiAuthAdapter.requestPasswordReset(email);
}
