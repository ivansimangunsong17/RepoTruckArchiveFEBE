import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  listStorageTrash,
  purgeStorageTrash,
  restoreStorageTrash,
} from './storage-trash.service.js';

export async function listStorageTrashController(request, response) {
  const result = await listStorageTrash(request.query);
  sendSuccess(response, result);
}

export async function restoreStorageTrashController(request, response) {
  const restored = await restoreStorageTrash(request.params.id);
  await safeRecordActivityLog(request, {
    action: 'RESTORE_STORAGE_TRASH',
    module: 'storage',
    entityType: restored.trash.sourceTable,
    entityId: restored.trash.sourceId,
    afterData: restored.trash,
    metadata: {
      trashId: restored.trash.id,
      originalRelativePath: restored.trash.originalRelativePath,
    },
  });
  sendSuccess(response, restored.trash, 'Dokumen berhasil dipulihkan dari recycle bin.');
}

export async function purgeStorageTrashController(request, response) {
  const purged = await purgeStorageTrash(request.params.id);
  await safeRecordActivityLog(request, {
    action: 'PURGE_STORAGE_TRASH',
    module: 'storage',
    entityType: purged.sourceTable,
    entityId: purged.sourceId,
    beforeData: purged,
    afterData: null,
    metadata: {
      trashId: purged.id,
      originalRelativePath: purged.originalRelativePath,
    },
  });
  sendSuccess(response, purged, 'Dokumen dihapus permanen dari recycle bin.');
}
