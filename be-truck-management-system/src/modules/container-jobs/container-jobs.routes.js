import {
  generateContainerJobSpkController,
  getContainerJobController,
  listContainerJobsController,
  requestCancelContainerJobController,
  reviewCancelContainerJobController,
  updateContainerJobController,
} from './container-jobs.controller.js';

export const containerJobRoutes = [
  {
    method: 'GET',
    path: '/api/container-jobs',
    permission: 'container_job.read',
    handler: listContainerJobsController,
  },
  {
    method: 'GET',
    path: '/api/container-jobs/:id',
    permission: 'container_job.read',
    handler: getContainerJobController,
  },
  {
    method: 'PATCH',
    path: '/api/container-jobs/:id',
    permissions: ['container_job.update', 'container_job.update_status'],
    handler: updateContainerJobController,
  },
  {
    method: 'POST',
    path: '/api/container-jobs/:id/spk',
    permission: 'container_job.update',
    handler: generateContainerJobSpkController,
  },
  {
    method: 'PATCH',
    path: '/api/container-jobs/:id/assignment',
    permission: 'container_job.assign',
    handler: updateContainerJobController,
  },
  {
    method: 'PATCH',
    path: '/api/container-jobs/:id/status',
    permission: 'container_job.update_status',
    handler: updateContainerJobController,
  },
  {
    method: 'PATCH',
    path: '/api/container-jobs/:id/cancel-request',
    permission: 'sales_order.update',
    handler: requestCancelContainerJobController,
  },
  {
    method: 'PATCH',
    path: '/api/container-jobs/:id/cancel-review',
    permission: 'container_job.update_status',
    handler: reviewCancelContainerJobController,
  },
  {
    method: 'PUT',
    path: '/api/container-jobs/:id',
    permissions: ['container_job.update', 'container_job.update_status'],
    handler: updateContainerJobController,
  },
];
