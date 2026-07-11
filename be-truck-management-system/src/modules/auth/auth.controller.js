import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import { changePassword, getCurrentUser, login, logout } from './auth.service.js';

function readIpAddress(request) {
  const forwardedFor = request?.headers?.['x-forwarded-for'] || request?.headers?.['X-Forwarded-For'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();
  return request?.socket?.remoteAddress || null;
}

export async function loginController(request, response) {
  try {
    const result = await login(request.body, { ipAddress: readIpAddress(request) });
    await safeRecordActivityLog(request, {
      actorUserId: result.user?.id,
      actorName: result.user?.name,
      actorRole: result.user?.role,
      action: 'LOGIN_SUCCESS',
      module: 'auth',
      entityType: 'user',
      entityId: result.user?.id,
      metadata: { email: result.user?.email },
    });
    sendSuccess(response, result, 'Login berhasil.');
  } catch (error) {
    await safeRecordActivityLog(request, {
      actorName: request.body?.email || 'Unknown',
      action: 'LOGIN_FAILED',
      module: 'auth',
      entityType: 'user',
      metadata: {
        email: request.body?.email || null,
        code: error.code || 'LOGIN_FAILED',
      },
    });
    throw error;
  }
}

export async function logoutController(request, response) {
  const result = logout();
  await safeRecordActivityLog(request, {
    action: 'LOGOUT',
    module: 'auth',
    entityType: 'user',
    entityId: request.user?.sub,
  });
  sendSuccess(response, result, 'Logout berhasil.');
}

export async function meController(request, response) {
  const user = await getCurrentUser(request.headers);
  sendSuccess(response, user);
}

export async function changePasswordController(request, response) {
  const result = await changePassword(request.headers, request.body);
  await safeRecordActivityLog(request, {
    action: 'CHANGE_PASSWORD',
    module: 'auth',
    entityType: 'user',
    entityId: result.user?.id || request.user?.sub,
    metadata: { email: result.user?.email || request.user?.email },
  });
  sendSuccess(response, result, 'Password berhasil diperbarui.');
}
