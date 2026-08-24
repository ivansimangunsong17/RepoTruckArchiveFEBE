import { query, withTransaction } from '../../db/client.js';

const ACTIVE_BATCH_STATUSES = ['draft', 'submitted', 'approved', 'paid'];

function toNumber(value) {
  return value == null ? 0 : Number(value);
}

function mapEligibleRow(row = {}) {
  return {
    containerJobId: row.container_job_id,
    salesOrderId: row.sales_order_id,
    soNumber: row.so_number || '',
    accurateSoNumber: row.accurate_so_number || '',
    containerNumber: row.container_number || '',
    containerSize: row.container_size || '',
    customerName: row.customer_name || '',
    destination: row.destination || '',
    completedDate: row.completed_date,
    completedAt: row.completed_at,
    driverId: row.driver_id || null,
    driverName: row.driver_name || '',
    paymentMethod: row.payment_method === 'emoney' ? 'emoney' : 'bank',
    bankName: row.bank_name || '',
    bankAccountNumber: row.bank_account_number || '',
    bankAccountHolder: row.bank_account_holder || '',
    emoneyProvider: row.emoney_provider || '',
    emoneyNumber: row.emoney_number || '',
    emoneyAccountHolder: row.emoney_account_holder || '',
    amount: toNumber(row.amount),
    sourceDestinationId: row.source_destination_id || null,
    commissionNote: row.commission_note || '',
    entrySource: row.entry_source || 'realtime',
    historicalPeriod: row.historical_period || '',
  };
}

