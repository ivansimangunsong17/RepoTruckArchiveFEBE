import { query, withTransaction } from '../../db/client.js';
import {
  deleteStorageFile,
  moveStorageFileToTrash,
  restoreStorageFile,
  storageFileExists,
} from './storage-files.js';

const SOURCE_CONFIG = {
  attachments: {
    entityType: (row) => row.entity_type,
    entityId: (row) => row.entity_id,
    originalPath: (row) => row.storage_path,
    fileName: (row) => row.file_name_original || row.file_name,
    mimeType: (row) => row.mime_type,
    sizeBytes: (row) => row.size_bytes ?? row.file_size,
  },
  vehicle_documents: {
    entityType: () => 'vehicle',
    entityId: (row) => row.vehicle_id,
    originalPath: (row) => row.relative_path,
    fileName: (row) => row.file_name_original,
    mimeType: (row) => row.mime_type,
    sizeBytes: (row) => row.size_bytes,
  },
};

function lifecycleError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function getSourceConfig(sourceTable) {
  const config = SOURCE_CONFIG[sourceTable];
  if (!config) {
    throw lifecycleError('Jenis sumber recycle bin tidak valid.', 'INVALID_TRASH_SOURCE', 400);
  }
  return config;
}

function readPagination(payload = {}) {
  const page = Math.max(1, Number.parseInt(payload.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(payload.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function mapStorageTrashRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    entityType: row.entity_type || '',
    entityId: row.entity_id || '',
    originalRelativePath: row.original_relative_path || '',
    trashRelativePath: row.trash_relative_path || '',
    fileNameOriginal: row.file_name_original || '',
    mimeType: row.mime_type || '',
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    deletionReason: row.deletion_reason || '',
    deletedByName: row.deleted_by_name || '',
    deletedByRole: row.deleted_by_role || '',
    deletedAt: row.deleted_at,
    canRestoreFile: Boolean(row.trash_relative_path),
  };
}

async function findSourceRow(client, sourceTable, sourceId, vehicleId = '') {
  const params = [sourceId];
  let scope = '';
  if (sourceTable === 'vehicle_documents' && vehicleId) {
    params.push(vehicleId);
    scope = ' and vehicle_id = $2';
  }
  const result = await client.query(
    `select * from ${sourceTable} where id = $1${scope} for update`,
    params,
  );
  return result.rows[0] || null;
}

export async function softDeleteStorageRecord({
  sourceTable,
  sourceId,
  vehicleId = '',
  actor = {},
  reason = '',
} = {}) {
  const config = getSourceConfig(sourceTable);
  return withTransaction(async (client) => {
    const row = await findSourceRow(client, sourceTable, sourceId, vehicleId);
    if (!row) {
      const isVehicleDocument = sourceTable === 'vehicle_documents';
      throw lifecycleError(
        isVehicleDocument ? 'Dokumen kendaraan tidak ditemukan.' : 'Attachment tidak ditemukan.',
        isVehicleDocument ? 'VEHICLE_DOCUMENT_NOT_FOUND' : 'ATTACHMENT_NOT_FOUND',
        404,
      );
    }

    const originalRelativePath = config.originalPath(row) || '';
    const trashRelativePath = await moveStorageFileToTrash({
      sourceTable,
      sourceId,
      originalRelativePath,
    });

    try {
      const inserted = await client.query(
        `
          insert into storage_trash (
            source_table, source_id, entity_type, entity_id,
            original_relative_path, trash_relative_path,
            file_name_original, mime_type, size_bytes, record_data,
            deletion_reason, deleted_by_name, deleted_by_role
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
          returning *
        `,
        [
          sourceTable,
          sourceId,
          config.entityType(row) || null,
          config.entityId(row) || null,
          originalRelativePath || null,
          trashRelativePath || null,
          config.fileName(row) || null,
          config.mimeType(row) || null,
          config.sizeBytes(row) ?? null,
          JSON.stringify(row),
          String(reason || '').trim() || null,
          actor.name || actor.actorName || 'System',
          actor.role || actor.actorRole || null,
        ],
      );
      const deleted = await client.query(
        `delete from ${sourceTable} where id = $1 returning *`,
        [sourceId],
      );
      if (deleted.rowCount !== 1) {
        throw lifecycleError('Data berubah saat dipindahkan ke recycle bin.', 'TRASH_CONFLICT', 409);
      }
      return {
        row,
        trash: mapStorageTrashRow(inserted.rows[0]),
      };
    } catch (error) {
      if (trashRelativePath) {
        await restoreStorageFile(trashRelativePath, originalRelativePath).catch(() => {});
      }
      throw error;
    }
  });
}

export async function listStorageTrash(payload = {}) {
  const { page, pageSize, offset } = readPagination(payload);
  const params = [];
  const clauses = [];
  if (payload.sourceTable) {
    getSourceConfig(payload.sourceTable);
    params.push(payload.sourceTable);
    clauses.push(`source_table = $${params.length}`);
  }
  if (payload.sourceId) {
    params.push(payload.sourceId);
    clauses.push(`source_id = $${params.length}`);
  }
  if (payload.query || payload.search) {
    params.push(`%${String(payload.query || payload.search).trim()}%`);
    clauses.push(`(
      file_name_original ilike $${params.length}
      or entity_type ilike $${params.length}
      or coalesce(deleted_by_name, '') ilike $${params.length}
      or coalesce(deletion_reason, '') ilike $${params.length}
    )`);
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const countResult = await query(`select count(*)::int as total from storage_trash ${where}`, params);
  const rowsResult = await query(
    `
      select *
      from storage_trash
      ${where}
      order by deleted_at desc, id
      limit $${params.length + 1} offset $${params.length + 2}
    `,
    [...params, pageSize, offset],
  );
  return {
    rows: rowsResult.rows.map(mapStorageTrashRow),
    total: countResult.rows[0].total,
    page,
    pageSize,
  };
}

export async function getStorageTrash(id, client = null) {
  const executor = client || { query };
  const result = await executor.query('select * from storage_trash where id = $1', [id]);
  return result.rows[0] || null;
}

export async function restoreStorageTrash(id) {
  return withTransaction(async (client) => {
    const result = await client.query('select * from storage_trash where id = $1 for update', [id]);
    const trashRow = result.rows[0];
    if (!trashRow) {
      throw lifecycleError('Data recycle bin tidak ditemukan.', 'TRASH_NOT_FOUND', 404);
    }
    getSourceConfig(trashRow.source_table);

    const existing = await client.query(
      `select id from ${trashRow.source_table} where id = $1`,
      [trashRow.source_id],
    );
    if (existing.rowCount) {
      throw lifecycleError('Data dengan ID yang sama sudah aktif.', 'TRASH_RESTORE_CONFLICT', 409);
    }

    let fileMoved = false;
    if (trashRow.trash_relative_path && trashRow.original_relative_path) {
      const trashFileExists = await storageFileExists(trashRow.trash_relative_path);
      const originalFileExists = await storageFileExists(trashRow.original_relative_path);
      if (trashFileExists && originalFileExists) {
        throw lifecycleError('Lokasi file asli sudah terisi.', 'TRASH_RESTORE_FILE_CONFLICT', 409);
      }
      if (!trashFileExists && !originalFileExists) {
        throw lifecycleError('File recycle bin tidak ditemukan.', 'TRASH_FILE_MISSING', 409);
      }
      if (trashFileExists) {
        await restoreStorageFile(
          trashRow.trash_relative_path,
          trashRow.original_relative_path,
        );
        fileMoved = true;
      }
    }

    try {
      const restored = await client.query(
        `
          insert into ${trashRow.source_table}
          select * from jsonb_populate_record(null::${trashRow.source_table}, $1::jsonb)
          returning *
        `,
        [JSON.stringify(trashRow.record_data)],
      );
      await client.query('delete from storage_trash where id = $1', [id]);
      return {
        row: restored.rows[0],
        trash: mapStorageTrashRow(trashRow),
      };
    } catch (error) {
      if (fileMoved) {
        await restoreStorageFile(
          trashRow.original_relative_path,
          trashRow.trash_relative_path,
        ).catch(() => {});
      }
      throw error;
    }
  });
}

export async function purgeStorageTrash(id) {
  return withTransaction(async (client) => {
    const result = await client.query('select * from storage_trash where id = $1 for update', [id]);
    const trashRow = result.rows[0];
    if (!trashRow) {
      throw lifecycleError('Data recycle bin tidak ditemukan.', 'TRASH_NOT_FOUND', 404);
    }
    if (trashRow.trash_relative_path) {
      await deleteStorageFile(trashRow.trash_relative_path);
    }
    await client.query('delete from storage_trash where id = $1', [id]);
    return mapStorageTrashRow(trashRow);
  });
}

export async function purgeExpiredStorageTrash(cutoffDate) {
  const result = await query(
    'select id from storage_trash where deleted_at < $1 order by deleted_at, id',
    [cutoffDate],
  );
  const purged = [];
  const failed = [];
  for (const row of result.rows) {
    try {
      purged.push(await purgeStorageTrash(row.id));
    } catch (error) {
      failed.push({ id: row.id, error: error.message });
    }
  }
  return { purged, failed };
}
