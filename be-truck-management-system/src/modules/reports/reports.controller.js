import { sendSuccess } from '../../utils/apiResponse.js';
import {
  fetchCustomerPerformanceReport,
  fetchDashboardReport,
  fetchDocumentReport,
  fetchDriverPerformanceReport,
  fetchInputMonitoringReport,
  fetchLocationPerformanceReport,
  fetchMonthlyComparisonReport,
  fetchMonthlyRevenueReport,
  fetchOperationReport,
  fetchSalesPerformanceReport,
  fetchSalesOrderReport,
  fetchUtilizationTrips,
} from './reports.service.js';

export async function utilizationTripsController(request, response) {
  sendSuccess(response, { rows: await fetchUtilizationTrips(request.query) });
}

export async function dashboardReportController(_request, response) {
  const result = await fetchDashboardReport();
  sendSuccess(response, result);
}

export async function salesOrderReportController(request, response) {
  const result = await fetchSalesOrderReport(request.query);
  sendSuccess(response, result);
}

export async function monthlyRevenueReportController(request, response) {
  const result = await fetchMonthlyRevenueReport(request.query);
  sendSuccess(response, result);
}

export async function monthlyComparisonReportController(request, response) {
  const result = await fetchMonthlyComparisonReport(request.query);
  sendSuccess(response, result);
}

export async function salesPerformanceReportController(request, response) {
  const result = await fetchSalesPerformanceReport(request.query);
  sendSuccess(response, result);
}

export async function customerPerformanceReportController(request, response) {
  const result = await fetchCustomerPerformanceReport(request.query);
  sendSuccess(response, result);
}

export async function locationPerformanceReportController(request, response) {
  const result = await fetchLocationPerformanceReport(request.query);
  sendSuccess(response, result);
}

export async function operationReportController(request, response) {
  const result = await fetchOperationReport(request.query);
  sendSuccess(response, result);
}

export async function documentReportController(request, response) {
  const result = await fetchDocumentReport(request.query);
  sendSuccess(response, result);
}

export async function driverPerformanceReportController(request, response) {
  const result = await fetchDriverPerformanceReport(request.query);
  sendSuccess(response, result);
}

export async function inputMonitoringReportController(request, response) {
  const result = await fetchInputMonitoringReport(request.query);
  sendSuccess(response, result);
}
