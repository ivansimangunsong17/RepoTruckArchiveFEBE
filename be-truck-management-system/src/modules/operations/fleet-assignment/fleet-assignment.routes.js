import {
  getFleetVehicleHistoryController,
  listFleetAssignmentsController,
  updateFleetChassisController,
  updateFleetDefaultDriverController,
} from './fleet-assignment.controller.js';

export const fleetAssignmentRoutes = [
  {
    method: 'GET',
    path: '/api/operations/fleet-assignment',
    permission: 'operations.fleet_assignment.read',
    handler: listFleetAssignmentsController,
  },
  {
    method: 'PATCH',
    path: '/api/operations/fleet-assignment/:vehicleId/default-driver',
    permission: 'operations.fleet_assignment.driver.update',
    handler: updateFleetDefaultDriverController,
  },
  {
    method: 'PATCH',
    path: '/api/operations/fleet-assignment/:vehicleId/chassis',
    permission: 'operations.fleet_assignment.chassis.update',
    handler: updateFleetChassisController,
  },
  {
    method: 'GET',
    path: '/api/operations/fleet-assignment/:vehicleId/history',
    permission: 'operations.fleet_assignment.read',
    handler: getFleetVehicleHistoryController,
  },
];
