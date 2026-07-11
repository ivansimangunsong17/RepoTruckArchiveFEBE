import * as apiSettingsAdapter from './adapters/apiSettingsAdapter';

export function isSettingsDatabaseEnabled() {
  return apiSettingsAdapter.isEnabled();
}

export async function fetchSystemSettings() {
  return apiSettingsAdapter.fetchSystemSettings();
}

export async function saveSystemSettings(settings) {
  return apiSettingsAdapter.saveSystemSettings(settings);
}
