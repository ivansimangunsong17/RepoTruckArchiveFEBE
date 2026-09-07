import {
  cachedHinoVehiclesController,
  generateHinoTokenController,
  hinoTelematicsStatusController,
  linkHinoVehicleController,
  liveHinoVehiclePositionsController,
  syncHinoVehicleCatalogController,
  syncHinoVehiclePositionsController,
  syncHinoVehiclesController,
  unlinkHinoVehicleController,
} from './hino.controller.js';

export const hinoTelematicsRoutes = [
  {
    method: 'GET',
    path: '/api/telematics/hino/status',
    permission: 'telematics.hino.read',
    handler: hinoTelematicsStatusController,
  },
  {
    method: 'GET',
    path: '/api/telematics/hino/vehicles',
    permission: 'telematics.vehicle_position.read',
    handler: cachedHinoVehiclesController,
  },
  {
    method: 'GET',
    path: '/api/telematics/vehicles/live',
    permission: 'telematics.vehicle_position.read',
    handler: liveHinoVehiclePositionsController,
  },
  {
    method: 'POST',
    path: '/api/telematics/hino/token',
    permission: 'telematics.hino.sync',
    handler: generateHinoTokenController,
  },
  {
    method: 'POST',
    path: '/api/telematics/hino/vehicles/sync',
    permission: 'telematics.hino.sync',
    handler: syncHinoVehicleCatalogController,
  },
  {
    method: 'POST',
    path: '/api/telematics/hino/vehiclepositions/sync',
    permission: 'telematics.hino.sync',
    handler: syncHinoVehiclePositionsController,
  },
  {
    method: 'PATCH',
    path: '/api/telematics/hino/vehicles/:hinoVehicleId/link',
    permission: 'telematics.hino.sync',
    handler: linkHinoVehicleController,
  },
  {
    method: 'DELETE',
    path: '/api/telematics/hino/vehicles/:hinoVehicleId/link',
    permission: 'telematics.hino.sync',
    handler: unlinkHinoVehicleController,
  },
  {
    method: 'POST',
    path: '/api/telematics/hino/sync',
    permission: 'telematics.hino.sync',
    handler: syncHinoVehiclesController,
  },
];
