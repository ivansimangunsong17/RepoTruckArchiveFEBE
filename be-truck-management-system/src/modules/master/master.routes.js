import {
  archiveMasterController,
  calculateDestinationUjController,
  createMasterController,
  getMasterController,
  listMasterController,
  listMasterPageController,
  updateMasterController,
} from './master.controller.js';

export const masterRoutes = [
  {
    method: 'GET',
    path: '/api/master/:resource',
    permission: 'master_data.read',
    handler: listMasterController,
  },
  {
    method: 'GET',
    path: '/api/master/:resource/page',
    permission: 'master_data.read',
    handler: listMasterPageController,
  },
  {
    method: 'POST',
    path: '/api/master/:resource',
    permission: 'master_data.create',
    handler: createMasterController,
  },
  {
    method: 'GET',
    path: '/api/master/:resource/:id',
    permission: 'master_data.read',
    handler: getMasterController,
  },
  {
    method: 'GET',
    path: '/api/master/destinations/:id/calculate-uj',
    permission: 'master_data.read',
    handler: calculateDestinationUjController,
  },
  {
    method: 'PATCH',
    path: '/api/master/:resource/:id',
    permission: 'master_data.update',
    handler: updateMasterController,
  },
  {
    method: 'PUT',
    path: '/api/master/:resource/:id',
    permission: 'master_data.update',
    handler: updateMasterController,
  },
  {
    method: 'DELETE',
    path: '/api/master/:resource/:id',
    permission: 'master_data.delete',
    handler: archiveMasterController,
  },
];
