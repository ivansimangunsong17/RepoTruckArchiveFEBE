import { getHistoricalPeriodController, updateHistoricalPeriodController } from './historical-entry.controller.js';
import { HISTORICAL_ENTRY_PERMISSION } from './historical-entry.permissions.js';

export const historicalEntryRoutes = [
  {
    method: 'GET',
    path: '/api/historical-entry/periods/:period',
    permission: HISTORICAL_ENTRY_PERMISSION,
    handler: getHistoricalPeriodController,
  },
  {
    method: 'PATCH',
    path: '/api/historical-entry/periods/:period',
    permission: HISTORICAL_ENTRY_PERMISSION,
    handler: updateHistoricalPeriodController,
  },
];
