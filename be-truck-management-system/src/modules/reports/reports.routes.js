import {
  customerPerformanceReportController,
  dashboardReportController,
  documentReportController,
  driverPerformanceReportController,
  inputMonitoringReportController,
  monthlyComparisonReportController,
  monthlyRevenueReportController,
  operationReportController,
  salesPerformanceReportController,
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
    path: '/api/reports/monthly-revenue',
    permission: 'report.read',
    handler: monthlyRevenueReportController,
  },
  {
    method: 'GET',
    path: '/api/reports/monthly-comparison',
    permission: 'report.read',
    handler: monthlyComparisonReportController,
  },
  {
    method: 'GET',
    path: '/api/reports/sales-performance',
    permission: 'report.read',
    handler: salesPerformanceReportController,
  },
  {
    method: 'GET',
    path: '/api/reports/customer-performance',
    permission: 'report.read',
    handler: customerPerformanceReportController,
  },
  {
    method: 'GET',
    path: '/api/reports/operations',
    permissions: ['report.read', 'container_job.read', 'sales_order.read'],
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
  {
    method: 'GET',
    path: '/api/reports/input-monitoring',
    permission: 'report.read',
    handler: inputMonitoringReportController,
  },
];
