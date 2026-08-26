import { sendSuccess } from '../../utils/apiResponse.js';
import { listActivityLogs, recordActivityLog } from './activity-logs.service.js';

export async function listActivityLogsController(request, response) {
  const result = await listActivityLogs(request.query);
  sendSuccess(response, result);
}

export async function createActivityLogController(request, response) {
  // actorName/actorRole/actorUserId SELALU diambil dari request.user (token login terverifikasi).
  // recordActivityLog() menerima payload sebagai fallback identitas untuk caller INTERNAL yang
  // tepercaya -- di endpoint publik ini payload datang dari request.body milik client, jadi
  // ketiga field identitas itu harus dibuang dulu sebelum diteruskan, supaya endpoint ini tidak
  // bisa dipakai untuk memalsukan entri log seolah-olah dilakukan orang lain.
  const { actorName, actorRole, actorUserId, ...safePayload } = request.body || {};
  const saved = await recordActivityLog(request, safePayload);
  sendSuccess(response, saved, 'Activity log berhasil dicatat.', 201);
}
