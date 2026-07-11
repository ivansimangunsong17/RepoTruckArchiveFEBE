import { sendSuccess } from '../../utils/apiResponse.js';
import { listActivityLogs, saveActivityLog } from './activity-logs.service.js';

export async function listActivityLogsController(request, response) {
  const result = await listActivityLogs(request.query);
  sendSuccess(response, result);
}

export async function createActivityLogController(request, response) {
  const saved = await saveActivityLog(request.body);
  sendSuccess(response, saved, 'Activity log berhasil dicatat.', 201);
}
