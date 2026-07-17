import { query, withTransaction } from '../../db/client.js';
import { mapContainerJob, toAssignmentSnapshot } from './container-jobs.mapper.js';

const joinedJobColumns = `
  cj.id, cj.sales_order_id, cj.container_number, cj.container_size, cj.container_type,
  cj.container_notes, cj.rpuj_status, cj.rpuj_notes,
  cj.rpuj_requested_by_name, cj.rpuj_requested_at, cj.rpuj_reviewed_by_name,
  cj.rpuj_reviewed_at, cj.rpuj_rejection_note, cj.rpuj_transfer_uploaded_by_name,
  cj.rpuj_transfer_uploaded_at,
  cj.spk_number, cj.eir_number,
  cj.loading_voucher_number, cj.unloading_voucher_number, cj.travel_document_number,
  cj.weighing_document_number, cj.tila_gatepass_document_number, cj.tila_gatepass_migration_note,
  cj.driver_id, cj.vehicle_id, cj.assignment_snapshot,
  cj.status, cj.received_at, cj.running_at, cj.completed_at, cj.cancelled_at, cj.created_by_name,
  cj.updated_by_name, cj.created_at, cj.updated_at, cj.cancel_request_status, cj.cancel_request_note,
  cj.cancel_requested_by_name, cj.cancel_requested_by_role, cj.cancel_requested_at,
  cj.cancel_reviewed_by_name, cj.cancel_reviewed_at, cj.cancel_review_note,
  so.so_number, so.do_number, so.customer_name, so.shipment_type, so.job_type,
  so.finance_verification_status,
  to_jsonb(so)->>'vessel_name' as vessel_name,
  so.terminal, so.service_name, so.origin, so.destination, so.trip_date,
  so.created_by_name as order_created_by_name,
  (
    select count(*)::int
    from container_jobs order_cj
    where order_cj.sales_order_id = cj.sales_order_id
      and upper(replace(order_cj.container_size, ' ', '')) = '20FT'
  ) as order_qty_20ft,
  (
    select count(*)::int
    from container_jobs order_cj
    where order_cj.sales_order_id = cj.sales_order_id
      and upper(replace(order_cj.container_size, ' ', '')) = '40FT'
  ) as order_qty_40ft
`;

