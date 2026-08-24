import { createReadStream } from 'node:fs';
import { sendError, sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import { actorHasPermission } from '../../utils/permissions.js';
import {
  createAttachment,
  deleteAttachment,
  getAttachmentById,
  listAttachments,
  resolveAttachmentFilePath,
  updateAttachment,
} from './attachments.service.js';

const FINANCE_ATTACHMENT_ENTITY_PERMISSIONS = {
  operational_fund_transaction: 'finance.operational_fund.read',
  operational_fund_request: 'finance.operational_fund.read',
  operational_fund_batch: 'finance.operational_fund.read',
  driver_commission_payment: 'finance.read',
  driver_commission_batch: 'finance.read',
  finance_correction_request: 'finance.correction.read',
};

const FINANCE_SENSITIVE_CONTAINER_JOB_CATEGORIES = new Set(['expensePaymentProof']);
const FINANCE_SENSITIVE_SALES_ORDER_CATEGORIES = new Set(['paymentProof']);

export function resolveRequiredFinancePermission(attachment) {
  if (FINANCE_ATTACHMENT_ENTITY_PERMISSIONS[attachment.entityType]) {
    return FINANCE_ATTACHMENT_ENTITY_PERMISSIONS[attachment.entityType];
  }
  if (attachment.entityType === 'container_job' && FINANCE_SENSITIVE_CONTAINER_JOB_CATEGORIES.has(attachment.category)) {
    return 'finance.operational_fund.read';
  }
  if (attachment.entityType === 'sales_order' && FINANCE_SENSITIVE_SALES_ORDER_CATEGORIES.has(attachment.category)) {
    return 'finance.invoice.read';
  }
  return null;
}

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

  const requiredPermission = resolveRequiredFinancePermission({ entityType });
  if (requiredPermission && !actorHasPermission(request.user, requiredPermission)) {
    sendError(response, {
      code: 'ATTACHMENT_ACCESS_DENIED',
      message: 'Anda tidak memiliki akses untuk melihat daftar dokumen ini.',
    }, 403);
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

  const requiredPermission = resolveRequiredFinancePermission(attachment);
  if (requiredPermission && !actorHasPermission(request.user, requiredPermission)) {
    sendError(response, {
      code: 'ATTACHMENT_ACCESS_DENIED',
      message: 'Anda tidak memiliki akses untuk membuka dokumen ini.',
    }, 403);
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
