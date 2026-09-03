import { query, withTransaction } from '../../db/client.js';
import { getResourceConfig } from './master.mapper.js';

function buildWhere(config, { keyword = '', filters = {} } = {}) {
  const clauses = [];
  const params = [];

  if (config.archivedColumn) clauses.push(`${config.archivedColumn} is null`);

  const cleanKeyword = keyword.trim();
  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    const searchClauses = config.searchable.map((column) => `${column}::text ilike $${params.length}`);
    clauses.push(`(${searchClauses.join(' or ')})`);
  }

  Object.entries(filters || {}).forEach(([key, value]) => {
    const column = config.filters[key];
    if (!column || !value) return;
    params.push(value);
    clauses.push(`${column} = $${params.length}`);
  });

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

export async function findMasterRows(resource, options = {}) {
  const config = getResourceConfig(resource);
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  const { whereSql, params } = buildWhere(config, {
    keyword: options.query || '',
    filters: options.filters || {},
  });
  const offset = (page - 1) * pageSize;
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rowsResult, countResult] = await Promise.all([
    query(
      `
        select *
        from ${config.table}
        ${whereSql}
        order by ${config.orderColumn} desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from ${config.table} ${whereSql}`, params),
  ]);

  return {
    rows: rowsResult.rows.map(config.toApi),
    total: countResult.rows[0]?.total || 0,
  };
}

export async function findAllMasterRows(resource) {
  const config = getResourceConfig(resource);
  const result = await query(
    `
      select *
      from ${config.table}
      ${config.archivedColumn ? `where ${config.archivedColumn} is null` : ''}
      order by ${config.orderColumn} desc
    `,
  );
  return result.rows.map(config.toApi);
}

export async function findMasterRowById(resource, id) {
  const config = getResourceConfig(resource);
  const result = await query(
    `
      select *
      from ${config.table}
      where id = $1
        ${config.archivedColumn ? `and ${config.archivedColumn} is null` : ''}
    `,
    [id],
  );
  return result.rows[0] ? config.toApi(result.rows[0]) : null;
}

