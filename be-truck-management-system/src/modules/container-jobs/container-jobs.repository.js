import crypto from 'node:crypto';
import { query, withTransaction } from '../../db/client.js';
import { mapAssignmentHistory, mapContainerJob, mapContainerJobExpense, toAssignmentSnapshot } from './container-jobs.mapper.js';
import {
  assertCompletionNotBeforeStart,
  assertOperationalTimeline,
  isOperationalTimestampChanged,
  lockRepoPickupMovementForJob,
  reconcileRepoPickupMovement,
  requirePhysicalRepoPickup,
} from './repo-pickup-lifecycle.js';
import { buildRepoUjDescription, normalizeRepoUjAmount, postRepoUjToDroppingAccount } from './repo-pickup-uj.js';
import { createRepoRevenueLines } from './repo-pickup-revenue.js';
import { assertContainerNumberAllowed } from './container-number-guard.js';
import { isSalesOrderBillingAdvanced } from '../finance/finance-eligibility.js';

const joinedJobColumns = `
  cj.id, cj.sales_order_id, cj.execution_source, cj.container_number, cj.container_size, cj.container_type,
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
  cj.inap_started_at, cj.inap_ended_at, cj.inap_reason, cj.inap_notes, cj.inap_created_by_name,
  cj.uj_amount_snapshot, cj.uj_source_destination_id, cj.uj_snapshot_at, cj.uj_snapshot_source,
  cj.entry_source, cj.historical_period, cj.historical_notes,
  cj.is_backdate_entry, cj.backdate_reason, cj.created_as_correction,
  cj.has_driver_commission, cj.driver_commission_amount,
  cj.driver_commission_source_destination_id, cj.driver_commission_note,
  cj.commission_driver_id, cj.commission_driver_name, cj.commission_driver_snapshot,
  cj.commission_locked_amount, cj.commission_locked_at, cj.commission_status,
  (select dci.batch_id from driver_commission_items dci where dci.container_job_id = cj.id and dci.voided_at is null limit 1) as commission_batch_id,
  (select dcb.status from driver_commission_items dci join driver_commission_batches dcb on dcb.id = dci.batch_id where dci.container_job_id = cj.id and dci.voided_at is null limit 1) as commission_batch_status,
  (
    select cpm.id
    from container_pickup_items cpi
    join container_pickup_movements cpm on cpm.id = cpi.movement_id
    where cpi.container_job_id = cj.id
      and cpm.status <> 'cancelled'
    order by cpm.created_at desc
    limit 1
  ) as pickup_movement_id,
  (
    select cpm.pickup_type
    from container_pickup_items cpi
    join container_pickup_movements cpm on cpm.id = cpi.movement_id
    where cpi.container_job_id = cj.id
      and cpm.status <> 'cancelled'
    order by cpm.created_at desc
    limit 1
  ) as pickup_type,
  (
    select cpm.started_at
    from container_pickup_items cpi
    join container_pickup_movements cpm on cpm.id = cpi.movement_id
    where cpi.container_job_id = cj.id
      and cpm.status <> 'cancelled'
    order by cpm.created_at desc
    limit 1
  ) as pickup_started_at,
  (
    select cpm.completed_at
    from container_pickup_items cpi
    join container_pickup_movements cpm on cpm.id = cpi.movement_id
    where cpi.container_job_id = cj.id
      and cpm.status <> 'cancelled'
    order by cpm.created_at desc
    limit 1
  ) as pickup_completed_at,
  (
    select cpi.sequence_no
    from container_pickup_items cpi
    join container_pickup_movements cpm on cpm.id = cpi.movement_id
    where cpi.container_job_id = cj.id
      and cpm.status <> 'cancelled'
    order by cpm.created_at desc
    limit 1
  ) as pickup_sequence_no,
  (
    select count(*)::int
    from container_pickup_items cpi
    join container_pickup_movements cpm on cpm.id = cpi.movement_id
    where cpm.id = (
      select inner_cpm.id
      from container_pickup_items inner_cpi
      join container_pickup_movements inner_cpm on inner_cpm.id = inner_cpi.movement_id
      where inner_cpi.container_job_id = cj.id
        and inner_cpm.status <> 'cancelled'
      order by inner_cpm.created_at desc
      limit 1
    )
  ) as pickup_item_count,
  (
    select array_remove(array_agg(nullif(coalesce(sibling.container_number, ''), '') order by sibling_item.sequence_no), null)
    from container_pickup_items current_item
    join container_pickup_movements cpm on cpm.id = current_item.movement_id
    join container_pickup_items sibling_item on sibling_item.movement_id = cpm.id
    join container_jobs sibling on sibling.id = sibling_item.container_job_id
    where current_item.container_job_id = cj.id
      and cpm.status <> 'cancelled'
    group by cpm.id, cpm.created_at
    order by cpm.created_at desc
    limit 1
  ) as pickup_container_numbers,
  so.so_number, so.accurate_so_number, so.do_number, so.customer_name, so.shipment_type, so.job_type,
  so.finance_verification_status,
  to_jsonb(so)->>'vessel_name' as vessel_name,
  so.terminal, so.service_name, so.origin, cj.destination, so.trip_date,
  cj.warehouse_location_id, cj.warehouse_location_name_snapshot, cj.warehouse_location_address_snapshot,
  cj.destination_id,
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

const expenseColumns = `
  expense.id,
  expense.sales_order_id,
  expense.container_job_id,
  expense.driver_id,
  expense.category,
  expense.expense_group,
  expense.amount,
  expense.description,
  expense.recipient_type,
  expense.recipient_name,
  expense.payment_status,
  expense.paid_at,
  expense.paid_by_name,
  expense.proof_attachment_id,
  expense.finance_check_status,
  expense.finance_checked_by_name,
  expense.finance_checked_at,
  expense.finance_note,
  expense.source,
  expense.source_ref_id,
  expense.input_source,
  expense.created_by_name,
  expense.updated_by_name,
  expense.created_at,
  expense.updated_at,
  proof.file_name as proof_file_name,
  proof.storage_path as proof_storage_path,
  proof.mime_type as proof_mime_type,
  proof.file_size as proof_file_size
`;

const jakartaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toJakartaDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return jakartaDateFormatter.format(new Date());
  return jakartaDateFormatter.format(date);
}

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function normalizeBooleanFlag(value) {
  return value === true || String(value || '').toLowerCase() === 'true' || value === '1';
}

function orderNumberSearchSql(alias = 'so') {
  return `concat('ORD-', upper(left(regexp_replace(${alias}.id::text, '[^a-zA-Z0-9]', '', 'g'), 8)))`;
}

async function findExpenseRowsByJobId(executeQuery, id) {
  const result = await executeQuery(
    `
      select ${expenseColumns}
      from container_job_expenses expense
      left join attachments proof on proof.id = expense.proof_attachment_id
      where expense.container_job_id = $1
      order by expense.created_at asc, expense.id asc
    `,
    [id],
  );
  return result.rows;
}

function periodFromDate(value, fallback = '') {
  const datePeriod = String(value || '').trim().match(/^(\d{4}-\d{2})-/)?.[1] || '';
  return normalizeOptionalText(datePeriod || fallback);
}

function operationalFundCategoryFromExpense(category = '') {
  if (category === 'uj_awal') return 'uj_order';
  if (category === 'top_up_uj') return 'top_up_uj';
  return 'biaya_lainnya';
}

async function ensureOperationalFundBatch(client, batchDate, actorName = 'Operational') {
  const result = await client.query(
    `
      insert into operational_fund_batches (
        batch_date,
        status,
        created_by_name,
        updated_by_name
      )
      values (coalesce($1::date, current_date), 'open', $2, $2)
      on conflict (batch_date) do update
        set updated_at = operational_fund_batches.updated_at
      returning id, batch_date, status
    `,
    [batchDate, actorName],
  );
  const batch = result.rows[0];
  if (batch.status === 'closed') {
    const error = new Error('Batch rekening dropping tanggal ini sudah ditutup.');
    error.statusCode = 409;
    error.code = 'OPERATIONAL_FUND_BATCH_CLOSED';
    throw error;
  }
  return batch;
}

async function ensureSufficientOperationalFundBalance(client, batch, expenseId, newAmount) {
  const balanceResult = await client.query(
    `
      select
        coalesce(sum(amount) filter (where transaction_type = 'credit' and status = 'posted'), 0)
        - coalesce(sum(amount) filter (where transaction_type = 'debit' and status = 'posted'), 0)
        + coalesce(sum(amount) filter (where transaction_type = 'adjustment' and status = 'posted'), 0)
        as balance
      from operational_fund_transactions
      where batch_id = $1
    `,
    [batch.id],
  );
  const currentBalance = Number(balanceResult.rows[0]?.balance || 0);

  const existingDebitResult = await client.query(
    `
      select amount
      from operational_fund_transactions
      where container_job_expense_id = $1
        and transaction_type = 'debit'
        and status = 'posted'
      limit 1
    `,
    [expenseId],
  );
  const existingDebitAmount = Number(existingDebitResult.rows[0]?.amount || 0);

  const marginalIncrease = Number(newAmount || 0) - existingDebitAmount;
  if (marginalIncrease > currentBalance) {
    const error = new Error(
      `Saldo batch rekening dropping tanggal ${batch.batch_date} tidak mencukupi. Sisa saldo Rp ${currentBalance.toLocaleString('id-ID')}, dibutuhkan Rp ${marginalIncrease.toLocaleString('id-ID')}.`,
    );
    error.statusCode = 409;
    error.code = 'OPERATIONAL_FUND_INSUFFICIENT_BALANCE';
    throw error;
  }
}

async function ensureOperationalFundBatchOpenForExpense(client, expenseId) {
  const result = await client.query(
    `
      select batch.id, batch.batch_date, batch.status
      from operational_fund_transactions oft
      join operational_fund_batches batch on batch.id = oft.batch_id
      where oft.container_job_expense_id = $1
        and oft.transaction_type = 'debit'
        and oft.status = 'posted'
      limit 1
      for update of batch
    `,
    [expenseId],
  );
  const batch = result.rows[0];
  if (batch && batch.status === 'closed') {
    const error = new Error('Batch rekening dropping tanggal ini sudah ditutup.');
    error.statusCode = 409;
    error.code = 'OPERATIONAL_FUND_BATCH_CLOSED';
    throw error;
  }
  return batch || null;
}

function ensureTransactionNotFinanceChecked(existing) {
  if (existing.finance_check_status === 'belum_dicek') return;
  const error = new Error('Transaksi ini sudah diproses Finance. Perubahan hanya bisa lewat Finance (Klarifikasi) atau Admin.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_EXPENSE_FINANCE_LOCKED';
  throw error;
}

function ensureExpenseNotVoid(existing) {
  if (existing.payment_status !== 'batal') return;
  const error = new Error('Transaksi ini sudah dibatalkan/void.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_EXPENSE_ALREADY_VOID';
  throw error;
}

function ensureManualOperationalExpense(existing) {
  if (existing.source !== 'auto_uj_order') return;
  const error = new Error('UJ otomatis tidak bisa diedit, dipindahkan, atau dibatalkan oleh Operational. Jika ada kesalahan, ajukan klarifikasi ke Finance/Admin.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_EXPENSE_AUTO_UJ_LOCKED';
  throw error;
}

async function ensureSalesOrderBillingNotAdvanced(client, salesOrderId) {
  if (!(await isSalesOrderBillingAdvanced(client, salesOrderId))) return;
  const error = new Error('Sales Order terkait sudah masuk proses invoice/debit note/pembayaran. Perubahan hanya lewat Finance/Admin.');
  error.statusCode = 409;
  error.code = 'CONTAINER_JOB_EXPENSE_BILLING_ADVANCED';
  throw error;
}

const NON_BLOCKING_AUTO_UJ_OPERATIONAL_FUND_CODES = new Set([
  'OPERATIONAL_FUND_BATCH_CLOSED',
  'OPERATIONAL_FUND_INSUFFICIENT_BALANCE',
]);

export function isNonBlockingAutoJourneyMoneyOperationalFundError(error) {
  return NON_BLOCKING_AUTO_UJ_OPERATIONAL_FUND_CODES.has(error?.code);
}

function autoJourneyMoneyPendingFinanceNote(error) {
  return [
    'UJ otomatis belum masuk Catatan Saldo rekening dropping.',
    error?.message || 'Finance perlu mengecek transaksi UJ otomatis ini.',
  ].filter(Boolean).join(' ');
}

async function markAutoJourneyMoneyExpensePendingFinanceReview(client, {
  expenseId,
  actorName,
  error,
}) {
  await client.query(
    `
      update container_job_expenses
      set finance_check_status = 'perlu_klarifikasi',
          finance_checked_by_name = null,
          finance_checked_at = null,
          finance_note = $1,
          updated_by_name = $2,
          updated_at = now()
      where id = $3
    `,
    [
      autoJourneyMoneyPendingFinanceNote(error),
      actorName || 'Operational',
      expenseId,
    ],
  );
}

function isFortyFeetContainer(size = '') {
  return normalizeContainerSize(size).includes('40');
}

export function resolveJourneyMoneyAmountForSize(destinationRow = {}, containerSize = '') {
  const amount = isFortyFeetContainer(containerSize)
    ? destinationRow.uj_40ft ?? destinationRow.uj40ft
    : destinationRow.uj_20ft ?? destinationRow.uj20ft;
  const normalized = Number(amount || 0);
  return Number.isFinite(normalized) && normalized > 0 ? Math.round(normalized) : 0;
}

export function buildAutoJourneyMoneyDescription(job = {}, assignment = {}) {
  return [
    'UJ',
    job.customer_name || job.customerName,
    job.destination,
    job.container_size || job.containerSize,
    assignment.plateNumber || job.assignment_snapshot?.plateNumber,
  ].filter(Boolean).join(' ');
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
  completedDate = '',
  entrySource = '',
  historicalPeriod = '',
  includeRpujStage = true,
  excludeCancelledJobs = false,
} = {}) {
  const clauses = [
    "so.status <> 'cancelled'",
  ];
  const params = [];
  const cleanKeyword = keyword.trim();
  const cleanTripDate = normalizeDateOnly(tripDate);
  const cleanCompletedDate = normalizeDateOnly(completedDate);

  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.accurate_so_number ilike $${params.length}
      or ${orderNumberSearchSql('so')} ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
    )`);
  }

  if (status === 'active_journey') {
    clauses.push("cj.status in ('running', 'inap')");
  } else if (status) {
    params.push(status);
    clauses.push(`cj.status = $${params.length}`);
  }

  if (cleanTripDate) {
    params.push(cleanTripDate);
    clauses.push(`so.trip_date = $${params.length}::date`);
  }

  if (cleanCompletedDate) {
    params.push(cleanCompletedDate);
    clauses.push(`(cj.completed_at at time zone 'Asia/Jakarta')::date = $${params.length}::date`);
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
          and attachment.category in ('travelDocumentFile', 'travelDocument', 'suratJalan', 'suratJalanDocument')
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
    const result = await client.query(
      `
        select v.*, kc.id as chassis_id, kc.chassis_code, kc.container_size as chassis_size
        from vehicles v
        left join kir_chassis kc on kc.id = v.current_chassis_id
        where v.id = $1 and v.archived_at is null
      `,
      [form.vehicleId],
    );
    return result.rows[0] || null;
  }
  if (!form.plateNumber) return null;
  const result = await client.query(
    `
      select v.*, kc.id as chassis_id, kc.chassis_code, kc.container_size as chassis_size
      from vehicles v
      left join kir_chassis kc on kc.id = v.current_chassis_id
      where v.plate_number = $1 and v.archived_at is null
    `,
    [form.plateNumber],
  );
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
  const expenseRows = await findExpenseRowsByJobId(client.query.bind(client), id);
  return mapContainerJob(result.rows[0], attachmentResult.rows, expenseRows);
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

// Kapasitas truck hierarkis: 20FT hanya untuk container 20FT; 40FT untuk 20FT maupun 40FT;
// COMBO untuk semua. Satu-satunya kombinasi yang ditolak: container 40FT dengan truck 20FT.
export function isVehicleSizeAllowedForContainer(vehicleSize, containerSize) {
  return vehicleSize === 'COMBO' || vehicleSize === containerSize || (vehicleSize === '40FT' && containerSize === '20FT');
}

function assertVehicleMatchesContainer(vehicle, containerSize) {
  if (!vehicle) return;
  const vehicleSize = normalizeContainerSize(vehicle.container_size);
  const jobSize = normalizeContainerSize(containerSize);
  if (!isVehicleSizeAllowedForContainer(vehicleSize, jobSize)) {
    const error = new Error(`Truck ${vehicle.plate_number} kapasitas ${vehicleSize} tidak sesuai untuk container ${jobSize}.`);
    error.statusCode = 400;
    error.code = 'VEHICLE_SIZE_MISMATCH';
    throw error;
  }
}

