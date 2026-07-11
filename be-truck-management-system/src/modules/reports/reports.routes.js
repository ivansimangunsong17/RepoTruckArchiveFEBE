import {
  dashboardReportController,
  documentReportController,
  driverPerformanceReportController,
  operationReportController,
  salesOrderReportController,
} from './reports.controller.js';

export const reportRoutes = [
  {
    method: 'GET',
    path: '/api/reports/dashboard',
    authOnly: true,
    handler: dashboardReportController,
  },
  {
    method: 'GET',
    path: '/api/reports/sales-orders',
    permission: 'report.read',
    handler: salesOrderReportController,
  },
  {
    method: 'GET',
    path: '/api/reports/operations',
    permission: 'report.read',
    handler: operationReportController,
  },
  {
    method: 'GET',
    path: '/api/reports/documents',
    permission: 'report.read',
    handler: documentReportController,
  },
  {
    method: 'GET',
    path: '/api/reports/driver-performance',
    permission: 'report.read',
    handler: driverPerformanceReportController,
  },
];
