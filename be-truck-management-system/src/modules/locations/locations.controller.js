import { sendSuccess } from '../../utils/apiResponse.js';
import { listLocations } from './locations.service.js';

export async function listLocationsController(request, response) {
  const rows = await listLocations(request.query, request.user);
  sendSuccess(response, rows);
}
