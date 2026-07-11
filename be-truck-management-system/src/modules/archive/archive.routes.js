import { listArchiveTripsController } from './archive.controller.js';

export const archiveRoutes = [
  {
    method: 'GET',
    path: '/api/archive/trips',
    permission: 'report.read',
    handler: listArchiveTripsController,
  },
];
