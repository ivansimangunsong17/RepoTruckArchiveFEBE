import { sendSuccess } from '../../utils/apiResponse.js';
import {
  fetchDashboardReport,
  fetchDocumentReport,
  fetchDriverPerformanceReport,
  fetchMonthlyRevenueReport,
  fetchOperationReport,
  fetchSalesPerformanceReport,
  fetchSalesOrderReport,
} from './reports.service.js';

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

export async function salesPerformanceReportController(request, response) {
  const result = await fetchSalesPerformanceReport(request.query);
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
