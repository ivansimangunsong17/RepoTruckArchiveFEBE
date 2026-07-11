import { getSettingsController, updateSettingsController } from './settings.controller.js';

export const settingsRoutes = [
  {
    method: 'GET',
    path: '/api/settings',
    permission: 'settings.read',
    handler: getSettingsController,
  },
  {
    method: 'PUT',
    path: '/api/settings',
    permission: 'settings.update',
    handler: updateSettingsController,
  },
];
