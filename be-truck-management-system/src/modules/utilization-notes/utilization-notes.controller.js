import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import { getUtilizationNotes, removeUtilizationNote, saveUtilizationNote } from './utilization-notes.service.js';

export async function listUtilizationNotesController(request, response) {
  const result = await getUtilizationNotes(request.query);
  sendSuccess(response, result);
}

export async function upsertUtilizationNoteController(request, response) {
  const saved = await saveUtilizationNote(request.body, request.user);
  await safeRecordActivityLog(request, {
    action: 'UPSERT_UTILIZATION_NOTE',
    module: 'reports',
    entityType: 'utilization_note',
    entityId: saved.id,
    afterData: saved,
    metadata: {
      resourceType: saved.resourceType,
      resourceId: saved.resourceId,
      date: saved.date,
      reasonLabel: saved.reasonLabel,
    },
  });
  sendSuccess(response, saved, 'Catatan utilisasi disimpan.');
}

export async function deleteUtilizationNoteController(request, response) {
  const deleted = await removeUtilizationNote(request.params.id);
  await safeRecordActivityLog(request, {
    action: 'DELETE_UTILIZATION_NOTE',
    module: 'reports',
    entityType: 'utilization_note',
    entityId: deleted.id,
    beforeData: deleted,
  });
  sendSuccess(response, deleted, 'Catatan utilisasi dihapus.');
}
