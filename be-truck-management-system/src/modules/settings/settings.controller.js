import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import { getSystemSettings, updateSystemSettings } from './settings.service.js';

export async function getSettingsController(_request, response) {
  const settings = await getSystemSettings();
  sendSuccess(response, settings);
}

export async function updateSettingsController(request, response) {
  const before = await getSystemSettings();
  const settings = await updateSystemSettings(request.body);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_SETTINGS',
    module: 'settings',
    entityType: 'system_settings',
    entityId: 'archive',
    beforeData: before,
    afterData: settings,
  });
  sendSuccess(response, settings, 'Settings berhasil disimpan.');
}