const attachmentColumns = `
  id, entity_id, category, reference_number, document_date, file_name, storage_path,
  mime_type, file_size, notes, uploaded_by_name, created_at
`;

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildJobWhere({ query: keyword = '', status = '', requestStatus = '', rpujStage = '', includeRpujStage = true } = {}) {
  const clauses = [
    "so.status <> 'cancelled'",
    "so.finance_verification_status = 'verified'",
    "nullif(btrim(so.so_number), '') is not null",
  ];
  const params = [];
  const cleanKeyword = keyword.trim();

  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
    )`);
  }

  if (status) {
    params.push(status);
    clauses.push(`cj.status = $${params.length}`);
  }

  if (requestStatus) {
    params.push(requestStatus);
    clauses.push(`cj.cancel_request_status = $${params.length}`);
  }

  if (includeRpujStage && rpujStage) {
    if (rpujStage === 'queue') {
      clauses.push("coalesce(cj.rpuj_status, 'pending') in ('pending', 'rejected')");
    } else if (rpujStage === 'submitted') {
      clauses.push("cj.rpuj_status in ('submitted', 'approved')");
    } else if (rpujStage === 'paid') {
      clauses.push("cj.rpuj_status = 'paid'");
    }
  }

  return {
    whereSql: `where ${clauses.join(' and ')}`,
    params,
  };
}

async function findDriver(client, form) {
  if (form.driverId) {
    const result = await client.query('select * from drivers where id = $1 and archived_at is null', [form.driverId]);
    return result.rows[0] || null;
  }
  if (!form.driver) return null;
  const result = await client.query('select * from drivers where name = $1 and archived_at is null', [form.driver]);
  return result.rows[0] || null;
}

async function findVehicle(client, form) {
  if (form.vehicleId) {
    const result = await client.query('select * from vehicles where id = $1 and archived_at is null', [form.vehicleId]);
    return result.rows[0] || null;
  }
  if (!form.plateNumber) return null;
  const result = await client.query('select * from vehicles where plate_number = $1 and archived_at is null', [form.plateNumber]);
  return result.rows[0] || null;
}

function normalizeContainerSize(value) {
  const normalized = String(value || '').toUpperCase().replace(/\s/g, '');
  if (normalized === 'COMBO') return 'COMBO';
  return normalized === '40FT' ? '40FT' : '20FT';
}

function assertVehicleMatchesContainer(vehicle, containerSize) {
  if (!vehicle) return;
  const vehicleSize = normalizeContainerSize(vehicle.container_size);
  const jobSize = normalizeContainerSize(containerSize);
  if (vehicleSize !== 'COMBO' && vehicleSize !== jobSize) {
    const error = new Error(`Truck ${vehicle.plate_number} kapasitas ${vehicleSize} tidak sesuai untuk container ${jobSize}.`);
    error.statusCode = 400;
    error.code = 'VEHICLE_SIZE_MISMATCH';
    throw error;
  }
}

async function refreshOrderStatus(client, salesOrderId) {
  const result = await client.query(
    `
      select status, count(*)::int as total
      from container_jobs
      where sales_order_id = $1
      group by status
    `,
    [salesOrderId],
  );
  const counts = Object.fromEntries(result.rows.map((row) => [row.status, row.total]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const activeTotal = total - (counts.cancelled || 0);
  const nextStatus = total > 0 && activeTotal === 0
    ? 'cancelled'
    : activeTotal > 0 && counts.completed === activeTotal
    ? 'completed'
    : counts.running || counts.completed
      ? 'running'
      : 'waiting_operational';

  await client.query(
    'update sales_orders set status = $1, updated_at = now() where id = $2',
    [nextStatus, salesOrderId],
  );
}

function ensureSalesOrderVerifiedForOperational(row) {
  if (row?.finance_verification_status === 'verified' && String(row?.so_number || '').trim()) return;
  const error = new Error('Order belum memiliki Nomor SO Accurate dari Finance. Operational baru bisa memproses setelah SO terbit.');
  error.statusCode = 409;
  error.code = 'SALES_ORDER_NOT_VERIFIED_BY_FINANCE';
  throw error;
}

function normalizeRpujStatusForOperational(existing, nextStatus) {
  const currentStatus = existing?.rpuj_status || 'pending';
  const normalizedNext = nextStatus || currentStatus || 'pending';
  if (['approved', 'paid'].includes(currentStatus)) return currentStatus;
  if (['approved', 'paid'].includes(normalizedNext)) return currentStatus;
  if (currentStatus === 'rejected' && normalizedNext !== 'submitted') return currentStatus;
  return normalizedNext;
}

function validationError(message, code = 'VALIDATION_ERROR', statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function requireTripStartAllowed(nextStatus, rpujStatus) {
  if (!['running', 'completed'].includes(nextStatus)) return;
  if (['approved', 'paid'].includes(rpujStatus)) return;
  throw validationError(
    'Status perjalanan baru bisa Sedang Jalan setelah UJ disetujui Finance.',
    'TRIP_WAITING_RPUJ_APPROVAL',
    409,
  );
}

function pickFormValue(form, key, fallback = null) {
  return Object.prototype.hasOwnProperty.call(form, key) ? form[key] : fallback;
}

async function requireCompletedJobReady(client, id, form, existing) {
  const requiredValues = [
    ['driver', form.driver || form.driverId || existing.driver_id],
    ['truck', form.plateNumber || form.vehicleId || existing.vehicle_id],
    ['waktu mulai', form.runningAt || existing.running_at],
    ['waktu selesai', form.completedAt],
    ['No. EIR', pickFormValue(form, 'eirNumber', existing.eir_number)],
    ['No. Bon Muat / Bon Bongkar', pickFormValue(form, 'loadingVoucher', existing.loading_voucher_number)],
    ['No. TILA / Delivery Card / Gatepass / SP2', pickFormValue(form, 'tilaGatepassDocument', existing.tila_gatepass_document_number)],
    ['No. Surat Jalan', pickFormValue(form, 'travelDocument', existing.travel_document_number)],
  ];
  const missingValue = requiredValues.find(([, value]) => !value);
  if (missingValue) {
    throw validationError(
      `Pekerjaan belum dapat diselesaikan. Lengkapi ${missingValue[0]} terlebih dahulu.`,
      'CONTAINER_JOB_COMPLETION_INCOMPLETE',
      409,
    );
  }

  const attachmentResult = await client.query(
    `
      select category
      from attachments
      where entity_type = 'container_job'
        and entity_id = $1
        and category = any($2::text[])
    `,
    [id, ['eirDocument', 'loadingVoucherDocument', 'tilaGatepassDocumentFile', 'unloadingVoucherDocument', 'weighingDocumentFile', 'travelDocumentFile']],
  );
  const categories = new Set(attachmentResult.rows.map((row) => row.category));
  const requiredAttachments = [
    ['Lampiran EIR', ['eirDocument']],
    ['Lampiran Bon Muat / Bon Bongkar', ['loadingVoucherDocument']],
    ['Lampiran TILA / Delivery Card / Gatepass / SP2', ['tilaGatepassDocumentFile', 'unloadingVoucherDocument', 'weighingDocumentFile']],
    ['Lampiran Surat Jalan', ['travelDocumentFile']],
  ];
  const missingAttachment = requiredAttachments.find(([, alternatives]) => !alternatives.some((category) => categories.has(category)));
  if (missingAttachment) {
    throw validationError(
      `Pekerjaan belum dapat diselesaikan. Lengkapi ${missingAttachment[0]} terlebih dahulu.`,
      'CONTAINER_JOB_COMPLETION_INCOMPLETE',
      409,
    );
  }
}

export async function findContainerJobsPage(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildJobWhere(options);
  const rpujCountWhere = buildJobWhere({ ...options, includeRpujStage: false });
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rowsResult, countResult, statusResult, rpujStatusResult] = await Promise.all([
    query(
      `
        select ${joinedJobColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
    order by
          case cj.status
            when 'received' then 1
            when 'running' then 2
            when 'completed' then 3
            when 'cancelled' then 4
            else 4
          end,
          coalesce(cj.cancel_requested_at, cj.updated_at) desc,
          so.trip_date asc,
          cj.created_at asc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        select cj.status, count(*)::int as total
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where so.status <> 'cancelled'
          and so.finance_verification_status = 'verified'
          and nullif(btrim(so.so_number), '') is not null
        group by cj.status
      `,
    ),
    query(
      `
        select
          case
            when cj.rpuj_status = 'paid' then 'paid'
            when cj.rpuj_status in ('submitted', 'approved') then 'submitted'
            else 'queue'
          end as stage,
          count(*)::int as total
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${rpujCountWhere.whereSql}
        group by 1
      `,
      rpujCountWhere.params,
    ),
  ]);

  const jobIds = rowsResult.rows.map((row) => row.id);
  const attachmentResult = jobIds.length
    ? await query(
        `
          select ${attachmentColumns}
          from attachments
          where entity_type = 'container_job' and entity_id = any($1::uuid[])
          order by created_at asc
        `,
        [jobIds],
      )
    : { rows: [] };
  const groupedAttachments = attachmentResult.rows.reduce((groups, attachment) => {
    groups[attachment.entity_id] = groups[attachment.entity_id] || [];
    groups[attachment.entity_id].push(attachment);
    return groups;
  }, {});

  const counts = { received: 0, running: 0, completed: 0, cancelled: 0 };
  statusResult.rows.forEach((row) => {
    counts[row.status] = row.total;
  });
  const rpujCounts = { queue: 0, submitted: 0, paid: 0 };
  rpujStatusResult.rows.forEach((row) => {
    rpujCounts[row.stage] = row.total;
  });

  return {
    rows: rowsResult.rows.map((row) => mapContainerJob(row, groupedAttachments[row.id] || [])),
    total: countResult.rows[0]?.total || 0,
    counts,
    rpujCounts,
  };
}

export async function findContainerJobById(id) {
  const result = await query(
    `
      select ${joinedJobColumns}
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where cj.id = $1
    `,
    [id],
  );
  if (!result.rows[0]) return null;

  const attachmentResult = await query(
    `
      select ${attachmentColumns}
      from attachments
      where entity_type = 'container_job' and entity_id = $1
      order by created_at asc
    `,
    [id],
  );
  return mapContainerJob(result.rows[0], attachmentResult.rows);
}

export async function updateContainerJob(id, form) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select cj.id, cj.sales_order_id, cj.container_number, cj.container_size, cj.running_at, cj.cancelled_at,
               cj.driver_id, cj.vehicle_id, cj.rpuj_status, cj.status, cj.eir_number,
               cj.loading_voucher_number, cj.travel_document_number, cj.tila_gatepass_document_number,
               so.so_number, so.finance_verification_status
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [id],
    );
    if (!existing.rows[0]) {
      const error = new Error('Container Job tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_NOT_FOUND';
      throw error;
    }
    ensureSalesOrderVerifiedForOperational(existing.rows[0]);

    const driver = await findDriver(client, form);
    const vehicle = await findVehicle(client, form);
    assertVehicleMatchesContainer(vehicle, existing.rows[0].container_size);
    const nextStatus = form.status || existing.rows[0].status || 'received';
    const nextRpujStatus = normalizeRpujStatusForOperational(existing.rows[0], form.rpujStatus);
    requireTripStartAllowed(nextStatus, nextRpujStatus);
    if (nextStatus === 'completed') {
      await requireCompletedJobReady(client, id, form, existing.rows[0]);
    }
    const requestRpujAt = nextRpujStatus === 'submitted' && existing.rows[0].rpuj_status !== 'submitted'
      ? new Date().toISOString()
      : null;
    const nextContainerNumber = String(form.containerNumber || existing.rows[0].container_number || '').trim().toUpperCase() || null;
    const runningAt = nextStatus === 'cancelled'
      ? existing.rows[0].running_at
      : ['running', 'completed'].includes(nextStatus)
        ? form.runningAt || new Date().toISOString()
        : null;
    const cancelledAt = nextStatus === 'cancelled'
      ? form.cancelledAt || existing.rows[0].cancelled_at || new Date().toISOString()
      : null;

    await client.query(
      `
        update container_jobs
        set container_number = $1,
            driver_id = $2,
            vehicle_id = $3,
            assignment_snapshot = $4::jsonb,
            rpuj_status = $5,
            rpuj_notes = $6,
            rpuj_requested_by_name = case when $7::timestamptz is not null then $8 else rpuj_requested_by_name end,
            rpuj_requested_at = coalesce($7::timestamptz, rpuj_requested_at),
            spk_number = case when $9::text is null then spk_number else spk_number end,
            eir_number = $10,
            loading_voucher_number = $11,
            travel_document_number = $12,
            tila_gatepass_document_number = $13,
            status = $14,
            running_at = $15,
            completed_at = $16,
            cancelled_at = $17,
            updated_by_name = $18,
            updated_at = now()
        where id = $19
      `,
      [
        nextContainerNumber,
        driver?.id || form.driverId || null,
        vehicle?.id || form.vehicleId || null,
        JSON.stringify(toAssignmentSnapshot(form, driver, vehicle)),
        nextRpujStatus,
        form.rpujNotes || null,
        requestRpujAt,
        form.updatedBy || 'Operational',
        form.spkNumber || null,
        form.eirNumber || null,
        form.loadingVoucher || null,
        form.travelDocument || null,
        form.tilaGatepassDocument || form.unloadingVoucher || form.weighingDocument || null,
        nextStatus,
        runningAt,
        nextStatus === 'completed' ? form.completedAt || new Date().toISOString() : null,
        cancelledAt,
        form.updatedBy || 'Operational',
        id,
      ],
    );

    await refreshOrderStatus(client, existing.rows[0].sales_order_id);
    const updated = await client.query(
      `
        select ${joinedJobColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [id],
    );
    const attachmentResult = await client.query(
      `
        select ${attachmentColumns}
        from attachments
        where entity_type = 'container_job' and entity_id = $1
        order by created_at asc
      `,
      [id],
    );
    return mapContainerJob(updated.rows[0], attachmentResult.rows);
  });
}

