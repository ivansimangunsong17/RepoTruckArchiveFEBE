import { createActivityLogController, listActivityLogsController } from './activity-logs.controller.js';

export const activityLogRoutes = [
  {
    method: 'GET',
    path: '/api/activity-logs',
    permission: 'activity_log.read',
    handler: listActivityLogsController,
  },
  {
    method: 'POST',
    path: '/api/activity-logs',
    authOnly: true,
    handler: createActivityLogController,
  },
];