function mapBatchRow(row = {}) {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    submittedByUserId: row.submitted_by_user_id || null,
    submittedByName: row.submitted_by_name || '',
    submittedAt: row.submitted_at,
    reviewedByUserId: row.reviewed_by_user_id || null,
    reviewedByName: row.reviewed_by_name || '',
    reviewedAt: row.reviewed_at,
    rejectionNote: row.rejection_note || '',
    totalItems: toNumber(row.total_items),
    totalAmount: toNumber(row.total_amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPaymentRow(row = {}) {
  return {
    id: row.id,
    batchId: row.batch_id,
    batchStatus: row.batch_status || '',
    driverId: row.driver_id || null,
    driverName: row.driver_name || '',
    paymentMethod: row.payment_method === 'emoney' ? 'emoney' : 'bank',
    bankName: row.bank_name || '',
    bankAccountNumber: row.bank_account_number || '',
    bankAccountHolder: row.bank_account_holder || '',
    emoneyProvider: row.emoney_provider || '',
    emoneyNumber: row.emoney_number || '',
    emoneyAccountHolder: row.emoney_account_holder || '',
    totalItems: toNumber(row.total_items),
    totalAmount: toNumber(row.total_amount),
    status: row.status,
    paidByUserId: row.paid_by_user_id || null,
    paidByName: row.paid_by_name || '',
    paidAt: row.paid_at,
    paymentProofAttachmentId: row.payment_proof_attachment_id || null,
    paymentNote: row.payment_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItemRow(row = {}) {
  return {
    id: row.id,
    batchId: row.batch_id,
    paymentId: row.payment_id,
    containerJobId: row.container_job_id,
    salesOrderId: row.sales_order_id || null,
    soNumber: row.so_number || '',
    accurateSoNumber: row.accurate_so_number || '',
    containerNumber: row.container_number || '',
    containerSize: row.container_size || '',
    customerName: row.customer_name || '',
    destination: row.destination || '',
    completedDate: row.completed_date,
    completedAt: row.completed_at,
    driverId: row.driver_id || null,
    driverName: row.driver_name || '',
    amount: toNumber(row.amount),
    sourceDestinationId: row.source_destination_id || null,
    commissionNote: row.commission_note || '',
    voidedAt: row.voided_at,
    voidedReason: row.voided_reason || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function reportDriverKey(row = {}) {
  return row.driverId || `name:${String(row.driverName || '').trim().toLowerCase()}`;
}

// Kuota ritasi mingguan: mendorong sopir tetap aktif jalan. Sopir yang baru pertama kali (tidak
// punya tunggakan dari minggu sebelumnya) perlu minimal 6 ritasi berkomisi minggu itu supaya
// langsung cair minggu itu juga. Kalau kurang dari 6, seluruh komisi minggu itu ditahan dan
// digabung (bukan hangus) dengan ritasi minggu-minggu berikutnya; begitu totalnya tembus 7,
// seluruh tunggakan cair sekaligus. Tidak ada batas waktu penahanan.
export const DRIVER_COMMISSION_QUOTA_FRESH_WEEK_MINIMUM = 6;
export const DRIVER_COMMISSION_QUOTA_RELEASE_THRESHOLD = 7;

// Fungsi murni (tanpa akses DB) supaya mudah diuji: menerima SEMUA ritasi berkomisi milik sopir
// yang belum pernah masuk batch mana pun (completed_date sampai dengan periodEnd, tidak dibatasi
// periodStart, karena tunggakan bisa berasal dari berminggu-minggu sebelumnya), lalu memutuskan
// per sopir mana yang lolos kuota (released, ikut diajukan periode ini) dan mana yang masih
// ditahan (withheld, informasi untuk ditampilkan ke Operational).
export function applyDriverCommissionQuota(rows = [], period) {
  const byDriver = new Map();
  for (const row of rows) {
    const key = reportDriverKey(row);
    if (!byDriver.has(key)) byDriver.set(key, []);
    byDriver.get(key).push(row);
  }

  const released = [];
  const withheld = [];

  for (const driverRows of byDriver.values()) {
    const backlog = driverRows.filter((row) => String(row.completedDate || '') < period.periodStart);
    const thisWeek = driverRows.filter((row) => (
      String(row.completedDate || '') >= period.periodStart && String(row.completedDate || '') <= period.periodEnd
    ));
    const isCarryingBacklog = backlog.length > 0;
    const total = backlog.length + thisWeek.length;
    const target = isCarryingBacklog ? DRIVER_COMMISSION_QUOTA_RELEASE_THRESHOLD : DRIVER_COMMISSION_QUOTA_FRESH_WEEK_MINIMUM;
    const passes = total >= target;

    if (passes) {
      released.push(...backlog, ...thisWeek);
    } else if (total > 0) {
      const sample = driverRows[0];
      withheld.push({
        driverKey: reportDriverKey(sample),
        driverId: sample.driverId || null,
        driverName: sample.driverName || '',
        pendingItems: total,
        pendingAmount: driverRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        target,
        remaining: Math.max(target - total, 0),
      });
    }
  }

  released.sort((left, right) => (
    String(left.completedDate || '').localeCompare(String(right.completedDate || ''))
      || String(left.driverName || '').localeCompare(String(right.driverName || ''), 'id-ID', { numeric: true })
  ));
  withheld.sort((left, right) => left.driverName.localeCompare(right.driverName, 'id-ID', { numeric: true }));

  return { released, withheld };
}

function pickBatchStatus(current, next) {
  const rank = { unsubmitted: 0, submitted: 1, approved: 2, paid: 3 };
  const currentStatus = current || 'unsubmitted';
  const nextStatus = next || 'unsubmitted';
  return (rank[nextStatus] || 0) > (rank[currentStatus] || 0) ? nextStatus : currentStatus;
}

function pickPaymentStatus(current, next) {
  const rank = { unsubmitted: 0, pending: 1, paid: 2 };
  const currentStatus = current || 'unsubmitted';
  const nextStatus = next || 'unsubmitted';
  return (rank[nextStatus] || 0) > (rank[currentStatus] || 0) ? nextStatus : currentStatus;
}

function mapReportEligibleRow(row = {}) {
  return {
    ...mapEligibleRow(row),
    batchId: null,
    batchStatus: null,
    paymentId: null,
    paymentStatus: 'unsubmitted',
    paidAt: null,
    paidByName: '',
    truckPlateNumber: row.truck_plate_number || '',
    source: 'eligible',
  };
}

function mapReportSubmittedRow(row = {}) {
  const paymentProofAttachment = row.payment_proof_attachment_id
    ? {
        id: row.payment_proof_attachment_id,
        name: row.proof_file_name || '',
        size: row.proof_file_size == null ? 0 : Number(row.proof_file_size),
        type: row.proof_mime_type || '',
        path: row.payment_proof_attachment_id,
      }
    : null;

  return {
    ...mapItemRow(row),
    paymentMethod: row.payment_method === 'emoney' ? 'emoney' : 'bank',
    bankName: row.bank_name || '',
    bankAccountNumber: row.bank_account_number || '',
    bankAccountHolder: row.bank_account_holder || '',
    emoneyProvider: row.emoney_provider || '',
    emoneyNumber: row.emoney_number || '',
    emoneyAccountHolder: row.emoney_account_holder || '',
    batchStatus: row.batch_status || '',
    paymentStatus: row.payment_status || 'pending',
    paidAt: row.paid_at,
    paidByName: row.paid_by_name || '',
    paymentProofAttachmentId: row.payment_proof_attachment_id || null,
    paymentProofAttachment,
    paymentNote: row.payment_note || '',
    truckPlateNumber: row.truck_plate_number || '',
    source: 'batch',
  };
}

function summarizeEligibleRows(rows = []) {
  const byDriver = new Map();
  let totalAmount = 0;

  for (const row of rows) {
    totalAmount += row.amount;
    const key = reportDriverKey(row);
    const current = byDriver.get(key) || {
      driverKey: key,
      driverId: row.driverId,
      driverName: row.driverName,
      paymentMethod: row.paymentMethod,
      bankName: row.bankName,
      bankAccountNumber: row.bankAccountNumber,
      bankAccountHolder: row.bankAccountHolder,
      emoneyProvider: row.emoneyProvider,
      emoneyNumber: row.emoneyNumber,
      emoneyAccountHolder: row.emoneyAccountHolder,
      totalItems: 0,
      totalAmount: 0,
    };
    current.totalItems += 1;
    current.totalAmount += row.amount;
    byDriver.set(key, current);
  }

  return {
    totalItems: rows.length,
    totalAmount,
    drivers: Array.from(byDriver.values()).sort((left, right) => left.driverName.localeCompare(right.driverName)),
  };
}

export function summarizeDriverCommissionPeriodRows(rows = []) {
  const byDriver = new Map();
  const summary = {
    totalDrivers: 0,
    totalItems: rows.length,
    totalAmount: 0,
    unsubmittedItems: 0,
    submittedItems: 0,
    approvedItems: 0,
    paidItems: 0,
    unpaidAmount: 0,
    paidAmount: 0,
  };

  for (const row of rows) {
    const amount = toNumber(row.amount);
    const key = reportDriverKey(row);
    const current = byDriver.get(key) || {
      driverKey: key,
      driverId: row.driverId || null,
      driverName: row.driverName || '',
      paymentMethod: row.paymentMethod || 'bank',
      bankName: row.bankName || '',
      bankAccountNumber: row.bankAccountNumber || '',
      bankAccountHolder: row.bankAccountHolder || '',
      emoneyProvider: row.emoneyProvider || '',
      emoneyNumber: row.emoneyNumber || '',
      emoneyAccountHolder: row.emoneyAccountHolder || '',
      batchId: row.batchId || null,
      batchStatus: row.batchStatus || (row.paymentStatus === 'unsubmitted' ? 'unsubmitted' : ''),
      paymentId: row.paymentId || null,
      paymentStatus: row.paymentStatus || 'unsubmitted',
      paymentProofAttachmentId: row.paymentProofAttachmentId || null,
      paymentProofAttachment: row.paymentProofAttachment || null,
      paymentNote: row.paymentNote || '',
      paidAt: row.paidAt || null,
      paidByName: row.paidByName || '',
      totalItems: 0,
      totalAmount: 0,
      paidItems: 0,
      paidAmount: 0,
      unpaidItems: 0,
      unpaidAmount: 0,
      statuses: {
        unsubmitted: 0,
        submitted: 0,
        approved: 0,
        paid: 0,
      },
      items: [],
    };

    const normalizedBatchStatus = row.batchStatus || (row.paymentStatus === 'unsubmitted' ? 'unsubmitted' : 'submitted');
    const isPaid = row.paymentStatus === 'paid' || normalizedBatchStatus === 'paid';
    const statusKey = isPaid
      ? 'paid'
      : normalizedBatchStatus === 'approved'
        ? 'approved'
        : normalizedBatchStatus === 'submitted'
          ? 'submitted'
          : 'unsubmitted';

    current.batchId = current.batchId || row.batchId || null;
    current.batchStatus = pickBatchStatus(current.batchStatus, normalizedBatchStatus);
    current.paymentId = current.paymentId || row.paymentId || null;
    current.paymentStatus = pickPaymentStatus(current.paymentStatus, row.paymentStatus);
    current.paymentProofAttachmentId = current.paymentProofAttachmentId || row.paymentProofAttachmentId || null;
    current.paymentProofAttachment = current.paymentProofAttachment || row.paymentProofAttachment || null;
    current.paymentNote = current.paymentNote || row.paymentNote || '';
    current.paidAt = current.paidAt || row.paidAt || null;
    current.paidByName = current.paidByName || row.paidByName || '';

    current.totalItems += 1;
    current.totalAmount += amount;
    current.statuses[statusKey] += 1;
    if (isPaid) {
      current.paidItems += 1;
      current.paidAmount += amount;
      summary.paidItems += 1;
      summary.paidAmount += amount;
    } else {
      current.unpaidItems += 1;
      current.unpaidAmount += amount;
      summary.unpaidAmount += amount;
    }
    summary.totalAmount += amount;
    if (statusKey === 'unsubmitted') summary.unsubmittedItems += 1;
    if (statusKey === 'submitted') summary.submittedItems += 1;
    if (statusKey === 'approved') summary.approvedItems += 1;

    current.items.push({
      id: row.id || null,
      containerJobId: row.containerJobId,
      salesOrderId: row.salesOrderId,
      soNumber: row.soNumber,
      accurateSoNumber: row.accurateSoNumber,
      containerNumber: row.containerNumber,
      containerSize: row.containerSize,
      customerName: row.customerName,
      destination: row.destination,
      truckPlateNumber: row.truckPlateNumber,
      completedDate: row.completedDate,
      completedAt: row.completedAt,
      amount,
      commissionNote: row.commissionNote,
      batchId: row.batchId || null,
      batchStatus: row.batchStatus || null,
      paymentId: row.paymentId || null,
      paymentStatus: row.paymentStatus,
      paidAt: row.paidAt,
      paidByName: row.paidByName,
      paymentProofAttachmentId: row.paymentProofAttachmentId || null,
      paymentNote: row.paymentNote || '',
      source: row.source,
    });
    byDriver.set(key, current);
  }

  const drivers = Array.from(byDriver.values())
    .map((driver) => ({
      ...driver,
      items: driver.items.sort((left, right) => (
        String(left.completedDate || '').localeCompare(String(right.completedDate || ''))
          || String(left.soNumber || '').localeCompare(String(right.soNumber || ''), 'id-ID', { numeric: true })
          || String(left.containerNumber || '').localeCompare(String(right.containerNumber || ''), 'id-ID', { numeric: true })
      )),
    }))
    .sort((left, right) => left.driverName.localeCompare(right.driverName, 'id-ID', { numeric: true }));

  summary.totalDrivers = drivers.length;

  return { summary, drivers };
}

// Diambil semua ritasi berkomisi yang belum pernah masuk batch mana pun dengan completed_date
// SAMPAI DENGAN periodEnd (tanpa batas bawah periodStart) — supaya tunggakan kuota dari
// minggu-minggu sebelumnya ikut terbawa dan bisa dievaluasi bersama oleh applyDriverCommissionQuota.
async function findEligibleRows(period, db = { query }) {
  const result = await db.query(
    `
      select
        cj.id as container_job_id,
        cj.sales_order_id,
        so.so_number,
        so.accurate_so_number,
        cj.container_number,
        cj.container_size,
        so.customer_name,
        so.destination,
        (cj.completed_at at time zone 'Asia/Jakarta')::date as completed_date,
        cj.completed_at,
        cj.driver_id,
        coalesce(nullif(d.name, ''), nullif(cj.assignment_snapshot->>'driver', '')) as driver_name,
        case
          when coalesce(nullif(d.payment_method, ''), nullif(cj.assignment_snapshot->>'driverPaymentMethod', ''), 'bank') = 'emoney' then 'emoney'
          else 'bank'
        end as payment_method,
        coalesce(nullif(d.bank_name, ''), nullif(cj.assignment_snapshot->>'driverBankName', '')) as bank_name,
        coalesce(nullif(d.bank_account_number, ''), nullif(cj.assignment_snapshot->>'driverBankAccountNumber', '')) as bank_account_number,
        coalesce(nullif(d.bank_account_holder, ''), nullif(cj.assignment_snapshot->>'driverBankAccountHolder', '')) as bank_account_holder,
        coalesce(nullif(d.emoney_provider, ''), nullif(cj.assignment_snapshot->>'driverEmoneyProvider', '')) as emoney_provider,
        coalesce(nullif(d.emoney_number, ''), nullif(cj.assignment_snapshot->>'driverEmoneyNumber', '')) as emoney_number,
        coalesce(nullif(d.emoney_account_holder, ''), nullif(cj.assignment_snapshot->>'driverEmoneyAccountHolder', '')) as emoney_account_holder,
        cj.assignment_snapshot->>'plateNumber' as truck_plate_number,
        cj.driver_commission_amount as amount,
        cj.driver_commission_source_destination_id as source_destination_id,
        cj.driver_commission_note as commission_note,
        coalesce(cj.entry_source, 'realtime') as entry_source,
        cj.historical_period
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join drivers d on d.id = cj.driver_id and d.archived_at is null
      where cj.status = 'completed'
        and cj.completed_at is not null
        and (cj.completed_at at time zone 'Asia/Jakarta')::date <= $1::date
        and coalesce(cj.has_driver_commission, false)
        and coalesce(cj.driver_commission_amount, 0) > 0
        and nullif(coalesce(d.name, cj.assignment_snapshot->>'driver', ''), '') is not null
        and so.status <> 'cancelled'
        and not exists (
          select 1
          from driver_commission_items dci
          where dci.container_job_id = cj.id
            and dci.voided_at is null
        )
      order by completed_date asc, driver_name asc, so.so_number asc, cj.container_number asc nulls last
    `,
    [period.periodEnd],
  );

  return result.rows.map(mapEligibleRow);
}

async function findEligibleRowsWithQuota(period, db = { query }) {
  const rows = await findEligibleRows(period, db);
  return applyDriverCommissionQuota(rows, period);
}

export async function findEligibleDriverCommissions(period) {
  const { released, withheld } = await findEligibleRowsWithQuota(period);
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    summary: summarizeEligibleRows(released),
    rows: released,
    withheld,
  };
}

export async function findDriverCommissionPeriodReport(period) {
  const [{ released: eligibleRows, withheld }, submittedResult, batchesResult] = await Promise.all([
    findEligibleRowsWithQuota(period),
    query(
      `
        select
          dci.*,
          dcb.status as batch_status,
          dcp.status as payment_status,
          dcp.payment_method,
          dcp.bank_name,
          dcp.bank_account_number,
          dcp.bank_account_holder,
          dcp.emoney_provider,
          dcp.emoney_number,
          dcp.emoney_account_holder,
          dcp.paid_at,
          dcp.paid_by_name,
          dcp.payment_proof_attachment_id,
          proof.file_name as proof_file_name,
          proof.mime_type as proof_mime_type,
          proof.file_size as proof_file_size,
          dcp.payment_note,
          cj.assignment_snapshot->>'plateNumber' as truck_plate_number
        from driver_commission_items dci
        join driver_commission_batches dcb on dcb.id = dci.batch_id
        join driver_commission_payments dcp on dcp.id = dci.payment_id
        left join container_jobs cj on cj.id = dci.container_job_id
        left join attachments proof on proof.id = dcp.payment_proof_attachment_id
        where dci.voided_at is null
          and dci.completed_date between $1::date and $2::date
          and dcb.status in ('submitted', 'approved', 'paid')
        order by dci.completed_date asc, dci.driver_name asc, dci.so_number asc, dci.container_number asc nulls last
      `,
      [period.periodStart, period.periodEnd],
    ),
    query(
      `
        select *
        from driver_commission_batches
        where period_start = $1::date
          and period_end = $2::date
          and status in ('submitted', 'approved', 'paid')
        order by created_at desc
      `,
      [period.periodStart, period.periodEnd],
    ),
  ]);

  const rows = [
    ...eligibleRows.map(mapReportEligibleRow),
    ...submittedResult.rows.map(mapReportSubmittedRow),
  ];
  const grouped = summarizeDriverCommissionPeriodRows(rows);
  const activeBatch = batchesResult.rows[0] ? mapBatchRow(batchesResult.rows[0]) : null;

  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status: activeBatch?.status || (rows.length ? 'draft' : 'empty'),
    activeBatch,
    withheld,
    ...grouped,
  };
}

export async function findDriverCommissionBatches(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  const params = [];
  const clauses = [];

  if (options.status) {
    params.push(String(options.status).trim());
    clauses.push(`status = $${params.length}`);
  }
  if (options.periodStart) {
    params.push(options.periodStart);
    clauses.push(`period_end >= $${params.length}::date`);
  }
  if (options.periodEnd) {
    params.push(options.periodEnd);
    clauses.push(`period_start <= $${params.length}::date`);
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const totalResult = await query(`select count(*)::int as total from driver_commission_batches ${whereSql}`, params);

  params.push(pageSize, (page - 1) * pageSize);
  const result = await query(
    `
      select *
      from driver_commission_batches
      ${whereSql}
      order by period_start desc, created_at desc
      limit $${params.length - 1}
      offset $${params.length}
    `,
    params,
  );

  return {
    rows: result.rows.map(mapBatchRow),
    pagination: {
      page,
      pageSize,
      total: Number(totalResult.rows[0]?.total || 0),
    },
  };
}

export async function findDriverCommissionBatchById(id, db = { query }) {
  const batchResult = await db.query('select * from driver_commission_batches where id = $1', [id]);
  const batch = mapBatchRow(batchResult.rows[0]);
  if (!batch.id) return null;

  const paymentsResult = await db.query('select * from driver_commission_payments where batch_id = $1 order by driver_name asc', [id]);
  const itemsResult = await db.query(
    'select * from driver_commission_items where batch_id = $1 order by completed_date asc, driver_name asc, so_number asc, container_number asc nulls last',
    [id],
  );

  const payments = paymentsResult.rows.map(mapPaymentRow);
  const items = itemsResult.rows.map(mapItemRow);
  const itemsByPayment = items.reduce((result, item) => {
    const current = result.get(item.paymentId) || [];
    current.push(item);
    result.set(item.paymentId, current);
    return result;
  }, new Map());

  return {
    ...batch,
    payments: payments.map((payment) => ({
      ...payment,
      items: itemsByPayment.get(payment.id) || [],
    })),
    items,
  };
}

export async function findDriverCommissionPaymentById(id, db = { query }) {
  const result = await db.query(
    `
      select dcp.*, dcb.status as batch_status
      from driver_commission_payments dcp
      join driver_commission_batches dcb on dcb.id = dcp.batch_id
      where dcp.id = $1
    `,
    [id],
  );
  return result.rows[0] ? mapPaymentRow(result.rows[0]) : null;
}

export async function createDriverCommissionBatch(period, actor = {}) {
  return withTransaction(async (client) => {
    const activeBatch = await client.query(
      `
        select id, status
        from driver_commission_batches
        where period_start = $1::date
          and period_end = $2::date
          and status = any($3::text[])
        for update
      `,
      [period.periodStart, period.periodEnd, ACTIVE_BATCH_STATUSES],
    );

    if (activeBatch.rows.length) {
      const error = new Error('Periode komisi ini sudah memiliki batch aktif.');
      error.statusCode = 409;
      error.code = 'DUPLICATE_COMMISSION_BATCH';
      error.details = activeBatch.rows.map((row) => ({ id: row.id, status: row.status }));
      throw error;
    }

    const { released: eligibleRows } = await findEligibleRowsWithQuota(period, client);
    if (!eligibleRows.length) {
      const error = new Error('Tidak ada komisi sopir yang eligible untuk periode ini (kemungkinan semua sopir masih di bawah kuota ritasi mingguan).');
      error.statusCode = 400;
      error.code = 'NO_ELIGIBLE_DRIVER_COMMISSION';
      throw error;
    }

    const summary = summarizeEligibleRows(eligibleRows);
    const batchResult = await client.query(
      `
        insert into driver_commission_batches (
          period_start, period_end, status,
          submitted_by_user_id, submitted_by_name, submitted_at,
          total_items, total_amount
        )
        values ($1::date, $2::date, 'submitted', $3::uuid, $4, now(), $5, $6)
        returning *
      `,
      [
        period.periodStart,
        period.periodEnd,
        actor.sub || actor.id || null,
        actor.name || 'System',
        summary.totalItems,
        summary.totalAmount,
      ],
    );
    const batch = mapBatchRow(batchResult.rows[0]);

    const paymentsByDriverKey = new Map();
    for (const driver of summary.drivers) {
      const paymentResult = await client.query(
        `
          insert into driver_commission_payments (
            batch_id, driver_id, driver_name,
            payment_method, bank_name, bank_account_number, bank_account_holder,
            emoney_provider, emoney_number, emoney_account_holder,
            total_items, total_amount
          )
          values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          returning *
        `,
        [
          batch.id,
          driver.driverId,
          driver.driverName,
          driver.paymentMethod,
          driver.bankName || null,
          driver.bankAccountNumber || null,
          driver.bankAccountHolder || null,
          driver.emoneyProvider || null,
          driver.emoneyNumber || null,
          driver.emoneyAccountHolder || null,
          driver.totalItems,
          driver.totalAmount,
        ],
      );
      const payment = mapPaymentRow(paymentResult.rows[0]);
      paymentsByDriverKey.set(driver.driverId || `name:${driver.driverName.toLowerCase()}`, payment.id);
    }

    for (const row of eligibleRows) {
      const driverKey = row.driverId || `name:${row.driverName.toLowerCase()}`;
      await client.query(
        `
          insert into driver_commission_items (
            batch_id, payment_id, container_job_id, sales_order_id,
            so_number, accurate_so_number, container_number, container_size,
            customer_name, destination, completed_date, completed_at,
            driver_id, driver_name, amount, source_destination_id, commission_note
          )
          values (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid,
            $5, $6, $7, $8,
            $9, $10, $11::date, $12,
            $13::uuid, $14, $15, $16::uuid, $17
          )
        `,
        [
          batch.id,
          paymentsByDriverKey.get(driverKey),
          row.containerJobId,
          row.salesOrderId,
          row.soNumber,
          row.accurateSoNumber || null,
          row.containerNumber || null,
          row.containerSize || null,
          row.customerName || null,
          row.destination || null,
          row.completedDate,
          row.completedAt,
          row.driverId,
          row.driverName,
          row.amount,
          row.sourceDestinationId,
          row.commissionNote || null,
        ],
      );
    }

    return findDriverCommissionBatchById(batch.id, client);
  });
}

export async function approveDriverCommissionBatch(id, actor = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      "select id, status from driver_commission_batches where id = $1 for update",
      [id],
    );
    if (!existing.rows.length) return null;
    if (existing.rows[0].status !== 'submitted') {
      const error = new Error('Batch komisi hanya bisa di-approve saat status submitted.');
      error.statusCode = 400;
      error.code = 'INVALID_COMMISSION_BATCH_STATUS';
      throw error;
    }

    await client.query(
      `
        update driver_commission_batches
        set status = 'approved',
            reviewed_by_user_id = $2::uuid,
            reviewed_by_name = $3,
            reviewed_at = now(),
            updated_at = now()
        where id = $1
      `,
      [id, actor.sub || actor.id || null, actor.name || 'System'],
    );

    return findDriverCommissionBatchById(id, client);
  });
}

export async function rejectDriverCommissionBatch(id, rejectionNote = '', actor = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      "select id, status from driver_commission_batches where id = $1 for update",
      [id],
    );
    if (!existing.rows.length) return null;
    if (!['submitted', 'approved'].includes(existing.rows[0].status)) {
      const error = new Error('Batch komisi hanya bisa ditolak saat status submitted atau approved.');
      error.statusCode = 400;
      error.code = 'INVALID_COMMISSION_BATCH_STATUS';
      throw error;
    }

    await client.query(
      `
        update driver_commission_items
        set voided_at = coalesce(voided_at, now()),
            voided_reason = coalesce(nullif(voided_reason, ''), $2),
            updated_at = now()
        where batch_id = $1
          and voided_at is null
      `,
      [id, rejectionNote || 'Batch komisi ditolak Finance'],
    );

    await client.query(
      `
        update driver_commission_batches
        set status = 'rejected',
            reviewed_by_user_id = $2::uuid,
            reviewed_by_name = $3,
            reviewed_at = now(),
            rejection_note = $4,
            updated_at = now()
        where id = $1
      `,
      [id, actor.sub || actor.id || null, actor.name || 'System', rejectionNote || null],
    );

    return findDriverCommissionBatchById(id, client);
  });
}

