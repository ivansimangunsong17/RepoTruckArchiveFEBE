import { httpClient } from '../../api/httpClient';
import { readLocalSettings, writeLocalSettings } from './localSettingsStore';

export function isEnabled() {
  return true;
}

export async function fetchSystemSettings() {
  const settings = await httpClient.get('/settings');
  return settings || readLocalSettings();
}

export async function saveSystemSettings(settings) {
  writeLocalSettings(settings);
  return httpClient.put('/settings', settings);
}
