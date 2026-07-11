import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  getUser,
  listUsers,
  resetUserPassword,
  saveNewUser,
  saveUser,
  saveUserStatus,
} from './users.service.js';

export async function listUsersController(request, response) {
  const result = await listUsers(request.query);
  sendSuccess(response, result);
}

export async function createUserController(request, response) {
  const saved = await saveNewUser(request.body);
  await safeRecordActivityLog(request, {
    action: 'CREATE_USER',
    module: 'users',
    entityType: 'user',
    entityId: saved.id,
    afterData: saved,
  });
  sendSuccess(response, saved, 'User berhasil dibuat.', 201);
}

export async function getUserController(request, response) {
  const user = await getUser(request.params.id);
  sendSuccess(response, user);
}

export async function updateUserController(request, response) {
  const before = await getUser(request.params.id);
  const saved = await saveUser(request.params.id, request.body);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_USER',
    module: 'users',
    entityType: 'user',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
  });
  if (before.role !== saved.role) {
    await safeRecordActivityLog(request, {
      action: 'UPDATE_USER_ROLE',
      module: 'users',
      entityType: 'user',
      entityId: saved.id,
      beforeData: { role: before.role },
      afterData: { role: saved.role },
      metadata: {
        fromRole: before.role,
        toRole: saved.role,
      },
    });
  }
  sendSuccess(response, saved, 'User berhasil diperbarui.');
}

export async function updateUserStatusController(request, response) {
  const before = await getUser(request.params.id);
  const saved = await saveUserStatus(request.params.id, request.body);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_USER',
    module: 'users',
    entityType: 'user',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
    metadata: { changedField: 'status' },
  });
  sendSuccess(response, saved, 'Status user berhasil diperbarui.');
}

export async function resetUserPasswordController(request, response) {
  const result = await resetUserPassword(request.params.id, request.body || {});
  await safeRecordActivityLog(request, {
    action: 'CHANGE_PASSWORD',
    module: 'users',
    entityType: 'user',
    entityId: result.user?.id || request.params.id,
    metadata: {
      resetByAdmin: true,
      email: result.user?.email,
    },
  });
  sendSuccess(response, result, 'Password user berhasil direset.');
}
