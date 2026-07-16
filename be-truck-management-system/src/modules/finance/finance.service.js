import {
  getCompletedTripDetail,
  getCompletedTripsPage,
  getFinanceDashboard,
} from './finance.repository.js';

function normalizeFinanceQuery(query = {}) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    dateFrom: query.dateFrom || query.startDate || '',
    dateTo: query.dateTo || query.endDate || '',
    customer: query.customer || '',
    destination: query.destination || '',
    containerSize: query.containerSize || query.size || '',
    documentStatus: query.documentStatus || '',
    invoiceStatus: query.invoiceStatus || '',
    query: query.query || query.search || '',
  };
}

export function fetchFinanceDashboard(query) {
  return getFinanceDashboard(normalizeFinanceQuery(query));
}

export function fetchCompletedTrips(query) {
  return getCompletedTripsPage(normalizeFinanceQuery(query));
}

export async function fetchCompletedTripDetail(id) {
  const trip = await getCompletedTripDetail(id);
  if (!trip) {
    const error = new Error('Perjalanan selesai tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'FINANCE_TRIP_NOT_FOUND';
    throw error;
  }
  return trip;
}
