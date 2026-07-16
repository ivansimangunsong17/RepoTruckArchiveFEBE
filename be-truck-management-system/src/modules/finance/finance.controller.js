import { sendSuccess } from '../../utils/apiResponse.js';
import {
  fetchCompletedTripDetail,
  fetchCompletedTrips,
  fetchFinanceDashboard,
} from './finance.service.js';

export async function financeDashboardController(request, response) {
  const result = await fetchFinanceDashboard(request.query);
  sendSuccess(response, result);
}

export async function completedTripsController(request, response) {
  const result = await fetchCompletedTrips(request.query);
  sendSuccess(response, result);
}

export async function completedTripDetailController(request, response) {
  const result = await fetchCompletedTripDetail(request.params.id);
  sendSuccess(response, result);
}
