import {
  archiveMasterController,
  calculateDestinationUjController,
  createMasterController,
  getMasterController,
  getMasterViewerNoteController,
  listMasterController,
  listMasterPageController,
  updateMasterViewerNoteController,
  updateMasterController,
  updateVehicleDefaultDriverController,
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
    path: '/api/master/:resource/:id/viewer-note',
    permission: 'master_data.read',
    handler: getMasterViewerNoteController,
  },
  {
    method: 'PATCH',
    path: '/api/master/:resource/:id/viewer-note',
    permission: 'master_data.read',
    handler: updateMasterViewerNoteController,
  },
  {
    method: 'GET',
    path: '/api/master/destinations/:id/calculate-uj',
    permission: 'master_data.read',
    handler: calculateDestinationUjController,
  },
  {
    method: 'PATCH',
    path: '/api/master/trucks/:id/default-driver',
    permission: 'operations.truck_default_driver.update',
    handler: updateVehicleDefaultDriverController,
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