// Pengecualian validasi ukuran untuk job 20FT yang masih bagian dari pickup combo 2x20: truck
// 40FT/COMBO yang sama dengan truck movement combo itu sah (aturan pickup yang sama). Diverifikasi
// ke data movement, bukan hanya assignment_group_id, dan gugur begitu truck job diganti
// (trigger DB juga mengeluarkan job dari grup saat itu).
async function isComboPickupVehicle(client, job, vehicle) {
  if (!vehicle || !job?.assignment_group_id) return false;
  if (String(vehicle.id) !== String(job.vehicle_id || '')) return false;
  if (normalizeContainerSize(job.container_size) !== '20FT') return false;
  const vehicleSize = normalizeContainerSize(vehicle.chassis_size || vehicle.container_size);
  if (vehicleSize !== '40FT' && vehicleSize !== 'COMBO') return false;
  const result = await client.query(
    `
      select 1
      from container_pickup_items cpi
      join container_pickup_movements cpm on cpm.id = cpi.movement_id
      where cpm.id = $1
        and cpi.container_job_id = $2
        and cpm.pickup_type = 'combo_2x20'
        and cpm.vehicle_id = $3
      limit 1
    `,
    [job.assignment_group_id, job.id, vehicle.id],
  );
  return result.rows.length > 0;
}

