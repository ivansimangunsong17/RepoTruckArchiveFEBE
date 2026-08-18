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
  cj.cancel_reason, cj.cancel_source, cj.cancelled_by_name,
  cj.repo_location, cj.repo_stored_at, cj.repo_eir_number, cj.repo_reason, cj.repo_notes, cj.repo_container_condition,
  cj.repo_released_driver_id, cj.repo_released_vehicle_id, cj.repo_created_by_name,
  cj.repo_picked_up_at, cj.repo_picked_up_by_name,
  cj.entry_source, cj.historical_period, cj.historical_notes,
  cj.has_driver_commission, cj.driver_commission_amount,
  cj.driver_commission_source_destination_id, cj.driver_commission_note,
  so.so_number, so.accurate_so_number, so.do_number, so.customer_name, so.shipment_type, so.job_type,
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

function normalizeBooleanFlag(value) {
  return value === true || String(value || '').toLowerCase() === 'true' || value === '1';
}

function periodFromDate(value, fallback = '') {
  const datePeriod = String(value || '').trim().match(/^(\d{4}-\d{2})-/)?.[1] || '';
  return normalizeOptionalText(datePeriod || fallback);
}

function normalizeDateOnly(value) {
  const clean = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : '';
}

function buildJobWhere({
  query: keyword = '',
  status = '',
  requestStatus = '',
  rpujStage = '',
  documentStatus = '',
  tripDate = '',
  entrySource = '',
  historicalPeriod = '',
  includeRpujStage = true,
  excludeCancelledJobs = false,
} = {}) {
  const clauses = [
    "so.status <> 'cancelled'",
    "nullif(btrim(so.so_number), '') is not null",
  ];
  const params = [];
  const cleanKeyword = keyword.trim();
  const cleanTripDate = normalizeDateOnly(tripDate);

  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.accurate_so_number ilike $${params.length}
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

  if (cleanTripDate) {
    params.push(cleanTripDate);
    clauses.push(`so.trip_date = $${params.length}::date`);
  }

  if (entrySource) {
    params.push(normalizeEntrySource(entrySource));
    clauses.push(`coalesce(cj.entry_source, 'realtime') = $${params.length}`);
  }

  if (historicalPeriod) {
    params.push(String(historicalPeriod).trim());
    clauses.push(`cj.historical_period = $${params.length}`);
  }

  if (excludeCancelledJobs) {
    clauses.push("cj.status <> 'cancelled'");
  }

  if (requestStatus) {
    params.push(requestStatus);
    clauses.push(`cj.cancel_request_status = $${params.length}`);
  }

  if (includeRpujStage && rpujStage) {
    clauses.push("cj.status <> 'cancelled'");
    if (rpujStage === 'queue') {
      clauses.push("coalesce(cj.rpuj_status, 'pending') in ('pending', 'rejected')");
    } else if (rpujStage === 'submitted') {
      clauses.push("cj.rpuj_status = 'submitted'");
    } else if (rpujStage === 'approved') {
      clauses.push("cj.rpuj_status = 'approved'");
    } else if (rpujStage === 'paid') {
      clauses.push("cj.rpuj_status = 'paid'");
    }
  }

  if (documentStatus === 'incomplete') {
    clauses.push(`(
      not exists (
        select 1 from attachments attachment
        where attachment.entity_type = 'container_job'
          and attachment.entity_id = cj.id
          and attachment.category = 'eirDocument'
      )
      or not exists (
        select 1 from attachments attachment
        where attachment.entity_type = 'container_job'
          and attachment.entity_id = cj.id
          and attachment.category = 'loadingVoucherDocument'
      )
      or not exists (
        select 1 from attachments attachment
        where attachment.entity_type = 'container_job'
          and attachment.entity_id = cj.id
          and attachment.category in ('tilaGatepassDocumentFile', 'unloadingVoucherDocument', 'weighingDocumentFile')
      )
      or not exists (
        select 1 from attachments attachment
        where attachment.entity_type = 'container_job'
          and attachment.entity_id = cj.id
          and attachment.category = 'travelDocumentFile'
      )
      or (
        (
          nullif(btrim(cj.repo_location), '') is not null
          or cj.repo_stored_at is not null
          or nullif(btrim(cj.repo_eir_number), '') is not null
        )
        and (
          nullif(btrim(cj.repo_eir_number), '') is null
          or not exists (
            select 1 from attachments attachment
            where attachment.entity_type = 'container_job'
              and attachment.entity_id = cj.id
              and attachment.category = 'repoEirDocument'
          )
        )
      )
    )`);
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

async function findMappedContainerJob(client, id) {
  const result = await client.query(
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
  return mapContainerJob(result.rows[0], attachmentResult.rows);
}

async function refreshOrderStatusAndMapJob(client, orderId, jobId) {
  await refreshOrderStatus(client, orderId);
  return findMappedContainerJob(client, jobId);
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

function assertVehicleAssignable(vehicle, existingVehicleId) {
  if (!vehicle) return;
  if (existingVehicleId && String(vehicle.id) === String(existingVehicleId)) return;
  if (['Maintenance', 'Tidak Aktif'].includes(vehicle.operational_status)) {
    const error = new Error(`Truck ${vehicle.plate_number} sedang ${vehicle.operational_status} dan tidak bisa di-assign.`);
    error.statusCode = 409;
    error.code = 'VEHICLE_NOT_ASSIGNABLE';
    throw error;
  }
}

function assertDriverAssignable(driver, existingDriverId) {
  if (!driver) return;
  if (existingDriverId && String(driver.id) === String(existingDriverId)) return;
  if (driver.operational_status === 'Blacklist') {
    const error = new Error(`Sopir ${driver.name} masuk blacklist dan tidak bisa di-assign.`);
    error.statusCode = 409;
    error.code = 'DRIVER_BLACKLISTED';
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
    : counts.running || counts.repo_stored || counts.completed
      ? 'running'
      : 'waiting_operational';

  await client.query(
    'update sales_orders set status = $1, updated_at = now() where id = $2',
    [nextStatus, salesOrderId],
  );
}

function ensureSalesOrderVerifiedForOperational(row) {
  if (String(row?.so_number || '').trim()) return;
  const error = new Error('Order belum memiliki Nomor SO internal. Operational baru bisa memproses setelah nomor kerja dibuat sistem.');
  error.statusCode = 409;
  error.code = 'SALES_ORDER_INTERNAL_SO_REQUIRED';
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

function normalizeCancelSource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['customer', 'sales', 'operational', 'other'].includes(normalized) ? normalized : 'operational';
}

function normalizeEntrySource(value) {
  return String(value || '').trim().toLowerCase() === 'historical' ? 'historical' : 'realtime';
}

function normalizeOptionalText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeNonNegativeAmount(value, label) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw validationError(`${label} tidak boleh negatif.`, 'VALIDATION_ERROR', 400);
  }
  return amount;
}

function normalizeOptionalUuid(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw validationError(`${label} tidak valid.`, 'VALIDATION_ERROR', 400);
  }
  return normalized;
}

function hasRepoStorageHistory(existing = {}) {
  return Boolean(
    existing.repo_stored_at
      || existing.repoStoredAt
      || existing.repo_location
      || existing.repoLocation
      || existing.repo_eir_number
      || existing.repoEirNumber
      || existing.repo_picked_up_at
      || existing.repoPickedUpAt,
  );
}

export function hasRequiredRepoCompletionDocuments(existing = {}, categories = new Set()) {
  if (!hasRepoStorageHistory(existing)) return true;
  return Boolean(String(existing.repo_eir_number || existing.repoEirNumber || '').trim() && categories.has('repoEirDocument'));
}

function isAssignmentReleasedStatus(status) {
  return ['completed', 'cancelled', 'repo_stored'].includes(status);
}

function isHistoricalBackfill(form = {}, existing = {}) {
  const source = hasOwnInput(form, 'entrySource') ? form.entrySource : existing.entry_source;
  return normalizeEntrySource(source) === 'historical' || Boolean(normalizeOptionalText(form.historicalPeriod || existing.historical_period));
}

export function shouldValidateVehicleContainerSize(form = {}, existing = {}) {
  return !isHistoricalBackfill(form, existing);
}

function requireTripStartAllowed(nextStatus, rpujStatus, options = {}) {
  if (options.allowHistoricalBackfill || options.allowAdminCorrection) return;
  if (!['running', 'completed'].includes(nextStatus)) return;
  if (['approved', 'paid'].includes(rpujStatus)) return;
  throw validationError(
    'Status perjalanan baru bisa Sedang Jalan setelah UJ disetujui Finance.',
    'TRIP_WAITING_RPUJ_APPROVAL',
    409,
  );
}

function assignmentValue(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function hasOwnInput(form, key) {
  return Object.prototype.hasOwnProperty.call(form, key);
}

export function hasCompleteOperationalAssignment(form = {}, driver = null, vehicle = null, existing = {}) {
  const assignment = existing?.assignment_snapshot || {};
  const driverName = assignmentValue(form.driver, driver?.name, assignment.driver);
  const plateNumber = assignmentValue(form.plateNumber, vehicle?.plate_number, assignment.plateNumber);
  return Boolean(driverName && plateNumber);
}

function requireCompleteOperationalAssignment(form, driver, vehicle, existing, message) {
  if (hasCompleteOperationalAssignment(form, driver, vehicle, existing)) return;
  throw validationError(
    message || 'Lengkapi truck dan driver terlebih dahulu.',
    'CONTAINER_JOB_ASSIGNMENT_REQUIRED',
    409,
  );
}

async function requireAssignmentAvailable(client, id, form, driver, vehicle, nextStatus) {
  if (isAssignmentReleasedStatus(nextStatus)) return;
  const driverName = String(form.driver || driver?.name || '').trim();
  const plateNumber = String(form.plateNumber || vehicle?.plate_number || '').trim();
  if (!driver?.id && !driverName && !vehicle?.id && !plateNumber) return;

  const result = await client.query(
    `
      select cj.id, cj.container_number, cj.assignment_snapshot, so.so_number
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where cj.id <> $1
        and cj.status not in ('completed', 'cancelled', 'repo_stored')
        and (
          ($2::uuid is not null and cj.driver_id = $2::uuid)
          or ($3::uuid is not null and cj.vehicle_id = $3::uuid)
          or ($4::text <> '' and lower(trim(cj.assignment_snapshot->>'driver')) = lower(trim($4::text)))
          or ($5::text <> '' and trim(cj.assignment_snapshot->>'plateNumber') = trim($5::text))
        )
      limit 1
    `,
    [id, driver?.id || form.driverId || null, vehicle?.id || form.vehicleId || null, driverName, plateNumber],
  );

  if (result.rows[0]) {
    const activeJob = result.rows[0];
    throw validationError(
      `Driver atau truck masih aktif di job lain (${activeJob.so_number || '-'} / ${activeJob.container_number || 'container belum diisi'}). Selesaikan atau batalkan job tersebut terlebih dahulu.`,
      'ASSIGNMENT_ALREADY_ACTIVE',
      409,
    );
  }
}

async function releaseDriverIfIdle(client, driverId) {
  if (!driverId) return;
  await client.query(
    `
      update drivers
      set operational_status = 'Aktif',
          updated_at = now()
      where id = $1
        and operational_status = 'Bertugas'
        and not exists (
          select 1
          from container_jobs cj
          where cj.driver_id = $1
            and cj.status not in ('completed', 'cancelled', 'repo_stored')
        )
    `,
    [driverId],
  );
}

async function releaseVehicleIfIdle(client, vehicleId) {
  if (!vehicleId) return;
  await client.query(
    `
      update vehicles
      set operational_status = 'Aktif',
          updated_at = now()
      where id = $1
        and operational_status = 'Bertugas'
        and not exists (
          select 1
          from container_jobs cj
          where cj.vehicle_id = $1
            and cj.status not in ('completed', 'cancelled', 'repo_stored')
        )
    `,
    [vehicleId],
  );
}

async function syncResourceAssignmentStatus(client, existing, nextAssignment = {}, nextStatus) {
  const nextDriverId = nextAssignment.driverId || null;
  const nextVehicleId = nextAssignment.vehicleId || null;
  const previousDriverId = existing?.driver_id || null;
  const previousVehicleId = existing?.vehicle_id || null;
  const assignmentActive = !isAssignmentReleasedStatus(nextStatus);

  if (assignmentActive && nextDriverId) {
    await client.query(
      `
        update drivers
        set operational_status = 'Bertugas',
            updated_at = now()
        where id = $1
          and archived_at is null
          and operational_status not in ('Cuti', 'Tidak Aktif')
      `,
      [nextDriverId],
    );
  }

  if (assignmentActive && nextVehicleId) {
    await client.query(
      `
        update vehicles
        set operational_status = 'Bertugas',
            updated_at = now()
        where id = $1
          and archived_at is null
          and operational_status not in ('Maintenance', 'Tidak Aktif')
      `,
      [nextVehicleId],
    );
  }

  await releaseDriverIfIdle(client, previousDriverId);
  await releaseVehicleIfIdle(client, previousVehicleId);
  if (!assignmentActive || nextDriverId !== previousDriverId) await releaseDriverIfIdle(client, nextDriverId);
  if (!assignmentActive || nextVehicleId !== previousVehicleId) await releaseVehicleIfIdle(client, nextVehicleId);
}

async function requireCompletedJobReady(client, id, form, existing, options = {}) {
  const allowHistoricalBackfill = Boolean(options.allowHistoricalBackfill);
  const allowAdminCorrection = Boolean(options.allowAdminCorrection);
  if (!allowHistoricalBackfill && !allowAdminCorrection && !['approved', 'paid'].includes(existing.rpuj_status || form.rpujStatus)) {
    throw validationError(
      'Pekerjaan belum dapat diselesaikan. UJ harus disetujui/dikirim Finance terlebih dahulu.',
      'CONTAINER_JOB_COMPLETION_INCOMPLETE',
      409,
    );
  }

  const runningAt = form.runningAt || existing.running_at;
  const completedAt = form.completedAt;
  if (runningAt && completedAt && new Date(completedAt) < new Date(runningAt)) {
    throw validationError(
      'Pekerjaan belum dapat diselesaikan. Waktu selesai tidak boleh lebih awal dari waktu mulai.',
      'CONTAINER_JOB_COMPLETION_INVALID_TIME',
      409,
    );
  }

  const requiredValues = [
    ['nomor container', String(form.containerNumber || existing.container_number || '').trim()],
    ['driver', form.driver || form.driverId || existing.driver_id],
    ['truck', form.plateNumber || form.vehicleId || existing.vehicle_id],
    ['waktu mulai', runningAt],
    ['waktu selesai', completedAt],
  ];
  const missingValue = requiredValues.find(([, value]) => !value);
  if (missingValue) {
    throw validationError(
      `Pekerjaan belum dapat diselesaikan. Lengkapi ${missingValue[0]} terlebih dahulu.`,
      'CONTAINER_JOB_COMPLETION_INCOMPLETE',
      409,
    );
  }
  if (allowHistoricalBackfill || allowAdminCorrection) return;

  const attachmentResult = await client.query(
    `
      select category
      from attachments
      where entity_type = 'container_job'
        and entity_id = $1
        and category in ('spkDocument', 'eirDocument', 'repoEirDocument')
    `,
    [id],
  );
  const categories = new Set(attachmentResult.rows.map((row) => row.category));
  if (!hasRequiredRepoCompletionDocuments(existing, categories)) {
    throw validationError(
      'Pekerjaan belum dapat diselesaikan. Lengkapi EIR Titip dari depo penitipan terlebih dahulu.',
      'CONTAINER_JOB_COMPLETION_INCOMPLETE',
      409,
    );
  }
  if (!(form.spkNumber || existing.spk_number || categories.has('spkDocument'))) {
    throw validationError(
      'Pekerjaan belum dapat diselesaikan. Lengkapi SPK terlebih dahulu.',
      'CONTAINER_JOB_COMPLETION_INCOMPLETE',
      409,
    );
  }
  if (!categories.has('eirDocument')) {
    throw validationError(
      'Pekerjaan belum dapat diselesaikan. Upload lampiran EIR terlebih dahulu.',
      'CONTAINER_JOB_COMPLETION_INCOMPLETE',
      409,
    );
  }
}

export async function findContainerJobsPage(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildJobWhere(options);
  const rpujCountWhere = buildJobWhere({ ...options, includeRpujStage: false, excludeCancelledJobs: true });
  const statusCountWhere = buildJobWhere({ ...options, status: '', includeRpujStage: false });
  const groupByOrder = normalizeBooleanFlag(options.groupByOrder);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const rowQuery = groupByOrder
    ? `
        with filtered_jobs as (
          select ${joinedJobColumns},
            case cj.status
              when 'received' then 1
              when 'running' then 2
              when 'repo_stored' then 3
              when 'completed' then 4
              when 'cancelled' then 5
              else 4
            end as job_status_rank,
            coalesce(cj.cancel_requested_at, cj.updated_at) as job_activity_at,
            so.trip_date as order_trip_date,
            cj.created_at as job_created_at
          from container_jobs cj
          join sales_orders so on so.id = cj.sales_order_id
          ${whereSql}
        ),
        page_orders as (
          select
            sales_order_id,
            min(job_status_rank) as status_rank,
            max(job_activity_at) as latest_activity_at,
            min(order_trip_date) as trip_date,
            min(job_created_at) as first_job_created_at
          from filtered_jobs
          group by sales_order_id
          order by
            min(job_status_rank),
            max(job_activity_at) desc,
            min(order_trip_date) asc,
            min(job_created_at) asc
          limit $${limitIndex} offset $${offsetIndex}
        )
        select filtered_jobs.*
        from filtered_jobs
        join page_orders on page_orders.sales_order_id = filtered_jobs.sales_order_id
        order by
          page_orders.status_rank,
          page_orders.latest_activity_at desc,
          page_orders.trip_date asc,
          page_orders.first_job_created_at asc,
          filtered_jobs.job_status_rank,
          filtered_jobs.job_activity_at desc,
          filtered_jobs.order_trip_date asc,
          filtered_jobs.job_created_at asc
      `
    : `
        select ${joinedJobColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
        order by
          case cj.status
            when 'received' then 1
            when 'running' then 2
            when 'repo_stored' then 3
            when 'completed' then 4
            when 'cancelled' then 5
            else 4
          end,
          coalesce(cj.cancel_requested_at, cj.updated_at) desc,
          so.trip_date asc,
          cj.created_at asc
        limit $${limitIndex} offset $${offsetIndex}
      `;

  const [rowsResult, countResult, statusResult, rpujStatusResult] = await Promise.all([
    query(
      rowQuery,
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
        ${statusCountWhere.whereSql}
        group by cj.status
      `,
      statusCountWhere.params,
    ),
    query(
      `
        select
          case
            when cj.rpuj_status = 'paid' then 'paid'
            when cj.rpuj_status = 'approved' then 'approved'
            when cj.rpuj_status = 'submitted' then 'submitted'
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
  const groupCountResult = groupByOrder
    ? await query(
        `
          select count(distinct cj.sales_order_id)::int as total
          from container_jobs cj
          join sales_orders so on so.id = cj.sales_order_id
          ${whereSql}
        `,
        params,
      )
    : { rows: [{ total: 0 }] };

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

  const counts = { received: 0, running: 0, repo_stored: 0, completed: 0, cancelled: 0 };
  statusResult.rows.forEach((row) => {
    counts[row.status] = row.total;
  });
  const rpujCounts = { queue: 0, submitted: 0, approved: 0, paid: 0 };
  rpujStatusResult.rows.forEach((row) => {
    rpujCounts[row.stage] = row.total;
  });
  const totalRows = countResult.rows[0]?.total || 0;
  const totalGroups = groupByOrder ? groupCountResult.rows[0]?.total || 0 : 0;

  return {
    rows: rowsResult.rows.map((row) => mapContainerJob(row, groupedAttachments[row.id] || [])),
    total: groupByOrder ? totalGroups : totalRows,
    totalRows,
    totalGroups,
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
               cj.driver_id, cj.vehicle_id, cj.rpuj_status, cj.rpuj_notes, cj.status, cj.eir_number,
               cj.assignment_snapshot,
               cj.loading_voucher_number, cj.travel_document_number, cj.tila_gatepass_document_number,
               cj.unloading_voucher_number, cj.weighing_document_number,
               cj.spk_number, cj.cancel_reason, cj.cancel_source, cj.cancelled_by_name,
               cj.repo_location, cj.repo_stored_at, cj.repo_eir_number, cj.repo_reason, cj.repo_notes, cj.repo_container_condition,
               cj.repo_released_driver_id, cj.repo_released_vehicle_id, cj.repo_created_by_name,
               cj.repo_picked_up_at, cj.repo_picked_up_by_name,
               cj.entry_source, cj.historical_period, cj.historical_notes,
               cj.has_driver_commission, cj.driver_commission_amount,
               cj.driver_commission_source_destination_id, cj.driver_commission_note,
               so.so_number, so.trip_date, so.finance_verification_status
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

    const currentJob = existing.rows[0];
    const allowHistoricalBackfill = isHistoricalBackfill(form, currentJob);
    const allowAdminCorrection = normalizeBooleanFlag(form.adminCorrectionMode);
    const driver = await findDriver(client, form);
    const vehicle = await findVehicle(client, form);
    assertDriverAssignable(driver, currentJob.driver_id);
    assertVehicleAssignable(vehicle, currentJob.vehicle_id);
    if (shouldValidateVehicleContainerSize(form, currentJob)) {
      assertVehicleMatchesContainer(vehicle, currentJob.container_size);
    }
    const nextStatus = form.status || currentJob.status || 'received';
    if (nextStatus === 'cancelled' && currentJob.status === 'completed' && !allowAdminCorrection) {
      throw validationError(
        'Container Job yang sudah selesai tidak dapat dibatalkan.',
        'CONTAINER_JOB_COMPLETED_CANNOT_CANCEL',
        409,
      );
    }
    const nextRpujStatus = normalizeRpujStatusForOperational(currentJob, form.rpujStatus);
    if (nextRpujStatus === 'submitted' && !['submitted', 'approved', 'paid'].includes(currentJob.rpuj_status)) {
      requireCompleteOperationalAssignment(
        form,
        driver,
        vehicle,
        currentJob,
        'RPUJ belum bisa diajukan. Lengkapi truck dan driver terlebih dahulu.',
      );
    }
    requireTripStartAllowed(nextStatus, nextRpujStatus, { allowHistoricalBackfill, allowAdminCorrection });
    if (['running', 'completed'].includes(nextStatus)) {
      requireCompleteOperationalAssignment(
        form,
        driver,
        vehicle,
        currentJob,
        'Status perjalanan belum bisa Sedang Jalan. Lengkapi truck dan driver terlebih dahulu.',
      );
    }
    await requireAssignmentAvailable(client, id, form, driver, vehicle, nextStatus);
    if (nextStatus === 'completed') {
      await requireCompletedJobReady(client, id, form, currentJob, { allowHistoricalBackfill, allowAdminCorrection });
    }
    const requestRpujAt = nextRpujStatus === 'submitted' && currentJob.rpuj_status !== 'submitted'
      ? new Date().toISOString()
      : null;
    const nextContainerNumber = hasOwnInput(form, 'containerNumber')
      ? String(form.containerNumber || existing.rows[0].container_number || '').trim().toUpperCase() || null
      : existing.rows[0].container_number || null;
    const runningAt = nextStatus === 'cancelled'
      ? existing.rows[0].running_at
      : nextStatus === 'repo_stored'
        ? form.runningAt || existing.rows[0].running_at
      : ['running', 'completed'].includes(nextStatus)
        ? form.runningAt || new Date().toISOString()
        : null;
    const cancelledAt = nextStatus === 'cancelled'
      ? form.cancelledAt || existing.rows[0].cancelled_at || new Date().toISOString()
      : null;
    const cancelReason = nextStatus === 'cancelled'
      ? String(form.cancelReason || form.cancelRequestNote || existing.rows[0].cancel_reason || 'Pembatalan Container Job').trim()
      : existing.rows[0].cancel_reason || null;
    const cancelSource = nextStatus === 'cancelled'
      ? normalizeCancelSource(form.cancelSource || existing.rows[0].cancel_source)
      : existing.rows[0].cancel_source || null;
    const cancelledByName = nextStatus === 'cancelled'
      ? form.cancelledByName || form.updatedBy || existing.rows[0].cancelled_by_name || 'Operational'
      : existing.rows[0].cancelled_by_name || null;
    const hasDriverAssignmentInput = hasOwnInput(form, 'driverId') || hasOwnInput(form, 'driver');
    const hasVehicleAssignmentInput = hasOwnInput(form, 'vehicleId') || hasOwnInput(form, 'plateNumber');
    const nextDriverId = driver?.id || form.driverId || (hasDriverAssignmentInput ? null : existing.rows[0].driver_id);
    const nextVehicleId = vehicle?.id || form.vehicleId || (hasVehicleAssignmentInput ? null : existing.rows[0].vehicle_id);
    const existingAssignment = existing.rows[0].assignment_snapshot || {};
    const nextAssignmentForm = {
      driver: existingAssignment.driver || '',
      plateNumber: existingAssignment.plateNumber || '',
      chassis: existingAssignment.vehicleDetail || '',
      driverPaymentMethod: existingAssignment.driverPaymentMethod || 'bank',
      driverBankName: existingAssignment.driverBankName || '',
      driverBankAccountNumber: existingAssignment.driverBankAccountNumber || '',
      driverBankAccountHolder: existingAssignment.driverBankAccountHolder || '',
      driverEmoneyProvider: existingAssignment.driverEmoneyProvider || '',
      driverEmoneyNumber: existingAssignment.driverEmoneyNumber || '',
      ...form,
    };
    const nextRepoLocation = normalizeOptionalText(form.repoLocation ?? existing.rows[0].repo_location);
    const nextRepoStoredAt = nextStatus === 'repo_stored'
      ? form.repoStoredAt || existing.rows[0].repo_stored_at || new Date().toISOString()
      : form.repoStoredAt || existing.rows[0].repo_stored_at || null;
    const nextRepoEirNumber = normalizeOptionalText(form.repoEirNumber ?? existing.rows[0].repo_eir_number);
    const nextRepoReason = normalizeOptionalText(form.repoReason ?? existing.rows[0].repo_reason);
    const nextRepoNotes = normalizeOptionalText(form.repoNotes ?? existing.rows[0].repo_notes);
    const nextRepoContainerCondition = normalizeOptionalText(form.repoContainerCondition ?? existing.rows[0].repo_container_condition);
    const nextRepoReleasedDriverId = form.repoReleasedDriverId
      || existing.rows[0].repo_released_driver_id
      || (nextStatus === 'repo_stored' ? existing.rows[0].driver_id || nextDriverId : null);
    const nextRepoReleasedVehicleId = form.repoReleasedVehicleId
      || existing.rows[0].repo_released_vehicle_id
      || (nextStatus === 'repo_stored' ? existing.rows[0].vehicle_id || nextVehicleId : null);
    const nextRepoCreatedByName = normalizeOptionalText(
      form.repoCreatedByName
        ?? existing.rows[0].repo_created_by_name
        ?? (nextStatus === 'repo_stored' ? form.updatedBy || 'Operational' : null),
    );
    const isRepoPickup = existing.rows[0].status === 'repo_stored' && nextStatus !== 'repo_stored';
    const nextRepoPickedUpAt = isRepoPickup
      ? form.repoPickedUpAt || existing.rows[0].repo_picked_up_at || new Date().toISOString()
      : existing.rows[0].repo_picked_up_at || null;
    const nextRepoPickedUpByName = isRepoPickup
      ? normalizeOptionalText(form.repoPickedUpByName || form.updatedBy || 'Operational')
      : existing.rows[0].repo_picked_up_by_name || null;
    const nextRpujNotes = hasOwnInput(form, 'rpujNotes') ? form.rpujNotes || null : existing.rows[0].rpuj_notes || null;
    const nextEirNumber = hasOwnInput(form, 'eirNumber') ? form.eirNumber || null : existing.rows[0].eir_number || null;
    const nextLoadingVoucher = hasOwnInput(form, 'loadingVoucher') ? form.loadingVoucher || null : existing.rows[0].loading_voucher_number || null;
    const nextTravelDocument = hasOwnInput(form, 'travelDocument') ? form.travelDocument || null : existing.rows[0].travel_document_number || null;
    const nextEntrySource = hasOwnInput(form, 'entrySource')
      ? normalizeEntrySource(form.entrySource)
      : existing.rows[0].entry_source || 'realtime';
    const nextHistoricalPeriod = nextEntrySource === 'historical'
      ? periodFromDate(existing.rows[0].trip_date, hasOwnInput(form, 'historicalPeriod') ? form.historicalPeriod : existing.rows[0].historical_period)
      : null;
    const nextHistoricalNotes = nextEntrySource === 'historical'
      ? normalizeOptionalText(hasOwnInput(form, 'historicalNotes') ? form.historicalNotes : existing.rows[0].historical_notes)
      : null;
    const hasTilaInput = hasOwnInput(form, 'tilaGatepassDocument') || hasOwnInput(form, 'unloadingVoucher') || hasOwnInput(form, 'weighingDocument');
    const nextTilaGatepassDocument = hasTilaInput
      ? form.tilaGatepassDocument || form.unloadingVoucher || form.weighingDocument || null
      : existing.rows[0].tila_gatepass_document_number || existing.rows[0].unloading_voucher_number || existing.rows[0].weighing_document_number || null;
    const nextHasDriverCommission = hasOwnInput(form, 'hasDriverCommission')
      ? Boolean(form.hasDriverCommission)
      : Boolean(existing.rows[0].has_driver_commission);
    const nextDriverCommissionAmount = nextHasDriverCommission
      ? normalizeNonNegativeAmount(
        hasOwnInput(form, 'driverCommissionAmount') ? form.driverCommissionAmount : existing.rows[0].driver_commission_amount,
        'Nominal komisi sopir',
      )
      : 0;
    if (nextHasDriverCommission && nextDriverCommissionAmount <= 0) {
      throw validationError('Nominal komisi sopir wajib lebih dari 0 jika komisi aktif.', 'VALIDATION_ERROR', 400);
    }
    const nextDriverCommissionSourceDestinationId = nextHasDriverCommission
      ? normalizeOptionalUuid(
        hasOwnInput(form, 'driverCommissionSourceDestinationId')
          ? form.driverCommissionSourceDestinationId
          : existing.rows[0].driver_commission_source_destination_id,
        'Sumber komisi sopir',
      )
      : null;
    const nextDriverCommissionNote = nextHasDriverCommission
      ? normalizeOptionalText(
        hasOwnInput(form, 'driverCommissionNote')
          ? form.driverCommissionNote
          : existing.rows[0].driver_commission_note,
      )
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
            cancel_reason = $18,
            cancel_source = $19,
            cancelled_by_name = $20,
            cancel_request_status = case when $14 = 'cancelled' then 'approved' else cancel_request_status end,
            cancel_request_note = case when $14 = 'cancelled' then coalesce($18, cancel_request_note) else cancel_request_note end,
            cancel_reviewed_by_name = case when $14 = 'cancelled' then coalesce($20, cancel_reviewed_by_name) else cancel_reviewed_by_name end,
            cancel_reviewed_at = case when $14 = 'cancelled' then now() else cancel_reviewed_at end,
            repo_location = $21,
            repo_stored_at = $22,
            repo_eir_number = $23,
            repo_reason = $24,
            repo_notes = $25,
            repo_container_condition = $26,
            repo_released_driver_id = $27,
            repo_released_vehicle_id = $28,
            repo_created_by_name = $29,
            repo_picked_up_at = $30,
            repo_picked_up_by_name = $31,
            entry_source = $32,
            historical_period = $33,
            historical_notes = $34,
            has_driver_commission = $35,
            driver_commission_amount = $36,
            driver_commission_source_destination_id = $37::uuid,
            driver_commission_note = $38,
            updated_by_name = $39,
            updated_at = now()
        where id = $40
      `,
      [
        nextContainerNumber,
        nextDriverId,
        nextVehicleId,
        JSON.stringify(toAssignmentSnapshot(nextAssignmentForm, driver, vehicle)),
        nextRpujStatus,
        nextRpujNotes,
        requestRpujAt,
        form.updatedBy || 'Operational',
        form.spkNumber || null,
        nextEirNumber,
        nextLoadingVoucher,
        nextTravelDocument,
        nextTilaGatepassDocument,
        nextStatus,
        runningAt,
        nextStatus === 'completed' ? form.completedAt || new Date().toISOString() : null,
        cancelledAt,
        cancelReason,
        cancelSource,
        cancelledByName,
        nextRepoLocation,
        nextRepoStoredAt,
        nextRepoEirNumber,
        nextRepoReason,
        nextRepoNotes,
        nextRepoContainerCondition,
        nextRepoReleasedDriverId,
        nextRepoReleasedVehicleId,
        nextRepoCreatedByName,
        nextRepoPickedUpAt,
        nextRepoPickedUpByName,
        nextEntrySource,
        nextHistoricalPeriod,
        nextHistoricalNotes,
        nextHasDriverCommission,
        nextDriverCommissionAmount,
        nextDriverCommissionSourceDestinationId,
        nextDriverCommissionNote,
        form.updatedBy || 'Operational',
        id,
      ],
    );

    await syncResourceAssignmentStatus(client, existing.rows[0], {
      driverId: nextDriverId,
      vehicleId: nextVehicleId,
    }, nextStatus);
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
    await client.query(
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
      `,
      [
        form.cancelRequestNote || null,
        form.cancelRequestedByName || null,
        form.cancelRequestedByRole || null,
        form.cancelRequestedByName || null,
        id,
      ],
    );
    return findMappedContainerJob(client, id);
  });
}

export async function reviewContainerJobCancellation(id, form = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'select id, sales_order_id, driver_id, vehicle_id, status, cancel_request_status, cancel_request_note, cancel_requested_by_name, cancel_requested_by_role, cancel_requested_at, cancel_reason, cancel_source from container_jobs where id = $1',
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
      const cancelReason = String(
        form.cancelRequestNote
        || existing.rows[0].cancel_request_note
        || existing.rows[0].cancel_reason
        || 'Pembatalan Container Job',
      ).trim();
      const cancelSource = normalizeCancelSource(form.cancelSource || existing.rows[0].cancel_source || 'sales');
      await client.query(
        `
          update container_jobs
          set status = 'cancelled',
              cancelled_at = now(),
              cancel_reason = $8,
              cancel_source = $9,
              cancelled_by_name = $5,
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
        `,
        [
          form.cancelRequestNote || null,
          existing.rows[0].cancel_requested_by_name || null,
          existing.rows[0].cancel_requested_by_role || null,
          existing.rows[0].cancel_requested_at || null,
          form.cancelReviewedByName || null,
          form.cancelReviewNote || null,
          id,
          cancelReason,
          cancelSource,
        ],
      );
      await syncResourceAssignmentStatus(client, existing.rows[0], {
        driverId: existing.rows[0].driver_id,
        vehicleId: existing.rows[0].vehicle_id,
      }, 'cancelled');
      return refreshOrderStatusAndMapJob(client, existing.rows[0].sales_order_id, id);
    }

    await client.query(
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
    return findMappedContainerJob(client, id);
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
    const driver = await findDriver(client, form);
    const vehicle = await findVehicle(client, form);
    assertDriverAssignable(driver, existing.rows[0].driver_id);
    requireCompleteOperationalAssignment(
      form,
      driver,
      vehicle,
      existing.rows[0],
      'SPK belum bisa terbit. Lengkapi truck dan driver terlebih dahulu.',
    );

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
