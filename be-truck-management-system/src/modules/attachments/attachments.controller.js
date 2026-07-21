import { createReadStream } from 'node:fs';
import { sendError, sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  createAttachment,
  deleteAttachment,
  getAttachmentById,
  listAttachments,
  resolveAttachmentFilePath,
  updateAttachment,
} from './attachments.service.js';

export async function uploadAttachmentController(request, response) {
  const saved = await createAttachment(request.body);
  await safeRecordActivityLog(request, {
    action: 'UPLOAD_ATTACHMENT',
    module: 'attachments',
    entityType: 'attachment',
    entityId: saved.id,
    afterData: saved,
    metadata: {
      attachedEntityType: saved.entityType,
      attachedEntityId: saved.entityId,
      category: saved.category,
    },
  });
  sendSuccess(response, saved, 'Dokumen berhasil diunggah.', 201);
}

export async function updateAttachmentController(request, response) {
  const saved = await updateAttachment(request.params.id, request.body);
  sendSuccess(response, saved, 'Dokumen berhasil diperbarui.');
}

export async function deleteAttachmentController(request, response) {
  const before = await getAttachmentById(request.params.id);
  const deleted = await deleteAttachment(
    request.params.id,
    request.user,
    request.query?.reason,
  );
  await safeRecordActivityLog(request, {
    action: 'DELETE_ATTACHMENT',
    module: 'attachments',
    entityType: 'attachment',
    entityId: request.params.id,
    beforeData: before || deleted,
    afterData: null,
    metadata: {
      attachedEntityType: deleted.entityType,
      attachedEntityId: deleted.entityId,
      category: deleted.category,
      trashId: deleted.trashId,
    },
  });
  sendSuccess(response, deleted, 'Dokumen dipindahkan ke recycle bin.');
}

export async function listAttachmentsController(request, response) {
  const { entityType, entityId } = request.query;
  if (!entityType || !entityId) {
    sendError(response, {
      code: 'VALIDATION_ERROR',
      message: 'entityType dan entityId wajib diisi.',
    }, 400);
    return;
  }

  const rows = await listAttachments(entityType, entityId);
  sendSuccess(response, rows);
}

export async function downloadAttachmentController(request, response) {
  const attachment = await getAttachmentById(request.params.id);
  if (!attachment) {
    sendError(response, {
      code: 'ATTACHMENT_NOT_FOUND',
      message: 'Dokumen tidak ditemukan.',
    }, 404);
    return;
  }

  const filePath = await resolveAttachmentFilePath(attachment);
  if (!filePath) {
    sendError(response, {
      code: 'ATTACHMENT_FILE_MISSING',
      message: 'File dokumen tidak tersedia di storage.',
    }, 404);
    return;
  }

  const fileName = attachment.fileNameOriginal || attachment.fileName || 'document';

  response.writeHead(200, {
    'Content-Type': attachment.mimeType || 'application/octet-stream',
    'Content-Disposition': `${request.query?.download === '1' ? 'attachment' : 'inline'}; filename="${String(fileName).replace(/"/g, '\\"')}"`,
  });

  createReadStream(filePath).pipe(response);
}
