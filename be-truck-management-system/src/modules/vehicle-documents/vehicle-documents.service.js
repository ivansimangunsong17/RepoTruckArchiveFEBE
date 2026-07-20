import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { query } from '../../db/client.js';
import { env } from '../../config/env.js';
import {
  resolveUploadPath,
  sanitizeFileName,
  sanitizePathSegment,
} from '../attachments/attachment-storage.js';
import {
  archiveReplacedStorageFile,
  quarantineStorageFile,
  writeStorageBufferAtomic,
} from '../storage/storage-files.js';
import { softDeleteStorageRecord } from '../storage/storage-trash.service.js';

const DOCUMENT_TYPES = ['KIR_HEAD', 'KIR_BUNTUT', 'STNK', 'PAJAK', 'ASURANSI', 'KEPEMILIKAN', 'FOTO', 'OTHER'];
const DOCUMENT_FOLDERS = {
  KIR_HEAD: 'KIR dan Uji Berkala',
  KIR_BUNTUT: 'KIR dan Uji Berkala',
  STNK: 'STNK',
  PAJAK: 'STNK',
  ASURANSI: 'Asuransi',
  KEPEMILIKAN: 'Dokumen Kepemilikan',
  FOTO: 'Foto',
  OTHER: 'Dokumen Lainnya',
};
const allowedExtensionsByMimeType = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