export async function markDriverCommissionPaymentPaid(id, payload = {}, actor = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select dcp.id, dcp.batch_id, dcp.status as payment_status, dcp.payment_proof_attachment_id, dcb.status as batch_status
        from driver_commission_payments dcp
        join driver_commission_batches dcb on dcb.id = dcp.batch_id
        where dcp.id = $1
        for update of dcp, dcb
      `,
      [id],
    );
    if (!existing.rows.length) return null;

    const current = existing.rows[0];
    if (!['approved', 'paid'].includes(current.batch_status)) {
      const error = new Error('Pembayaran komisi hanya bisa dicatat setelah batch approved.');
      error.statusCode = 400;
      error.code = 'INVALID_COMMISSION_BATCH_STATUS';
      throw error;
    }
    const nextProofAttachmentId = payload.paymentProofAttachmentId || payload.payment_proof_attachment_id || null;
    if (current.payment_status === 'paid' && !nextProofAttachmentId) {
      const error = new Error('Pembayaran sopir ini sudah dicatat paid.');
      error.statusCode = 400;
      error.code = 'INVALID_COMMISSION_PAYMENT_STATUS';
      throw error;
    }

    if (current.payment_status === 'paid' && nextProofAttachmentId) {
      await client.query(
        `
          update driver_commission_payments
          set payment_proof_attachment_id = $2::uuid,
              payment_note = coalesce($3, payment_note),
              updated_at = now()
          where id = $1
        `,
        [id, nextProofAttachmentId, payload.paymentNote || payload.payment_note || null],
      );

      return findDriverCommissionBatchById(current.batch_id, client);
    }

    if (!nextProofAttachmentId && !current.payment_proof_attachment_id) {
      const error = new Error('Bukti transfer wajib diupload sebelum pembayaran komisi ditandai paid.');
      error.statusCode = 400;
      error.code = 'DRIVER_COMMISSION_PAYMENT_PROOF_REQUIRED';
      throw error;
    }

    await client.query(
      `
        update driver_commission_payments
        set status = 'paid',
            paid_by_user_id = $2::uuid,
            paid_by_name = $3,
            paid_at = coalesce($4::timestamptz, now()),
            payment_note = $5,
            payment_proof_attachment_id = coalesce($6::uuid, payment_proof_attachment_id),
            updated_at = now()
        where id = $1
      `,
      [
        id,
        actor.sub || actor.id || null,
        actor.name || 'System',
        payload.paidAt || payload.paid_at || null,
        payload.paymentNote || payload.payment_note || null,
        nextProofAttachmentId,
      ],
    );

    const remaining = await client.query(
      "select count(*)::int as total from driver_commission_payments where batch_id = $1 and status <> 'paid'",
      [current.batch_id],
    );
    if (Number(remaining.rows[0]?.total || 0) === 0) {
      await client.query(
        "update driver_commission_batches set status = 'paid', updated_at = now() where id = $1",
        [current.batch_id],
      );
    }

    return findDriverCommissionBatchById(current.batch_id, client);
  });
}