export async function upsertMasterRow(resource, payload, id) {
  const config = getResourceConfig(resource);
  const data = config.toDb(payload);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    const error = new Error('Payload tidak memiliki data untuk disimpan.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (id) {
    const setSql = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
    const result = await query(
      `
        update ${config.table}
        set ${setSql}, updated_at = now()
        where id = $${entries.length + 1}
        returning *
      `,
      [...entries.map(([, value]) => value), id],
    );
    if (!result.rows[0]) {
      const error = new Error('Data master tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'MASTER_NOT_FOUND';
      throw error;
    }
    return config.toApi(result.rows[0]);
  }

  const columns = entries.map(([key]) => key);
  const placeholders = entries.map((_, index) => `$${index + 1}`);
  const result = await query(
    `
      insert into ${config.table} (${columns.join(', ')})
      values (${placeholders.join(', ')})
      returning *
    `,
    entries.map(([, value]) => value),
  );
  return config.toApi(result.rows[0]);
}

export async function clearVehicleDefaultDriverByNames(names = []) {
  const normalizedNames = Array.from(new Set(
    names
      .map((name) => String(name || '').trim().toLowerCase())
      .filter(Boolean),
  ));
  if (!normalizedNames.length) return 0;

  const result = await query(
    `
      update vehicles
      set default_driver_name = null,
          updated_at = now()
      where default_driver_name is not null
        and lower(trim(default_driver_name)) = any($1::text[])
      returning id
    `,
    [normalizedNames],
  );
  return result.rowCount || 0;
}

// Endpoint khusus, terpisah dari upsertMasterRow generik -- default sopir truck sengaja punya
// validasi eligibility (truck/sopir) dan alasan wajib yang tidak berlaku untuk field master lain,
// jadi tidak lewat jalur PATCH /api/master/trucks/:id biasa. Menulis default_driver_id (akurat,
// FK) SEKALIGUS default_driver_name (dipertahankan untuk kompatibilitas tampilan/halaman Truck
// Admin yang masih pakai teks nama saja) -- tidak pernah menyentuh container_jobs sama sekali.
export async function updateVehicleDefaultDriver(vehicleId, driverId) {
  return withTransaction(async (client) => {
    const vehicleResult = await client.query(
      'select * from vehicles where id = $1 and archived_at is null for update',
      [vehicleId],
    );
    const vehicle = vehicleResult.rows[0];
    if (!vehicle) {
      const error = new Error('Truck tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'TRUCK_NOT_FOUND';
      throw error;
    }
    if (['Maintenance', 'Tidak Aktif'].includes(vehicle.operational_status)) {
      const error = new Error(`Truck ${vehicle.plate_number} sedang ${vehicle.operational_status} dan default sopirnya tidak bisa diubah.`);
      error.statusCode = 409;
      error.code = 'TRUCK_DEFAULT_DRIVER_TRUCK_NOT_ELIGIBLE';
      throw error;
    }

    const driverResult = await client.query(
      'select * from drivers where id = $1 and archived_at is null',
      [driverId],
    );
    const driver = driverResult.rows[0];
    if (!driver) {
      const error = new Error('Sopir tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'DRIVER_NOT_FOUND';
      throw error;
    }
    // 'Bertugas' (sedang jalan di job lain) sengaja TETAP boleh dijadikan default -- status itu
    // cuma mencerminkan job yang berjalan SEKARANG, bukan indikasi sopir tidak layak untuk
    // assignment BERIKUTNYA (justru itu tujuan "default"). Yang benar-benar ditolak cuma status
    // yang menandakan sopir memang tidak layak dipakai lagi: blacklist/cuti/tidak aktif.
    if (['Blacklist', 'Cuti', 'Tidak Aktif'].includes(driver.operational_status)) {
      const error = new Error(`Sopir ${driver.name} sedang ${driver.operational_status} dan tidak bisa dijadikan default truck.`);
      error.statusCode = 409;
      error.code = 'TRUCK_DEFAULT_DRIVER_DRIVER_NOT_ELIGIBLE';
      throw error;
    }

    // Satu sopir cuma boleh jadi default di satu truck -- kalau sopir ini sebelumnya default di
    // truck lain, lepas dulu dari sana supaya tidak ada dua truck menganggap sopir yang sama
    // sebagai default-nya masing-masing.
    await client.query(
      `
        update vehicles
        set default_driver_id = null,
            default_driver_name = null,
            updated_at = now()
        where default_driver_id = $1 and id <> $2
      `,
      [driver.id, vehicleId],
    );

    const updated = await client.query(
      `
        update vehicles
        set default_driver_id = $2,
            default_driver_name = $3,
            updated_at = now()
        where id = $1
        returning *
      `,
      [vehicleId, driver.id, driver.name],
    );

    return {
      before: getResourceConfig('trucks').toApi(vehicle),
      after: getResourceConfig('trucks').toApi(updated.rows[0]),
    };
  });
}

export async function archiveMasterRow(resource, id) {
  const config = getResourceConfig(resource);
  const result = await query(
    `
      update ${config.table}
      set ${config.archivedColumn} = now(),
          updated_at = now()
      where id = $1
      returning id
    `,
    [id],
  );
  if (!result.rows[0]) {
    const error = new Error('Data master tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'MASTER_NOT_FOUND';
    throw error;
  }
}

function mapViewerNote(row) {
  if (!row) return {
    documentKey: 'general',
    note: '',
    updatedByName: '',
    updatedAt: null,
  };

  return {
    id: row.id,
    resource: row.resource,
    entityId: row.entity_id,
    documentKey: row.document_key || 'general',
    note: row.note || '',
    updatedByName: row.updated_by_name || '',
    updatedAt: row.updated_at || null,
  };
}

function isViewerNoteTableMissing(error) {
  return error?.code === '42P01' && String(error.message || '').includes('master_viewer_notes');
}

function viewerNoteTableMissingError() {
  const error = new Error('Catatan monitoring belum siap. Jalankan migration database.');
  error.statusCode = 500;
  error.code = 'VIEWER_NOTE_TABLE_MISSING';
  return error;
}

export async function findMasterViewerNotes(resource, entityId) {
  getResourceConfig(resource);
  try {
    const result = await query(
      `
        select *
        from master_viewer_notes
        where resource = $1
          and entity_id = $2
        order by document_key asc
      `,
      [resource, entityId],
    );
    return result.rows.map(mapViewerNote);
  } catch (error) {
    if (isViewerNoteTableMissing(error)) return [];
    throw error;
  }
}

export async function findMasterViewerNote(resource, entityId, documentKey = 'general') {
  getResourceConfig(resource);
  try {
    const result = await query(
      `
        select *
        from master_viewer_notes
        where resource = $1
          and entity_id = $2
          and document_key = $3
      `,
      [resource, entityId, documentKey],
    );
    return mapViewerNote(result.rows[0]);
  } catch (error) {
    if (isViewerNoteTableMissing(error)) return mapViewerNote(null);
    throw error;
  }
}

export async function upsertMasterViewerNote(resource, entityId, documentKey, note, user = {}) {
  getResourceConfig(resource);
  try {
    const result = await query(
      `
        insert into master_viewer_notes (
          resource, entity_id, document_key, note, updated_by, updated_by_name
        )
        values ($1, $2, $3, $4, $5, $6)
        on conflict (resource, entity_id, document_key)
        do update set
          note = excluded.note,
          updated_by = excluded.updated_by,
          updated_by_name = excluded.updated_by_name,
          updated_at = now()
        returning *
      `,
      [
        resource,
        entityId,
        documentKey,
        note,
        user.id || user.sub || null,
        user.name || user.fullName || user.email || null,
      ],
    );
    return mapViewerNote(result.rows[0]);
  } catch (error) {
    if (isViewerNoteTableMissing(error)) throw viewerNoteTableMissingError();
    throw error;
  }
}