function validationError(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function decodeBase64Payload(fileBase64) {
  if (!fileBase64 || typeof fileBase64 !== 'string') return null;
  if (fileBase64.startsWith('data:')) {
    const commaIndex = fileBase64.indexOf(',');
    if (commaIndex === -1) throw validationError('Format fileBase64 tidak valid.');
    const meta = fileBase64.slice(5, commaIndex);
    return {
      buffer: Buffer.from(fileBase64.slice(commaIndex + 1), 'base64'),
      mimeType: meta.split(';')[0] || 'application/octet-stream',
    };
  }
  return { buffer: Buffer.from(fileBase64, 'base64') };
}

function validateFile({ fileName, mimeType, buffer }) {
  const normalizedMimeType = mimeType || 'application/octet-stream';
  const extension = extname(String(fileName || '')).toLowerCase();
  const configuredExtensions = env.allowedUploadExtensions.map((item) => `.${item}`);
  const allowedExtensions = allowedExtensionsByMimeType[normalizedMimeType] || [];

  if (!env.allowedUploadMimeTypes.includes(normalizedMimeType)) {
    throw validationError('Tipe file tidak diizinkan. Gunakan PDF, JPG, atau PNG.', 'INVALID_FILE_TYPE');
  }
  if (!configuredExtensions.includes(extension) || !allowedExtensions.includes(extension)) {
    throw validationError('Ekstensi file tidak sesuai dengan tipe file.', 'INVALID_FILE_EXTENSION');
  }
  const validSignature = (
    (normalizedMimeType === 'application/pdf' && buffer.subarray(0, 4).toString('utf8') === '%PDF')
    || (normalizedMimeType === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    || (normalizedMimeType === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
  );
  if (!validSignature) throw validationError('Isi file tidak sesuai dengan tipe file.', 'INVALID_FILE_SIGNATURE');
  if (buffer.length > env.maxUploadBytes) {
    throw validationError(`Ukuran file melebihi batas ${Math.round(env.maxUploadBytes / (1024 * 1024))} MB.`, 'FILE_TOO_LARGE');
  }
}

export function calculateVehicleDocumentStatus(expiredDate, baseDate = new Date()) {
  if (!expiredDate) return 'Aktif';
  const today = new Date(baseDate);
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiredDate);
  expiry.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (days < 0) return 'Expired';
  if (days <= 7) return 'Segera Habis';
  if (days <= 30) return 'Akan Habis';
  return 'Aktif';
}

function mapDocument(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    documentType: row.document_type,
    documentNumber: row.document_number || '',
    issuedDate: row.issued_date || '',
    expiredDate: row.expired_date || '',
    status: calculateVehicleDocumentStatus(row.expired_date),
    fileNameOriginal: row.file_name_original || '',
    fileNameStored: row.file_name_stored || '',
    relativePath: row.relative_path || '',
    mimeType: row.mime_type || '',
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    notes: row.notes || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    downloadUrl: `/api/vehicles/${row.vehicle_id}/documents/${row.id}/download`,
  };
}

async function getVehicle(vehicleId) {
  const result = await query('select id, unit_code, unit_kind from vehicles where id = $1 and archived_at is null', [vehicleId]);
  if (!result.rows[0]) {
    const error = new Error('Kendaraan tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'VEHICLE_NOT_FOUND';
    throw error;
  }
  return result.rows[0];
}

function validatePayload(payload = {}, requireFile = false) {
  if (!DOCUMENT_TYPES.includes(payload.documentType)) throw validationError('Jenis dokumen kendaraan tidak valid.');
  if (requireFile && !payload.fileBase64) throw validationError('File dokumen wajib diunggah.');
}

export function buildVehicleDocumentPath(vehicle, payload, sanitizedFileName) {
  const dateKey = String(payload.issuedDate || payload.expiredDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9]/g, '') || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const documentType = payload.documentType;
  const storedFileName = sanitizeFileName(`${dateKey}-${randomUUID().slice(0, 8)}-${sanitizedFileName}`);
  const entityFolder = ['CHASSIS', 'TRAILER'].includes(vehicle.unit_kind) ? 'Chassis' : 'Truck';
  return join(
    'Master Data',
    entityFolder,
    sanitizePathSegment(vehicle.id).toLowerCase(),
    DOCUMENT_FOLDERS[documentType] || 'Dokumen Lainnya',
    storedFileName,
  );
}

async function writeVehicleDocumentFile(vehicle, payload, existingPath = '') {
  const decoded = decodeBase64Payload(payload.fileBase64);
  if (!decoded) {
    return {
      relativePath: existingPath || null,
      fileNameStored: null,
      mimeType: null,
      sizeBytes: null,
      fileNameOriginal: null,
    };
  }
  const sanitizedFileName = sanitizeFileName(payload.fileName || 'document.pdf');
  const mimeType = payload.mimeType || decoded.mimeType || 'application/octet-stream';
  validateFile({ fileName: sanitizedFileName, mimeType, buffer: decoded.buffer });
  const relativePath = buildVehicleDocumentPath(vehicle, payload, sanitizedFileName);
  await writeStorageBufferAtomic(relativePath, decoded.buffer);
  return {
    relativePath,
    fileNameStored: String(relativePath).split(/[\\/]/).pop(),
    mimeType,
    sizeBytes: decoded.buffer.length,
    fileNameOriginal: sanitizedFileName,
  };
}

export async function listVehicleDocuments(vehicleId) {
  await getVehicle(vehicleId);
  const result = await query('select * from vehicle_documents where vehicle_id = $1 order by expired_date asc nulls last, created_at desc', [vehicleId]);
  return result.rows.map(mapDocument);
}

export async function createVehicleDocument(vehicleId, payload, actorName = '') {
  validatePayload(payload, true);
  const vehicle = await getVehicle(vehicleId);
  const file = await writeVehicleDocumentFile(vehicle, payload);
  let result;
  try {
    result = await query(
      `
        insert into vehicle_documents (
          vehicle_id, document_type, document_number, issued_date, expired_date,
          file_name_original, file_name_stored, relative_path, mime_type, size_bytes,
          notes, created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning *
      `,
      [
        vehicleId,
        payload.documentType,
        payload.documentNumber || null,
        payload.issuedDate || null,
        payload.expiredDate || null,
        file.fileNameOriginal,
        file.fileNameStored,
        file.relativePath,
        file.mimeType,
        file.sizeBytes,
        payload.notes || null,
        actorName || payload.createdBy || null,
      ],
    );
  } catch (error) {
    await quarantineStorageFile(file.relativePath, 'Database dokumen kendaraan gagal').catch(() => {});
    throw error;
  }
  return mapDocument(result.rows[0]);
}

export async function getVehicleDocument(vehicleId, documentId) {
  const result = await query('select * from vehicle_documents where vehicle_id = $1 and id = $2', [vehicleId, documentId]);
  return result.rows[0] ? mapDocument(result.rows[0]) : null;
}

export async function updateVehicleDocument(vehicleId, documentId, payload) {
  validatePayload(payload, false);
  const vehicle = await getVehicle(vehicleId);
  const existing = await getVehicleDocument(vehicleId, documentId);
  if (!existing) {
    const error = new Error('Dokumen kendaraan tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'VEHICLE_DOCUMENT_NOT_FOUND';
    throw error;
  }
  const file = await writeVehicleDocumentFile(vehicle, payload, existing.relativePath);
  let result;
  try {
    result = await query(
      `
        update vehicle_documents
        set document_type = $1,
            document_number = $2,
            issued_date = $3,
            expired_date = $4,
            file_name_original = coalesce($5, file_name_original),
            file_name_stored = coalesce($6, file_name_stored),
            relative_path = coalesce($7, relative_path),
            mime_type = coalesce($8, mime_type),
            size_bytes = coalesce($9, size_bytes),
            notes = $10,
            updated_at = now()
        where vehicle_id = $11 and id = $12
        returning *
      `,
      [
        payload.documentType,
        payload.documentNumber || null,
        payload.issuedDate || null,
        payload.expiredDate || null,
        file.fileNameOriginal || null,
        file.fileNameStored || null,
        file.relativePath || null,
        file.mimeType || null,
        file.sizeBytes,
        payload.notes || null,
        vehicleId,
        documentId,
      ],
    );
  } catch (error) {
    if (file.relativePath && file.relativePath !== existing.relativePath) {
      await quarantineStorageFile(file.relativePath, 'Update dokumen kendaraan gagal').catch(() => {});
    }
    throw error;
  }
  if (file.relativePath && file.relativePath !== existing.relativePath) {
    await archiveReplacedStorageFile({
      sourceTable: 'vehicle_documents',
      sourceId: documentId,
      originalRelativePath: existing.relativePath,
    }).catch((error) => {
      console.error(`File dokumen kendaraan lama gagal diarsipkan: ${error.message}`);
    });
  }
  return mapDocument(result.rows[0]);
}

export async function deleteVehicleDocument(vehicleId, documentId, actor = {}, reason = '') {
  const deleted = await softDeleteStorageRecord({
    sourceTable: 'vehicle_documents',
    sourceId: documentId,
    vehicleId,
    actor,
    reason,
  });
  return {
    ...mapDocument(deleted.row),
    trashId: deleted.trash.id,
    deletedAt: deleted.trash.deletedAt,
  };
}

export async function resolveVehicleDocumentFile(document) {
  if (!document?.relativePath) return null;
  const filePath = resolveUploadPath(document.relativePath);
  const fileStat = await stat(filePath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  return fileStat?.isFile() ? filePath : null;
}

export function streamVehicleDocument(response, document, filePath) {
  response.writeHead(200, {
    'Content-Type': document.mimeType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${String(document.fileNameOriginal || 'vehicle-document').replace(/"/g, '\\"')}"`,
  });
  createReadStream(filePath).pipe(response);
}
