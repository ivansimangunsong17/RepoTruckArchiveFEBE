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
    truckPlateNumber: row.truck_plate_number || '',
    amount: toNumber(row.amount),
    sourceDestinationId: row.source_destination_id || null,
    commissionNote: row.commission_note || '',
    commissionStatus: row.commission_status || '',
    reviewReasons: Array.isArray(row.review_reasons) ? row.review_reasons.filter(Boolean) : [],
    entrySource: row.entry_source || 'realtime',
    historicalPeriod: row.historical_period || '',
    isBackdateCommission: Boolean(row.is_backdate_commission),
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
    revisionCount: toNumber(row.revision_count),
    lastRevisedAt: row.last_revised_at,
    lastRevisedByName: row.last_revised_by_name || '',
    lastRevisionReason: row.last_revision_reason || '',
    lastRevisionJobId: row.last_revision_job_id || null,
    lastRevisionPreviousDriverName: row.last_revision_previous_driver_name || '',
    lastRevisionNextDriverName: row.last_revision_next_driver_name || '',
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
    voidedAt: row.voided_at || null,
    voidedByName: row.voided_by_name || '',
    voidReason: row.void_reason || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDeductionRow(row = {}) {
  return {
    id: row.id,
    paymentId: row.payment_id,
    deductionType: row.deduction_type || 'lainnya',
    amount: toNumber(row.amount),
    reason: row.reason || '',
    operationalNote: row.operational_note || '',
    status: row.status,
    createdByUserId: row.created_by_user_id || null,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedByUserId: row.updated_by_user_id || null,
    updatedByName: row.updated_by_name || '',
    updatedAt: row.updated_at,
    voidedByUserId: row.voided_by_user_id || null,
    voidedByName: row.voided_by_name || '',
    voidedAt: row.voided_at || null,
    voidReason: row.void_reason || '',
  };
}

