export const SETTINGS_STORAGE_KEY = 'tms-admin-settings';

export function readLocalSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeLocalSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return settings;
}