async function ensureCanRequestCancellation(client, id) {
  const result = await client.query(
    'select id, status, cancel_request_status from container_jobs where id = $1',
    [id],
  );
  const job = result.rows[0];
  if (!job) {
    const error = new Error('Container Job tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'CONTAINER_JOB_NOT_FOUND';
    throw error;
  }
  if (job.status !== 'received') {
    const error = new Error('Container Job hanya bisa diajukan batal sebelum diproses Operational.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_LOCKED';
    throw error;
  }
  if (job.cancel_request_status === 'submitted') {
    const error = new Error('Container Job sudah memiliki permintaan pembatalan yang menunggu approval.');
    error.statusCode = 409;
    error.code = 'CONTAINER_JOB_CANCEL_REQUEST_EXISTS';
    throw error;
  }
  return job;
}

export async function requestContainerJobCancellation(id, form = {}) {
  return withTransaction(async (client) => {
    await ensureCanRequestCancellation(client, id);
    const result = await client.query(
      `
        update container_jobs
        set cancel_request_status = 'submitted',
            cancel_request_note = $1,
            cancel_requested_by_name = $2,
            cancel_requested_by_role = $3,
            cancel_requested_at = now(),
            cancel_reviewed_by_name = null,
            cancel_reviewed_at = null,
            cancel_review_note = null,
            updated_by_name = $4,
            updated_at = now()
        where id = $5
        returning ${joinedJobColumns}
      `,
      [
        form.cancelRequestNote || null,
        form.cancelRequestedByName || null,
        form.cancelRequestedByRole || null,
        form.cancelRequestedByName || null,
        id,
      ],
    );
    const attachmentResult = await client.query(
      `
        select ${attachmentColumns}
        from attachments
        where entity_type = 'container_job' and entity_id = $1
        order by created_at asc
      `,
      [id],
    );
    return mapContainerJob(result.rows[0], attachmentResult.rows);
  });
}

export async function reviewContainerJobCancellation(id, form = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'select id, sales_order_id, status, cancel_request_status, cancel_requested_by_name, cancel_requested_by_role, cancel_requested_at from container_jobs where id = $1',
      [id],
    );
    if (!existing.rows[0]) {
      const error = new Error('Container Job tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_NOT_FOUND';
      throw error;
    }
    if (existing.rows[0].cancel_request_status !== 'submitted') {
      const error = new Error('Belum ada permintaan pembatalan yang menunggu approval.');
      error.statusCode = 409;
      error.code = 'CONTAINER_JOB_CANCEL_REQUEST_MISSING';
      throw error;
    }

    if (form.approved) {
      const result = await client.query(
        `
          update container_jobs
          set status = 'cancelled',
              cancelled_at = now(),
              cancel_request_status = 'approved',
              cancel_request_note = coalesce($1, cancel_request_note),
              cancel_requested_by_name = coalesce($2, cancel_requested_by_name),
              cancel_requested_by_role = coalesce($3, cancel_requested_by_role),
              cancel_requested_at = coalesce($4, cancel_requested_at),
              cancel_reviewed_by_name = $5,
              cancel_reviewed_at = now(),
              cancel_review_note = $6,
              updated_by_name = $5,
              updated_at = now()
          where id = $7
          returning ${joinedJobColumns}
        `,
        [
          form.cancelRequestNote || null,
          existing.rows[0].cancel_requested_by_name || null,
          existing.rows[0].cancel_requested_by_role || null,
          existing.rows[0].cancel_requested_at || null,
          form.cancelReviewedByName || null,
          form.cancelReviewNote || null,
          id,
        ],
      );
      await refreshOrderStatus(client, existing.rows[0].sales_order_id);
      const attachmentResult = await client.query(
        `
          select ${attachmentColumns}
          from attachments
          where entity_type = 'container_job' and entity_id = $1
          order by created_at asc
        `,
        [id],
      );
      return mapContainerJob(result.rows[0], attachmentResult.rows);
    }

    const result = await client.query(
      `
        update container_jobs
        set cancel_request_status = 'rejected',
            cancel_request_note = coalesce($1, cancel_request_note),
            cancel_requested_by_name = coalesce($2, cancel_requested_by_name),
            cancel_requested_by_role = coalesce($3, cancel_requested_by_role),
            cancel_requested_at = coalesce($4, cancel_requested_at),
            cancel_reviewed_by_name = $5,
            cancel_reviewed_at = now(),
            cancel_review_note = $6,
            updated_by_name = $5,
            updated_at = now()
        where id = $7
        returning ${joinedJobColumns}
      `,
      [
        form.cancelRequestNote || null,
        existing.rows[0].cancel_requested_by_name || null,
        existing.rows[0].cancel_requested_by_role || null,
        existing.rows[0].cancel_requested_at || null,
        form.cancelReviewedByName || null,
        form.cancelReviewNote || null,
        id,
      ],
    );
    const attachmentResult = await client.query(
      `
        select ${attachmentColumns}
        from attachments
        where entity_type = 'container_job' and entity_id = $1
        order by created_at asc
      `,
      [id],
    );
    return mapContainerJob(result.rows[0], attachmentResult.rows);
  });
}

