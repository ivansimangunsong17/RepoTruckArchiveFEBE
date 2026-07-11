import { sendError } from '../utils/apiResponse.js';

export function handleError(response, error) {
  const statusCode = error.statusCode || 500;
  sendError(response, error, statusCode);
}