export function assertVehicleCanPickupRepo(vehicle, jobs = [], pickupType = 'single') {
  if (!vehicle) return;
  const vehicleSize = normalizeContainerSize(vehicle.chassis_size || vehicle.container_size);
  const jobSizes = jobs.map((job) => normalizeContainerSize(job.container_size));
  if (pickupType === 'combo_2x20') {
    if (vehicleSize !== '40FT' && vehicleSize !== 'COMBO') {
      throw validationError('Pickup combo 2x20 wajib memakai truck/chassis 40FT.', 'REPO_PICKUP_COMBO_REQUIRES_40FT', 400);
    }
    if (jobSizes.length !== 2 || jobSizes.some((size) => size !== '20FT')) {
      throw validationError('Pickup combo hanya berlaku untuk tepat 2 container 20FT.', 'REPO_PICKUP_COMBO_INVALID_JOBS', 400);
    }
    return;
  }
  // Single mengikuti kapasitas hierarkis yang sama dengan update biasa: container 20FT boleh
  // truck 20FT/40FT/COMBO; container 40FT wajib truck 40FT/COMBO.
  const has40ftJob = jobSizes.includes('40FT');
  if (has40ftJob && vehicleSize !== '40FT' && vehicleSize !== 'COMBO') {
    throw validationError('Container 40FT wajib memakai truck/chassis 40FT.', 'REPO_PICKUP_REQUIRES_40FT', 400);
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
    : counts.running || counts.inap || counts.repo_stored || counts.completed
      ? 'running'
      : 'waiting_operational';

  await client.query(
    'update sales_orders set status = $1, updated_at = now() where id = $2',
    [nextStatus, salesOrderId],
  );
}

function ensureSalesOrderVerifiedForOperational(row) {
  if (!row) {
    const error = new Error('Order tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'SALES_ORDER_NOT_FOUND';
    throw error;
  }
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

export function normalizeCompletedAtForSave(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!normalized || !/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(normalized)) return null;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function resolveCompletedAtForSave(form = {}, existing = {}, nextStatus = '') {
  if (nextStatus !== 'completed') return null;

  if (hasOwnInput(form, 'completedAt') && form.completedAt !== null && form.completedAt !== '') {
    const requestedCompletedAt = normalizeCompletedAtForSave(form.completedAt);
    if (!requestedCompletedAt) {
      throw validationError('Tanggal dan jam selesai tidak valid.', 'CONTAINER_JOB_COMPLETION_INVALID_TIME', 400);
    }
    return requestedCompletedAt;
  }

  const existingCompletedAt = normalizeCompletedAtForSave(existing.completed_at || existing.completedAt);
  if (existingCompletedAt) return existingCompletedAt;

  return null;
}

function buildCommissionDriverSnapshot(assignment = {}) {
  if (!assignment?.driver) return {};
  return {
    driver: assignment.driver || null,
    driverPaymentMethod: assignment.driverPaymentMethod || 'bank',
    driverBankName: assignment.driverBankName || null,
    driverBankAccountNumber: assignment.driverBankAccountNumber || null,
    driverBankAccountHolder: assignment.driverBankAccountHolder || null,
    driverEmoneyProvider: assignment.driverEmoneyProvider || null,
    driverEmoneyNumber: assignment.driverEmoneyNumber || null,
    // Plat truck pekerjaan berkomisi; export komisi tidak boleh membaca truck pickup titip.
    plateNumber: assignment.plateNumber || null,
  };
}

function commissionCorrectionError(message, code, details = undefined) {
  const error = validationError(message, code, 409);
  if (details) error.details = details;
  return error;
}

export async function resolveCompletedCommissionDriverCorrection(client, {
  job,
  action,
  driverId,
  assignment,
  actorName,
  reason,
} = {}) {
  const previousAssignment = job.assignment_snapshot || {};
  const previousDriverId = job.commission_driver_id || job.driver_id || null;
  const previousDriverName = normalizeOptionalText(
    job.commission_driver_name || job.commission_driver_snapshot?.driver || previousAssignment.driver,
  );
  const previousSnapshot = job.commission_driver_snapshot && Object.keys(job.commission_driver_snapshot).length
    ? job.commission_driver_snapshot
    : buildCommissionDriverSnapshot(previousAssignment);
  const normalizedAction = String(action || '').trim().toLowerCase();

  if (normalizedAction === 'keep') {
    return {
      driverId: previousDriverId,
      driverName: previousDriverName,
      snapshot: previousSnapshot,
      batchId: null,
      batchStatus: 'unsubmitted',
    };
  }
  if (normalizedAction !== 'move') {
    throw commissionCorrectionError(
      'Tindakan koreksi penerima komisi tidak valid.',
      'CONTAINER_JOB_COMMISSION_DRIVER_ACTION_INVALID',
      { allowedActions: ['move', 'keep'] },
    );
  }
  if (!driverId || !assignment?.driver) {
    throw commissionCorrectionError(
      'Sopir baru wajib lengkap untuk memindahkan komisi.',
      'CONTAINER_JOB_COMMISSION_DRIVER_REQUIRED',
    );
  }
  // Job Ambil Titip: sopir pickup (B) hanya menerima UJ Repo, komisi tidak boleh dipindahkan kepadanya.
  if (job.repo_picked_up_at) {
    const origin = await findRepoPickupOrigin(client, job);
    if (origin.pickupDriverIds.includes(String(driverId)) && String(driverId) !== String(origin.driverId || '')) {
      throw commissionCorrectionError(
        'Sopir Ambil Titip hanya menerima UJ Repo, komisi tidak dapat dipindahkan kepadanya.',
        'COMMISSION_RECIPIENT_IS_REPO_PICKUP_DRIVER',
      );
    }
  }

  const itemResult = await client.query(
    `
      select dci.id, dci.batch_id, dci.payment_id,
             dcb.status as batch_status,
             dcp.status as payment_status,
             dcp.payment_proof_attachment_id
      from driver_commission_items dci
      join driver_commission_batches dcb on dcb.id = dci.batch_id
      join driver_commission_payments dcp on dcp.id = dci.payment_id
      where dci.container_job_id = $1
        and dci.voided_at is null
      for update of dci, dcb, dcp
    `,
    [job.id],
  );
  const item = itemResult.rows[0];
  if (!item) {
    return {
      driverId,
      driverName: normalizeOptionalText(assignment.driver),
      snapshot: buildCommissionDriverSnapshot(assignment),
      batchId: null,
      batchStatus: 'unsubmitted',
    };
  }
  if (!['draft', 'submitted'].includes(item.batch_status)) {
    throw commissionCorrectionError(
      `Komisi tidak dapat dipindahkan karena batch sudah berstatus ${item.batch_status}.`,
      'CONTAINER_JOB_COMMISSION_BATCH_LOCKED',
      { batchId: item.batch_id, batchStatus: item.batch_status },
    );
  }
  if (item.payment_status !== 'pending' || item.payment_proof_attachment_id) {
    throw commissionCorrectionError(
      'Komisi tidak dapat dipindahkan karena pembayaran sopir sudah diproses Finance.',
      'CONTAINER_JOB_COMMISSION_PAYMENT_LOCKED',
      { batchId: item.batch_id, batchStatus: item.batch_status },
    );
  }

  const deductionResult = await client.query(
    'select exists(select 1 from driver_commission_payment_deductions where payment_id = $1 and voided_at is null) as exists',
    [item.payment_id],
  );
  if (deductionResult.rows[0]?.exists) {
    throw commissionCorrectionError(
      'Komisi tidak dapat dipindahkan karena potongan Finance sudah dicatat untuk sopir sebelumnya.',
      'CONTAINER_JOB_COMMISSION_DEDUCTION_LOCKED',
      { batchId: item.batch_id, batchStatus: item.batch_status },
    );
  }

  let targetPaymentResult = await client.query(
    `
      select id, status, payment_proof_attachment_id
      from driver_commission_payments
      where batch_id = $1 and driver_id = $2
      for update
    `,
    [item.batch_id, driverId],
  );
  if (!targetPaymentResult.rows[0]) {
    targetPaymentResult = await client.query(
      `
        insert into driver_commission_payments (
          batch_id, driver_id, driver_name,
          payment_method, bank_name, bank_account_number, bank_account_holder,
          emoney_provider, emoney_number, emoney_account_holder,
          total_items, total_amount
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, 0, 0)
        returning id, status, payment_proof_attachment_id
      `,
      [
        item.batch_id,
        driverId,
        assignment.driver,
        assignment.driverPaymentMethod === 'emoney' ? 'emoney' : 'bank',
        assignment.driverBankName || null,
        assignment.driverBankAccountNumber || null,
        assignment.driverBankAccountHolder || null,
        assignment.driverEmoneyProvider || null,
        assignment.driverEmoneyNumber || null,
      ],
    );
  }
  const targetPayment = targetPaymentResult.rows[0];
  if (targetPayment.status !== 'pending' || targetPayment.payment_proof_attachment_id) {
    throw commissionCorrectionError(
      'Komisi tidak dapat dipindahkan karena pembayaran sopir baru sudah diproses Finance.',
      'CONTAINER_JOB_COMMISSION_TARGET_PAYMENT_LOCKED',
      { batchId: item.batch_id, batchStatus: item.batch_status },
    );
  }
  const targetDeductionResult = await client.query(
    'select exists(select 1 from driver_commission_payment_deductions where payment_id = $1 and voided_at is null) as exists',
    [targetPayment.id],
  );
  if (targetDeductionResult.rows[0]?.exists) {
    throw commissionCorrectionError(
      'Komisi tidak dapat dipindahkan karena potongan Finance sudah dicatat untuk sopir baru.',
      'CONTAINER_JOB_COMMISSION_TARGET_DEDUCTION_LOCKED',
      { batchId: item.batch_id, batchStatus: item.batch_status },
    );
  }

  await client.query(
    `
      update driver_commission_items
      set payment_id = $2,
          driver_id = $3,
          driver_name = $4,
          updated_at = now()
      where id = $1
    `,
    [item.id, targetPayment.id, driverId, assignment.driver],
  );
  await client.query(
    `
      update driver_commission_payments payment
      set total_items = (
            select count(*)::int
            from driver_commission_items item
            where item.payment_id = payment.id and item.voided_at is null
          ),
          total_amount = (
            select coalesce(sum(item.amount), 0)
            from driver_commission_items item
            where item.payment_id = payment.id and item.voided_at is null
          ),
          updated_at = now()
      where payment.id = any($1::uuid[])
    `,
    [[item.payment_id, targetPayment.id]],
  );
  await client.query(
    `
      delete from driver_commission_payments payment
      where payment.id = $1
        and payment.status = 'pending'
        and payment.payment_proof_attachment_id is null
        and not exists (select 1 from driver_commission_items item where item.payment_id = payment.id)
        and not exists (select 1 from driver_commission_payment_deductions deduction where deduction.payment_id = payment.id and deduction.voided_at is null)
    `,
    [item.payment_id],
  );
  await client.query(
    `
      update driver_commission_batches batch
      set total_items = (
            select count(*)::int
            from driver_commission_items item
            where item.batch_id = batch.id and item.voided_at is null
          ),
          total_amount = (
            select coalesce(sum(item.amount), 0)
            from driver_commission_items item
            where item.batch_id = batch.id and item.voided_at is null
          ),
          revision_count = case when batch.status = 'submitted' then batch.revision_count + 1 else batch.revision_count end,
          last_revised_at = case when batch.status = 'submitted' then now() else batch.last_revised_at end,
          last_revised_by_name = case when batch.status = 'submitted' then $2 else batch.last_revised_by_name end,
          last_revision_reason = case when batch.status = 'submitted' then $3 else batch.last_revision_reason end,
          last_revision_job_id = case when batch.status = 'submitted' then $4::uuid else batch.last_revision_job_id end,
          last_revision_previous_driver_name = case when batch.status = 'submitted' then $5 else batch.last_revision_previous_driver_name end,
          last_revision_next_driver_name = case when batch.status = 'submitted' then $6 else batch.last_revision_next_driver_name end,
          updated_at = now()
      where batch.id = $1
    `,
    [item.batch_id, actorName || 'Admin', reason || null, job.id, previousDriverName, assignment.driver],
  );

  return {
    driverId,
    driverName: normalizeOptionalText(assignment.driver),
    snapshot: buildCommissionDriverSnapshot(assignment),
    batchId: item.batch_id,
    batchStatus: item.batch_status,
  };
}

// Asal titip (sopir/truck A) dan sopir Ambil Titip (B) dari data yang benar-benar tercatat:
// repo_released_* dan riwayat repo_pickup pertama untuk A, movement pickup aktif untuk B.
// Tidak mengarang: field yang tidak tercatat dibiarkan null.
async function findRepoPickupOrigin(client, job) {
  const history = await client.query(
    `
      select h.previous_driver_id, h.previous_plate_number, h.next_driver_id
      from container_job_assignment_history h
      where h.container_job_id = $1
        and h.change_source in ('repo_pickup', 'repo_combo_pickup')
      order by h.created_at asc, h.id asc
      limit 1
    `,
    [job.id],
  );
  const movements = await client.query(
    `
      select distinct cpm.driver_id
      from container_pickup_items cpi
      join container_pickup_movements cpm on cpm.id = cpi.movement_id
      where cpi.container_job_id = $1 and cpm.status <> 'cancelled' and cpm.driver_id is not null
    `,
    [job.id],
  );
  const releasedVehicle = job.repo_released_vehicle_id
    ? await client.query('select plate_number from vehicles where id = $1', [job.repo_released_vehicle_id])
    : { rows: [] };
  const first = history.rows[0] || {};
  return {
    driverId: job.repo_released_driver_id || first.previous_driver_id || null,
    plateNumber: normalizeOptionalText(first.previous_plate_number) || normalizeOptionalText(releasedVehicle.rows[0]?.plate_number),
    pickupDriverIds: [
      first.next_driver_id,
      ...movements.rows.map((row) => row.driver_id),
    ].filter(Boolean).map(String),
  };
}

// Koreksi Admin atas penerima komisi TANPA mengubah assignment aktual job (sopir/truck Ambil
// Titip B tetap tercatat apa adanya). Rekening diambil dari master sopir penerima; plat dari truck
// asal titip yang tercatat. Batch approved/paid, pembayaran yang sudah diproses, dan potongan
// Finance tetap terkunci lewat resolveCompletedCommissionDriverCorrection.
export async function correctContainerJobCommissionRecipient(id, { driverId, reason, actorName } = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select ${joinedJobColumns}
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
        for update of cj
      `,
      [id],
    );
    const job = existing.rows[0];
    if (!job) throw validationError('Container Job tidak ditemukan.', 'CONTAINER_JOB_NOT_FOUND', 404);
    if (job.execution_source === 'vendor') {
      throw validationError('Ritasi vendor tidak memiliki komisi sopir.', 'COMMISSION_RECIPIENT_VENDOR', 409);
    }
    if (!job.has_driver_commission || !['completed', 'repo_stored'].includes(job.status)) {
      throw validationError('Penerima komisi hanya bisa dikoreksi untuk ritasi berkomisi yang sudah dititip/selesai.', 'COMMISSION_RECIPIENT_NOT_CORRECTABLE', 409);
    }
    const normalizedDriverId = normalizeOptionalUuid(driverId, 'Sopir');
    const driverResult = normalizedDriverId
      ? await client.query('select * from drivers where id = $1 and archived_at is null', [normalizedDriverId])
      : { rows: [] };
    const driver = driverResult.rows[0];
    if (!driver) throw validationError('Sopir penerima komisi tidak ditemukan atau sudah diarsipkan.', 'COMMISSION_RECIPIENT_DRIVER_NOT_FOUND', 404);

    const pickedUp = Boolean(job.repo_picked_up_at);
    const origin = pickedUp ? await findRepoPickupOrigin(client, job) : null;
    if (origin && origin.pickupDriverIds.includes(String(driver.id)) && String(driver.id) !== String(origin.driverId || '')) {
      throw validationError(
        'Sopir Ambil Titip hanya menerima UJ Repo, tidak bisa menjadi penerima komisi ritasi ini.',
        'COMMISSION_RECIPIENT_IS_REPO_PICKUP_DRIVER',
        409,
      );
    }
    const paymentMethod = driver.payment_method === 'emoney' ? 'emoney' : 'bank';
    const accountNumber = paymentMethod === 'emoney' ? driver.emoney_number : driver.bank_account_number;
    if (!normalizeOptionalText(accountNumber)) {
      throw validationError(
        'Data rekening/e-money sopir penerima belum lengkap di Master Sopir. Lengkapi dulu sebelum komisi dialihkan.',
        'COMMISSION_RECIPIENT_PAYMENT_INFO_MISSING',
        409,
      );
    }

    const assignment = {
      driver: driver.name,
      driverPaymentMethod: paymentMethod,
      driverBankName: driver.bank_name || null,
      driverBankAccountNumber: driver.bank_account_number || null,
      driverBankAccountHolder: driver.bank_account_holder || null,
      driverEmoneyProvider: driver.emoney_provider || null,
      driverEmoneyNumber: driver.emoney_number || null,
      // Job Ambil Titip: assignment_snapshot sudah milik B, jadi plat hanya dari asal titip yang tercatat.
      plateNumber: pickedUp ? origin.plateNumber : normalizeOptionalText(job.assignment_snapshot?.plateNumber),
    };
    const before = {
      driverId: job.commission_driver_id || null,
      driverName: job.commission_driver_name || job.commission_driver_snapshot?.driver || '',
    };
    const correction = await resolveCompletedCommissionDriverCorrection(client, {
      job,
      action: 'move',
      driverId: driver.id,
      assignment,
      actorName,
      reason,
    });
    await client.query(
      `
        update container_jobs
        set commission_driver_id = $2,
            commission_driver_name = $3,
            commission_driver_snapshot = $4::jsonb,
            commission_status = $6,
            updated_by_name = $5,
            updated_at = now()
        where id = $1
      `,
      [
        job.id,
        correction.driverId,
        correction.driverName,
        JSON.stringify(correction.snapshot),
        actorName || 'Admin',
        resolveCommissionStatus({
          currentStatus: job.commission_status,
          jobStatus: job.status,
          hasCommission: true,
          amount: job.commission_locked_amount ?? job.driver_commission_amount,
          driverId: correction.driverId,
          driverName: correction.driverName,
        }),
      ],
    );
    return {
      before,
      after: { driverId: correction.driverId, driverName: correction.driverName },
      batchId: correction.batchId,
      batchStatus: correction.batchStatus,
      job: await findMappedContainerJob(client, job.id),
    };
  });
}

function resolveCommissionStatus({
  currentStatus = 'pending',
  jobStatus = 'received',
  hasCommission = false,
  amount = 0,
  driverId = null,
  driverName = '',
} = {}) {
  if (!hasCommission) return 'without_commission';
  if (Number(amount || 0) <= 0) return 'needs_review';
  if (!driverId && !String(driverName || '').trim()) return 'needs_review';
  if (['completed', 'repo_stored'].includes(jobStatus)) return 'with_commission';
  return currentStatus === 'needs_review' ? 'pending' : currentStatus || 'pending';
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

// Ritasi susulan/backdate (Phase 2) SENGAJA dipisah dari "historical backfill" -- historical backfill
// adalah backfill massal data lama yang admin-only (lihat historical-entry module), sedangkan backdate
// entry adalah ritasi yang benar-benar terjadi tapi baru dicatat belakangan, boleh dipakai Operational
// biasa selama alasannya diisi (divalidasi di service layer). Keduanya sama-sama boleh melewati syarat
// dokumen/assignment yang biasanya wajib untuk ritasi realtime -- lihat isBackfillLike di bawah.
function isBackdateEntry(form = {}, existing = {}) {
  return hasOwnInput(form, 'isBackdateEntry')
    ? normalizeBooleanFlag(form.isBackdateEntry)
    : Boolean(existing.is_backdate_entry);
}

// Dipakai di titik-titik yang sudah lebih dulu membebaskan historical backfill dari syarat normal
// (dokumen completion, ketersediaan driver/truck, sinkronisasi status "Bertugas") -- backdate entry
// butuh pembebasan yang sama karena sama-sama mencatat kejadian di masa lalu, bukan kejadian sekarang.
function isBackfillLike(form = {}, existing = {}) {
  return isHistoricalBackfill(form, existing) || isBackdateEntry(form, existing);
}

export function shouldValidateVehicleContainerSize(form = {}, existing = {}) {
  return !isHistoricalBackfill(form, existing);
}

function assignmentValue(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function hasOwnInput(form, key) {
  return Object.prototype.hasOwnProperty.call(form, key);
}

export function isRepoShipment(job = {}) {
  const shipment = String(job.shipment_type || job.shipmentType || job.shipment || '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  return shipment === 'repo_empty' || shipment === 'repo_full';
}

function hasExplicitDriverCommissionInput(form = {}) {
  const unambiguousEnable = form.hasDriverCommission === true
    && Number(form.driverCommissionAmount || 0) > 0;
  return (normalizeBooleanFlag(form.driverCommissionEdited) || unambiguousEnable) && [
    'hasDriverCommission',
    'driverCommissionAmount',
    'driverCommissionSourceDestinationId',
    'driverCommissionNote',
  ].some((key) => hasOwnInput(form, key));
}

export function resolveDriverCommissionUpdate(existing = {}, form = {}, { documentOnlyUpdate = false } = {}) {
  const updateRequested = !documentOnlyUpdate && hasExplicitDriverCommissionInput(form);
  const hasCommission = updateRequested && hasOwnInput(form, 'hasDriverCommission')
    ? Boolean(form.hasDriverCommission)
    : Boolean(existing.has_driver_commission);
  const amount = hasCommission
    ? normalizeNonNegativeAmount(
      updateRequested && hasOwnInput(form, 'driverCommissionAmount')
        ? form.driverCommissionAmount
        : existing.driver_commission_amount,
      'Nominal komisi sopir',
    )
    : 0;
  if (hasCommission && amount <= 0) {
    throw validationError('Nominal komisi sopir wajib lebih dari 0 jika komisi aktif.', 'VALIDATION_ERROR', 400);
  }
  const sourceDestinationId = hasCommission
    ? normalizeOptionalUuid(
      updateRequested && hasOwnInput(form, 'driverCommissionSourceDestinationId')
        ? form.driverCommissionSourceDestinationId
        : existing.driver_commission_source_destination_id,
      'Sumber komisi sopir',
    )
    : null;
  const note = hasCommission
    ? normalizeOptionalText(
      updateRequested && hasOwnInput(form, 'driverCommissionNote')
        ? form.driverCommissionNote
        : existing.driver_commission_note,
    )
    : null;

  return { updateRequested, hasCommission, amount, sourceDestinationId, note };
}

export async function ensureDriverCommissionIsNotPosted(client, containerJobId, commissionValuesChanged) {
  if (!commissionValuesChanged) return;
  const postedCommission = await client.query(
    `select id from driver_commission_items where container_job_id = $1 and voided_at is null limit 1`,
    [containerJobId],
  );
  if (postedCommission.rows[0]) {
    throw validationError(
      'Komisi sudah masuk daftar pembayaran. Lakukan void/koreksi melalui modul Komisi Sopir terlebih dahulu.',
      'CONTAINER_JOB_COMMISSION_ALREADY_POSTED',
      409,
    );
  }
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

export async function findJourneyMoneyAmount(client, job = {}) {
  const destinationId = normalizeOptionalUuid(job.destination_id, 'Master Tujuan');
  const destination = normalizeOptionalText(job.destination);
  if (!destinationId && !destination) return { amount: 0, destinationId: null };
  const result = await client.query(
    `
      select id, uj_20ft, uj_40ft
      from destination_locations
      where (
          ($1::uuid is not null and id = $1::uuid)
          or ($1::uuid is null and lower(trim(name)) = lower(trim($2)))
        )
        and archived_at is null
      order by updated_at desc nulls last, created_at desc nulls last
      limit 1
    `,
    [destinationId, destination],
  );
  const row = result.rows[0] || {};
  const baseAmount = resolveJourneyMoneyAmountForSize(row, job.container_size);
  const isReefer = String(job.container_type || '').trim().toLowerCase().includes('reefer');
  const reeferSurcharge = isReefer && !isRepoShipment(job) ? 100000 : 0;
  return {
    amount: baseAmount > 0 ? baseAmount + reeferSurcharge : baseAmount,
    destinationId: row.id || null,
  };
}

export async function syncAutoJourneyMoneyExpense(client, {
  job,
  nextStatus,
  nextEntrySource,
  nextIsBackdateEntry = false,
  nextDriverId,
  runningAt,
  assignment,
  actorName,
  allowOperationalFundPending = false,
  allowAdminCorrection = false,
}) {
  if ((job.execution_source || 'internal') === 'vendor') return;
  if (!['running', 'completed'].includes(nextStatus)) return;
  // Ritasi susulan/backdate (Phase 3) TIDAK boleh memicu UJ otomatis / rekening dropping sama
  // sekali -- persis seperti entry historis. Kalau UJ tetap diperlukan untuk ritasi ini, harus
  // dicatat manual lewat createContainerJobExpense (koreksi biaya), bukan jalur otomatis di sini.
  if (nextEntrySource === 'historical' || nextIsBackdateEntry) return;
  if (['approved', 'paid'].includes(job.rpuj_status)) return;

  const existingJourneyMoney = await client.query(
    `
      select id
      from container_job_expenses
      where container_job_id = $1
        and category = 'uj_awal'
        and payment_status <> 'batal'
        and coalesce(source, 'manual') <> 'auto_uj_order'
      limit 1
    `,
    [job.id],
  );
  if (existingJourneyMoney.rows[0]) return;

  // UJ dibekukan SEKALI per job -- kalau job ini sudah pernah punya uj_amount_snapshot, pakai
  // nilai beku itu (jangan live-lookup ulang ke destination_locations), supaya biaya UJ yang
  // sudah tercatat tidak diam-diam berubah kalau rate master destination diedit belakangan.
  let amount = job.uj_amount_snapshot != null ? Number(job.uj_amount_snapshot) : null;
  if (amount == null) {
    const lookup = await findJourneyMoneyAmount(client, job);
    amount = lookup.amount;
    if (amount > 0) {
      await client.query(
        `
          update container_jobs
          set uj_amount_snapshot = $2,
              uj_source_destination_id = $3,
              uj_snapshot_at = now(),
              uj_snapshot_source = 'destination_master'
          where id = $1
        `,
        [job.id, amount, lookup.destinationId],
      );
    }
  }
  if (amount <= 0) return;

  const paidAt = runningAt || new Date().toISOString();
  const batchDate = toJakartaDateKey(paidAt);
  if (allowAdminCorrection && batchDate) {
    const lockedBatch = await client.query(
      `
        select batch.id
        from operational_fund_batches batch
        where batch.batch_date = $1::date
          and batch.status = 'closed'
        limit 1
      `,
      [batchDate],
    );
    if (lockedBatch.rows[0]) return;
  }

  const description = buildAutoJourneyMoneyDescription(job, assignment);
  const sourceRefId = job.id;
  const existingAutoLedger = await client.query(
    `
      select
        expense.id,
        oft.id as ledger_id,
        batch.status as batch_status
      from container_job_expenses expense
      left join operational_fund_transactions oft
        on oft.container_job_expense_id = expense.id
       and oft.transaction_type = 'debit'
       and oft.status = 'posted'
      left join operational_fund_batches batch on batch.id = oft.batch_id
      where expense.source = 'auto_uj_order'
        and expense.source_ref_id = $1
        and expense.payment_status <> 'batal'
      limit 1
    `,
    [String(sourceRefId)],
  );
  if (existingAutoLedger.rows[0]?.ledger_id && existingAutoLedger.rows[0]?.batch_status === 'closed') {
    return null;
  }

  const expenseResult = await client.query(
    `
      insert into container_job_expenses (
        sales_order_id,
        container_job_id,
        driver_id,
        category,
        expense_group,
        amount,
        description,
        recipient_type,
        recipient_name,
        payment_status,
        paid_at,
        paid_by_name,
        finance_check_status,
        finance_checked_by_name,
        finance_checked_at,
        source,
        source_ref_id,
        input_source,
        created_by_name,
        updated_by_name
      )
      values ($1, $2, $3, 'uj_awal', 'operational', $4, $5, 'driver', $6, 'sudah_dibayar', $7::timestamptz, $8, 'belum_dicek', null, null, 'auto_uj_order', $9, 'system', $8, $8)
      on conflict (source, source_ref_id)
        where source = 'auto_uj_order' and source_ref_id is not null
      do update set
        sales_order_id = excluded.sales_order_id,
        driver_id = excluded.driver_id,
        expense_group = 'operational',
        amount = excluded.amount,
        description = excluded.description,
        recipient_name = excluded.recipient_name,
        payment_status = 'sudah_dibayar',
        paid_at = excluded.paid_at,
        paid_by_name = excluded.paid_by_name,
        finance_check_status = case
          when container_job_expenses.finance_check_status = 'sudah_dicek'
            then container_job_expenses.finance_check_status
          else 'belum_dicek'
        end,
        finance_checked_by_name = case
          when container_job_expenses.finance_check_status = 'sudah_dicek'
            then container_job_expenses.finance_checked_by_name
          else null
        end,
        finance_checked_at = case
          when container_job_expenses.finance_check_status = 'sudah_dicek'
            then container_job_expenses.finance_checked_at
          else null
        end,
        updated_by_name = excluded.updated_by_name,
        updated_at = now()
      returning id
    `,
    [
      job.sales_order_id,
      job.id,
      nextDriverId || job.driver_id || null,
      amount,
      description,
      assignment.driver || null,
      paidAt,
      actorName || 'Operational',
      String(sourceRefId),
    ],
  );
  const expenseId = expenseResult.rows[0].id;
  let batch;
  try {
    batch = await ensureOperationalFundBatch(client, batchDate, actorName || 'Operational');
  } catch (error) {
    if (!allowOperationalFundPending || !isNonBlockingAutoJourneyMoneyOperationalFundError(error)) {
      throw error;
    }
    await markAutoJourneyMoneyExpensePendingFinanceReview(client, {
      expenseId,
      actorName,
      error,
    });
    return {
      code: 'AUTO_UJ_PENDING_FINANCE_REVIEW',
      message: autoJourneyMoneyPendingFinanceNote(error),
    };
  }

  await client.query(
    `
      insert into operational_fund_transactions (
        batch_id,
        container_job_id,
        container_job_expense_id,
        transaction_date,
        transaction_type,
        category,
        amount,
        description,
        top_name,
        driver_name,
        do_number,
        customer_name,
        source,
        source_ref_id,
        created_by_name,
        updated_by_name
      )
      values ($1, $2, $3, coalesce($4::date, current_date), 'debit', 'uj_order', $5, $6, $7, $8, $9, $10, 'auto_uj_order', $11, $7, $7)
      on conflict (container_job_expense_id)
        where container_job_expense_id is not null
          and transaction_type = 'debit'
          and status = 'posted'
        do update set
        transaction_date = excluded.transaction_date,
        category = 'uj_order',
        amount = excluded.amount,
        description = excluded.description,
        batch_id = excluded.batch_id,
        top_name = excluded.top_name,
        driver_name = excluded.driver_name,
        do_number = excluded.do_number,
        customer_name = excluded.customer_name,
        source = excluded.source,
        source_ref_id = excluded.source_ref_id,
        updated_by_name = excluded.updated_by_name,
        updated_at = now()
    `,
    [
      batch.id,
      job.id,
      expenseId,
      batchDate,
      amount,
      description,
      actorName || 'Operational',
      assignment.driver || null,
      job.do_number || job.destination || null,
      job.customer_name || null,
      String(job.id),
    ],
  );
  return null;
}

async function voidAutoJourneyMoneyExpense(client, jobId, actorName = 'Operational', { allowAdminCorrection = false } = {}) {
  if (allowAdminCorrection) {
    const lockedBatch = await client.query(
      `
        select batch.id
        from operational_fund_transactions oft
        join operational_fund_batches batch on batch.id = oft.batch_id
        where oft.container_job_id = $1
          and oft.source = 'auto_uj_order'
          and oft.transaction_type = 'debit'
          and oft.status = 'posted'
          and batch.status = 'closed'
        limit 1
      `,
      [jobId],
    );
    if (lockedBatch.rows[0]) return;
  }

  await client.query(
    `
      update container_job_expenses
      set payment_status = 'batal',
          updated_by_name = $2,
          updated_at = now()
      where container_job_id = $1
        and source = 'auto_uj_order'
        and payment_status <> 'batal'
    `,
    [jobId, actorName],
  );
  await client.query(
    `
      update operational_fund_transactions
      set status = 'void',
          updated_by_name = $2,
          updated_at = now()
      where container_job_id = $1
        and source = 'auto_uj_order'
        and transaction_type = 'debit'
        and status = 'posted'
    `,
    [jobId, actorName],
  );
}

async function requireAssignmentAvailable(client, id, form, driver, vehicle, nextStatus, existing = {}) {
  if (isAssignmentReleasedStatus(nextStatus)) return;
  if (isBackfillLike(form, existing)) return;
  const driverName = String(form.driver || driver?.name || '').trim();
  const plateNumber = String(form.plateNumber || vehicle?.plate_number || '').trim();
  const driverId = driver?.id || form.driverId || null;
  const vehicleId = vehicle?.id || form.vehicleId || null;
  if (!driverId && !driverName && !vehicleId && !plateNumber) return;

  // Kunci baris master driver/vehicle (urutan tetap: driver dulu baru vehicle) supaya dua request
  // assignment yang datang bersamaan untuk driver/truck yang sama diserialkan di sini, bukan cuma
  // lolos berdua karena SELECT check di bawah tidak melihat tulisan satu sama lain (TOCTOU).
  // Unique index partial di migrasi 202608250003 adalah jaring pengaman terakhir kalau lock ini
  // entah bagaimana terlewati (misal race lewat assignment_snapshot berbasis nama/plat saja).
  if (driverId) await client.query('select id from drivers where id = $1 for update', [driverId]);
  if (vehicleId) await client.query('select id from vehicles where id = $1 for update', [vehicleId]);

  // Pasangan job dalam satu combo (assignment_group_id sama) adalah perjalanan fisik yang sama,
  // bukan bentrok -- tapi hanya selama driver/truck job ini tidak diganti (trigger DB juga
  // mengeluarkan job dari grup begitu driver/truck-nya diganti).
  const keepsAssignment = String(driverId || '') === String(existing.driver_id || '')
    && String(vehicleId || '') === String(existing.vehicle_id || '');
  const assignmentGroupId = keepsAssignment ? existing.assignment_group_id || null : null;

  const result = await client.query(
    `
      select cj.id, cj.container_number, cj.assignment_snapshot, so.so_number
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where cj.id <> $1
        and coalesce(cj.execution_source, 'internal') = 'internal'
        and cj.status not in ('completed', 'cancelled', 'repo_stored')
        and ($6::uuid is null or coalesce(cj.assignment_group_id, cj.id) <> $6::uuid)
        and (
          ($2::uuid is not null and cj.driver_id = $2::uuid)
          or ($3::uuid is not null and cj.vehicle_id = $3::uuid)
          or ($4::text <> '' and lower(trim(cj.assignment_snapshot->>'driver')) = lower(trim($4::text)))
          or ($5::text <> '' and trim(cj.assignment_snapshot->>'plateNumber') = trim($5::text))
        )
      limit 1
    `,
    [id, driverId, vehicleId, driverName, plateNumber, assignmentGroupId],
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
            and coalesce(cj.execution_source, 'internal') = 'internal'
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
            and coalesce(cj.execution_source, 'internal') = 'internal'
            and cj.status not in ('completed', 'cancelled', 'repo_stored')
        )
    `,
    [vehicleId],
  );
}

async function syncResourceAssignmentStatus(client, existing, nextAssignment = {}, nextStatus, nextEntrySource = 'realtime', nextIsBackdateEntry = false) {
  // Ritasi susulan/backdate (Phase 2) mencatat pekerjaan yang sudah selesai di masa lalu -- jangan
  // tandai driver/truck "Bertugas" sekarang untuk pekerjaan yang sebenarnya sudah lama berakhir.
  if (normalizeEntrySource(nextEntrySource) === 'historical' || nextIsBackdateEntry) return;
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

// Job yang pernah dititip (repo_stored_at terisi) sudah punya leg awal: running_at miliknya adalah
// waktu mulai perjalanan awal dan tidak boleh tertimpa waktu pickup/penyelesaian leg Repo.
// Hanya koreksi Admin yang boleh mengubahnya.
export function shouldPreserveOriginalRunningAt(existing = {}, { allowAdminCorrection = false } = {}) {
  return Boolean(existing.repo_stored_at && existing.running_at && !allowAdminCorrection);
}

export function resolveRunningAtForSave(existing = {}, form = {}, nextStatus, { documentOnlyUpdate = false, allowAdminCorrection = false } = {}) {
  if (documentOnlyUpdate || nextStatus === 'cancelled') return existing.running_at;
  if (shouldPreserveOriginalRunningAt(existing, { allowAdminCorrection }) && ['running', 'completed', 'repo_stored'].includes(nextStatus)) {
    return existing.running_at;
  }
  // Inap adalah jeda di tengah perjalanan: waktu mulai tidak boleh hilang, supaya Selesai Inap
  // (resume ke running) dan closing tidak perlu mengisi ulang waktu mulai.
  if (nextStatus === 'inap') return existing.running_at;
  if (['repo_stored', 'running', 'completed'].includes(nextStatus)) return form.runningAt || existing.running_at;
  return null;
}

export async function requireCompletedJobReady(client, id, form, existing, options = {}) {
  // allowRetroactiveEntry mencakup historical backfill DAN ritasi susulan/backdate (Phase 2) --
  // keduanya sama-sama mencatat pekerjaan yang sudah selesai di masa lalu, jadi sama-sama boleh
  // lewati syarat upload dokumen (SPK/EIR) yang normalnya wajib untuk penyelesaian ritasi realtime.
  const allowRetroactiveEntry = Boolean(options.allowRetroactiveEntry);
  const allowAdminCorrection = Boolean(options.allowAdminCorrection);
  const isVendorExecution = Boolean(options.isVendorExecution);

  const runningAt = shouldPreserveOriginalRunningAt(existing, { allowAdminCorrection })
    ? existing.running_at
    : form.runningAt || existing.running_at;
  const completedAt = resolveCompletedAtForSave(form, existing, 'completed');
  // Job Repo: selesai juga tidak boleh sebelum pickup Repo / mulai movement. Divalidasi sebelum
  // job, movement, atau efek samping penyelesaian apa pun disimpan.
  if (existing.status !== 'completed' || isOperationalTimestampChanged(completedAt, existing.completed_at)) {
    assertCompletionNotBeforeStart(completedAt, {
      runningAt,
      repoStoredAt: existing.repo_stored_at,
      repoPickedUpAt: existing.repo_picked_up_at,
      movementStartedAt: options.pickupMovement?.started_at,
    });
  }

  const requiredValues = [
    ['nomor container', String(form.containerNumber || existing.container_number || '').trim()],
    ...(!isVendorExecution ? [
      ['driver', form.driver || form.driverId || existing.driver_id],
      ['truck', form.plateNumber || form.vehicleId || existing.vehicle_id],
    ] : []),
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
  if (allowRetroactiveEntry || allowAdminCorrection) return completedAt;

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
  if (!isVendorExecution && !(form.spkNumber || existing.spk_number || categories.has('spkDocument'))) {
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

  return completedAt;
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
              when 'inap' then 2
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
            when 'inap' then 2
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

  // Ringkasan per SO (total/selesai/jalan/belum) SENGAJA dihitung dari SELURUH container job milik
  // SO tersebut, bukan dari `rowsResult` yang sudah kena filter status/tanggal/dsb -- supaya badge
  // ringkasan tetap menampilkan progres asli SO itu walau daftar baris di bawahnya sedang difilter
  // (mis. tab "Belum Jalan" tidak boleh membuat badge ikut seolah-olah SO itu cuma py container itu saja).
  const groupOrderIds = groupByOrder
    ? [...new Set(rowsResult.rows.map((row) => row.sales_order_id))]
    : [];
  const groupStatsResult = groupOrderIds.length
    ? await query(
        `
          select
            cj.sales_order_id,
            count(*)::int as total,
            count(*) filter (where cj.status = 'completed')::int as completed,
            count(*) filter (
              where cj.status in ('running', 'inap', 'repo_stored')
                or (cj.repo_stored_at is not null and cj.repo_picked_up_at is null)
            )::int as running,
            count(*) filter (where cj.status = 'cancelled')::int as cancelled
          from container_jobs cj
          where cj.sales_order_id = any($1::uuid[])
          group by cj.sales_order_id
        `,
        [groupOrderIds],
      )
    : { rows: [] };
  const partyCountsResult = groupOrderIds.length
    ? await query(
        `
          select
            cj.sales_order_id,
            coalesce(cj.container_size, 'Lainnya') as size,
            count(*)::int as count
          from container_jobs cj
          where cj.sales_order_id = any($1::uuid[])
          group by cj.sales_order_id, coalesce(cj.container_size, 'Lainnya')
        `,
        [groupOrderIds],
      )
    : { rows: [] };
  const groupStats = groupStatsResult.rows.reduce((map, row) => {
    const waiting = Math.max(0, row.total - row.completed - row.running - row.cancelled);
    map[row.sales_order_id] = {
      total: row.total,
      completed: row.completed,
      running: row.running,
      waiting,
      cancelled: row.cancelled,
      partyCounts: {},
    };
    return map;
  }, {});
  partyCountsResult.rows.forEach((row) => {
    if (groupStats[row.sales_order_id]) {
      groupStats[row.sales_order_id].partyCounts[row.size] = row.count;
    }
  });

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

  const counts = { received: 0, running: 0, inap: 0, repo_stored: 0, completed: 0, cancelled: 0 };
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
    groupStats,
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
  const expenseRows = await findExpenseRowsByJobId(query, id);
  return mapContainerJob(result.rows[0], attachmentResult.rows, expenseRows);
}

export async function findContainerJobExpensesByJobId(id) {
  const result = await query('select id from container_jobs where id = $1', [id]);
  if (!result.rows[0]) {
    const error = new Error('Container Job tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'CONTAINER_JOB_NOT_FOUND';
    throw error;
  }
  const expenseRows = await findExpenseRowsByJobId(query, id);
  return expenseRows.map(mapContainerJobExpense);
}

export async function findAssignmentHistory(id) {
  const result = await query('select id from container_jobs where id = $1', [id]);
  if (!result.rows[0]) {
    const error = new Error('Container Job tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'CONTAINER_JOB_NOT_FOUND';
    throw error;
  }
  const historyResult = await query(
    `
      select id, container_job_id, change_source,
             previous_driver_id, previous_driver_name, next_driver_id, next_driver_name,
             previous_vehicle_id, previous_plate_number, next_vehicle_id, next_plate_number,
             reason, note, changed_by_name, changed_by_role, created_at
      from container_job_assignment_history
      where container_job_id = $1
      order by created_at desc
    `,
    [id],
  );
  return historyResult.rows.map(mapAssignmentHistory);
}

export async function findContainerJobExpenseLedger(options = {}) {
  const { limit, offset, page, pageSize } = parsePage(options);
  const params = [];
  const clauses = ["coalesce(cj.execution_source, 'internal') = 'internal'"];

  if (options.financeCheckStatus) {
    params.push(options.financeCheckStatus);
    clauses.push(`expense.finance_check_status = $${params.length}`);
  }
  if (options.paymentStatus) {
    params.push(options.paymentStatus);
    clauses.push(`expense.payment_status = $${params.length}`);
  }
  if (options.ledgerStatus === 'need_proof') {
    clauses.push("expense.payment_status = 'sudah_dibayar' and expense.proof_attachment_id is null");
  } else if (options.ledgerStatus === 'need_correction') {
    clauses.push("expense.finance_check_status = 'perlu_klarifikasi'");
  } else if (options.ledgerStatus === 'waiting_finance') {
    clauses.push("expense.finance_check_status in ('belum_dicek', 'dikoreksi')");
  } else if (options.ledgerStatus === 'checked') {
    clauses.push("expense.finance_check_status = 'sudah_dicek'");
  }
  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`coalesce(expense.paid_at::date, expense.created_at::date) >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`coalesce(expense.paid_at::date, expense.created_at::date) <= $${params.length}`);
  }
  if (options.query) {
    params.push(`%${options.query}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.accurate_so_number ilike $${params.length}
      or ${orderNumberSearchSql('so')} ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or cj.destination ilike $${params.length}
      or expense.description ilike $${params.length}
      or expense.recipient_name ilike $${params.length}
      or cj.assignment_snapshot->>'driver' ilike $${params.length}
      or cj.assignment_snapshot->>'plateNumber' ilike $${params.length}
    )`);
  }

  const whereSql = clauses.join(' and ');
  const rowsParams = [...params, limit, offset];
  const rows = await query(
    `
      select
        ${expenseColumns},
        cj.id as ledger_container_job_id,
        cj.container_number as ledger_container_number,
        cj.container_size as ledger_container_size,
        cj.assignment_snapshot as ledger_assignment_snapshot,
        so.so_number as ledger_so_number,
        so.customer_name as ledger_customer_name,
        cj.destination as ledger_destination,
        so.trip_date as ledger_trip_date
      from container_job_expenses expense
      join container_jobs cj on cj.id = expense.container_job_id
      join sales_orders so on so.id = coalesce(expense.sales_order_id, cj.sales_order_id)
      left join attachments proof on proof.id = expense.proof_attachment_id
      where ${whereSql}
      order by coalesce(expense.paid_at, expense.created_at) desc, expense.created_at desc
      limit $${params.length + 1} offset $${params.length + 2}
    `,
    rowsParams,
  );
  const summary = await query(
    `
      select
        count(*)::int as total,
        coalesce(sum(expense.amount), 0)::numeric as total_amount,
        count(*) filter (
          where expense.payment_status = 'sudah_dibayar'
            and expense.proof_attachment_id is null
        )::int as need_proof,
        count(*) filter (where expense.finance_check_status = 'perlu_klarifikasi')::int as need_correction,
        count(*) filter (where expense.finance_check_status in ('belum_dicek', 'dikoreksi'))::int as waiting_finance,
        count(*) filter (where expense.finance_check_status = 'sudah_dicek')::int as checked
      from container_job_expenses expense
      join container_jobs cj on cj.id = expense.container_job_id
      join sales_orders so on so.id = coalesce(expense.sales_order_id, cj.sales_order_id)
      where ${whereSql}
    `,
    params,
  );

  return {
    rows: rows.rows.map((row) => {
      const assignment = row.ledger_assignment_snapshot || {};
      return {
        ...mapContainerJobExpense(row),
        jobId: row.ledger_container_job_id,
        soNumber: row.ledger_so_number || '',
        containerNumber: row.ledger_container_number || '',
        containerSize: row.ledger_container_size || '',
        customer: row.ledger_customer_name || '',
        destination: row.ledger_destination || '',
        tripDate: row.ledger_trip_date || null,
        driver: assignment.driver || '',
        plateNumber: assignment.plateNumber || '',
      };
    }),
    page,
    pageSize,
    total: Number(summary.rows[0]?.total || 0),
    summary: {
      totalAmount: Number(summary.rows[0]?.total_amount || 0),
      needProof: Number(summary.rows[0]?.need_proof || 0),
      needCorrection: Number(summary.rows[0]?.need_correction || 0),
      waitingFinance: Number(summary.rows[0]?.waiting_finance || 0),
      checked: Number(summary.rows[0]?.checked || 0),
    },
  };
}

async function getMappedExpenseById(client, id) {
  const result = await client.query(
    `
      select ${expenseColumns}
      from container_job_expenses expense
      left join attachments proof on proof.id = expense.proof_attachment_id
      where expense.id = $1
      limit 1
    `,
    [id],
  );
  return result.rows[0] ? mapContainerJobExpense(result.rows[0]) : null;
}

export async function findContainerJobExpenseByIdRecord(id) {
  const result = await query(
    `
      select ${expenseColumns}
      from container_job_expenses expense
      left join attachments proof on proof.id = expense.proof_attachment_id
      where expense.id = $1
      limit 1
    `,
    [id],
  );
  return result.rows[0] ? mapContainerJobExpense(result.rows[0]) : null;
}

export function shouldRequireAssignmentAfterVendorRevert(currentSource, nextSource, documentOnlyUpdate = false) {
  return !documentOnlyUpdate
    && (currentSource || 'internal') === 'vendor'
    && (nextSource || 'internal') === 'internal';
}

async function ensureInternalExecution(client, id, processLabel = 'proses internal') {
  const result = await client.query('select id, execution_source from container_jobs where id = $1', [id]);
  if (!result.rows[0]) throw validationError('Container Job tidak ditemukan.', 'CONTAINER_JOB_NOT_FOUND', 404);
  if ((result.rows[0].execution_source || 'internal') === 'vendor') {
    throw validationError(
      `Ritasi Vendor tidak dapat diproses pada ${processLabel}.`,
      'CONTAINER_JOB_VENDOR_INTERNAL_PROCESS_FORBIDDEN',
      409,
    );
  }
}

export async function createContainerJobExpenseRecord(id, payload = {}) {
  return withTransaction(async (client) => {
    await ensureInternalExecution(client, id, 'Rekening Dropping');
    const jobResult = await client.query(
      `
        select cj.id, cj.sales_order_id, cj.driver_id, cj.status, cj.container_number,
               cj.assignment_snapshot,
               so.so_number, so.do_number, so.customer_name, cj.destination
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [id],
    );
    if (!jobResult.rows[0]) {
      const error = new Error('Container Job tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_NOT_FOUND';
      throw error;
    }

    const job = jobResult.rows[0];
    const idempotencyKey = normalizeOptionalText(payload.idempotencyKey);
    const sourceRefId = idempotencyKey
      ? `manual:${idempotencyKey}`
      : `manual:${job.id}:${payload.category}:${crypto.randomUUID()}`;
    const requestedInputSource = String(payload.inputSource || '').trim().toLowerCase();
    const inputSource = ['operational', 'finance', 'system'].includes(requestedInputSource)
      ? requestedInputSource
      : 'operational';
    const result = await client.query(
      `
        insert into container_job_expenses (
          sales_order_id,
          container_job_id,
          driver_id,
          category,
          expense_group,
          amount,
          description,
          recipient_type,
          recipient_name,
          payment_status,
          paid_at,
          paid_by_name,
          proof_attachment_id,
          source,
          source_ref_id,
          input_source,
          idempotency_key,
          created_by_name,
          updated_by_name
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12, $13,
          'manual', $14,
          case when $16 = any(array['operational', 'finance', 'system']) then $16 else 'operational' end,
          $15, $17, $17
        )
        on conflict (idempotency_key) where idempotency_key is not null do nothing
        returning id
      `,
      [
        job.sales_order_id,
        job.id,
        payload.driverId || job.driver_id || null,
        payload.category,
        payload.expenseGroup || null,
        payload.amount,
        payload.description || null,
        payload.recipientType || 'driver',
        payload.recipientName || null,
        payload.paymentStatus || 'belum_dibayar',
        payload.paidAt || (payload.paymentStatus === 'sudah_dibayar' ? new Date().toISOString() : null),
        payload.paidByName || null,
        payload.proofAttachmentId || null,
        sourceRefId,
        idempotencyKey,
        inputSource,
        payload.actorName || 'Operational',
      ],
    );

    if (!result.rows[0]) {
      if (!idempotencyKey) {
        const error = new Error('Biaya sudah pernah diproses, tetapi kunci submit tidak tersedia. Silakan ulangi tambah biaya sebagai entri baru.');
        error.statusCode = 409;
        error.code = 'CONTAINER_JOB_EXPENSE_IDEMPOTENCY_KEY_MISSING';
        throw error;
      }
      const duplicate = await client.query(
        `select id from container_job_expenses where idempotency_key = $1 limit 1`,
        [idempotencyKey],
      );
      if (!duplicate.rows[0]) {
        const error = new Error('Biaya sudah pernah diproses dengan kunci submit ini, tetapi data duplikat tidak ditemukan. Silakan ulangi tambah biaya sebagai entri baru.');
        error.statusCode = 409;
        error.code = 'CONTAINER_JOB_EXPENSE_IDEMPOTENCY_KEY_NOT_FOUND';
        throw error;
      }
      const existingExpense = await getMappedExpenseById(client, duplicate.rows[0].id);
      const payloadMatches = existingExpense
        && existingExpense.category === payload.category
        && Number(existingExpense.amount) === Number(payload.amount)
        && (existingExpense.description || '') === (payload.description || '')
        && (existingExpense.recipientName || '') === (payload.recipientName || '')
        && existingExpense.paymentStatus === (payload.paymentStatus || 'belum_dibayar');
      if (!payloadMatches) {
        const error = new Error('Percobaan submit ini memakai kunci yang sama dengan biaya lain yang sudah tersimpan dengan data berbeda. Silakan catat sebagai entri baru.');
        error.statusCode = 409;
        error.code = 'CONTAINER_JOB_EXPENSE_IDEMPOTENCY_KEY_MISMATCH';
        throw error;
      }
      return existingExpense;
    }
    const expenseId = result.rows[0].id;

    if (payload.paymentStatus === 'sudah_dibayar') {
      const batchDate = payload.paidAt ? String(payload.paidAt).slice(0, 10) : null;
      const batch = await ensureOperationalFundBatch(client, batchDate, payload.actorName || 'Operational');
      await ensureSufficientOperationalFundBalance(client, batch, expenseId, payload.amount);
      await client.query(
        `
          insert into operational_fund_transactions (
            batch_id,
            container_job_id,
            container_job_expense_id,
            transaction_date,
            transaction_type,
            category,
            amount,
            description,
            proof_attachment_id,
            top_name,
            driver_name,
            do_number,
            customer_name,
            source,
            source_ref_id,
            created_by_name,
            updated_by_name
          )
          values ($1, $2, $3, coalesce($4::date, current_date), 'debit', $5, $6, $7, $8, $9, $10, $11, $12, 'container_job_expense', $14, $13, $13)
          on conflict (container_job_expense_id)
            where container_job_expense_id is not null
              and transaction_type = 'debit'
              and status = 'posted'
          do update set
            amount = excluded.amount,
            description = excluded.description,
            proof_attachment_id = excluded.proof_attachment_id,
            top_name = excluded.top_name,
            driver_name = excluded.driver_name,
            do_number = excluded.do_number,
            customer_name = excluded.customer_name,
            batch_id = excluded.batch_id,
            source = excluded.source,
            source_ref_id = excluded.source_ref_id,
            updated_by_name = excluded.updated_by_name,
            updated_at = now()
        `,
        [
          batch.id,
          job.id,
          expenseId,
          batchDate,
          operationalFundCategoryFromExpense(payload.category),
          payload.amount,
          payload.description || `${job.so_number || '-'} ${job.container_number || ''}`.trim(),
          payload.proofAttachmentId || null,
          payload.actorName || 'Operational',
          payload.recipientName || job.assignment_snapshot?.driver || null,
          job.do_number || job.destination || null,
          job.customer_name || null,
          payload.actorName || 'Operational',
          String(expenseId),
        ],
      );
    }

    return getMappedExpenseById(client, expenseId);
  });
}

async function fetchDroppingExpenseForUpdate(client, id, expenseId) {
  const existingResult = await client.query(
    `
      select expense.*, cj.container_number, cj.assignment_snapshot, cj.status as job_status,
             so.so_number, so.do_number, so.customer_name, cj.destination
      from container_job_expenses expense
      join container_jobs cj on cj.id = expense.container_job_id
      join sales_orders so on so.id = cj.sales_order_id
      where expense.id = $1 and expense.container_job_id = $2
      limit 1
    `,
    [expenseId, id],
  );
  const existing = existingResult.rows[0];
  if (!existing) {
    const error = new Error('Transaksi biaya Container Job tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'CONTAINER_JOB_EXPENSE_NOT_FOUND';
    throw error;
  }
  return existing;
}

async function applyDroppingExpenseFieldsUpdate(client, { id, expenseId, existing, payload, resultingFinanceCheckStatus }) {
  await client.query(
    `
      update container_job_expenses
      set category = $1,
          amount = $2,
          description = $3,
          recipient_type = $4,
          recipient_name = $5,
          payment_status = $6,
          paid_at = case
            when $6 = 'sudah_dibayar' then coalesce($7::timestamptz, paid_at, now())
            else null
          end,
          paid_by_name = case
            when $6 = 'sudah_dibayar' then coalesce($8, paid_by_name)
            else null
          end,
          proof_attachment_id = coalesce($9, proof_attachment_id),
          finance_check_status = $10,
          finance_checked_by_name = null,
          finance_checked_at = null,
          updated_by_name = $11,
          updated_at = now()
      where id = $12
    `,
    [
      payload.category,
      payload.amount,
      payload.description || null,
      payload.recipientType || 'driver',
      payload.recipientName || null,
      payload.paymentStatus || 'belum_dibayar',
      payload.paidAt || null,
      payload.paidByName || null,
      payload.proofAttachmentId || null,
      resultingFinanceCheckStatus,
      payload.actorName || 'Operational',
      expenseId,
    ],
  );

  if (payload.paymentStatus === 'sudah_dibayar') {
    const batchDate = payload.paidAt ? String(payload.paidAt).slice(0, 10) : null;
    const batch = await ensureOperationalFundBatch(client, batchDate, payload.actorName || 'Operational');
    await ensureSufficientOperationalFundBalance(client, batch, expenseId, payload.amount);
    await client.query(
      `
        insert into operational_fund_transactions (
          batch_id,
          container_job_id,
          container_job_expense_id,
          transaction_date,
          transaction_type,
          category,
          amount,
          description,
          proof_attachment_id,
          top_name,
          driver_name,
          do_number,
          customer_name,
          source,
          source_ref_id,
          created_by_name,
          updated_by_name
        )
        values ($1, $2, $3, coalesce($4::date, current_date), 'debit', $5, $6, $7, $8, $9, $10, $11, $12, 'container_job_expense', $14, $13, $13)
        on conflict (container_job_expense_id)
          where container_job_expense_id is not null
            and transaction_type = 'debit'
            and status = 'posted'
        do update set
          transaction_date = excluded.transaction_date,
          amount = excluded.amount,
          description = excluded.description,
          proof_attachment_id = excluded.proof_attachment_id,
          top_name = excluded.top_name,
          driver_name = excluded.driver_name,
          do_number = excluded.do_number,
          customer_name = excluded.customer_name,
          batch_id = excluded.batch_id,
          source = excluded.source,
          source_ref_id = excluded.source_ref_id,
          updated_by_name = excluded.updated_by_name,
          updated_at = now()
      `,
      [
        batch.id,
        id,
        expenseId,
        batchDate,
        operationalFundCategoryFromExpense(payload.category),
        payload.amount,
        payload.description || `${existing.so_number || '-'} ${existing.container_number || ''}`.trim(),
        payload.proofAttachmentId || existing.proof_attachment_id || null,
        payload.actorName || 'Operational',
        payload.recipientName || existing.assignment_snapshot?.driver || null,
        existing.do_number || existing.destination || null,
        existing.customer_name || null,
        payload.actorName || 'Operational',
        String(expenseId),
      ],
    );
  } else {
    await client.query(
      `
        update operational_fund_transactions
        set status = 'void',
            updated_by_name = $1,
            updated_at = now()
        where container_job_expense_id = $2
          and transaction_type = 'debit'
          and status = 'posted'
      `,
      [payload.actorName || 'Operational', expenseId],
    );
  }

  return getMappedExpenseById(client, expenseId);
}

export async function correctContainerJobExpenseRecord(id, expenseId, payload = {}) {
  return withTransaction(async (client) => {
    await ensureInternalExecution(client, id, 'Rekening Dropping');
    const existing = await fetchDroppingExpenseForUpdate(client, id, expenseId);
    if (existing.finance_check_status !== 'perlu_klarifikasi') {
      const error = new Error('Transaksi biaya hanya bisa dikoreksi setelah Finance meminta klarifikasi.');
      error.statusCode = 409;
      error.code = 'CONTAINER_JOB_EXPENSE_CORRECTION_INVALID_STATUS';
      throw error;
    }
    return applyDroppingExpenseFieldsUpdate(client, {
      id, expenseId, existing, payload, resultingFinanceCheckStatus: 'dikoreksi',
    });
  });
}

export async function updateDroppingExpenseBeforeFinanceCheckRecord(id, expenseId, payload = {}) {
  return withTransaction(async (client) => {
    await ensureInternalExecution(client, id, 'Rekening Dropping');
    const existing = await fetchDroppingExpenseForUpdate(client, id, expenseId);
    ensureExpenseNotVoid(existing);
    ensureManualOperationalExpense(existing);
    ensureTransactionNotFinanceChecked(existing);
    await ensureOperationalFundBatchOpenForExpense(client, expenseId);
    await ensureSalesOrderBillingNotAdvanced(client, existing.sales_order_id);
    return applyDroppingExpenseFieldsUpdate(client, {
      id, expenseId, existing, payload, resultingFinanceCheckStatus: 'belum_dicek',
    });
  });
}

export async function moveDroppingExpenseToAnotherJobBeforeFinanceCheckRecord(id, expenseId, targetJobId, payload = {}) {
  return withTransaction(async (client) => {
    await ensureInternalExecution(client, id, 'Rekening Dropping');
    const existing = await fetchDroppingExpenseForUpdate(client, id, expenseId);
    ensureExpenseNotVoid(existing);
    ensureManualOperationalExpense(existing);
    ensureTransactionNotFinanceChecked(existing);
    await ensureOperationalFundBatchOpenForExpense(client, expenseId);
    await ensureSalesOrderBillingNotAdvanced(client, existing.sales_order_id);

    const normalizedTargetJobId = String(targetJobId || '').trim();
    if (!normalizedTargetJobId || normalizedTargetJobId === id) {
      const error = new Error('Ritasi tujuan tidak valid.');
      error.statusCode = 409;
      error.code = 'CONTAINER_JOB_EXPENSE_MOVE_TARGET_INVALID';
      throw error;
    }
    await ensureInternalExecution(client, normalizedTargetJobId, 'Rekening Dropping');
    const targetResult = await client.query(
      `
        select cj.id, cj.sales_order_id, cj.status, cj.container_number, cj.assignment_snapshot, cj.destination,
               so.so_number, so.do_number, so.customer_name
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
      `,
      [normalizedTargetJobId],
    );
    const targetJob = targetResult.rows[0];
    if (!targetJob) {
      const error = new Error('Ritasi tujuan tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_EXPENSE_MOVE_TARGET_NOT_FOUND';
      throw error;
    }
    if (targetJob.status === 'cancelled') {
      const error = new Error('Ritasi tujuan sudah dibatalkan, tidak bisa dipakai untuk pindah transaksi.');
      error.statusCode = 409;
      error.code = 'CONTAINER_JOB_EXPENSE_MOVE_TARGET_INVALID';
      throw error;
    }

    await client.query(
      `
        update container_job_expenses
        set container_job_id = $1,
            sales_order_id = $2,
            updated_by_name = $3,
            updated_at = now()
        where id = $4
      `,
      [targetJob.id, targetJob.sales_order_id, payload.actorName || 'Operational', expenseId],
    );
    await client.query(
      `
        update operational_fund_transactions
        set container_job_id = $1,
            driver_name = $2,
            do_number = $3,
            customer_name = $4,
            updated_by_name = $5,
            updated_at = now()
        where container_job_expense_id = $6
          and transaction_type = 'debit'
          and status = 'posted'
      `,
      [
        targetJob.id,
        existing.recipient_name || targetJob.assignment_snapshot?.driver || null,
        targetJob.do_number || targetJob.destination || null,
        targetJob.customer_name || null,
        payload.actorName || 'Operational',
        expenseId,
      ],
    );

    return getMappedExpenseById(client, expenseId);
  });
}

export async function voidDroppingExpenseBeforeFinanceCheckRecord(id, expenseId, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await fetchDroppingExpenseForUpdate(client, id, expenseId);
    ensureExpenseNotVoid(existing);
    ensureManualOperationalExpense(existing);
    ensureTransactionNotFinanceChecked(existing);
    await ensureOperationalFundBatchOpenForExpense(client, expenseId);
    await ensureSalesOrderBillingNotAdvanced(client, existing.sales_order_id);

    await client.query(
      `
        update container_job_expenses
        set payment_status = 'batal',
            updated_by_name = $1,
            updated_at = now()
        where id = $2
      `,
      [payload.actorName || 'Operational', expenseId],
    );
    await client.query(
      `
        update operational_fund_transactions
        set status = 'void',
            updated_by_name = $1,
            updated_at = now()
        where container_job_expense_id = $2
          and transaction_type = 'debit'
          and status = 'posted'
      `,
      [payload.actorName || 'Operational', expenseId],
    );

    return getMappedExpenseById(client, expenseId);
  });
}

export async function uploadAutoJourneyMoneyProofRecord(id, expenseId, payload = {}) {
  return withTransaction(async (client) => {
    await ensureInternalExecution(client, id, 'Uang Jalan');
    const existing = await fetchDroppingExpenseForUpdate(client, id, expenseId);
    if (existing.source !== 'auto_uj_order') {
      const error = new Error('Bukti transfer ini hanya berlaku untuk transaksi UJ Perjalanan otomatis.');
      error.statusCode = 409;
      error.code = 'CONTAINER_JOB_EXPENSE_NOT_AUTO_UJ';
      throw error;
    }
    ensureExpenseNotVoid(existing);
    ensureTransactionNotFinanceChecked(existing);
    await ensureOperationalFundBatchOpenForExpense(client, expenseId);

    await client.query(
      `
        update container_job_expenses
        set proof_attachment_id = $1,
            updated_by_name = $2,
            updated_at = now()
        where id = $3
      `,
      [payload.proofAttachmentId, payload.actorName || 'Operational', expenseId],
    );
    await client.query(
      `
        update operational_fund_transactions
        set proof_attachment_id = $1,
            updated_by_name = $2,
            updated_at = now()
        where container_job_expense_id = $3
          and transaction_type = 'debit'
          and status = 'posted'
      `,
      [payload.proofAttachmentId, payload.actorName || 'Operational', expenseId],
    );

    return getMappedExpenseById(client, expenseId);
  });
}

export async function updateContainerJobExpenseProofRecord(id, expenseId, payload = {}) {
  return withTransaction(async (client) => {
    await ensureInternalExecution(client, id, 'Rekening Dropping');
    const existing = await fetchDroppingExpenseForUpdate(client, id, expenseId);
    ensureExpenseNotVoid(existing);
    ensureTransactionNotFinanceChecked(existing);

    await client.query(
      `
        update container_job_expenses
        set proof_attachment_id = $1,
            updated_by_name = $2,
            updated_at = now()
        where id = $3
      `,
      [
        payload.proofAttachmentId,
        payload.actorName || 'Operational',
        expenseId,
      ],
    );

    return getMappedExpenseById(client, expenseId);
  });
}

// Jaring pengaman DB untuk "satu driver/truck per perjalanan aktif": exclusion constraint
// (23P01, migrasi 202610070001) menggantikan unique index lama (23505).
const ASSIGNMENT_ACTIVE_CONSTRAINTS = new Set([
  'ex_container_jobs_driver_active',
  'ex_container_jobs_vehicle_active',
  'uq_container_jobs_driver_active',
  'uq_container_jobs_vehicle_active',
]);

function toAssignmentConflictError(error) {
  if (!['23505', '23P01'].includes(error?.code) || !ASSIGNMENT_ACTIVE_CONSTRAINTS.has(error.constraint)) return error;
  return validationError(
    'Driver atau truck baru saja ter-assign ke job lain oleh permintaan lain yang bersamaan. Muat ulang dan pilih driver/truck lain.',
    'ASSIGNMENT_ALREADY_ACTIVE',
    409,
  );
}

export async function updateContainerJob(id, form) {
  try {
    return await updateContainerJobTransaction(id, form);
  } catch (error) {
    throw toAssignmentConflictError(error);
  }
}

export async function resetContainerJobAssignment(id, payload = {}) {
  return withTransaction(async (client) => {
    await ensureInternalExecution(client, id, 'reset assignment internal');
    const existing = await client.query(
      `
        select cj.id, cj.sales_order_id, cj.container_number, cj.status, cj.driver_id, cj.vehicle_id,
               cj.assignment_snapshot, cj.entry_source, cj.is_backdate_entry,
               cj.has_driver_commission, cj.driver_commission_amount, cj.commission_status,
               so.so_number, so.invoice_number, so.billing_status, so.debit_note_document_uploaded_at
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.id = $1
        for update
      `,
      [id],
    );
    const job = existing.rows[0];
    if (!job) {
      const error = new Error('Container Job tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_NOT_FOUND';
      throw error;
    }
    if (job.status === 'cancelled') {
      throw validationError('Container Job yang sudah batal tidak perlu direset.', 'CONTAINER_JOB_RESET_ALREADY_CANCELLED', 409);
    }
    await ensureSalesOrderBillingNotAdvanced(client, job.sales_order_id);

    const checkedExpense = await client.query(
      `
        select id
        from container_job_expenses
        where container_job_id = $1
          and payment_status <> 'batal'
          and finance_check_status = 'sudah_dicek'
        limit 1
      `,
      [id],
    );
    if (checkedExpense.rows[0]) {
      throw validationError(
        'Ritasi tidak bisa direset karena ada biaya yang sudah divalidasi Finance.',
        'CONTAINER_JOB_RESET_HAS_FINANCE_CHECKED_EXPENSE',
        409,
      );
    }

    const closedBatch = await client.query(
      `
        select batch.id
        from operational_fund_transactions oft
        join operational_fund_batches batch on batch.id = oft.batch_id
        where oft.container_job_id = $1
          and oft.status = 'posted'
          and batch.status = 'closed'
        limit 1
      `,
      [id],
    );
    if (closedBatch.rows[0]) {
      throw validationError(
        'Ritasi tidak bisa direset karena ada transaksi rekening dropping yang sudah masuk batch tertutup.',
        'CONTAINER_JOB_RESET_HAS_CLOSED_FUND_BATCH',
        409,
      );
    }

    const actorName = payload.actorName || 'Operational';
    const reason = payload.reason || 'Reset ritasi salah assign';
    await client.query(
      `
        update container_job_expenses
        set payment_status = 'batal',
            finance_check_status = case
              when finance_check_status = 'perlu_klarifikasi' then 'dikoreksi'
              else finance_check_status
            end,
            finance_note = coalesce(nullif(finance_note, ''), $3),
            updated_by_name = $2,
            updated_at = now()
        where container_job_id = $1
          and payment_status <> 'batal'
      `,
      [id, actorName, reason],
    );
    await client.query(
      `
        update operational_fund_transactions
        set status = 'void',
            updated_by_name = $2,
            updated_at = now()
        where container_job_id = $1
          and transaction_type = 'debit'
          and status = 'posted'
      `,
      [id, actorName],
    );

    await client.query(
      `
        update container_jobs
        set driver_id = null,
            vehicle_id = null,
            assignment_snapshot = '{}'::jsonb,
            container_number = null,
            rpuj_status = 'pending',
            rpuj_notes = null,
            rpuj_requested_by_name = null,
            rpuj_requested_at = null,
            rpuj_reviewed_by_name = null,
            rpuj_reviewed_at = null,
            rpuj_rejection_note = null,
            rpuj_transfer_uploaded_by_name = null,
            rpuj_transfer_uploaded_at = null,
            status = 'received',
            running_at = null,
            completed_at = null,
            cancelled_at = null,
            cancel_reason = null,
            cancel_source = null,
            cancelled_by_name = null,
            cancel_request_status = 'none',
            cancel_request_note = null,
            cancel_requested_by_name = null,
            cancel_requested_by_role = null,
            cancel_requested_at = null,
            cancel_reviewed_by_name = null,
            cancel_reviewed_at = null,
            cancel_review_note = null,
            repo_location = null,
            repo_stored_at = null,
            repo_eir_number = null,
            repo_reason = null,
            repo_notes = null,
            repo_container_condition = null,
            repo_released_driver_id = null,
            repo_released_vehicle_id = null,
            repo_created_by_name = null,
            repo_picked_up_at = null,
            repo_picked_up_by_name = null,
            inap_started_at = null,
            inap_ended_at = null,
            inap_reason = null,
            inap_notes = null,
            inap_created_by_name = null,
            has_driver_commission = false,
            driver_commission_amount = 0,
            driver_commission_source_destination_id = null,
            driver_commission_note = null,
            commission_driver_id = null,
            commission_driver_name = null,
            commission_driver_snapshot = '{}'::jsonb,
            commission_locked_amount = null,
            commission_locked_at = null,
            commission_status = 'without_commission',
            uj_amount_snapshot = null,
            uj_source_destination_id = null,
            uj_snapshot_at = null,
            uj_snapshot_source = null,
            updated_by_name = $2,
            updated_at = now()
        where id = $1
      `,
      [id, actorName],
    );

    await syncResourceAssignmentStatus(client, job, { driverId: null, vehicleId: null }, 'received', job.entry_source, job.is_backdate_entry);
    await refreshOrderStatus(client, job.sales_order_id);

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

async function updateContainerJobTransaction(id, form) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select cj.id, cj.sales_order_id, cj.container_number, cj.container_size, cj.running_at, cj.completed_at, cj.cancelled_at,
               cj.driver_id, cj.vehicle_id, cj.execution_source, cj.rpuj_status, cj.rpuj_notes, cj.status, cj.eir_number,
               cj.assignment_snapshot,
               cj.loading_voucher_number, cj.travel_document_number, cj.tila_gatepass_document_number,
               cj.unloading_voucher_number, cj.weighing_document_number,
               cj.spk_number, cj.cancel_reason, cj.cancel_source, cj.cancelled_by_name,
               cj.repo_location, cj.repo_stored_at, cj.repo_eir_number, cj.repo_reason, cj.repo_notes, cj.repo_container_condition,
               cj.repo_released_driver_id, cj.repo_released_vehicle_id, cj.repo_created_by_name,
               cj.repo_picked_up_at, cj.repo_picked_up_by_name,
               cj.inap_started_at, cj.inap_ended_at, cj.inap_reason, cj.inap_notes, cj.inap_created_by_name,
               cj.entry_source, cj.historical_period, cj.historical_notes,
               cj.is_backdate_entry, cj.backdate_reason, cj.created_as_correction,
               cj.has_driver_commission, cj.driver_commission_amount,
               cj.driver_commission_source_destination_id, cj.driver_commission_note,
               cj.commission_driver_id, cj.commission_driver_name, cj.commission_driver_snapshot,
               cj.commission_locked_amount, cj.commission_locked_at, cj.commission_status,
               cj.uj_amount_snapshot, cj.uj_source_destination_id, cj.uj_snapshot_at, cj.uj_snapshot_source,
               cj.assignment_group_id,
               so.so_number, so.do_number, so.customer_name, cj.destination, cj.destination_id,
               so.trip_date, so.finance_verification_status
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
    const documentOnlyUpdate = normalizeBooleanFlag(form.documentOnlyUpdate);
    const nextExecutionSource = documentOnlyUpdate
      ? currentJob.execution_source || 'internal'
      : form.executionSource || currentJob.execution_source || 'internal';
    const isVendorExecution = nextExecutionSource === 'vendor';
    if (isVendorExecution && currentJob.execution_source !== 'vendor') {
      const linkedInternalProcess = await client.query(
        `
          select
            exists(
              select 1 from container_job_expenses expense
              where expense.container_job_id = $1 and expense.payment_status <> 'batal'
            ) as has_active_expense,
            exists(
              select 1 from driver_commission_items item
              where item.container_job_id = $1 and item.voided_at is null
            ) as has_commission_item
        `,
        [id],
      );
      if (
        currentJob.rpuj_status !== 'pending'
        || linkedInternalProcess.rows[0]?.has_active_expense
        || linkedInternalProcess.rows[0]?.has_commission_item
      ) {
        throw validationError(
          'Ritasi tidak dapat diubah menjadi Vendor karena sudah memiliki proses UJ, Rekening Dropping, atau komisi.',
          'CONTAINER_JOB_VENDOR_INTERNAL_PROCESS_EXISTS',
          409,
        );
      }
    }
    const allowRetroactiveEntry = isBackfillLike(form, currentJob);
    const allowAdminCorrection = normalizeBooleanFlag(form.adminCorrectionMode);
    const driver = await findDriver(client, form);
    const vehicle = await findVehicle(client, form);
    if (shouldRequireAssignmentAfterVendorRevert(
      currentJob.execution_source,
      nextExecutionSource,
      documentOnlyUpdate,
    )) {
      requireCompleteOperationalAssignment(
        form,
        driver,
        vehicle,
        currentJob,
        'Ritasi Vendor yang dikembalikan menjadi Unit Sendiri wajib memilih truck dan driver.',
      );
    }
    if (!documentOnlyUpdate && !isVendorExecution) {
      assertDriverAssignable(driver, currentJob.driver_id);
      assertVehicleAssignable(vehicle, currentJob.vehicle_id);
    }
    if (!documentOnlyUpdate && !isVendorExecution && shouldValidateVehicleContainerSize(form, currentJob)) {
      try {
        assertVehicleMatchesContainer(vehicle, currentJob.container_size);
      } catch (error) {
        if (error.code !== 'VEHICLE_SIZE_MISMATCH' || !(await isComboPickupVehicle(client, currentJob, vehicle))) throw error;
      }
    }
    const nextStatus = documentOnlyUpdate ? currentJob.status || 'received' : form.status || currentJob.status || 'received';
    const pickupMovement = !documentOnlyUpdate && ['completed', 'cancelled'].includes(nextStatus)
      && currentJob.repo_picked_up_at
      ? await lockRepoPickupMovementForJob(client, id)
      : null;
    if (isVendorExecution && ['repo_stored', 'inap'].includes(nextStatus)) {
      throw validationError(
        'Ritasi Vendor tidak dapat menggunakan status Container Titip atau Inap armada internal.',
        'CONTAINER_JOB_VENDOR_INTERNAL_STATUS_FORBIDDEN',
        409,
      );
    }
    if (nextStatus === 'cancelled' && currentJob.status === 'completed' && !allowAdminCorrection) {
      throw validationError(
        'Container Job yang sudah selesai tidak dapat dibatalkan.',
        'CONTAINER_JOB_COMPLETED_CANNOT_CANCEL',
        409,
      );
    }
    if (nextStatus === 'cancelled' && currentJob.status !== 'cancelled') {
      const activeExpenses = await client.query(
        `
          select coalesce(count(*), 0)::int as count, coalesce(sum(amount), 0)::numeric as total
          from container_job_expenses
          where container_job_id = $1
            and payment_status <> 'batal'
        `,
        [id],
      );
      if (Number(activeExpenses.rows[0].count) > 0) {
        throw validationError(
          `Container Job tidak bisa dibatalkan karena masih ada ${activeExpenses.rows[0].count} biaya aktif (total Rp ${Number(activeExpenses.rows[0].total).toLocaleString('id-ID')}) yang sudah tercatat. Batalkan atau alihkan biaya tersebut ke job lain terlebih dahulu.`,
          'CONTAINER_JOB_CANCEL_HAS_ACTIVE_EXPENSE',
          409,
        );
      }
    }
    const nextRpujStatus = isVendorExecution
      ? 'pending'
      : normalizeRpujStatusForOperational(currentJob, form.rpujStatus);
    if (!documentOnlyUpdate && !isVendorExecution && nextRpujStatus === 'submitted' && !['submitted', 'approved', 'paid'].includes(currentJob.rpuj_status)) {
      requireCompleteOperationalAssignment(
        form,
        driver,
        vehicle,
        currentJob,
        'RPUJ belum bisa diajukan. Lengkapi truck dan driver terlebih dahulu.',
      );
    }
    if (!documentOnlyUpdate && !isVendorExecution && ['running', 'completed'].includes(nextStatus)) {
      requireCompleteOperationalAssignment(
        form,
        driver,
        vehicle,
        currentJob,
        'Status perjalanan belum bisa Sedang Jalan. Lengkapi truck dan driver terlebih dahulu.',
      );
    }
    if (!documentOnlyUpdate && !isVendorExecution) {
      await requireAssignmentAvailable(client, id, form, driver, vehicle, nextStatus, existing.rows[0]);
    }
    const validatedCompletedAt = !documentOnlyUpdate && nextStatus === 'completed'
      ? await requireCompletedJobReady(client, id, form, currentJob, {
          allowRetroactiveEntry,
          allowAdminCorrection,
          isVendorExecution,
          pickupMovement,
        })
      : null;
    const requestRpujAt = nextRpujStatus === 'submitted' && currentJob.rpuj_status !== 'submitted'
      ? new Date().toISOString()
      : null;
    const nextContainerNumber = hasOwnInput(form, 'containerNumber')
      ? String(form.containerNumber || existing.rows[0].container_number || '').trim().toUpperCase() || null
      : existing.rows[0].container_number || null;
    if (isVendorExecution && !nextContainerNumber) {
      throw validationError(
        'Nomor container wajib diisi untuk ritasi vendor.',
        'CONTAINER_JOB_VENDOR_CONTAINER_NUMBER_REQUIRED',
        400,
      );
    }
    if (nextStatus !== 'cancelled') {
      await assertContainerNumberAllowed(client, {
        containerNumber: nextContainerNumber,
        previousContainerNumber: existing.rows[0].container_number,
        jobId: existing.rows[0].id,
        salesOrderId: existing.rows[0].sales_order_id,
        confirmed: form.confirmPossibleDuplicateContainer,
      });
    }
    // Tujuan (destination) sengaja dibekukan begitu container dibuat -- hanya boleh dikoreksi lewat
    // mode koreksi admin (sudah divalidasi di service layer via ensureAdminCorrectionContract), bukan
    // lewat update biasa (mis. edit SO), supaya tidak diam-diam berubah tiap kali job diperbarui.
    const nextDestination = allowAdminCorrection && hasOwnInput(form, 'destination')
      ? String(form.destination || existing.rows[0].destination || '').trim()
      : existing.rows[0].destination || '';
    // UJ snapshot dibekukan otomatis oleh syncAutoJourneyMoneyExpense saat job pertama kali jalan --
    // sama seperti destination, cuma bisa dikoreksi manual lewat mode koreksi admin (sudah divalidasi
    // di service layer), bukan lewat update biasa.
    const nextUjAmountSnapshot = allowAdminCorrection && hasOwnInput(form, 'ujAmountSnapshot')
      ? Number(form.ujAmountSnapshot) || null
      : existing.rows[0].uj_amount_snapshot;
    const nextUjSourceDestinationId = allowAdminCorrection && hasOwnInput(form, 'ujAmountSnapshot')
      ? form.ujSourceDestinationId || existing.rows[0].uj_source_destination_id || null
      : existing.rows[0].uj_source_destination_id;
    const nextUjSnapshotAt = allowAdminCorrection && hasOwnInput(form, 'ujAmountSnapshot')
      ? new Date().toISOString()
      : existing.rows[0].uj_snapshot_at;
    const nextUjSnapshotSource = allowAdminCorrection && hasOwnInput(form, 'ujAmountSnapshot')
      ? 'admin_correction'
      : existing.rows[0].uj_snapshot_source;
    const runningAt = resolveRunningAtForSave(existing.rows[0], form, nextStatus, { documentOnlyUpdate, allowAdminCorrection });
    if (!documentOnlyUpdate && ['running', 'repo_stored', 'completed'].includes(nextStatus) && !runningAt) {
      throw validationError('Tanggal dan jam mulai perjalanan wajib diisi.', 'CONTAINER_JOB_RUNNING_TIME_REQUIRED', 400);
    }
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
    const nextDriverId = isVendorExecution
      ? null
      : driver?.id || form.driverId || (hasDriverAssignmentInput ? null : existing.rows[0].driver_id);
    const nextVehicleId = isVendorExecution
      ? null
      : vehicle?.id || form.vehicleId || (hasVehicleAssignmentInput ? null : existing.rows[0].vehicle_id);
    const existingAssignment = existing.rows[0].assignment_snapshot || {};
    // Snapshot (nama sopir/truck, rekening bank, e-money) dibekukan begitu assignment dibuat.
    // findDriver()/findVehicle() di atas selalu mengambil data TERKINI dari tabel master, jadi
    // hasilnya hanya boleh dipakai untuk membangun ulang snapshot kalau sopir/truck-nya BENAR-BENAR
    // diganti pada request ini -- bukan setiap kali status job diperbarui (received/running/completed
    // rutin mengirim ulang driver/plateNumber yang sama di body) -- supaya rekening bank sopir dkk
    // tidak diam-diam ikut berubah kalau data master driver dikoreksi belakangan.
    const driverIdentityChanging = hasDriverAssignmentInput && (
      form.driverId
        ? form.driverId !== existing.rows[0].driver_id
        : String(form.driver || '').trim() !== String(existingAssignment.driver || '').trim()
    );
    const vehicleIdentityChanging = hasVehicleAssignmentInput && (
      form.vehicleId
        ? form.vehicleId !== existing.rows[0].vehicle_id
        : String(form.plateNumber || '').trim() !== String(existingAssignment.plateNumber || '').trim()
    );
    // Kalau identitas driver/vehicle BENAR-BENAR berubah, default-nya sengaja dikosongkan (bukan
    // diwarisi dari existingAssignment) -- supaya fallback ke driver?.bank_name/vehicle?.unit_code
    // di toAssignmentSnapshot() benar-benar terpakai, bukan keburu ketutup oleh nilai lama yang
    // masih truthy (existingAssignment.driverBankName dkk).
    const nextAssignmentForm = {
      driver: driverIdentityChanging ? '' : (existingAssignment.driver || ''),
      plateNumber: vehicleIdentityChanging ? '' : (existingAssignment.plateNumber || ''),
      chassis: vehicleIdentityChanging ? '' : (existingAssignment.vehicleDetail || ''),
      driverPaymentMethod: driverIdentityChanging ? 'bank' : (existingAssignment.driverPaymentMethod || 'bank'),
      driverBankName: driverIdentityChanging ? '' : (existingAssignment.driverBankName || ''),
      driverBankAccountNumber: driverIdentityChanging ? '' : (existingAssignment.driverBankAccountNumber || ''),
      driverBankAccountHolder: driverIdentityChanging ? '' : (existingAssignment.driverBankAccountHolder || ''),
      driverEmoneyProvider: driverIdentityChanging ? '' : (existingAssignment.driverEmoneyProvider || ''),
      driverEmoneyNumber: driverIdentityChanging ? '' : (existingAssignment.driverEmoneyNumber || ''),
      ...form,
    };
    const nextRepoLocation = normalizeOptionalText(form.repoLocation ?? existing.rows[0].repo_location);
    const nextRepoStoredAt = nextStatus === 'repo_stored'
      ? form.repoStoredAt || existing.rows[0].repo_stored_at
      : form.repoStoredAt || existing.rows[0].repo_stored_at || null;
    if (!documentOnlyUpdate && nextStatus === 'repo_stored' && !nextRepoStoredAt) {
      throw validationError('Tanggal dan jam dititipkan wajib diisi.', 'REPO_STORED_ACTUAL_TIME_REQUIRED', 400);
    }
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
      ? form.repoPickedUpAt || existing.rows[0].repo_picked_up_at
      : existing.rows[0].repo_picked_up_at || null;
    if (!documentOnlyUpdate) {
      assertOperationalTimeline({
        runningAt,
        repoStoredAt: nextRepoStoredAt,
        repoPickedUpAt: nextRepoPickedUpAt,
        completedAt: nextStatus === 'completed' ? validatedCompletedAt : null,
      }, {
        runningAt: existing.rows[0].running_at,
        repoStoredAt: existing.rows[0].repo_stored_at,
        repoPickedUpAt: existing.rows[0].repo_picked_up_at,
        completedAt: existing.rows[0].completed_at,
      });
    }
    const nextRepoPickedUpByName = isRepoPickup
      ? normalizeOptionalText(form.repoPickedUpByName || form.updatedBy || 'Operational')
      : existing.rows[0].repo_picked_up_by_name || null;
    const nextInapReason = normalizeOptionalText(form.inapReason ?? existing.rows[0].inap_reason);
    const nextInapNotes = normalizeOptionalText(form.inapNotes ?? existing.rows[0].inap_notes);
    const nextInapStartedAt = nextStatus === 'inap'
      ? form.inapAt || existing.rows[0].inap_started_at || new Date().toISOString()
      : existing.rows[0].inap_started_at || null;
    const isLeavingInap = existing.rows[0].status === 'inap' && nextStatus !== 'inap';
    const nextInapEndedAt = isLeavingInap
      ? new Date().toISOString()
      : existing.rows[0].inap_ended_at || null;
    const nextInapCreatedByName = normalizeOptionalText(
      form.inapCreatedByName
        ?? existing.rows[0].inap_created_by_name
        ?? (nextStatus === 'inap' ? form.updatedBy || 'Operational' : null),
    );
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
    // Ritasi susulan/backdate (Phase 2) -- independen dari entry_source historis di atas. Alasannya
    // wajib diisi (divalidasi di service layer sebelum sampai ke sini), disimpan apa adanya di sini.
    const nextIsBackdateEntry = isBackdateEntry(form, existing.rows[0]);
    const nextBackdateReason = nextIsBackdateEntry
      ? normalizeOptionalText(hasOwnInput(form, 'backdateReason') ? form.backdateReason : existing.rows[0].backdate_reason)
      : null;
    const nextCreatedAsCorrection = nextIsBackdateEntry
      ? normalizeBooleanFlag(hasOwnInput(form, 'createdAsCorrection') ? form.createdAsCorrection : existing.rows[0].created_as_correction)
      : Boolean(existing.rows[0].created_as_correction);
    const hasTilaInput = hasOwnInput(form, 'tilaGatepassDocument') || hasOwnInput(form, 'unloadingVoucher') || hasOwnInput(form, 'weighingDocument');
    const nextTilaGatepassDocument = hasTilaInput
      ? form.tilaGatepassDocument || form.unloadingVoucher || form.weighingDocument || null
      : existing.rows[0].tila_gatepass_document_number || existing.rows[0].unloading_voucher_number || existing.rows[0].weighing_document_number || null;
    const commissionUpdate = resolveDriverCommissionUpdate(existing.rows[0], form, { documentOnlyUpdate });
    const commissionUpdateRequested = commissionUpdate.updateRequested;
    const isRepoJob = isRepoShipment(existing.rows[0]);
    const nextHasDriverCommission = isVendorExecution || isRepoJob ? false : commissionUpdate.hasCommission;
    const nextDriverCommissionAmount = isVendorExecution || isRepoJob ? 0 : commissionUpdate.amount;
    const nextDriverCommissionSourceDestinationId = isVendorExecution || isRepoJob ? null : commissionUpdate.sourceDestinationId;
    const nextDriverCommissionNote = isVendorExecution || isRepoJob ? null : commissionUpdate.note;
    const commissionValuesChanged = commissionUpdateRequested && Boolean(
      nextHasDriverCommission !== Boolean(existing.rows[0].has_driver_commission)
      || Number(nextDriverCommissionAmount || 0) !== Number(existing.rows[0].driver_commission_amount || 0)
      || String(nextDriverCommissionSourceDestinationId || '') !== String(existing.rows[0].driver_commission_source_destination_id || '')
      || String(nextDriverCommissionNote || '') !== String(existing.rows[0].driver_commission_note || '')
    );
    const actorName = form.updatedBy || 'Operational';
    const nextAssignmentSnapshot = isVendorExecution
      ? { driver: 'VENDOR', unitCode: 'VENDOR', plateNumber: 'VENDOR', vehicleDetail: null }
      : toAssignmentSnapshot(
        nextAssignmentForm,
        driverIdentityChanging ? driver : null,
        vehicleIdentityChanging ? vehicle : null,
        vehicleIdentityChanging ? {} : existingAssignment,
      );
    const commissionDriverMissing = !existing.rows[0].commission_driver_id
      && !normalizeOptionalText(existing.rows[0].commission_driver_name);
    // Ambil Titip: sopir pickup (B) hanya mendapat UJ Repo, tidak pernah menjadi penerima komisi.
    // Komisi milik sopir yang menitipkan (A): dikunci paling lambat saat dititip, dan kalau belum
    // terkunci (data lama) dikunci dari assignment titip sebelum diganti sopir pickup.
    const isRepoPickupLeg = existing.rows[0].status === 'repo_stored' || Boolean(existing.rows[0].repo_picked_up_at);
    const shouldCaptureCommissionDriver = ['running', 'completed', 'repo_stored'].includes(nextStatus)
      && (commissionValuesChanged || nextStatus !== currentJob.status)
      && commissionDriverMissing
      && !isRepoPickupLeg
      && (nextDriverId || nextAssignmentSnapshot.driver);
    const shouldCaptureStoredCommissionDriver = commissionDriverMissing
      && existing.rows[0].status === 'repo_stored'
      && nextStatus !== 'cancelled'
      && Boolean(normalizeOptionalText(existingAssignment.driver));
    let nextCommissionDriverId = isVendorExecution ? null : existing.rows[0].commission_driver_id
      || (shouldCaptureCommissionDriver ? nextDriverId : null)
      || (shouldCaptureStoredCommissionDriver ? existing.rows[0].repo_released_driver_id || existing.rows[0].driver_id || null : null);
    let nextCommissionDriverName = isVendorExecution ? null : normalizeOptionalText(
      existing.rows[0].commission_driver_name
        || (shouldCaptureCommissionDriver ? nextAssignmentSnapshot.driver : null)
        || (shouldCaptureStoredCommissionDriver ? existingAssignment.driver : null),
    );
    let nextCommissionDriverSnapshot = isVendorExecution ? {} : existing.rows[0].commission_driver_snapshot && Object.keys(existing.rows[0].commission_driver_snapshot).length
      ? existing.rows[0].commission_driver_snapshot
      : (shouldCaptureCommissionDriver
        ? buildCommissionDriverSnapshot(nextAssignmentSnapshot)
        : (shouldCaptureStoredCommissionDriver ? buildCommissionDriverSnapshot(existingAssignment) : {}));
    const completedCommissionDriverCorrection = currentJob.status === 'completed'
      && nextStatus === 'completed'
      && driverIdentityChanging
      && nextHasDriverCommission
      ? await resolveCompletedCommissionDriverCorrection(client, {
        job: existing.rows[0],
        action: form.commissionDriverAction,
        driverId: nextDriverId,
        assignment: nextAssignmentSnapshot,
        actorName,
        reason: form.adminCorrectionReason,
      })
      : null;
    if (completedCommissionDriverCorrection) {
      nextCommissionDriverId = completedCommissionDriverCorrection.driverId;
      nextCommissionDriverName = completedCommissionDriverCorrection.driverName;
      // Job Ambil Titip: truck pada assignment job adalah truck pickup (B), bukan truck pekerjaan
      // berkomisi. Plat dikosongkan supaya export komisi memakai plat asal titip yang tercatat.
      nextCommissionDriverSnapshot = existing.rows[0].repo_picked_up_at
        && String(form.commissionDriverAction || '').trim().toLowerCase() === 'move'
        ? { ...completedCommissionDriverCorrection.snapshot, plateNumber: null }
        : completedCommissionDriverCorrection.snapshot;
    }
    const completedAtForUpdate = nextStatus === 'completed'
      ? (documentOnlyUpdate
        ? resolveCompletedAtForSave({}, existing.rows[0], nextStatus)
        : validatedCompletedAt || resolveCompletedAtForSave(form, existing.rows[0], nextStatus))
      : null;
    if (nextStatus === 'completed' && !completedAtForUpdate) {
      throw validationError(
        'Pekerjaan belum dapat diselesaikan. Waktu selesai wajib tersimpan.',
        'CONTAINER_JOB_COMPLETION_MISSING_COMPLETED_AT',
        409,
      );
    }
    await ensureDriverCommissionIsNotPosted(client, id, commissionValuesChanged);
    const shouldRefreshCommissionLock = nextStatus === 'completed'
      && (commissionValuesChanged || nextStatus !== currentJob.status)
      && nextHasDriverCommission
      && nextDriverCommissionAmount > 0
      && (!existing.rows[0].commission_locked_amount || (allowAdminCorrection && commissionValuesChanged));
    const nextCommissionLockedAmount = shouldRefreshCommissionLock
      ? nextDriverCommissionAmount
      : existing.rows[0].commission_locked_amount;
    const nextCommissionLockedAt = shouldRefreshCommissionLock
      ? completedAtForUpdate || new Date().toISOString()
      : existing.rows[0].commission_locked_at;
    const nextCommissionStatus = !commissionValuesChanged && nextStatus === currentJob.status
      ? existing.rows[0].commission_status
      : resolveCommissionStatus({
      currentStatus: existing.rows[0].commission_status,
      jobStatus: nextStatus,
      hasCommission: nextHasDriverCommission,
      amount: nextStatus === 'completed' ? nextCommissionLockedAmount || nextDriverCommissionAmount : nextDriverCommissionAmount,
      driverId: nextCommissionDriverId || nextDriverId,
      driverName: nextCommissionDriverName || nextAssignmentSnapshot.driver,
      });

    await client.query(
      `
        update container_jobs
        set container_number = $1,
            execution_source = $60,
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
            commission_driver_id = $39::uuid,
            commission_driver_name = $40,
            commission_driver_snapshot = $41::jsonb,
            commission_locked_amount = $42,
            commission_locked_at = $43,
            commission_status = $44,
            destination = $45,
            inap_started_at = $46,
            inap_ended_at = $47,
            inap_reason = $48,
            inap_notes = $49,
            inap_created_by_name = $50,
            uj_amount_snapshot = $51,
            uj_source_destination_id = $52::uuid,
            uj_snapshot_at = $53,
            uj_snapshot_source = $54,
            is_backdate_entry = $55,
            backdate_reason = $56,
            created_as_correction = $57,
            updated_by_name = $58,
            updated_at = now()
        where id = $59
      `,
      [
        nextContainerNumber,
        nextDriverId,
        nextVehicleId,
        JSON.stringify(nextAssignmentSnapshot),
        nextRpujStatus,
        nextRpujNotes,
        requestRpujAt,
        actorName,
        form.spkNumber || null,
        nextEirNumber,
        nextLoadingVoucher,
        nextTravelDocument,
        nextTilaGatepassDocument,
        nextStatus,
        runningAt,
        completedAtForUpdate,
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
        nextCommissionDriverId,
        nextCommissionDriverName,
        JSON.stringify(nextCommissionDriverSnapshot),
        nextCommissionLockedAmount,
        nextCommissionLockedAt,
        nextCommissionStatus,
        nextDestination,
        nextInapStartedAt,
        nextInapEndedAt,
        nextInapReason,
        nextInapNotes,
        nextInapCreatedByName,
        nextUjAmountSnapshot,
        nextUjSourceDestinationId,
        nextUjSnapshotAt,
        nextUjSnapshotSource,
        nextIsBackdateEntry,
        nextBackdateReason,
        nextCreatedAsCorrection,
        actorName,
        id,
        nextExecutionSource,
      ],
    );

    // Riwayat assignment dicatat SEKALI per event penyimpanan yang benar-benar mengganti identitas
    // sopir/truck (driverIdentityChanging/vehicleIdentityChanging di atas), mencakup jalur normal
    // maupun mode koreksi admin, supaya "sopir A -> sopir B, kapan, oleh siapa, kenapa" selalu
    // terlacak terpisah dari dump before/after generik di activity_logs.
    if (!isVendorExecution && (driverIdentityChanging || vehicleIdentityChanging)) {
      const assignmentChangeSource = allowAdminCorrection ? 'admin_correction' : 'operational';
      const assignmentReason = allowAdminCorrection
        ? normalizeOptionalText(form.adminCorrectionReason)
        : normalizeOptionalText(form.assignmentChangeReason);
      const assignmentNote = normalizeOptionalText(form.assignmentChangeNote);
      await client.query(
        `
          insert into container_job_assignment_history (
            container_job_id, change_source,
            previous_driver_id, previous_driver_name, next_driver_id, next_driver_name,
            previous_vehicle_id, previous_plate_number, next_vehicle_id, next_plate_number,
            reason, note, changed_by_name, changed_by_role
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          id,
          assignmentChangeSource,
          existing.rows[0].driver_id,
          existingAssignment.driver || null,
          nextDriverId,
          nextAssignmentSnapshot.driver || null,
          existing.rows[0].vehicle_id,
          existingAssignment.plateNumber || null,
          nextVehicleId,
          nextAssignmentSnapshot.plateNumber || null,
          assignmentReason,
          assignmentNote,
          actorName,
          form.actorRole || null,
        ],
      );
    }

    const updateWarnings = [];
    if (documentOnlyUpdate) {
      // Document-only users (Sales) may complete missing/customer documents without changing
      // operational status, assignment, timeline, auto UJ, or resource availability.
    } else if (nextStatus === 'cancelled') {
      await voidAutoJourneyMoneyExpense(client, id, actorName, { allowAdminCorrection });
    } else if (!isVendorExecution) {
      const autoUjWarning = await syncAutoJourneyMoneyExpense(client, {
        job: existing.rows[0],
        nextStatus,
        nextEntrySource,
        nextIsBackdateEntry,
        nextDriverId,
        runningAt,
        assignment: nextAssignmentSnapshot,
        actorName,
        allowOperationalFundPending: nextStatus === 'completed',
        allowAdminCorrection,
      });
      if (autoUjWarning) updateWarnings.push(autoUjWarning);
    }

    if (!documentOnlyUpdate) {
      await syncResourceAssignmentStatus(client, existing.rows[0], {
        driverId: nextDriverId,
        vehicleId: nextVehicleId,
      }, nextStatus, nextEntrySource, nextIsBackdateEntry);
    }
    if (pickupMovement) await reconcileRepoPickupMovement(client, pickupMovement);
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
    const mapped = mapContainerJob(updated.rows[0], attachmentResult.rows);
    if (updateWarnings.length) mapped.updateWarnings = updateWarnings;
    return mapped;
  });
}

async function findLockedRepoPickupJobs(client, ids = []) {
  const result = await client.query(
    `
      select ${joinedJobColumns}
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where cj.id = any($1::uuid[])
      for update of cj
    `,
    [ids],
  );
  return result.rows;
}

function assertRepoPickupJobs(rows = [], ids = [], pickupType = 'single') {
  if (rows.length !== ids.length) {
    throw validationError('Container titip tidak ditemukan.', 'REPO_PICKUP_JOB_NOT_FOUND', 404);
  }
  rows.forEach((job) => {
    if (job.status !== 'repo_stored') {
      throw validationError('Hanya container dengan status titip yang bisa diambil.', 'REPO_PICKUP_STATUS_INVALID', 409);
    }
    if ((job.execution_source || 'internal') === 'vendor') {
      throw validationError('Ritasi vendor tidak dapat diproses sebagai pickup internal.', 'REPO_PICKUP_VENDOR_INVALID', 409);
    }
    if (!normalizeOptionalText(job.container_number)) {
      throw validationError('Nomor container wajib ada sebelum container titip diambil.', 'REPO_PICKUP_CONTAINER_REQUIRED', 400);
    }
  });
  if (pickupType === 'combo_2x20') {
    const locations = new Set(rows.map((job) => String(job.repo_location || '').trim().toLowerCase()).filter(Boolean));
    if (locations.size > 1) {
      throw validationError('Pickup combo hanya dapat dilakukan dari depo titip yang sama.', 'REPO_PICKUP_LOCATION_MISMATCH', 400);
    }
  }
}

async function ensureNoActiveRepoPickupMovement(client, ids = []) {
  const result = await client.query(
    `
      select cpi.container_job_id
      from container_pickup_items cpi
      join container_pickup_movements cpm on cpm.id = cpi.movement_id
      where cpi.container_job_id = any($1::uuid[])
        and cpm.status in ('running', 'completed')
      limit 1
    `,
    [ids],
  );
  if (result.rows[0]) {
    throw validationError('Container ini sudah tercatat dalam pickup aktif.', 'REPO_PICKUP_ALREADY_EXISTS', 409);
  }
}

async function insertRepoPickupMovement(client, {
  pickupType,
  jobs,
  driver,
  vehicle,
  assignment,
  actorName,
  runningAt,
  repoUjAmount,
}) {
  const movementResult = await client.query(
    `
      insert into container_pickup_movements (
        pickup_type, vehicle_id, driver_id, assignment_snapshot, pickup_location,
        status, started_at, created_by_name, updated_by_name, repo_uj_amount
      )
      values ($1, $2, $3, $4::jsonb, $5, 'running', $6::timestamptz, $7, $7, $8)
      returning *
    `,
    [
      pickupType,
      vehicle?.id || null,
      driver?.id || null,
      JSON.stringify(assignment || {}),
      jobs[0]?.repo_location || null,
      runningAt,
      actorName,
      repoUjAmount,
    ],
  );
  const movement = movementResult.rows[0];
  const items = [];
  for (const [index, job] of jobs.entries()) {
    const itemResult = await client.query(
      `
        insert into container_pickup_items (movement_id, container_job_id, sequence_no)
        values ($1, $2, $3)
        returning id
      `,
      [movement.id, job.id, index + 1],
    );
    items.push({ id: itemResult.rows[0].id, job });
  }
  return { movement, items };
}

async function updateRepoPickupJob(client, {
  job,
  driver,
  vehicle,
  assignment,
  actorName,
  runningAt,
  movement,
  pickupType,
}) {
  // Komisi tetap milik sopir yang menitipkan (A); sopir pickup (B) hanya mendapat UJ Repo. Data
  // lama yang penerima komisinya belum terkunci dikunci dari assignment titip sebelum ditimpa B.
  const storedAssignment = job.assignment_snapshot || {};
  const lockStoredCommissionDriver = !job.commission_driver_id
    && !normalizeOptionalText(job.commission_driver_name)
    && Boolean(normalizeOptionalText(storedAssignment.driver));
  // Combo 2x20: kedua job satu grup assignment (= movement) sehingga boleh berbagi driver/truck
  // aktif; single tetap tanpa grup (exclusion constraint ex_container_jobs_*_active).
  await client.query(
    `
      update container_jobs
      set status = 'running',
          driver_id = $2,
          vehicle_id = $3,
          assignment_snapshot = $4::jsonb,
          running_at = coalesce(running_at, $5::timestamptz),
          repo_picked_up_at = $5::timestamptz,
          repo_picked_up_by_name = $6,
          assignment_group_id = $7,
          commission_driver_id = case when $8::boolean then $9::uuid else commission_driver_id end,
          commission_driver_name = case when $8::boolean then $10 else commission_driver_name end,
          commission_driver_snapshot = case when $8::boolean then $11::jsonb else commission_driver_snapshot end,
          updated_by_name = $6,
          updated_at = now()
      where id = $1
    `,
    [
      job.id,
      driver?.id || null,
      vehicle?.id || null,
      JSON.stringify(assignment || {}),
      runningAt,
      actorName,
      pickupType === 'combo_2x20' ? movement.id : null,
      lockStoredCommissionDriver,
      lockStoredCommissionDriver ? job.repo_released_driver_id || job.driver_id || null : null,
      lockStoredCommissionDriver ? normalizeOptionalText(storedAssignment.driver) : null,
      JSON.stringify(lockStoredCommissionDriver ? buildCommissionDriverSnapshot(storedAssignment) : {}),
    ],
  );
  await client.query(
    `
      insert into container_job_assignment_history (
        container_job_id, change_source,
        previous_driver_id, previous_driver_name, next_driver_id, next_driver_name,
        previous_vehicle_id, previous_plate_number, next_vehicle_id, next_plate_number,
        reason, note, changed_by_name, changed_by_role
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, null)
    `,
    [
      job.id,
      pickupType === 'combo_2x20' ? 'repo_combo_pickup' : 'repo_pickup',
      job.repo_released_driver_id || null,
      job.assignment_snapshot?.driver || null,
      driver?.id || null,
      assignment.driver || null,
      job.repo_released_vehicle_id || null,
      job.assignment_snapshot?.plateNumber || null,
      vehicle?.id || null,
      assignment.plateNumber || null,
      'Pickup container titip',
      movement?.id ? `movement:${movement.id}` : null,
      actorName,
    ],
  );
}

async function mapUpdatedRepoPickupJobs(client, ids = []) {
  const result = await client.query(
    `
      select ${joinedJobColumns}
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where cj.id = any($1::uuid[])
      order by array_position($1::uuid[], cj.id)
    `,
    [ids],
  );
  return result.rows.map((row) => mapContainerJob(row, []));
}

async function pickupRepoContainerJobs(ids = [], payload = {}, pickupType = 'single') {
  // Physical confirmation is still mandatory; Operational supplies the actual pickup time.
  const runningAt = requirePhysicalRepoPickup(payload);
  const financialRunningAt = payload.runningAt || payload.repoPickedUpAt || runningAt;
  const uniqueIds = [...new Set(ids.map((id) => normalizeOptionalUuid(id, 'Container Job')).filter(Boolean))];
  if (pickupType === 'single' && uniqueIds.length !== 1) {
    throw validationError('Pickup single membutuhkan tepat 1 container job.', 'REPO_PICKUP_SINGLE_INVALID', 400);
  }
  if (pickupType === 'combo_2x20' && uniqueIds.length !== 2) {
    throw validationError('Pickup combo membutuhkan tepat 2 container job.', 'REPO_PICKUP_COMBO_INVALID', 400);
  }
  const actorName = normalizeOptionalText(payload.updatedBy || payload.actorName) || 'Operational';
  const repoUjAmount = normalizeRepoUjAmount(payload);

  return withTransaction(async (client) => {
    const jobs = await findLockedRepoPickupJobs(client, uniqueIds);
    const jobsById = new Map(jobs.map((job) => [String(job.id), job]));
    const orderedJobs = uniqueIds.map((id) => jobsById.get(String(id))).filter(Boolean);
    assertRepoPickupJobs(orderedJobs, uniqueIds, pickupType);
    for (const job of orderedJobs) {
      assertOperationalTimeline(
        { runningAt: job.running_at, repoStoredAt: job.repo_stored_at, repoPickedUpAt: runningAt },
        { runningAt: job.running_at, repoStoredAt: job.repo_stored_at, repoPickedUpAt: job.repo_picked_up_at },
        { forceChanged: ['repoPickedUpAt'] },
      );
    }
    await ensureNoActiveRepoPickupMovement(client, uniqueIds);

    const driver = await findDriver(client, payload);
    const vehicle = await findVehicle(client, payload);
    if (!driver) throw validationError('Sopir wajib dipilih untuk pickup container titip.', 'REPO_PICKUP_DRIVER_REQUIRED', 400);
    if (!vehicle) throw validationError('Truck wajib dipilih untuk pickup container titip.', 'REPO_PICKUP_VEHICLE_REQUIRED', 400);
    assertDriverAssignable(driver, null);
    assertVehicleAssignable(vehicle, null);
    assertVehicleCanPickupRepo(vehicle, orderedJobs, pickupType);

    const assignment = toAssignmentSnapshot(payload, driver, vehicle, {});
    const { movement, items: pickupItems } = await insertRepoPickupMovement(client, {
      pickupType,
      jobs: orderedJobs,
      driver,
      vehicle,
      assignment,
      actorName,
      runningAt,
      repoUjAmount,
    });

    for (const job of orderedJobs) {
      await updateRepoPickupJob(client, {
        job,
        driver,
        vehicle,
        assignment,
        actorName,
        runningAt,
        movement,
        pickupType,
      });
      await syncResourceAssignmentStatus(client, job, {
        driverId: driver.id,
        vehicleId: vehicle.id,
      }, 'running', 'realtime', false);
      await refreshOrderStatus(client, job.sales_order_id);
    }

    // UJ Repo manual: satu debit per movement, tidak menyentuh UJ/expense Container Job asli.
    // Satu transaksi dengan pembuatan movement -- kalau posting gagal, semuanya rollback.
    const repoUjTransaction = await postRepoUjToDroppingAccount(client, {
      movementId: movement.id,
      amount: repoUjAmount,
      batchDate: toJakartaDateKey(financialRunningAt),
      ensureBatch: ensureOperationalFundBatch,
      description: buildRepoUjDescription({
        pickupType,
        plateNumber: assignment.plateNumber,
        containerNumbers: orderedJobs.map((job) => job.container_number),
      }),
      driverName: assignment.driver,
      actorName,
    });

    // Revenue Repo per container (draft, belum masuk invoice) -- satu baris per pickup item.
    const repoRevenueLines = await createRepoRevenueLines(client, {
      movementId: movement.id,
      pickupType,
      items: pickupItems,
      actorName,
    });

    const updatedJobs = await mapUpdatedRepoPickupJobs(client, uniqueIds);
    return { movement, jobs: updatedJobs, repoUjTransaction, repoRevenueLines };
  });
}

export async function pickupSingleRepoContainerJob(id, payload = {}) {
  try {
    return await pickupRepoContainerJobs([id], payload, 'single');
  } catch (error) {
    throw toAssignmentConflictError(error);
  }
}

export async function pickupComboRepoContainerJobs(payload = {}) {
  try {
    return await pickupRepoContainerJobs(payload.containerJobIds || payload.jobIds || [], payload, 'combo_2x20');
  } catch (error) {
    throw toAssignmentConflictError(error);
  }
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
      const pickupMovement = await lockRepoPickupMovementForJob(client, id);
      const activeExpenses = await client.query(
        `
          select coalesce(count(*), 0)::int as count, coalesce(sum(amount), 0)::numeric as total
          from container_job_expenses
          where container_job_id = $1
            and payment_status <> 'batal'
        `,
        [id],
      );
      if (Number(activeExpenses.rows[0].count) > 0) {
        const error = new Error(`Container Job tidak bisa dibatalkan karena masih ada ${activeExpenses.rows[0].count} biaya aktif (total Rp ${Number(activeExpenses.rows[0].total).toLocaleString('id-ID')}) yang sudah tercatat. Batalkan atau alihkan biaya tersebut ke job lain terlebih dahulu sebelum menyetujui pembatalan.`);
        error.statusCode = 409;
        error.code = 'CONTAINER_JOB_CANCEL_HAS_ACTIVE_EXPENSE';
        throw error;
      }

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
      if (pickupMovement) await reconcileRepoPickupMovement(client, pickupMovement);
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
    await ensureInternalExecution(client, id, 'SPK internal');
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
