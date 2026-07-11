export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

export function sendSuccess(response, data, message = 'Success', statusCode = 200) {
  sendJson(response, statusCode, { data, message });
}

export function sendError(response, error, statusCode = 500) {
  sendJson(response, statusCode, {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Terjadi kesalahan server.',
      details: error.details || [],
    },
  });
}
