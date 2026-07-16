import {
  completedTripDetailController,
  completedTripsController,
  financeDashboardController,
} from './finance.controller.js';

export const financeRoutes = [
  {
    method: 'GET',
    path: '/api/finance/dashboard',
    permission: 'finance.invoice.read',
    handler: financeDashboardController,
  },
  {
    method: 'GET',
    path: '/api/finance/completed-trips',
    permission: 'finance.invoice.read',
    handler: completedTripsController,
  },
  {
    method: 'GET',
    path: '/api/finance/completed-trips/:id',
    permission: 'finance.invoice.read',
    handler: completedTripDetailController,
  },
];
