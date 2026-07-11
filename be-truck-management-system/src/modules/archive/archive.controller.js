import { sendSuccess } from '../../utils/apiResponse.js';
import { listArchiveTrips } from './archive.service.js';

export async function listArchiveTripsController(request, response) {
  const result = await listArchiveTrips(request.query);
  sendSuccess(response, result);
}
