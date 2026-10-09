import { extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { query } from '../../db/client.js';
import { env } from '../../config/env.js';
import {
  buildAttachmentStoragePath,
  parseSalesOrderStorageRoot,
  resolveUploadPath,
  sanitizeFileName,
} from './attachment-storage.js';
import {
  archiveReplacedStorageFile,
  quarantineStorageFile,
  writeStorageBufferAtomic,
} from '../storage/storage-files.js';
import { softDeleteStorageRecord } from '../storage/storage-trash.service.js';

const allowedExtensionsByMimeType = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};
let attachmentColumnSetPromise = null;

function decodeBase64Payload(fileBase64) {
  if (!fileBase64 || typeof fileBase64 !== 'string') {
    const error = new Error('Payload fileBase64 wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (fileBase64.startsWith('data:')) {
    const commaIndex = fileBase64.indexOf(',');
    if (commaIndex === -1) {
      const error = new Error('Format fileBase64 tidak valid.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    const meta = fileBase64.slice(5, commaIndex);
    const base64 = fileBase64.slice(commaIndex + 1);
    const mimeType = meta.split(';')[0] || 'application/octet-stream';
    return { buffer: Buffer.from(base64, 'base64'), mimeType };
  }

  return { buffer: Buffer.from(fileBase64, 'base64') };
}

export function validateAttachmentFile({ fileName, mimeType, buffer }, { maxUploadBytes = env.maxUploadBytes } = {}) {
  const normalizedMimeType = mimeType || 'application/octet-stream';
  const extension = extname(String(fileName || '')).toLowerCase();
  const allowedExtensions = allowedExtensionsByMimeType[normalizedMimeType] || [];
  const configuredExtensions = env.allowedUploadExtensions.map((item) => `.${item}`);

  if (!env.allowedUploadMimeTypes.includes(normalizedMimeType)) {
    const error = new Error('Tipe file tidak diizinkan. Gunakan PDF, JPG, atau PNG.');
    error.statusCode = 400;
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }

  if (!configuredExtensions.includes(extension) || !allowedExtensions.includes(extension)) {
    const error = new Error('Ekstensi file tidak sesuai dengan tipe file.');
    error.statusCode = 400;
    error.code = 'INVALID_FILE_EXTENSION';
    throw error;
  }

  const validSignature = (
    (normalizedMimeType === 'application/pdf' && buffer.subarray(0, 4).toString('utf8') === '%PDF')
    || (normalizedMimeType === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    || (normalizedMimeType === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
  );
  if (!validSignature) {
    const error = new Error('Isi file tidak sesuai dengan tipe file.');
    error.statusCode = 400;
    error.code = 'INVALID_FILE_SIGNATURE';
    throw error;
  }

  if (buffer.length > maxUploadBytes) {
    const maxMb = Math.round(maxUploadBytes / (1024 * 1024));
    const error = new Error(`Ukuran file melebihi batas ${maxMb} MB.`);
    error.statusCode = 400;
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }
}

async function getAttachmentColumnSet() {
  if (!attachmentColumnSetPromise) {
    attachmentColumnSetPromise = query(`
      select column_name
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'attachments'
    `).then((result) => new Set(result.rows.map((row) => row.column_name)));
  }
  return attachmentColumnSetPromise;
}

async function filterAttachmentPayload(payload) {
  const columnSet = await getAttachmentColumnSet();
  return Object.fromEntries(
    Object.entries(payload).filter(([column]) => columnSet.has(column)),
  );
}

async function findSalesOrderStorageRoot(salesOrderId) {
  if (!salesOrderId) return null;

  const result = await query(
    `
      select attachment.storage_path
      from attachments attachment
      where attachment.storage_path is not null
        and (
          (attachment.entity_type = 'sales_order' and attachment.entity_id = $1)
          or (
            attachment.entity_type = 'container_job'
            and exists (
              select 1
              from container_jobs container_job
              where container_job.id = attachment.entity_id
                and container_job.sales_order_id = $1
            )
          )
        )
      order by attachment.created_at asc
    `,
    [salesOrderId],
  );

  return result.rows
    .map((row) => parseSalesOrderStorageRoot(row.storage_path))
    .find(Boolean) || null;
}

async function readAttachmentContext(entityType, entityId) {
  if (entityType === 'sales_order') {
    const result = await query(
      `
        select id as sales_order_id, so_number, do_number, received_at, trip_date, so_date, created_at
        from sales_orders
        where id = $1
      `,
      [entityId],
    );
    const row = result.rows[0] || {};
    return {
      salesOrderId: row.sales_order_id,
      soNumber: row.so_number,
      doNumber: row.do_number,
      receivedAt: row.received_at,
      tripDate: row.trip_date,
      soDate: row.so_date,
      createdAt: row.created_at,
      storageRootParts: await findSalesOrderStorageRoot(row.sales_order_id),
    };
  }
  if (['truck', 'vehicle'].includes(entityType)) {
    const result = await query(
      `
        select unit_code, plate_number, container_size
        from vehicles
        where id = $1
      `,
      [entityId],
    );
    const row = result.rows[0] || {};
    const label = [
      row.unit_code,
      row.plate_number,
      row.container_size,
    ].filter(Boolean).join('-');
    return { masterRecordLabel: label };
  }
  if (entityType === 'chassis') {
    const result = await query(
      `
        select chassis_code, plate_number, container_size
        from kir_chassis
        where id = $1
      `,
      [entityId],
    );
    const row = result.rows[0] || {};
    const label = [
      row.chassis_code,
      row.container_size,
      row.plate_number,
    ].filter(Boolean).join('-');
    return { masterRecordLabel: label };
  }
  if (entityType === 'driver') {
    const result = await query(
      `
        select name
        from drivers
        where id = $1
      `,
      [entityId],
    );
    return { masterRecordLabel: result.rows[0]?.name || '' };
  }
  if (entityType === 'customer') {
    const result = await query(
      `
        select name
        from customers
        where id = $1
      `,
      [entityId],
    );
    return { masterRecordLabel: result.rows[0]?.name || '' };
  }
  if (entityType === 'container_job') {
    const result = await query(
      `
        select
          so.id as sales_order_id,
          so.so_number,
          so.do_number,
          so.received_at,
          so.trip_date,
          so.so_date,
          so.created_at,
          cj.id as container_job_id,
          cj.container_number
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [entityId],
    );
    const row = result.rows[0] || {};
    return {
      salesOrderId: row.sales_order_id,
      containerJobId: row.container_job_id,
      soNumber: row.so_number,
      doNumber: row.do_number,
      receivedAt: row.received_at,
      tripDate: row.trip_date,
      soDate: row.so_date,
      createdAt: row.created_at,
      containerNumber: row.container_number,
      storageRootParts: await findSalesOrderStorageRoot(row.sales_order_id),
    };
  }
  return {};
}

function buildAttachmentDbPayload(payload, context, storagePath, mimeType, fileSize) {
  const originalFileName = String(payload.fileName || 'document');
  const storedFileName = storagePath.split(/[\\/]/).pop();
  return {
    entity_type: payload.entityType,
    entity_id: payload.entityId,
    category: payload.category,
    reference_number: payload.referenceNumber || null,
    document_date: payload.documentDate || null,
    file_name: originalFileName,
    storage_path: storagePath,
    mime_type: mimeType,
    file_size: fileSize,
    notes: payload.notes || null,
    uploaded_by_name: payload.uploadedByName || null,
    module: payload.module || payload.entityType || null,
    do_number: payload.doNumber || context.doNumber || null,
    file_name_original: originalFileName,
    file_name_stored: storedFileName,
    relative_path: storagePath,
    size_bytes: fileSize,
    uploaded_by: payload.uploadedBy || payload.uploadedByName || null,
  };
}

export function mapAttachmentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    category: row.category,
    module: row.module || row.entity_type,
    doNumber: row.do_number || null,
    referenceNumber: row.reference_number,
    documentDate: row.document_date,
    fileName: row.file_name,
    fileNameOriginal: row.file_name_original || row.file_name,
    fileNameStored: row.file_name_stored || (row.storage_path ? String(row.storage_path).split(/[\\/]/).pop() : row.file_name),
    storagePath: row.storage_path,
    relativePath: row.relative_path || row.storage_path,
    mimeType: row.mime_type,
    fileSize: row.file_size == null ? null : Number(row.file_size),
    sizeBytes: row.size_bytes == null ? (row.file_size == null ? null : Number(row.file_size)) : Number(row.size_bytes),
    notes: row.notes,
    uploadedByName: row.uploaded_by_name,
    uploadedBy: row.uploaded_by || row.uploaded_by_name,
    uploadedAt: row.uploaded_at || row.created_at,
    createdAt: row.created_at,
    path: row.id,
    downloadUrl: `/api/attachments/${row.id}`,
  };
}

// `options.maxUploadBytes` hanya diisi oleh service (tidak pernah dari body request) untuk alur
// yang punya batas ukuran sendiri, mis. dokumen billing Finance.
export async function createAttachment(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload attachment harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const required = ['entityType', 'entityId', 'category', 'fileName', 'fileBase64'];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) {
    const error = new Error(`Field attachment wajib belum lengkap: ${missing.join(', ')}.`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const { buffer, mimeType: derivedMimeType } = decodeBase64Payload(payload.fileBase64);
  const mimeType = payload.mimeType || derivedMimeType || 'application/octet-stream';
  const sanitizedFileName = sanitizeFileName(payload.fileName);
  validateAttachmentFile({ fileName: sanitizedFileName, mimeType, buffer }, options);
  const context = await readAttachmentContext(payload.entityType, payload.entityId);
  const storagePath = buildAttachmentStoragePath({ ...payload, fileName: sanitizedFileName }, context);
  await writeStorageBufferAtomic(storagePath, buffer);
  const data = await filterAttachmentPayload(buildAttachmentDbPayload(
    { ...payload, fileName: sanitizedFileName },
    context,
    storagePath,
    mimeType,
    payload.fileSize == null ? buffer.length : Number(payload.fileSize),
  ));
  const entries = Object.entries(data);

  let result;
  try {
    result = await query(
      `
        insert into attachments (${entries.map(([key]) => key).join(', ')})
        values (${entries.map((_, index) => `$${index + 1}`).join(', ')})
        returning *
      `,
      entries.map(([, value]) => value),
    );
  } catch (error) {
    await quarantineStorageFile(storagePath, 'Database attachment gagal').catch(() => {});
    throw error;
  }

  return mapAttachmentRow(result.rows[0]);
}

export async function updateAttachment(id, payload, options = {}) {
  if (!id) {
    const error = new Error('ID attachment wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const existingResult = await query('select * from attachments where id = $1', [id]);
  const existing = existingResult.rows[0];
  if (!existing) {
    const error = new Error('Attachment tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'ATTACHMENT_NOT_FOUND';
    throw error;
  }

  const nextFileName = payload?.fileName || existing.file_name;
  const nextMimeType = payload?.mimeType || existing.mime_type || 'application/octet-stream';
  const nextFileSize = payload?.fileSize == null ? existing.file_size : Number(payload.fileSize);
  const nextReferenceNumber = payload?.referenceNumber ?? existing.reference_number;
  const nextDocumentDate = payload?.documentDate ?? existing.document_date;
  const nextNotes = payload?.notes ?? existing.notes;
  const nextCategory = payload?.category || existing.category;
  const nextUploadedByName = payload?.uploadedByName ?? existing.uploaded_by_name;
  let nextStoragePath = existing.storage_path;

  if (payload?.fileBase64) {
    const { buffer, mimeType: derivedMimeType } = decodeBase64Payload(payload.fileBase64);
    const resolvedMimeType = payload?.mimeType
      || derivedMimeType
      || existing.mime_type
      || 'application/octet-stream';
    const resolvedFileSize = payload?.fileSize == null
      ? buffer.length
      : Number(payload.fileSize);
    const sanitizedFileName = sanitizeFileName(nextFileName);
    validateAttachmentFile({ fileName: sanitizedFileName, mimeType: resolvedMimeType, buffer }, options);
    const context = await readAttachmentContext(existing.entity_type, existing.entity_id);
    nextStoragePath = buildAttachmentStoragePath({
      entityType: existing.entity_type,
      entityId: existing.entity_id,
      category: nextCategory,
      documentDate: nextDocumentDate,
      doNumber: payload?.doNumber || existing.do_number,
      fileName: sanitizedFileName,
    }, context);
    await writeStorageBufferAtomic(nextStoragePath, buffer);
    const storedFileName = nextStoragePath.split(/[\\/]/).pop();
    const data = await filterAttachmentPayload({
      category: nextCategory,
      reference_number: nextReferenceNumber,
      document_date: nextDocumentDate || null,
      file_name: sanitizedFileName,
      storage_path: nextStoragePath,
      mime_type: resolvedMimeType,
      file_size: resolvedFileSize,
      notes: nextNotes || null,
      uploaded_by_name: nextUploadedByName || null,
      file_name_original: sanitizedFileName,
      file_name_stored: storedFileName,
      relative_path: nextStoragePath,
      size_bytes: resolvedFileSize,
      uploaded_by: payload?.uploadedBy || nextUploadedByName || null,
    });
    const entries = Object.entries(data);
    let result;
    try {
      result = await query(
        `
          update attachments
          set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(', ')}
          where id = $${entries.length + 1}
          returning *
        `,
        [...entries.map(([, value]) => value), id],
      );
    } catch (error) {
      await quarantineStorageFile(nextStoragePath, 'Update attachment gagal').catch(() => {});
      throw error;
    }
    if (existing.storage_path && existing.storage_path !== nextStoragePath) {
      await archiveReplacedStorageFile({
        sourceTable: 'attachments',
        sourceId: id,
        originalRelativePath: existing.storage_path,
      }).catch((error) => {
        console.error(`File attachment lama gagal diarsipkan: ${error.message}`);
      });
    }
    return mapAttachmentRow(result.rows[0]);
  }

  const result = await query(
    `
      update attachments
      set category = $1,
          reference_number = $2,
          document_date = $3,
          file_name = $4,
          storage_path = $5,
          mime_type = $6,
          file_size = $7,
          notes = $8,
          uploaded_by_name = $9
      where id = $10
      returning *
    `,
    [
      nextCategory,
      nextReferenceNumber,
      nextDocumentDate || null,
      nextFileName,
      nextStoragePath,
      nextMimeType,
      nextFileSize,
      nextNotes || null,
      nextUploadedByName || null,
      id,
    ],
  );

  return mapAttachmentRow(result.rows[0]);
}

export async function listAttachments(entityType, entityId) {
  const result = await query(
    `
      select *
      from attachments
      where entity_type = $1 and entity_id = $2
      order by created_at asc
    `,
    [entityType, entityId],
  );

  return result.rows.map(mapAttachmentRow);
}

export async function getAttachmentById(id) {
  const result = await query('select * from attachments where id = $1', [id]);
  return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
}

export async function deleteAttachment(id, actor = {}, reason = '') {
  const deleted = await softDeleteStorageRecord({
    sourceTable: 'attachments',
    sourceId: id,
    actor,
    reason,
  });
  return {
    ...mapAttachmentRow(deleted.row),
    trashId: deleted.trash.id,
    deletedAt: deleted.trash.deletedAt,
  };
}

export async function resolveAttachmentFilePath(attachment) {
  const resolvedPath = resolveUploadPath(attachment.storagePath || '');
  const fileStat = await stat(resolvedPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!fileStat) return null;
  return fileStat.isFile() ? resolvedPath : null;
}
