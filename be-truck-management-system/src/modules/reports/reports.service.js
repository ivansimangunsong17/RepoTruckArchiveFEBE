import {
  getDashboardReport,
  getDocumentReport,
  getDriverPerformanceReport,
  getMonthlyRevenueReport,
  getOperationReport,
  getSalesOrderReport,
} from './reports.repository.js';

export function fetchDashboardReport() {
  return getDashboardReport();
}

export function fetchSalesOrderReport(query) {
  return getSalesOrderReport({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    status: query.status || '',
    customer: query.customer || '',
    query: query.query || query.search || '',
  });
}

export function fetchMonthlyRevenueReport(query) {
  return getMonthlyRevenueReport({
    month: query.month,
    year: query.year,
    entrySource: query.entrySource || '',
    historicalPeriod: query.historicalPeriod || '',
  });
}

export function fetchOperationReport(query) {
  return getOperationReport({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    status: query.status || '',
    query: query.query || query.search || '',
    entrySource: query.entrySource || '',
    historicalPeriod: query.historicalPeriod || '',
  });
}

export function fetchDocumentReport(query) {
  return getDocumentReport({
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    entityType: query.entityType || '',
  });
}

export function fetchDriverPerformanceReport(query) {
  return getDriverPerformanceReport({
    month: query.month || '',
    weekFrom: query.weekFrom || query.week_from || '',
    weekTo: query.weekTo || query.week_to || '',
    entrySource: query.entrySource || '',
    historicalPeriod: query.historicalPeriod || '',
  });
}
