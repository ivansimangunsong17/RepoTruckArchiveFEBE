import { listLocationsController } from './locations.controller.js';

export const locationRoutes = [
  {
    method: 'GET',
    path: '/api/locations',
    permission: 'master_data.read',
    handler: listLocationsController,
  },
];