// Potongan komisi (hutang/kasbon/penalti/lainnya) disimpan di tabel terpisah, bukan sebagai field
// mutable di driver_commission_payments -- gross_amount TIDAK PERNAH ditulis ulang, cuma dibaca
// dari total_amount yang sudah ada. deduction_amount/net_amount dihitung live dari baris deduction
// yang berstatus 'active' setiap kali payment/report dibaca, supaya tidak ada state ganda yang bisa
// tidak sinkron -- satu-satunya sumber kebenaran untuk "berapa potongannya" adalah baris deduction
// itu sendiri.
async function findDeductionsByPaymentIds(db, paymentIds = []) {
  const ids = [...new Set((paymentIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const result = await db.query(
    'select * from driver_commission_payment_deductions where payment_id = any($1::uuid[]) order by created_at asc',
    [ids],
  );
  const byPayment = new Map();
  for (const row of result.rows) {
    const deduction = mapDeductionRow(row);
    const list = byPayment.get(deduction.paymentId) || [];
    list.push(deduction);
    byPayment.set(deduction.paymentId, list);
  }
  return byPayment;
}

function attachGrossDeductionNet(target, deductions = []) {
  const grossAmount = toNumber(target.totalAmount);
  const deductionAmount = deductions
    .filter((deduction) => deduction.status === 'active')
    .reduce((sum, deduction) => sum + deduction.amount, 0);
  return {
    ...target,
    grossAmount,
    deductionAmount,
    netAmount: Math.max(0, grossAmount - deductionAmount),
    deductions,
  };
}

export function resolveDriverCommissionPaymentSettlement({
  grossAmount,
  totalAmount,
  deductionAmount,
  currentProofAttachmentId,
  nextProofAttachmentId,
} = {}) {
  const resolvedGrossAmount = toNumber(grossAmount ?? totalAmount);
  const resolvedDeductionAmount = toNumber(deductionAmount);
  const netAmount = Math.max(0, resolvedGrossAmount - resolvedDeductionAmount);
  const hasTransferProof = Boolean(currentProofAttachmentId || nextProofAttachmentId);

  return {
    grossAmount: resolvedGrossAmount,
    deductionAmount: resolvedDeductionAmount,
    netAmount,
    hasTransferProof,
    isFullyDeducted: resolvedGrossAmount > 0 && resolvedDeductionAmount >= resolvedGrossAmount && netAmount === 0,
    requiresTransferProof: netAmount > 0 && !hasTransferProof,
  };
}

async function attachDeductionsToPayments(db, payments = []) {
  const deductionsByPayment = await findDeductionsByPaymentIds(db, payments.map((payment) => payment.id));
  return payments.map((payment) => attachGrossDeductionNet(payment, deductionsByPayment.get(payment.id) || []));
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
    isBackdateCommission: Boolean(row.is_backdate_commission),
    voidedAt: row.voided_at,
    voidedReason: row.voided_reason || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function reportDriverKey(row = {}) {
  return row.driverId || `name:${String(row.driverName || '').trim().toLowerCase()}`;
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

// row di sini sudah dalam bentuk hasil mapEligibleRow (camelCase), BUKAN raw row dari DB --
// pemanggilnya (findDriverCommissionPeriodReport) selalu mengambil eligibleRows lewat
// findEligibleRows yang sudah memetakannya. Jangan panggil mapEligibleRow lagi di sini, nanti
// field snake_case yang dicarinya (row.driver_name, dst) tidak ketemu dan hasilnya kosong semua.
function mapReportEligibleRow(row = {}) {
  return {
    ...row,
    batchId: null,
    batchStatus: null,
    paymentId: null,
    paymentStatus: 'unsubmitted',
    paidAt: null,
    paidByName: '',
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
    voidedAt: row.voided_at || null,
    voidedByName: row.voided_by_name || '',
    voidReason: row.void_reason || '',
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
      reviewItems: 0,
      noCommissionItems: 0,
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
      isBackdateCommission: Boolean(row.isBackdateCommission),
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

// Diambil hanya ritasi berkomisi yang masuk periode Minggu-Sabtu yang sedang ditutup.
// Untuk container titip, periode komisi memakai tanggal masuk penitipan (repo_stored_at),
// bukan tanggal closing akhir setelah container diambil lagi.
// Ritasi dari periode lain harus dicek lewat periodenya masing-masing agar batch mingguan rapi.
// Tidak ada syarat jumlah ritasi minimum: berapa pun jumlahnya (termasuk 1) langsung eligible
// untuk diajukan ke Finance.
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
        cj.destination,
        (coalesce(cj.repo_stored_at, cj.completed_at) at time zone 'Asia/Jakarta')::date as completed_date,
        coalesce(cj.repo_stored_at, cj.completed_at) as completed_at,
        coalesce(cj.commission_driver_id, cj.driver_id, ad.id) as driver_id,
        coalesce(nullif(cj.commission_driver_name, ''), nullif(cj.commission_driver_snapshot->>'driver', ''), nullif(cj.assignment_snapshot->>'driver', ''), nullif(d.name, ''), nullif(ad.name, '')) as driver_name,
        case
          when coalesce(nullif(cj.commission_driver_snapshot->>'driverPaymentMethod', ''), nullif(cj.assignment_snapshot->>'driverPaymentMethod', ''), nullif(d.payment_method, ''), nullif(ad.payment_method, ''), 'bank') = 'emoney' then 'emoney'
          else 'bank'
        end as payment_method,
        coalesce(nullif(cj.commission_driver_snapshot->>'driverBankName', ''), nullif(cj.assignment_snapshot->>'driverBankName', ''), nullif(d.bank_name, ''), nullif(ad.bank_name, '')) as bank_name,
        coalesce(nullif(cj.commission_driver_snapshot->>'driverBankAccountNumber', ''), nullif(cj.assignment_snapshot->>'driverBankAccountNumber', ''), nullif(d.bank_account_number, ''), nullif(ad.bank_account_number, '')) as bank_account_number,
        coalesce(nullif(cj.commission_driver_snapshot->>'driverBankAccountHolder', ''), nullif(cj.assignment_snapshot->>'driverBankAccountHolder', ''), nullif(d.bank_account_holder, ''), nullif(ad.bank_account_holder, '')) as bank_account_holder,
        coalesce(nullif(cj.commission_driver_snapshot->>'driverEmoneyProvider', ''), nullif(cj.assignment_snapshot->>'driverEmoneyProvider', ''), nullif(d.emoney_provider, ''), nullif(ad.emoney_provider, '')) as emoney_provider,
        coalesce(nullif(cj.commission_driver_snapshot->>'driverEmoneyNumber', ''), nullif(cj.assignment_snapshot->>'driverEmoneyNumber', ''), nullif(d.emoney_number, ''), nullif(ad.emoney_number, '')) as emoney_number,
        coalesce(nullif(cj.commission_driver_snapshot->>'driverEmoneyAccountHolder', ''), nullif(cj.assignment_snapshot->>'driverEmoneyAccountHolder', ''), nullif(d.emoney_account_holder, ''), nullif(ad.emoney_account_holder, '')) as emoney_account_holder,
        cj.assignment_snapshot->>'plateNumber' as truck_plate_number,
        coalesce(cj.commission_locked_amount, cj.driver_commission_amount) as amount,
        cj.driver_commission_source_destination_id as source_destination_id,
        cj.driver_commission_note as commission_note,
        cj.commission_status,
        coalesce(cj.entry_source, 'realtime') as entry_source,
        cj.historical_period,
        -- Phase 4: item ini masuk batch periode $1-$2 yang SEDANG dibuat, tapi tanggal aslinya
        -- (completed_date) jatuh di periode lain -- artinya ini "komisi susulan" yang disapu ke
        -- batch sekarang karena periode aslinya sudah keburu approved/paid (lihat kondisi OR di
        -- bawah). Ritasi susulan yang periode aslinya MASIH open tetap masuk lewat kondisi normal
        -- (between $1 and $2), jadi tidak butuh flag ini.
        case
          when (coalesce(cj.repo_stored_at, cj.completed_at) at time zone 'Asia/Jakarta')::date between $1::date and $2::date then false
          else true
        end as is_backdate_commission
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join drivers d on d.id = coalesce(cj.commission_driver_id, cj.driver_id) and d.archived_at is null
      left join lateral (
        select d2.*
        from drivers d2
        where d2.archived_at is null
          and coalesce(cj.commission_driver_id, cj.driver_id) is null
          and lower(btrim(coalesce(nullif(cj.commission_driver_name, ''), nullif(cj.commission_driver_snapshot->>'driver', ''), nullif(cj.assignment_snapshot->>'driver', '')))) in (
            lower(btrim(d2.name)),
            lower(btrim(coalesce(d2.nickname, ''))),
            lower(btrim(coalesce(d2.bank_account_holder, '')))
          )
        order by
          case
            when lower(btrim(coalesce(nullif(cj.commission_driver_name, ''), nullif(cj.commission_driver_snapshot->>'driver', ''), nullif(cj.assignment_snapshot->>'driver', '')))) = lower(btrim(d2.name)) then 1
            when lower(btrim(coalesce(nullif(cj.commission_driver_name, ''), nullif(cj.commission_driver_snapshot->>'driver', ''), nullif(cj.assignment_snapshot->>'driver', '')))) = lower(btrim(coalesce(d2.nickname, ''))) then 2
            else 3
          end,
          d2.updated_at desc nulls last
        limit 1
      ) ad on true
      left join container_pickup_items cpi on cpi.container_job_id = cj.id
      left join container_pickup_movements cpm on cpm.id = cpi.movement_id and cpm.status <> 'cancelled'
      where cj.status in ('completed', 'repo_stored')
        and coalesce(cj.execution_source, 'internal') = 'internal'
        and not (cpm.pickup_type = 'combo_2x20' and coalesce(cpi.sequence_no, 1) > 1)
        and coalesce(cj.repo_stored_at, cj.completed_at) is not null
        and coalesce(cj.has_driver_commission, false)
        and coalesce(cj.commission_locked_amount, cj.driver_commission_amount, 0) > 0
        and nullif(coalesce(cj.commission_driver_name, cj.commission_driver_snapshot->>'driver', d.name, ad.name, cj.assignment_snapshot->>'driver', ''), '') is not null
        and coalesce(cj.commission_status, 'with_commission') = 'with_commission'
        and so.status <> 'cancelled'
        and not exists (
          select 1
          from driver_commission_items dci
          where dci.container_job_id = cj.id
            and dci.voided_at is null
        )
        and (
          (coalesce(cj.repo_stored_at, cj.completed_at) at time zone 'Asia/Jakarta')::date between $1::date and $2::date
          or (
            -- Ritasi susulan/backdate (Phase 4): periode mingguan ASLI ritasi ini sudah
            -- approved/paid, jadi tidak akan pernah bisa membuka batch baru untuk periode
            -- itu sendiri (lihat DUPLICATE_COMMISSION_BATCH). Disapu ke batch $1-$2 yang
            -- sedang dibuat sekarang, bukan menggantung selamanya, dan TIDAK menyentuh
            -- batch lama yang sudah final sama sekali.
            coalesce(cj.is_backdate_entry, false)
            and exists (
              select 1
              from driver_commission_batches b2
              where b2.period_start <= (coalesce(cj.repo_stored_at, cj.completed_at) at time zone 'Asia/Jakarta')::date
                and b2.period_end >= (coalesce(cj.repo_stored_at, cj.completed_at) at time zone 'Asia/Jakarta')::date
                and b2.status in ('approved', 'paid')
            )
          )
        )
      order by completed_date asc, driver_name asc, so.so_number asc, cj.container_number asc nulls last
    `,
    [period.periodStart, period.periodEnd],
  );

  return result.rows.map(mapEligibleRow);
}

async function findCommissionReviewRows(period, db = { query }) {
  const result = await db.query(
    `
      with review_rows as (
        select
          cj.id as container_job_id,
          cj.sales_order_id,
          so.so_number,
          so.accurate_so_number,
          cj.container_number,
          cj.container_size,
          so.customer_name,
          cj.destination,
          (coalesce(cj.repo_stored_at, cj.completed_at) at time zone 'Asia/Jakarta')::date as completed_date,
          coalesce(cj.repo_stored_at, cj.completed_at) as completed_at,
          coalesce(cj.commission_driver_id, cj.driver_id, ad.id) as driver_id,
          coalesce(nullif(cj.commission_driver_name, ''), nullif(cj.commission_driver_snapshot->>'driver', ''), nullif(cj.assignment_snapshot->>'driver', ''), nullif(d.name, ''), nullif(ad.name, '')) as driver_name,
          'bank' as payment_method,
          null::text as bank_name,
          null::text as bank_account_number,
          null::text as bank_account_holder,
          null::text as emoney_provider,
          null::text as emoney_number,
          null::text as emoney_account_holder,
          cj.assignment_snapshot->>'plateNumber' as truck_plate_number,
          coalesce(cj.commission_locked_amount, cj.driver_commission_amount, 0) as amount,
          cj.driver_commission_source_destination_id as source_destination_id,
          cj.driver_commission_note as commission_note,
          coalesce(cj.commission_status, 'pending') as commission_status,
          array_remove(array[
            case when coalesce(cj.has_driver_commission, false) and coalesce(cj.commission_locked_amount, cj.driver_commission_amount, 0) <= 0 then 'Nominal komisi belum valid' end,
            case when coalesce(cj.has_driver_commission, false) and nullif(coalesce(cj.commission_driver_name, cj.commission_driver_snapshot->>'driver', d.name, ad.name, cj.assignment_snapshot->>'driver', ''), '') is null then 'Sopir penerima komisi belum terkunci' end,
            case when coalesce(cj.has_driver_commission, false) and coalesce(cj.commission_status, 'pending') <> 'with_commission' then 'Status komisi perlu dicek' end
          ], null) as review_reasons,
          coalesce(cj.entry_source, 'realtime') as entry_source,
          cj.historical_period
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        left join drivers d on d.id = coalesce(cj.commission_driver_id, cj.driver_id) and d.archived_at is null
        left join lateral (
          select d2.*
          from drivers d2
          where d2.archived_at is null
            and coalesce(cj.commission_driver_id, cj.driver_id) is null
            and lower(btrim(coalesce(nullif(cj.commission_driver_name, ''), nullif(cj.commission_driver_snapshot->>'driver', ''), nullif(cj.assignment_snapshot->>'driver', '')))) in (
              lower(btrim(d2.name)),
              lower(btrim(coalesce(d2.nickname, ''))),
              lower(btrim(coalesce(d2.bank_account_holder, '')))
            )
          order by
            case
              when lower(btrim(coalesce(nullif(cj.commission_driver_name, ''), nullif(cj.commission_driver_snapshot->>'driver', ''), nullif(cj.assignment_snapshot->>'driver', '')))) = lower(btrim(d2.name)) then 1
              when lower(btrim(coalesce(nullif(cj.commission_driver_name, ''), nullif(cj.commission_driver_snapshot->>'driver', ''), nullif(cj.assignment_snapshot->>'driver', '')))) = lower(btrim(coalesce(d2.nickname, ''))) then 2
              else 3
            end,
            d2.updated_at desc nulls last
          limit 1
        ) ad on true
        left join container_pickup_items cpi on cpi.container_job_id = cj.id
        left join container_pickup_movements cpm on cpm.id = cpi.movement_id and cpm.status <> 'cancelled'
        where cj.status in ('completed', 'repo_stored')
          and coalesce(cj.execution_source, 'internal') = 'internal'
          and not (cpm.pickup_type = 'combo_2x20' and coalesce(cpi.sequence_no, 1) > 1)
          and coalesce(cj.repo_stored_at, cj.completed_at) is not null
          and (coalesce(cj.repo_stored_at, cj.completed_at) at time zone 'Asia/Jakarta')::date between $1::date and $2::date
          and coalesce(cj.has_driver_commission, false)
          and so.status <> 'cancelled'
          and not exists (
            select 1
            from driver_commission_items dci
            where dci.container_job_id = cj.id
              and dci.voided_at is null
          )
      )
      select *
      from review_rows
      where array_length(review_reasons, 1) > 0
      order by completed_date asc, so_number asc, container_number asc nulls last
      limit 200
    `,
    [period.periodStart, period.periodEnd],
  );

  return result.rows.map(mapEligibleRow);
}

async function countNoCommissionRows(period, db = { query }) {
  const result = await db.query(
    `
      select count(*)::int as total
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join container_pickup_items cpi on cpi.container_job_id = cj.id
      left join container_pickup_movements cpm on cpm.id = cpi.movement_id and cpm.status <> 'cancelled'
      where cj.status in ('completed', 'repo_stored')
        and coalesce(cj.execution_source, 'internal') = 'internal'
        and not (cpm.pickup_type = 'combo_2x20' and coalesce(cpi.sequence_no, 1) > 1)
        and coalesce(cj.repo_stored_at, cj.completed_at) is not null
        and (coalesce(cj.repo_stored_at, cj.completed_at) at time zone 'Asia/Jakarta')::date between $1::date and $2::date
        and not coalesce(cj.has_driver_commission, false)
        and so.status <> 'cancelled'
    `,
    [period.periodStart, period.periodEnd],
  );
  return Number(result.rows[0]?.total || 0);
}

export async function hasActiveCommissionItemsForSalesOrder(salesOrderId) {
  const result = await query(
    'select exists(select 1 from driver_commission_items where sales_order_id = $1 and voided_at is null) as exists',
    [salesOrderId],
  );
  return Boolean(result.rows[0].exists);
}

export async function findEligibleDriverCommissions(period) {
  const [rows, reviewRows, noCommissionCount] = await Promise.all([
    findEligibleRows(period),
    findCommissionReviewRows(period),
    countNoCommissionRows(period),
  ]);
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    summary: summarizeEligibleRows(rows),
    rows,
    reviewRows,
    noCommissionCount,
  };
}

export async function findDriverCommissionPeriodReport(period) {
  const [eligibleRows, reviewRows, noCommissionCount, submittedResult, batchesResult] = await Promise.all([
    findEligibleRows(period),
    findCommissionReviewRows(period),
    countNoCommissionRows(period),
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
          dcp.voided_at,
          dcp.voided_by_name,
          dcp.void_reason,
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
  grouped.summary.reviewItems = reviewRows.length;
  grouped.summary.noCommissionItems = noCommissionCount;
  const deductionsByPayment = await findDeductionsByPaymentIds(
    { query },
    grouped.drivers.map((driver) => driver.paymentId),
  );
  grouped.drivers = grouped.drivers.map((driver) => (
    attachGrossDeductionNet(driver, deductionsByPayment.get(driver.paymentId) || [])
  ));
  const activeBatch = batchesResult.rows[0] ? mapBatchRow(batchesResult.rows[0]) : null;

  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status: activeBatch?.status || (rows.length ? 'draft' : 'empty'),
    activeBatch,
    reviewRows,
    noCommissionCount,
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

  const paymentsWithDeductions = await attachDeductionsToPayments(db, paymentsResult.rows.map(mapPaymentRow));
  const items = itemsResult.rows.map(mapItemRow);
  const itemsByPayment = items.reduce((result, item) => {
    const current = result.get(item.paymentId) || [];
    current.push(item);
    result.set(item.paymentId, current);
    return result;
  }, new Map());

  return {
    ...batch,
    payments: paymentsWithDeductions.map((payment) => ({
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
  if (!result.rows[0]) return null;
  const [payment] = await attachDeductionsToPayments(db, [mapPaymentRow(result.rows[0])]);
  return payment;
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

    const eligibleRows = await findEligibleRows(period, client);
    const reviewRows = await findCommissionReviewRows(period, client);
    if (reviewRows.length) {
      const error = new Error('Masih ada ritasi komisi yang perlu dicek sebelum batch diajukan.');
      error.statusCode = 409;
      error.code = 'DRIVER_COMMISSION_NEEDS_REVIEW';
      error.details = reviewRows.map((row) => ({
        containerJobId: row.containerJobId,
        soNumber: row.soNumber,
        containerNumber: row.containerNumber,
        reviewReasons: row.reviewReasons,
      }));
      throw error;
    }
    if (!eligibleRows.length) {
      const error = new Error('Tidak ada komisi sopir yang eligible untuk periode ini.');
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
            driver_id, driver_name, amount, source_destination_id, commission_note,
            is_backdate_commission
          )
          values (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid,
            $5, $6, $7, $8,
            $9, $10, $11::date, $12,
            $13::uuid, $14, $15, $16::uuid, $17,
            $18
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
          Boolean(row.isBackdateCommission),
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
        select dcp.id, dcp.batch_id, dcp.status as payment_status, dcp.total_amount,
               dcp.payment_proof_attachment_id, dcb.status as batch_status
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

    const deductionAmount = await sumActiveDeductions(client, id);
    const settlement = resolveDriverCommissionPaymentSettlement({
      totalAmount: current.total_amount,
      deductionAmount,
      currentProofAttachmentId: current.payment_proof_attachment_id,
      nextProofAttachmentId,
    });

    if (settlement.requiresTransferProof) {
      const error = new Error('Bukti transfer wajib diupload sebelum pembayaran komisi ditandai paid.');
      error.statusCode = 400;
      error.code = 'DRIVER_COMMISSION_PAYMENT_PROOF_REQUIRED';
      throw error;
    }

    const paymentNote = payload.paymentNote || payload.payment_note
      || (settlement.isFullyDeducted ? 'Lunas via potongan Finance penuh.' : null);

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
        paymentNote,
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

// Void resmi untuk pembayaran komisi sopir yang salah catat (salah sopir/nominal). Beda dari
// pembayaran invoice/Debit Note (ledger banyak baris), status pembayaran komisi cuma field
// mutable tunggal ('pending' <-> 'paid'), jadi void di sini artinya mengembalikan status ke
// 'pending' (bukan menambah baris pembalik) sambil tetap merekam voided_at/voided_by_name/
// void_reason dan melepas proof lama supaya pembayaran ulang wajib upload bukti baru. Kalau
// batch induknya sempat naik jadi 'paid' gara-gara payment ini, turunkan lagi ke 'approved'.
// Admin-only, alasan wajib.
export async function voidDriverCommissionPayment(id, payload = {}, actor = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select dcp.id, dcp.batch_id, dcp.status as payment_status, dcb.status as batch_status
        from driver_commission_payments dcp
        join driver_commission_batches dcb on dcb.id = dcp.batch_id
        where dcp.id = $1
        for update of dcp, dcb
      `,
      [id],
    );
    if (!existing.rows.length) {
      const error = new Error('Pembayaran komisi tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'DRIVER_COMMISSION_PAYMENT_NOT_FOUND';
      throw error;
    }

    const current = existing.rows[0];
    if (current.payment_status !== 'paid') {
      const error = new Error('Hanya pembayaran berstatus paid yang bisa dibatalkan.');
      error.statusCode = 400;
      error.code = 'DRIVER_COMMISSION_PAYMENT_NOT_PAID';
      throw error;
    }

    const reason = String(payload.reason || '').trim();
    if (!reason) {
      const error = new Error('Alasan pembatalan wajib diisi.');
      error.statusCode = 400;
      error.code = 'DRIVER_COMMISSION_PAYMENT_VOID_REASON_REQUIRED';
      throw error;
    }

    await client.query(
      `
        update driver_commission_payments
        set status = 'pending',
            paid_by_user_id = null,
            paid_by_name = null,
            paid_at = null,
            payment_proof_attachment_id = null,
            voided_at = now(),
            voided_by_name = $2,
            void_reason = $3,
            updated_at = now()
        where id = $1
      `,
      [id, actor.name || 'Admin', reason],
    );

    if (current.batch_status === 'paid') {
      await client.query(
        "update driver_commission_batches set status = 'approved', updated_at = now() where id = $1",
        [current.batch_id],
      );
    }

    return findDriverCommissionBatchById(current.batch_id, client);
  });
}

async function sumActiveDeductions(client, paymentId, excludeDeductionId = null) {
  const result = await client.query(
    excludeDeductionId
      ? "select coalesce(sum(amount), 0) as total from driver_commission_payment_deductions where payment_id = $1 and status = 'active' and id <> $2"
      : "select coalesce(sum(amount), 0) as total from driver_commission_payment_deductions where payment_id = $1 and status = 'active'",
    excludeDeductionId ? [paymentId, excludeDeductionId] : [paymentId],
  );
  return toNumber(result.rows[0]?.total);
}

function ensureDeductionWithinGross(nextTotal, grossAmount) {
  if (nextTotal > grossAmount) {
    const error = new Error(
      `Total potongan (Rp ${nextTotal.toLocaleString('id-ID')}) tidak boleh melebihi komisi bruto (Rp ${grossAmount.toLocaleString('id-ID')}).`,
    );
    error.statusCode = 400;
    error.code = 'DRIVER_COMMISSION_DEDUCTION_EXCEEDS_GROSS';
    throw error;
  }
}

// Potongan komisi cuma boleh ditambah/diubah/dibatalkan selama payment induknya belum 'paid' --
// begitu paid, satu-satunya jalur koreksi adalah void payment (mengembalikan status ke 'pending',
// lihat voidDriverCommissionPayment di atas) baru potongan bisa disentuh lagi. Ini sengaja
// menggunakan gate yang sama dengan payment sendiri, bukan admin-correction-mode terpisah, supaya
// alurnya konsisten dengan pola void/re-pay yang sudah ada di modul ini.
export async function createDriverCommissionDeduction(paymentId, payload = {}, actor = {}) {
  return withTransaction(async (client) => {
    const paymentResult = await client.query(
      'select id, batch_id, status, total_amount from driver_commission_payments where id = $1 for update',
      [paymentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      const error = new Error('Pembayaran komisi sopir tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'DRIVER_COMMISSION_PAYMENT_NOT_FOUND';
      throw error;
    }
    if (payment.status === 'paid') {
      const error = new Error('Potongan tidak bisa ditambahkan setelah pembayaran ini paid. Batalkan pembayaran terlebih dahulu.');
      error.statusCode = 409;
      error.code = 'DRIVER_COMMISSION_DEDUCTION_PAYMENT_LOCKED';
      throw error;
    }

    const grossAmount = toNumber(payment.total_amount);
    const existingTotal = await sumActiveDeductions(client, paymentId);
    ensureDeductionWithinGross(existingTotal + payload.amount, grossAmount);

    const inserted = await client.query(
      `
        insert into driver_commission_payment_deductions (
          payment_id, deduction_type, amount, reason, operational_note,
          status, created_by_user_id, created_by_name
        ) values ($1, $2, $3, $4, $5, 'active', $6, $7)
        returning *
      `,
      [
        paymentId,
        payload.deductionType,
        payload.amount,
        payload.reason,
        payload.operationalNote,
        actor.sub || actor.id || null,
        actor.name || 'Finance',
      ],
    );
    const deduction = mapDeductionRow(inserted.rows[0]);
    const batch = await findDriverCommissionBatchById(payment.batch_id, client);
    return { batch, deduction, previousDeduction: null };
  });
}

export async function updateDriverCommissionDeduction(deductionId, payload = {}, actor = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select dpd.*, dcp.batch_id as payment_batch_id, dcp.status as payment_status, dcp.total_amount as gross_amount
        from driver_commission_payment_deductions dpd
        join driver_commission_payments dcp on dcp.id = dpd.payment_id
        where dpd.id = $1
        for update of dpd, dcp
      `,
      [deductionId],
    );
    const current = existing.rows[0];
    if (!current) {
      const error = new Error('Potongan komisi tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'DRIVER_COMMISSION_DEDUCTION_NOT_FOUND';
      throw error;
    }
    if (current.status !== 'active') {
      const error = new Error('Potongan yang sudah dibatalkan tidak bisa diubah.');
      error.statusCode = 400;
      error.code = 'DRIVER_COMMISSION_DEDUCTION_ALREADY_VOID';
      throw error;
    }
    if (current.payment_status === 'paid') {
      const error = new Error('Potongan tidak bisa diubah setelah pembayaran ini paid. Batalkan pembayaran terlebih dahulu.');
      error.statusCode = 409;
      error.code = 'DRIVER_COMMISSION_DEDUCTION_PAYMENT_LOCKED';
      throw error;
    }

    const grossAmount = toNumber(current.gross_amount);
    const otherActiveTotal = await sumActiveDeductions(client, current.payment_id, deductionId);
    ensureDeductionWithinGross(otherActiveTotal + payload.amount, grossAmount);

    const previousDeduction = mapDeductionRow(current);
    const updated = await client.query(
      `
        update driver_commission_payment_deductions
        set deduction_type = $2,
            amount = $3,
            reason = $4,
            operational_note = $5,
            updated_by_user_id = $6,
            updated_by_name = $7,
            updated_at = now()
        where id = $1
        returning *
      `,
      [
        deductionId,
        payload.deductionType,
        payload.amount,
        payload.reason,
        payload.operationalNote,
        actor.sub || actor.id || null,
        actor.name || 'Finance',
      ],
    );
    const deduction = mapDeductionRow(updated.rows[0]);
    const batch = await findDriverCommissionBatchById(current.payment_batch_id, client);
    return { batch, deduction, previousDeduction };
  });
}

export async function voidDriverCommissionDeduction(deductionId, payload = {}, actor = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select dpd.*, dcp.batch_id as payment_batch_id, dcp.status as payment_status
        from driver_commission_payment_deductions dpd
        join driver_commission_payments dcp on dcp.id = dpd.payment_id
        where dpd.id = $1
        for update of dpd, dcp
      `,
      [deductionId],
    );
    const current = existing.rows[0];
    if (!current) {
      const error = new Error('Potongan komisi tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'DRIVER_COMMISSION_DEDUCTION_NOT_FOUND';
      throw error;
    }
    if (current.status !== 'active') {
      const error = new Error('Potongan ini sudah dibatalkan sebelumnya.');
      error.statusCode = 400;
      error.code = 'DRIVER_COMMISSION_DEDUCTION_ALREADY_VOID';
      throw error;
    }
    if (current.payment_status === 'paid') {
      const error = new Error('Potongan tidak bisa dibatalkan setelah pembayaran ini paid. Batalkan pembayaran terlebih dahulu.');
      error.statusCode = 409;
      error.code = 'DRIVER_COMMISSION_DEDUCTION_PAYMENT_LOCKED';
      throw error;
    }

    const reason = payload.reason;
    const previousDeduction = mapDeductionRow(current);
    const updated = await client.query(
      `
        update driver_commission_payment_deductions
        set status = 'void',
            voided_by_user_id = $2,
            voided_by_name = $3,
            voided_at = now(),
            void_reason = $4,
            updated_at = now()
        where id = $1
        returning *
      `,
      [deductionId, actor.sub || actor.id || null, actor.name || 'Finance', reason],
    );
    const deduction = mapDeductionRow(updated.rows[0]);
    const batch = await findDriverCommissionBatchById(current.payment_batch_id, client);
    return { batch, deduction, previousDeduction };
  });
}
