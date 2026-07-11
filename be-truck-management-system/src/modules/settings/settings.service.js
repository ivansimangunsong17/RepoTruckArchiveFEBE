import { findArchiveSettings, saveArchiveSettings } from './settings.repository.js';

export async function getSystemSettings() {
  return findArchiveSettings();
}

export async function updateSystemSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    const error = new Error('Payload settings harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return saveArchiveSettings(settings);
}