export async function updateContainerJobEir(id, form = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select ${joinedJobColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [id],
    );
    if (!existing.rows[0]) {
      const error = new Error('Container Job tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_NOT_FOUND';
      throw error;
    }
    ensureSalesOrderVerifiedForOperational(existing.rows[0]);

    await client.query(
      `
        update container_jobs
        set container_number = $1,
            eir_number = $2,
            updated_by_name = $3,
            updated_at = now()
        where id = $4
      `,
      [
        String(form.containerNumber || existing.rows[0].container_number || '').trim() || existing.rows[0].container_number,
        form.eirNumber || null,
        form.updatedBy || 'Operational',
        id,
      ],
    );

    const updated = await client.query(
      `
        select ${joinedJobColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [id],
    );
    const attachmentResult = await client.query(
      `
        select ${attachmentColumns}
        from attachments
        where entity_type = 'container_job' and entity_id = $1
        order by created_at asc
      `,
      [id],
    );
    return mapContainerJob(updated.rows[0], attachmentResult.rows);
  });
}

function buildGeneratedSpkNumber(job) {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const jobPart = String(job.container_number || job.so_number || job.id || '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase()
    .slice(-4)
    .padStart(4, '0');
  return `SPK-${yearMonth}-${jobPart}`;
}

export async function generateContainerJobSpk(id, form = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select ${joinedJobColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [id],
    );

    if (!existing.rows[0]) {
      const error = new Error('Container Job tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_NOT_FOUND';
      throw error;
    }
    ensureSalesOrderVerifiedForOperational(existing.rows[0]);

    if (!['approved', 'paid'].includes(existing.rows[0].rpuj_status)) {
      const error = new Error('SPK belum bisa terbit. Finance harus approve RPUJ terlebih dahulu.');
      error.statusCode = 409;
      error.code = 'SPK_WAITING_FINANCE_APPROVAL';
      throw error;
    }

    const nextSpkNumber = String(form.spkNumber || '').trim() || existing.rows[0].spk_number || buildGeneratedSpkNumber(existing.rows[0]);

    await client.query(
      `
        update container_jobs
        set spk_number = $1,
            updated_by_name = $2,
            updated_at = now()
        where id = $3
      `,
      [nextSpkNumber, form.updatedBy || 'Operational', id],
    );

    const updated = await client.query(
      `
        select ${joinedJobColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [id],
    );
    const attachmentResult = await client.query(
      `
        select ${attachmentColumns}
        from attachments
        where entity_type = 'container_job' and entity_id = $1
        order by created_at asc
      `,
      [id],
    );
    return mapContainerJob(updated.rows[0], attachmentResult.rows);
  });
}
