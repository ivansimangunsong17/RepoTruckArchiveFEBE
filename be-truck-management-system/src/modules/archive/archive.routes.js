import { listArchiveTripsController } from './archive.controller.js';

export const archiveRoutes = [
  {
    method: 'GET',
    path: '/api/archive/trips',
    permissions: ['report.read', 'container_job.read', 'sales_order.read'],
    handler: listArchiveTripsController,
  },
];
