import { query, withTransaction } from '../../db/client.js';
import {
  financeCorrectionStatuses,
  getFinanceCorrectionField,
  isFinanceCorrectionAdminApprovalRequired,
  mapFinanceCorrectionRequest,
  normalizeFinanceCorrectionType,
  validateFinanceCorrectionInput,
} from './finance-corrections.js';

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatContainerSummary(row) {
  const qty20 = Number(row.qty_20ft || 0);
  const qty40 = Number(row.qty_40ft || 0);
  const parts = [];
  if (qty20) parts.push(`${qty20} x 20FT`);
  if (qty40) parts.push(`${qty40} x 40FT`);
  if (parts.length) return parts.join(', ');
  if (row.container_summary) return row.container_summary;
  const lineItems = parseJsonArray(row.line_items)
    .filter((item) => ['Jasa Angkut D20', 'Jasa Angkut D40'].includes(item.serviceName));
  if (lineItems.length) {
    return lineItems.map((item) => `${Number(item.qty || 0)} x ${item.serviceName === 'Jasa Angkut D40' ? '40FT' : '20FT'}`).join(', ');
  }
  return row.quantity ? `${Number(row.quantity)} ritase` : '-';
}

function normalizeVerificationStatus(row) {
  return row.finance_verification_status === 'verified' && row.accurate_so_number ? 'verified' : 'pending_so';
}

function isGeneratedInternalSoNumber(value) {
  return /^SO-ARM-\d{6}-\d{4}$/i.test(String(value || '').trim());
}

function getDisplayOrderNumber(row = {}) {
  const rawNumber = String(row.order_number || row.internal_order_number || row.internal_so_number || row.so_number || '').trim();
  if (rawNumber && !isGeneratedInternalSoNumber(rawNumber)) return rawNumber;
  const id = String(row.sales_order_id || row.id || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return id ? `ORD-${id.slice(0, 8)}` : '';
}

function getDisplayFinanceSoNumber(row = {}) {
  const accurateSoNumber = String(row.accurate_so_number || '').trim();
  if (accurateSoNumber) return accurateSoNumber;
  const legacySoNumber = String(row.so_number || '').trim();
  return isGeneratedInternalSoNumber(legacySoNumber) ? '' : legacySoNumber;
}

function orderNumberSearchSql(alias = 'so') {
  return orderNumberSearchFromColumnSql(`${alias}.id`);
}

function orderNumberSearchFromColumnSql(column = 'id') {
  return `concat('ORD-', upper(left(regexp_replace(${column}::text, '[^a-zA-Z0-9]', '', 'g'), 8)))`;
}

// UJ dibaca dari snapshot dulu (dibekukan container-jobs.repository.js syncAutoJourneyMoneyExpense
// saat job pertama kali jalan) -- master destination_locations cuma fallback untuk job LAMA yang
// belum pernah punya snapshot (dibuat sebelum kolom ini ada), supaya UJ job yang sudah lama selesai
// tidak diam-diam berubah kalau rate UJ destinasi diedit belakangan.
function ujAmountExpression(cjAlias = 'cj', dlAlias = 'dl') {
  return `
    coalesce(
      nullif(${cjAlias}.uj_amount_snapshot, 0),
      case
        when upper(replace(${cjAlias}.container_size, ' ', '')) = '40FT' then nullif(${dlAlias}.uj_40ft, 0)
        else nullif(${dlAlias}.uj_20ft, 0)
      end
    )
  `;
}

function ujSourceExpression(cjAlias = 'cj') {
  return `case when nullif(${cjAlias}.uj_amount_snapshot, 0) is not null then 'snapshot' else 'master_current' end`;
}

function ujNeedsReviewExpression(cjAlias = 'cj') {
  return `(nullif(${cjAlias}.uj_amount_snapshot, 0) is null)`;
}

function paymentTermsExpression(alias = 'so') {
  return `
    case
      when lower(coalesce(${alias}.payment_type, 'cash')) = 'tempo'
      then concat('Tempo ', greatest(coalesce(${alias}.payment_term_days, 0), 1), ' hari')
      else 'Cash'
    end
  `;
}

async function applyFinanceCorrectionValue(client, orderId, correctionType, requestedValue, actorName) {
  const field = getFinanceCorrectionField(correctionType);
  if (field === 'invoice_number') {
    await client.query(
      `
        update sales_orders
        set invoice_number = $1,
            billing_status = case
              when coalesce(billing_status, 'belum_invoice') in ('belum_invoice', 'pending_invoice') then 'belum_dikirim'
              else billing_status
            end,
            invoice_issued_at = coalesce(invoice_issued_at, now()),
            invoice_input_by_name = coalesce(invoice_input_by_name, $2),
            updated_by_name = $2,
            updated_at = now()
        where id = $3
      `,
      [requestedValue, actorName || 'Finance', orderId],
    );
    return;
  }

  await client.query(
    `
      update sales_orders
      set accurate_so_number = $1,
          finance_verification_status = 'verified',
          finance_verified_by_name = coalesce(finance_verified_by_name, $2),
          finance_verified_at = coalesce(finance_verified_at, now()),
          updated_by_name = $2,
          updated_at = now()
      where id = $3
    `,
    [requestedValue, actorName || 'Finance', orderId],
  );
}

export function mapOrderVerificationRow(row) {
  const verificationStatus = normalizeVerificationStatus(row);
  const isCancelled = row.status === 'cancelled';
  const cancelReason = row.cancel_review_note || row.cancel_request_note || row.cancel_reason || '';
  const referenceDocuments = parseJsonArray(row.reference_documents);
  const lineItems = parseJsonArray(row.line_items);

  return {
    id: row.id,
    orderDate: row.so_date,
    salesName: row.sales_name || row.created_by_name || 'Sales',
    customer: row.customer_name,
    customerPic: row.customer_pic,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    destination: row.destination,
    origin: row.origin,
    orderType: row.shipment_type,
    paymentTerms: row.payment_terms || '-',
    price: row.price == null ? 0 : Number(row.price),
    totalAmount: row.total_amount == null ? 0 : Number(row.total_amount),
    lineItems: lineItems.map((item) => ({
      serviceName: item.serviceName || item.service_name || item.name || '-',
      containerType: item.containerType || item.container_type || '',
      qty: Number(item.qty || item.quantity || 0),
      price: Number(item.price || 0),
      total: Number(item.total || Number(item.qty || item.quantity || 0) * Number(item.price || 0)),
    })),
    runningDate: row.trip_date,
    container: formatContainerSummary(row),
    // Jumlah container job aktif (bukan cancelled) per ukuran, dipisah dari qty order di lineItems
    // supaya Finance bisa membandingkan keduanya. null = query sumber tidak menghitungnya.
    activeContainer20Qty: row.qty_20ft == null ? null : Number(row.qty_20ft),
    activeContainer40Qty: row.qty_40ft == null ? null : Number(row.qty_40ft),
    vesselName: row.vessel_name,
    terminal: row.terminal,
    depo: row.origin,
    document: referenceDocuments[0]?.file?.name || referenceDocuments[0]?.referenceNumber || '-',
    notes: row.notes || row.job_description || '',
    status: isCancelled ? 'SO Batal' : verificationStatus === 'verified' ? 'No. SO Terisi' : 'Menunggu No. SO Finance',
    verificationStatus: isCancelled ? 'cancelled' : verificationStatus,
    soNumber: getDisplayFinanceSoNumber(row),
    internalSoNumber: getDisplayOrderNumber(row),
    accurateSoNumber: row.accurate_so_number || '',
    cancelReason,
    cancelRequestStatus: row.cancel_request_status || 'none',
    cancelRequestNote: row.cancel_request_note || '',
    cancelRequestedByName: row.cancel_requested_by_name || '',
    cancelRequestedByRole: row.cancel_requested_by_role || '',
    cancelRequestedAt: row.cancel_requested_at,
    cancelReviewedByName: row.cancel_reviewed_by_name || '',
    cancelReviewedAt: row.cancel_reviewed_at,
    cancelReviewNote: row.cancel_review_note || '',
    cancelledAt: row.cancelled_at,
    cancelledByName: row.cancel_reviewed_by_name || row.cancel_requested_by_name || row.cancelled_by_name || '',
    financeVerifiedBy: row.finance_verified_by_name || '',
    financeVerifiedAt: row.finance_verified_at,
    operationalStatus: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeInvoiceStatusExpression(column = 'billing_status') {
  return `
    case
      when ${column} in ('draft') then 'DRAFT'
      when ${column} in ('belum_dikirim', 'invoice_issued') then 'SUDAH_DIBUAT'
      when ${column} in ('belum_diterima', 'belum_dikonfirmasi', 'menunggu_pembayaran', 'revisi_dispute', 'waiting_payment') then 'SUDAH_DIKIRIM'
      when ${column} in ('lunas', 'paid') then 'LUNAS'
      else 'BELUM_DIBUAT'
    end
  `;
}

export function financeRowsCte() {
  const invoiceStatusSql = normalizeInvoiceStatusExpression('so.billing_status');

  return `
    with attachment_flags as (
      select entity_id,
             bool_or(category = 'spkDocument') as has_spk_file,
             bool_or(category = 'loadingVoucherDocument') as has_loading_file,
             bool_or(category in ('tilaGatepassDocumentFile', 'unloadingVoucherDocument', 'weighingDocumentFile', 'deliveryCard', 'gatepass')) as has_tila_gatepass_file,
             bool_or(category in ('travelDocumentFile', 'travelDocument', 'suratJalan', 'suratJalanDocument')) as has_travel_file
      from attachments
      where entity_type = 'container_job'
      group by entity_id
    ),
    job_counts as (
      select sales_order_id, count(*)::numeric as total_jobs
      from container_jobs
      where status <> 'cancelled'
      group by sales_order_id
    ),
    ranked_jobs as (
      select
        cj.*,
        case
          when upper(replace(cj.container_size, ' ', '')) = '40FT' then '40FT'
          else '20FT'
        end as finance_size_key,
        row_number() over (
          partition by cj.sales_order_id,
          case
            when upper(replace(cj.container_size, ' ', '')) = '40FT' then '40FT'
            else '20FT'
          end
          order by cj.created_at asc, cj.id asc
        ) as finance_size_sequence
      from container_jobs cj
      where cj.status <> 'cancelled'
    ),
    order_financials as (
      select
        so.id as sales_order_id,
        count(item.value)::int as line_item_count,
        max(case
          when lower(btrim(coalesce(item.value->>'serviceName', item.value->>'service_name', ''))) = lower('Jasa Angkut D20')
          then coalesce(
            nullif(nullif(item.value->>'price', '')::numeric, 0),
            nullif(nullif(item.value->>'total', '')::numeric, 0) / greatest(coalesce(nullif(nullif(item.value->>'qty', '')::numeric, 0), 1), 1)
          )
          else null
        end) as transport_20ft_unit,
        max(case
          when lower(btrim(coalesce(item.value->>'serviceName', item.value->>'service_name', ''))) = lower('Jasa Angkut D40')
          then coalesce(
            nullif(nullif(item.value->>'price', '')::numeric, 0),
            nullif(nullif(item.value->>'total', '')::numeric, 0) / greatest(coalesce(nullif(nullif(item.value->>'qty', '')::numeric, 0), 1), 1)
          )
          else null
        end) as transport_40ft_unit,
        max(case
          when lower(btrim(coalesce(item.value->>'serviceName', item.value->>'service_name', ''))) = lower('Jasa Angkut')
          then coalesce(
            nullif(nullif(item.value->>'price', '')::numeric, 0),
            nullif(nullif(item.value->>'total', '')::numeric, 0) / greatest(coalesce(nullif(nullif(item.value->>'qty', '')::numeric, 0), 1), 1)
          )
          else null
        end) as transport_legacy_unit,
        coalesce(sum(case
          when lower(btrim(coalesce(item.value->>'serviceName', item.value->>'service_name', ''))) in (
            lower('Bon Muat/Bongkar'),
            lower('Tila/Gatepass'),
            lower('Handling'),
            lower('Stevedoring and Port Service'),
            lower('Jasa Handling'),
            lower('Jasa Lainnya')
          )
          then coalesce(
            nullif(nullif(item.value->>'total', '')::numeric, 0),
            greatest(coalesce(nullif(item.value->>'qty', '')::numeric, 1), 0) * coalesce(nullif(item.value->>'price', '')::numeric, 0)
          )
          else 0
        end), 0)::numeric as reimbursement_total
      from sales_orders so
      left join lateral jsonb_array_elements(
        case
          when jsonb_typeof(to_jsonb(so)->'line_items') = 'array' then to_jsonb(so)->'line_items'
          else '[]'::jsonb
        end
      ) item on true
      group by so.id
    ),
    transport_line_items as (
      select
        so.id as sales_order_id,
        case
          when lower(btrim(coalesce(item.value->>'serviceName', item.value->>'service_name', ''))) = lower('Jasa Angkut D40')
          then '40FT'
          else '20FT'
        end as finance_size_key,
        item.line_index,
        greatest(coalesce(nullif(item.value->>'qty', '')::numeric, 1), 0)::int as qty,
        coalesce(
          nullif(nullif(item.value->>'price', '')::numeric, 0),
          nullif(nullif(item.value->>'total', '')::numeric, 0) / greatest(coalesce(nullif(nullif(item.value->>'qty', '')::numeric, 0), 1), 1)
        ) as unit_price
      from sales_orders so
      join lateral jsonb_array_elements(
        case
          when jsonb_typeof(to_jsonb(so)->'line_items') = 'array' then to_jsonb(so)->'line_items'
          else '[]'::jsonb
        end
      ) with ordinality as item(value, line_index) on true
      where lower(btrim(coalesce(item.value->>'serviceName', item.value->>'service_name', ''))) in (
        lower('Jasa Angkut D20'),
        lower('Jasa Angkut D40'),
        lower('Jasa Angkut')
      )
    ),
    transport_unit_prices as (
      select
        sales_order_id,
        finance_size_key,
        unit_price,
        row_number() over (
          partition by sales_order_id, finance_size_key
          order by line_index asc, unit_index asc
        ) as finance_size_sequence
      from transport_line_items
      cross join lateral generate_series(1, qty) as unit_index
      where unit_price is not null
    ),
    finance_rows as (
      select
        cj.id,
        cj.sales_order_id,
        coalesce(so.accurate_so_number, so.so_number) as so_number,
        so.so_number as internal_so_number,
        so.accurate_so_number,
        so.do_number,
        so.invoice_number,
        so.billing_status,
        ${invoiceStatusSql} as invoice_status,
        so.customer_name,
        so.customer_pic,
        so.customer_phone,
        so.customer_address,
        so.shipment_type,
        coalesce(nullif(so.service_name, ''), nullif(so.job_type, ''), 'Jasa Angkut') as service_name,
        so.origin,
        cj.destination,
        so.trip_date,
        so.price,
        so.total_amount,
        cj.container_number,
        coalesce(cj.execution_source, 'internal') as execution_source,
        cj.container_size,
        cj.container_type,
        cj.container_notes,
        cj.spk_number,
        cj.eir_number,
        cj.loading_voucher_number,
        cj.tila_gatepass_document_number,
        cj.unloading_voucher_number,
        cj.weighing_document_number,
        cj.travel_document_number,
        cj.rpuj_status,
        cj.rpuj_notes,
        cj.has_driver_commission,
        cj.driver_commission_amount,
        cj.driver_commission_source_destination_id,
        cj.driver_commission_note,
        cj.received_at,
        cj.running_at,
        cj.completed_at,
        cj.inap_started_at,
        cj.inap_ended_at,
        cj.inap_reason,
        cj.inap_notes,
        cj.inap_created_by_name,
        cj.assignment_snapshot,
        coalesce(
          nullif(tup.unit_price, 0),
          case
            when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(ofi.transport_40ft_unit, 0)
            else nullif(ofi.transport_20ft_unit, 0)
          end,
          nullif(ofi.transport_legacy_unit, 0),
          case
            when coalesce(ofi.line_item_count, 0) = 0
            then coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1))
            else null
          end
        ) as tariff,
        1::int as trip_quantity,
        coalesce(
          nullif(tup.unit_price, 0),
          case
            when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(ofi.transport_40ft_unit, 0)
            else nullif(ofi.transport_20ft_unit, 0)
          end,
          nullif(ofi.transport_legacy_unit, 0),
          case
            when coalesce(ofi.line_item_count, 0) = 0
            then coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1))
            else null
          end
        ) as transport_revenue,
        coalesce(ofi.reimbursement_total, 0) / greatest(coalesce(jc.total_jobs, 1), 1) as reimbursement_amount,
        coalesce(
          nullif(tup.unit_price, 0),
          case
            when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(ofi.transport_40ft_unit, 0)
            else nullif(ofi.transport_20ft_unit, 0)
          end,
          nullif(ofi.transport_legacy_unit, 0),
          case
            when coalesce(ofi.line_item_count, 0) = 0
            then coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1))
            else null
          end
        ) + (coalesce(ofi.reimbursement_total, 0) / greatest(coalesce(jc.total_jobs, 1), 1)) as total_revenue,
        ${ujAmountExpression()} as journey_money,
        ${ujSourceExpression()} as journey_money_source,
        ${ujNeedsReviewExpression()} as journey_money_needs_review,
        coalesce(((regexp_match(coalesce(cj.rpuj_notes, ''), '"amount"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)'))[1])::numeric, 0) as additional_cost,
        case
          when coalesce(cj.has_driver_commission, false) then coalesce(cj.driver_commission_amount, 0)
          else 0
        end as driver_commission_cost,
        case
          when coalesce(
            nullif(tup.unit_price, 0),
            case
              when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(ofi.transport_40ft_unit, 0)
              else nullif(ofi.transport_20ft_unit, 0)
            end,
            nullif(ofi.transport_legacy_unit, 0),
            case
              when coalesce(ofi.line_item_count, 0) = 0
              then coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1))
              else null
            end
          ) is not null
            and ${ujAmountExpression()} is not null
          then coalesce(
            nullif(tup.unit_price, 0),
            case
              when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(ofi.transport_40ft_unit, 0)
              else nullif(ofi.transport_20ft_unit, 0)
            end,
            nullif(ofi.transport_legacy_unit, 0),
            case
              when coalesce(ofi.line_item_count, 0) = 0
              then coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1))
              else null
            end
          )
            - ${ujAmountExpression()}
            - coalesce(((regexp_match(coalesce(cj.rpuj_notes, ''), '"amount"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)'))[1])::numeric, 0)
            - case
              when coalesce(cj.has_driver_commission, false) then coalesce(cj.driver_commission_amount, 0)
              else 0
            end
          else null
        end as estimated_margin,
        case
          when coalesce(cj.execution_source, 'internal') = 'vendor'
          then case
            when coalesce(
              nullif(tup.unit_price, 0),
              case
                when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(ofi.transport_40ft_unit, 0)
                else nullif(ofi.transport_20ft_unit, 0)
              end,
              nullif(ofi.transport_legacy_unit, 0),
              case
                when coalesce(ofi.line_item_count, 0) = 0
                then coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1))
                else null
              end
            ) is not null
            then 'SIAP_DITAGIHKAN'
            else 'LENGKAP'
          end
          when (
            (nullif(btrim(cj.spk_number), '') is not null or coalesce(af.has_spk_file, false))
            and (nullif(btrim(cj.loading_voucher_number), '') is not null or coalesce(af.has_loading_file, false))
            and (
              nullif(btrim(coalesce(cj.tila_gatepass_document_number, cj.unloading_voucher_number, cj.weighing_document_number, '')), '') is not null
              or coalesce(af.has_tila_gatepass_file, false)
            )
            and (nullif(btrim(cj.travel_document_number), '') is not null or coalesce(af.has_travel_file, false))
          )
          then case
            when coalesce(
              nullif(tup.unit_price, 0),
              case
                when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(ofi.transport_40ft_unit, 0)
                else nullif(ofi.transport_20ft_unit, 0)
              end,
              nullif(ofi.transport_legacy_unit, 0),
              case
                when coalesce(ofi.line_item_count, 0) = 0
                then coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1))
                else null
              end
            ) is not null
              and ${ujAmountExpression()} is not null
            then 'SIAP_DITAGIHKAN'
            else 'LENGKAP'
          end
          else 'BELUM_LENGKAP'
        end as document_status,
        (
          coalesce(cj.execution_source, 'internal') = 'vendor'
          or nullif(btrim(cj.spk_number), '') is not null
          or coalesce(af.has_spk_file, false)
        ) as has_spk_document,
        (nullif(btrim(cj.loading_voucher_number), '') is not null or coalesce(af.has_loading_file, false)) as has_loading_document,
        (
          nullif(btrim(coalesce(cj.tila_gatepass_document_number, cj.unloading_voucher_number, cj.weighing_document_number, '')), '') is not null
          or coalesce(af.has_tila_gatepass_file, false)
        ) as has_tila_gatepass_document,
        (nullif(btrim(cj.travel_document_number), '') is not null or coalesce(af.has_travel_file, false)) as has_travel_document
      from ranked_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join job_counts jc on jc.sales_order_id = so.id
      left join order_financials ofi on ofi.sales_order_id = so.id
      left join transport_unit_prices tup
        on tup.sales_order_id = cj.sales_order_id
       and tup.finance_size_key = cj.finance_size_key
       and tup.finance_size_sequence = cj.finance_size_sequence
      left join destination_locations dl on dl.archived_at is null
        and (
          dl.id = cj.uj_source_destination_id
          or (cj.uj_source_destination_id is null and lower(trim(dl.name)) = lower(trim(cj.destination)))
        )
      left join attachment_flags af on af.entity_id = cj.id
      where cj.status = 'completed'
        and cj.completed_at is not null
        and so.status <> 'cancelled'
    )
  `;
}

function buildFinanceFilters(options = {}) {
  const clauses = [];
  const params = [];

  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`completed_at::date >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`completed_at::date <= $${params.length}`);
  }
  if (options.customer) {
    params.push(`%${String(options.customer).trim()}%`);
    clauses.push(`customer_name ilike $${params.length}`);
  }
  if (options.destination) {
    params.push(`%${String(options.destination).trim()}%`);
    clauses.push(`destination ilike $${params.length}`);
  }
  if (options.containerSize) {
    params.push(String(options.containerSize).trim().toUpperCase());
    clauses.push(`upper(replace(container_size, ' ', '')) = $${params.length}`);
  }
  if (options.documentStatus) {
    params.push(String(options.documentStatus).trim().toUpperCase());
    clauses.push(`document_status = $${params.length}`);
  }
  if (options.invoiceStatus) {
    params.push(String(options.invoiceStatus).trim().toUpperCase());
    clauses.push(`invoice_status = $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so_number ilike $${params.length}
      or accurate_so_number ilike $${params.length}
      or ${orderNumberSearchFromColumnSql('sales_order_id')} ilike $${params.length}
      or do_number ilike $${params.length}
      or spk_number ilike $${params.length}
      or container_number ilike $${params.length}
    )`);
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

export function buildOrderVerificationFilters(options = {}) {
  const clauses = [];
  const params = [];

  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`coalesce(so.so_date, so.created_at::date) >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`coalesce(so.so_date, so.created_at::date) <= $${params.length}`);
  }

  if (options.status === 'cancelled') {
    clauses.push("so.status = 'cancelled'");
  } else if (options.status === 'pending_so') {
    clauses.push("so.status <> 'cancelled'");
    clauses.push("(so.finance_verification_status <> 'verified' or nullif(btrim(so.accurate_so_number), '') is null)");
  } else if (options.status === 'verified') {
    clauses.push("so.finance_verification_status = 'verified'");
    clauses.push("nullif(btrim(so.accurate_so_number), '') is not null");
  }

  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.accurate_so_number ilike $${params.length}
      or ${orderNumberSearchSql('so')} ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or so.destination ilike $${params.length}
      or so.created_by_name ilike $${params.length}
      or so.sales_name ilike $${params.length}
      or so.cancel_request_note ilike $${params.length}
      or so.cancel_review_note ilike $${params.length}
    )`);
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

function buildRpujFilters(options = {}) {
  const clauses = [
    "so.status <> 'cancelled'",
    "cj.rpuj_status <> 'pending'",
    "coalesce(cj.execution_source, 'internal') = 'internal'",
  ];
  const params = [];
  const periodStatus = options.periodBasis || options.status;
  const periodDateExpression = periodStatus === 'paid'
    ? 'coalesce(cj.rpuj_transfer_uploaded_at::date, cj.rpuj_reviewed_at::date, cj.rpuj_requested_at::date, cj.updated_at::date, cj.created_at::date)'
    : ['approved', 'rejected'].includes(periodStatus)
      ? 'coalesce(cj.rpuj_reviewed_at::date, cj.rpuj_requested_at::date, cj.updated_at::date, cj.created_at::date)'
    : 'coalesce(cj.rpuj_requested_at::date, cj.received_at::date, so.trip_date, cj.created_at::date)';

  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`${periodDateExpression} >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`${periodDateExpression} <= $${params.length}`);
  }

  if (options.status) {
    params.push(String(options.status).trim());
    clauses.push(`cj.rpuj_status = $${params.length}`);
  }

  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.accurate_so_number ilike $${params.length}
      or ${orderNumberSearchSql('so')} ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or cj.destination ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
    )`);
  }

  return {
    whereSql: `where ${clauses.join(' and ')}`,
    params,
  };
}

function buildRpujSummaryDateCondition(expression, options = {}, params = []) {
  const clauses = [];
  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`${expression} >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`${expression} <= $${params.length}`);
  }
  return clauses.length ? ` and ${clauses.join(' and ')}` : '';
}

export function buildInvoiceFilters(options = {}) {
  const clauses = [];
  const params = [];
  const periodStatus = options.periodBasis || options.status;
  const periodDateExpression = options.dateBasis === 'updated'
    ? 'coalesce(updated_at::date, invoice_issued_at::date, completed_at::date)'
    : periodStatus === 'paid'
    ? 'coalesce(updated_at::date, invoice_issued_at::date, completed_at::date)'
    : periodStatus === 'in-progress'
      ? 'coalesce(invoice_issued_at::date, completed_at::date)'
      : 'completed_at::date';

  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`${periodDateExpression} >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`${periodDateExpression} <= $${params.length}`);
  }

  if (options.status === 'need-number') {
    clauses.push(`(
      nullif(btrim(invoice_number), '') is null
      or invoice_document_uploaded_at is null
    )`);
  } else if (options.status === 'in-progress') {
    clauses.push("nullif(btrim(invoice_number), '') is not null");
    clauses.push('invoice_document_uploaded_at is not null');
    clauses.push("billing_status <> 'lunas'");
  } else if (options.status === 'paid') {
    clauses.push("billing_status = 'lunas'");
  }

  if (options.invoiceDocumentFilter === 'missing-documents') {
    clauses.push("nullif(btrim(invoice_number), '') is not null");
    clauses.push('invoice_document_uploaded_at is null');
  } else if (options.invoiceDocumentFilter === 'missing-invoice') {
    clauses.push("nullif(btrim(invoice_number), '') is not null");
    clauses.push('invoice_document_uploaded_at is null');
  } else if (options.invoiceDocumentFilter === 'missing-tax-invoice') {
    clauses.push("nullif(btrim(invoice_number), '') is not null");
    clauses.push('tax_invoice_document_uploaded_at is null');
  } else if (options.invoiceDocumentFilter === 'complete') {
    clauses.push("nullif(btrim(invoice_number), '') is not null");
    clauses.push('invoice_document_uploaded_at is not null');
    clauses.push("coalesce(invoice_document_status, 'belum_upload') <> 'terkirim'");
  } else if (options.invoiceDocumentFilter === 'sent') {
    clauses.push("coalesce(invoice_document_status, 'belum_upload') = 'terkirim'");
  } else if (options.invoiceDocumentFilter === 'sj-incomplete') {
    // has_travel_document adalah bool_and per SO atas container job completed (invoice_orders hanya
    // memuat SO yang sudah punya job completed_at, lihat invoiceOrdersCte), jadi "job selesai tapi SJ
    // belum lengkap" sudah otomatis terpenuhi tanpa perlu cek status job terpisah.
    clauses.push('coalesce(has_travel_document, false) = false');
  } else if (options.invoiceDocumentFilter === 'sj-complete') {
    clauses.push('coalesce(has_travel_document, false) = true');
  } else if (options.invoiceDocumentFilter === 'due-soon') {
    clauses.push("billing_status <> 'lunas'");
    clauses.push('due_date is not null');
    clauses.push("(due_date at time zone 'Asia/Jakarta')::date >= (now() at time zone 'Asia/Jakarta')::date");
    clauses.push("(due_date at time zone 'Asia/Jakarta')::date <= (now() at time zone 'Asia/Jakarta')::date + 7");
  } else if (options.invoiceDocumentFilter === 'overdue') {
    clauses.push("billing_status <> 'lunas'");
    clauses.push('due_date is not null');
    clauses.push("(due_date at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date");
  }

  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so_number ilike $${params.length}
      or accurate_so_number ilike $${params.length}
      or ${orderNumberSearchFromColumnSql('invoice_orders.id')} ilike $${params.length}
      or invoice_number ilike $${params.length}
      or debit_note_number ilike $${params.length}
      or customer_name ilike $${params.length}
      or destination ilike $${params.length}
      or exists (
        select 1 from container_jobs cj
        where cj.sales_order_id = invoice_orders.id
          and cj.container_number ilike $${params.length}
      )
    )`);
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

function rpujRowsSelect() {
  return `
    select
      cj.id,
      cj.sales_order_id,
      cj.container_number,
      cj.container_size,
      cj.container_type,
      cj.rpuj_status,
      cj.rpuj_notes,
      cj.rpuj_requested_by_name,
      cj.rpuj_requested_at,
      cj.rpuj_reviewed_by_name,
      cj.rpuj_reviewed_at,
      cj.rpuj_rejection_note,
      cj.rpuj_transfer_uploaded_by_name,
      cj.rpuj_transfer_uploaded_at,
      cj.updated_at,
      cj.has_driver_commission,
      cj.driver_commission_amount,
      cj.driver_commission_source_destination_id,
      cj.driver_commission_note,
      cj.spk_number,
      cj.status as job_status,
      cj.repo_location,
      cj.repo_stored_at,
      cj.repo_reason,
      cj.repo_notes,
      cj.repo_container_condition,
      cj.repo_created_by_name,
      cj.repo_picked_up_at,
      cj.repo_picked_up_by_name,
      cj.driver_id,
      cj.assignment_snapshot,
      case
        when lower(coalesce(d.payment_method, 'bank')) = 'emoney'
          then nullif(concat_ws(' ', nullif(d.emoney_provider, ''), nullif(d.emoney_number, '')), '')
        else nullif(concat_ws(' ', nullif(d.bank_name, ''), nullif(d.bank_account_number, '')), '')
      end as driver_payment_account,
      coalesce(so.accurate_so_number, so.so_number) as so_number,
      so.so_number as internal_so_number,
      so.accurate_so_number,
      so.customer_name,
      so.shipment_type,
      so.origin,
      cj.destination,
      so.trip_date,
      so.terminal,
      ${ujAmountExpression()} as journey_money,
      ${ujSourceExpression()} as journey_money_source,
      ${ujNeedsReviewExpression()} as journey_money_needs_review,
      tp.id as transfer_proof_id,
      tp.file_name as transfer_proof_file_name,
      tp.storage_path as transfer_proof_storage_path,
      tp.mime_type as transfer_proof_mime_type,
      tp.file_size as transfer_proof_file_size
    from container_jobs cj
    join sales_orders so on so.id = cj.sales_order_id
    left join drivers d on d.id = cj.driver_id and d.archived_at is null
    left join destination_locations dl on dl.archived_at is null
      and (
        dl.id = cj.uj_source_destination_id
        or (cj.uj_source_destination_id is null and lower(trim(dl.name)) = lower(trim(cj.destination)))
      )
    left join lateral (
      select id, file_name, storage_path, mime_type, file_size
      from attachments
      where entity_type = 'container_job'
        and entity_id = cj.id
        and category = 'rpujTransferProof'
      order by created_at desc
      limit 1
    ) tp on true
  `;
}

function mapFinanceRow(row) {
  const tariff = row.tariff == null ? null : Number(row.tariff);
  const totalRevenue = row.total_revenue == null ? null : Number(row.total_revenue);
  const transportRevenue = row.transport_revenue == null ? null : Number(row.transport_revenue);
  const reimbursementAmount = Number(row.reimbursement_amount || 0);
  const journeyMoney = row.journey_money == null ? null : Number(row.journey_money);
  const additionalCost = Number(row.additional_cost || 0);
  const driverCommissionAmount = row.has_driver_commission ? Number(row.driver_commission_cost ?? row.driver_commission_amount ?? 0) : 0;
  const estimatedMargin = row.estimated_margin == null ? null : Number(row.estimated_margin);

  return {
    id: row.id,
    orderId: row.sales_order_id,
    completedDate: row.completed_at,
    soNumber: getDisplayFinanceSoNumber(row),
    internalSoNumber: getDisplayOrderNumber(row),
    accurateSoNumber: row.accurate_so_number || '',
    doNumber: row.do_number,
    spkNumber: row.spk_number,
    invoiceNumber: row.invoice_number,
    customer: row.customer_name,
    customerPic: row.customer_pic,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    shipment: row.shipment_type,
    serviceName: row.service_name,
    origin: row.origin,
    destination: row.destination,
    containerNumber: row.container_number,
    executionSource: row.execution_source === 'vendor' ? 'vendor' : 'internal',
    containerSize: row.container_size,
    containerType: row.container_type,
    quantity: Number(row.trip_quantity || 1),
    truck: row.assignment_snapshot?.plateNumber || null,
    driver: row.assignment_snapshot?.driver || null,
    tripDate: row.trip_date,
    receivedAt: row.received_at,
    runningAt: row.running_at,
    completedAt: row.completed_at,
    tariff,
    totalRevenue,
    transportRevenue,
    reimbursementAmount,
    billingAmount: totalRevenue,
    journeyMoney,
    additionalCost,
    hasDriverCommission: Boolean(row.has_driver_commission),
    driverCommissionAmount,
    driverCommissionSourceDestinationId: row.driver_commission_source_destination_id || '',
    driverCommissionNote: row.driver_commission_note || '',
    estimatedMargin,
    documentStatus: row.document_status,
    invoiceStatus: row.invoice_status,
    billingStatus: row.billing_status,
    rpujStatus: row.rpuj_status,
    rpujNotes: row.rpuj_notes,
    documents: {
      hasSpk: Boolean(row.has_spk_document),
      hasLoadingVoucher: Boolean(row.has_loading_document),
      hasTilaGatepass: Boolean(row.has_tila_gatepass_document),
      hasTravelDocument: Boolean(row.has_travel_document),
    },
    operationalDocuments: {
      loadingVoucher: row.loading_voucher_number,
      tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
      unloadingVoucher: row.unloading_voucher_number,
      weighingDocument: row.weighing_document_number,
      travelDocument: row.travel_document_number,
      eirNumber: row.eir_number,
    },
  };
}

function mapAttachment(row) {
  return {
    id: row.id,
    category: row.category,
    referenceNumber: row.reference_number,
    documentDate: row.document_date,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size == null ? 0 : Number(row.file_size),
    notes: row.notes || '',
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    file: {
      name: row.file_name || 'Dokumen',
      size: row.file_size == null ? 0 : Number(row.file_size),
      type: row.mime_type || '',
      path: row.id,
      storagePath: row.storage_path || '',
    },
  };
}

function parseOtherCost(value) {
  if (!value) return { amount: 0, notes: '' };
  if (typeof value === 'object') {
    return { amount: Number(value.amount || 0), notes: value.notes || '' };
  }

  const text = String(value || '').trim();
  if (!text) return { amount: 0, notes: '' };
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return { amount: Number(parsed.amount || 0), notes: parsed.notes || '' };
    }
  } catch {
    // Keep legacy plain text readable.
  }
  const numericText = text.replace(/[^\d.-]/g, '');
  const amount = numericText && numericText === text ? Number(numericText) : 0;
  return { amount: Number.isFinite(amount) ? amount : 0, notes: amount ? '' : text };
}

function mapRpujStatusLabel(row) {
  if (row.spk_number) return 'SPK Terbit';
  if (row.rpuj_status === 'paid') return 'Bukti Transfer Diupload';
  if (row.rpuj_status === 'approved') return 'Disetujui Finance';
  if (row.rpuj_status === 'rejected') return 'Ditolak Finance';
  if (row.rpuj_status === 'submitted') return 'Menunggu Approval Finance';
  return 'Belum Diajukan';
}

function mapRpujRequestRow(row) {
  const otherCost = parseOtherCost(row.rpuj_notes);
  const totalUj = row.journey_money == null ? 0 : Number(row.journey_money);
  const additionalCost = Number(otherCost.amount || 0);
  const hasDriverCommission = Boolean(row.has_driver_commission);
  const driverCommissionAmount = hasDriverCommission ? Number(row.driver_commission_amount || 0) : 0;
  const driverCommissionNote = hasDriverCommission ? row.driver_commission_note || '' : '';
  const notes = otherCost.notes || row.rpuj_rejection_note || '';
  const transferProof = row.transfer_proof_id
    ? {
        id: row.transfer_proof_id,
        name: row.transfer_proof_file_name || '',
        size: row.transfer_proof_file_size == null ? 0 : Number(row.transfer_proof_file_size),
        type: row.transfer_proof_mime_type || '',
        path: row.transfer_proof_id,
        storagePath: row.transfer_proof_storage_path || '',
      }
    : null;

  return {
    id: row.id,
    orderId: row.sales_order_id,
    soNumber: getDisplayFinanceSoNumber(row),
    internalSoNumber: getDisplayOrderNumber(row),
    accurateSoNumber: row.accurate_so_number || '',
    jobNumber: row.container_number || `JOB-${String(row.id || '').slice(0, 8).toUpperCase()}`,
    containerNumber: row.container_number || '',
    containerSize: row.container_size || '',
    customer: row.customer_name,
    destination: row.destination,
    driver: row.assignment_snapshot?.driver || null,
    driverBankAccount: row.assignment_snapshot?.driverBankAccount || row.assignment_snapshot?.bankAccount || row.driver_payment_account || '',
    truck: row.assignment_snapshot?.plateNumber || null,
    orderType: row.shipment_type,
    container: [row.container_size, row.container_number].filter(Boolean).join(' / ') || row.container_size || '-',
    departureDate: row.trip_date,
    terminal: row.terminal,
    depo: row.origin,
    spkNumber: row.spk_number || '',
    ujRecommendation: row.journey_money == null
      ? 'Rekomendasi UJ belum tersedia'
      : `1 x ${row.container_size || 'Container'} @ Rp ${Number(row.journey_money || 0).toLocaleString('id-ID')}`,
    ujSource: row.journey_money_needs_review ? 'master_current' : 'snapshot',
    ujNeedsReview: Boolean(row.journey_money_needs_review),
    notes,
    totalUj,
    additionalCost,
    hasDriverCommission,
    driverCommissionAmount,
    driverCommissionSourceDestinationId: row.driver_commission_source_destination_id || '',
    driverCommissionNote,
    totalRequest: totalUj + additionalCost,
    status: mapRpujStatusLabel(row),
    rpujStatus: row.rpuj_status,
    requestedBy: row.rpuj_requested_by_name || '',
    requestedAt: row.rpuj_requested_at,
    reviewedBy: row.rpuj_reviewed_by_name || '',
    reviewedAt: row.rpuj_reviewed_at,
    rejectionNote: row.rpuj_rejection_note || '',
    transferProof: transferProof?.name || '',
    transferProofFile: transferProof,
    transferUploadedBy: row.rpuj_transfer_uploaded_by_name || '',
    transferUploadedAt: row.rpuj_transfer_uploaded_at,
    updatedAt: row.updated_at,
    jobStatus: row.job_status || '',
    repoLocation: row.repo_location || '',
    repoStoredAt: row.repo_stored_at,
    repoReason: row.repo_reason || '',
    repoNotes: row.repo_notes || '',
    repoContainerCondition: row.repo_container_condition || '',
    repoCreatedByName: row.repo_created_by_name || '',
    repoPickedUpAt: row.repo_picked_up_at,
    repoPickedUpByName: row.repo_picked_up_by_name || '',
  };
}

function mapInvoiceStatusLabel(row) {
  if (row.billing_status === 'lunas') return 'Lunas';
  if (
    row.invoice_number
    && row.invoice_document_uploaded_at
  ) return 'Menunggu Update Status';
  return 'Butuh Nomor Invoice';
}

function mapInvoiceDocumentWorkflowLabel(status) {
  const labels = {
    belum_upload: 'Belum Upload',
    siap_dikirim: 'Dokumen Siap Dikirim',
    terkirim: 'Dokumen Terkirim',
  };
  return labels[status] || labels.belum_upload;
}

function mapInvoiceDeliveryMethodLabel(value) {
  const labels = {
    email: 'Email',
    whatsapp: 'WhatsApp',
    lainnya: 'Lainnya',
  };
  return labels[String(value || '').toLowerCase()] || value || '-';
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(...values) {
  return values
    .map(toDate)
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;
}

function daysBetween(startValue, endValue = new Date()) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return null;
  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function mapDebitNoteAgingBucket(dueDate) {
  if (!dueDate) return 'unknown';
  const now = new Date();
  const due = new Date(dueDate);
  const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'overdue_1_30';
  if (daysOverdue <= 60) return 'overdue_31_60';
  if (daysOverdue <= 90) return 'overdue_61_90';
  return 'overdue_90_plus';
}

function mapInvoiceAging(row) {
  const now = new Date();
  const documentsCompletedAt = latestDate(row.invoice_document_uploaded_at, row.tax_invoice_document_uploaded_at);
  const hasInvoiceNumber = Boolean(String(row.invoice_number || '').trim());
  const hasInvoicePdf = Boolean(row.invoice_document_uploaded_at);
  const hasCompleteDocuments = hasInvoicePdf;
  const isSent = Boolean(row.invoice_document_sent_at);
  const isPaid = row.billing_status === 'lunas';
  const paidAt = isPaid ? row.updated_at : null;

  let currentStage = 'Belum dikirim customer';
  let currentDays = null;
  if (isSent && !isPaid) {
    currentStage = 'Menunggu Pelunasan';
    currentDays = daysBetween(row.invoice_document_sent_at, now);
  } else if (isSent && isPaid) {
    currentStage = 'Lunas';
    currentDays = daysBetween(row.invoice_document_sent_at, paidAt);
  } else if (isPaid) {
    currentStage = 'Lunas, tanggal kirim kosong';
  } else if (hasInvoiceNumber && hasCompleteDocuments) {
    currentStage = 'Siap dikirim Sales';
  } else if (hasInvoiceNumber) {
    currentStage = 'Dokumen belum lengkap';
  }

  return {
    currentStage,
    currentDays,
    completionToInvoiceDays: daysBetween(row.completed_at, row.invoice_issued_at || (hasInvoiceNumber ? now : null)),
    invoiceToDocumentsDays: daysBetween(row.invoice_issued_at, documentsCompletedAt || (hasInvoiceNumber && !hasCompleteDocuments ? now : null)),
    documentsToSentDays: daysBetween(documentsCompletedAt, row.invoice_document_sent_at || (hasCompleteDocuments && !isSent ? now : null)),
    sentToPaidDays: daysBetween(row.invoice_document_sent_at, paidAt || (isSent && !isPaid ? now : null)),
  };
}

function mapPaymentStatusLabel(status) {
  const labels = {
    belum_invoice: '-',
    belum_dikirim: 'Belum Diterima',
    belum_diterima: 'Belum Diterima',
    belum_dikonfirmasi: 'Belum Dikonfirmasi',
    menunggu_pembayaran: 'Belum Dibayar',
    revisi_dispute: 'Revisi / Dispute',
    lunas: 'Lunas',
  };
  return labels[status] || '-';
}

function mapInvoiceDocumentStatus(row) {
  if (row.incomplete_documents_count > 0) return 'Dokumen Belum Lengkap';
  if (row.ready_documents_count === row.total_jobs_count) return 'Siap Ditagihkan';
  return 'Lengkap';
}

function mapInvoiceOrderRow(row) {
  const invoiceNumber = row.invoice_number || '';
  const documentStatus = mapInvoiceDocumentStatus(row);
  const billingItems = Array.isArray(row.billing_items) ? row.billing_items.filter(Boolean) : [];
  const cancelledJobsCount = Number(row.cancelled_jobs_count || 0);
  const repoStoredJobsCount = Number(row.repo_stored_jobs_count || 0);
  const cancellationNote = cancelledJobsCount > 0
    ? `${cancelledJobsCount} container dibatalkan; tagihan hanya menghitung container yang selesai.`
    : '';
  const repoStoredNote = repoStoredJobsCount > 0
    ? `${repoStoredJobsCount} container masih dititipkan Repo; belum masuk tagihan sampai job selesai.`
    : '';
  const activityLogs = [];
  if (row.completed_at) activityLogs.push(`${new Date(row.completed_at).toISOString()} - Operational menyelesaikan job`);
  if (documentStatus === 'Siap Ditagihkan') activityLogs.push(`${new Date(row.completed_at || row.updated_at).toISOString()} - Dokumen siap invoice`);
  if (invoiceNumber && row.invoice_issued_at) activityLogs.push(`${new Date(row.invoice_issued_at).toISOString()} - Finance input nomor invoice`);
  if (row.invoice_document_uploaded_at) {
    activityLogs.push(`${new Date(row.invoice_document_uploaded_at).toISOString()} - Finance upload Invoice${row.invoice_document_uploaded_by_name ? ` oleh ${row.invoice_document_uploaded_by_name}` : ''}`);
  }
  if (row.tax_invoice_document_uploaded_at) {
    activityLogs.push(`${new Date(row.tax_invoice_document_uploaded_at).toISOString()} - Finance upload Faktur Pajak${row.tax_invoice_document_uploaded_by_name ? ` oleh ${row.tax_invoice_document_uploaded_by_name}` : ''}`);
  }
  if (row.invoice_document_sent_at) {
    const deliveryMethod = mapInvoiceDeliveryMethodLabel(row.invoice_document_delivery_method);
    activityLogs.push(`${new Date(row.invoice_document_sent_at).toISOString()} - Sales kirim dokumen ke customer via ${deliveryMethod}${row.invoice_document_sent_by_name ? ` oleh ${row.invoice_document_sent_by_name}` : ''}`);
  }
  if (row.billing_status && row.billing_status !== 'belum_invoice') {
    const statusLoggedAt = row.billing_status === 'lunas'
      ? row.updated_at || row.invoice_document_sent_at
      : row.invoice_document_sent_at || row.updated_at;
    if (statusLoggedAt) {
      activityLogs.push(`${new Date(statusLoggedAt).toISOString()} - Status pembayaran: ${mapPaymentStatusLabel(row.billing_status)}`);
    }
  }
  activityLogs.sort((left, right) => {
    const leftTime = new Date(String(left).split(' - ')[0]).getTime();
    const rightTime = new Date(String(right).split(' - ')[0]).getTime();
    return (leftTime || 0) - (rightTime || 0);
  });

  return {
    id: row.id,
    orderId: row.id,
    soNumber: getDisplayFinanceSoNumber(row) || '-',
    invoiceNumber,
    invoiceDate: row.invoice_issued_at,
    invoiceDocumentStatus: row.invoice_document_status || 'belum_upload',
    invoiceDocumentStatusLabel: mapInvoiceDocumentWorkflowLabel(row.invoice_document_status),
    invoiceDocumentUploadedAt: row.invoice_document_uploaded_at,
    invoiceDocumentUploadedBy: row.invoice_document_uploaded_by_name || '',
    taxInvoiceDocumentUploadedAt: row.tax_invoice_document_uploaded_at,
    taxInvoiceDocumentUploadedBy: row.tax_invoice_document_uploaded_by_name || '',
    invoiceDocumentSentAt: row.invoice_document_sent_at,
    invoiceDocumentSentBy: row.invoice_document_sent_by_name || '',
    invoiceDocumentDeliveryMethod: row.invoice_document_delivery_method || '',
    invoiceDocumentDeliveryNotes: row.invoice_document_delivery_notes || '',
    invoiceAging: mapInvoiceAging(row),
    customer: row.customer_name || '-',
    destination: row.destination || '-',
    destinations: Array.isArray(row.destinations) ? row.destinations.filter(Boolean) : [],
    completedAt: row.completed_at,
    documentStatus,
    billingAmount: row.billing_amount == null ? 0 : Number(row.billing_amount),
    plannedJobsCount: Number(row.planned_jobs_count || 0),
    billedJobsCount: Number(row.billed_jobs_count || row.total_jobs_count || 0),
    sjUploadedCount: Number(row.travel_document_uploaded_count || 0),
    sjTotalCount: Number(row.billed_jobs_count || row.total_jobs_count || 0),
    inapJobsCount: Number(row.inap_jobs_count || 0),
    cancelledJobsCount,
    repoStoredJobsCount,
    cancellationNote,
    repoStoredNote,
    paymentTerms: row.payment_terms || '-',
    dueDate: row.due_date,
    billingItems: billingItems.length ? billingItems : ['Rincian tagihan belum tersedia'],
    documentChecklist: [
      { label: 'Nomor SO', ready: Boolean(row.accurate_so_number || getDisplayFinanceSoNumber(row)) },
      { label: 'Job selesai', ready: Boolean(row.completed_at) },
      { label: 'Surat Jalan', ready: Boolean(row.has_travel_document) },
      { label: 'Bon Muat/Bongkar', ready: Boolean(row.has_loading_document) },
      { label: 'TILA/Gatepass', ready: Boolean(row.has_tila_gatepass_document) },
    ],
    activityLogs,
    invoiceStatus: mapInvoiceStatusLabel({ ...row, invoice_number: invoiceNumber }),
    paymentStatus: mapPaymentStatusLabel(row.billing_status),
    billingStatus: row.billing_status || 'belum_invoice',
    invoiceInputBy: row.invoice_input_by_name || '',
    containerCount: Math.max(Number(row.planned_jobs_count || 0) - Number(row.cancelled_jobs_count || 0), 0),
    debitNoteNumber: row.debit_note_number || '',
    debitNoteIssuedAt: row.debit_note_issued_at,
    debitNoteInputBy: row.debit_note_input_by_name || '',
    debitNoteDocumentUploadedAt: row.debit_note_document_uploaded_at,
    debitNoteDocumentUploadedByName: row.debit_note_document_uploaded_by_name || '',
    debitNoteDueDate: row.debit_note_due_date,
    debitNoteAmount: Number(row.debit_note_amount || 0),
    debitNoteItemCount: Number(row.debit_note_item_count || 0),
    debitNoteTotalPaid: Number(row.debit_note_total_paid || 0),
    debitNoteOutstandingAmount: Math.max(Number(row.debit_note_amount || 0) - Number(row.debit_note_total_paid || 0), 0),
    debitNoteAgingBucket: row.debit_note_number ? mapDebitNoteAgingBucket(row.debit_note_due_date) : '',
    containerNumbers: Array.isArray(row.container_numbers) ? row.container_numbers.filter(Boolean) : [],
    manualRevenueAmount: Number(row.manual_revenue_amount || 0),
    internalCost: {
      journeyMoney: Number(row.journey_money_total || 0),
      journeyMoneySource: row.journey_money_needs_review ? 'master_current' : 'snapshot',
      journeyMoneyNeedsReview: Boolean(row.journey_money_needs_review),
      additionalCost: Number(row.additional_cost_total || 0),
      driverCommissionCost: Number(row.driver_commission_cost_total || 0),
      operationalExpenseTotal: Number(row.operational_expense_amount || 0),
      total: Number(row.journey_money_total || 0)
        + Number(row.additional_cost_total || 0)
        + Number(row.driver_commission_cost_total || 0)
        + Number(row.operational_expense_amount || 0),
    },
  };
}

const invoiceDocumentLabels = {
  invoicePdf: 'Invoice',
  taxInvoicePdf: 'Faktur Pajak',
  debitNotePdf: 'Dokumen Debit Note',
  spkDocument: 'SPK',
  eirDocument: 'EIR',
  loadingVoucherDocument: 'Bon Muat / Bon Bongkar',
  tilaGatepassDocumentFile: 'TILA / Delivery Card / Gatepass / SP2',
  unloadingVoucherDocument: 'Bon Bongkar',
  weighingDocumentFile: 'Dokumen Timbang / Gatepass',
  travelDocumentFile: 'Surat Jalan',
  otherDocument: 'Dokumen Tambahan',
};

const operationalInvoiceDocumentSlots = [
  { category: 'eirDocument', label: 'EIR', acceptedCategories: ['eirDocument'] },
  {
    category: 'travelDocumentFile',
    label: 'Surat Jalan',
    acceptedCategories: ['travelDocumentFile', 'travelDocument', 'suratJalan', 'suratJalanDocument'],
  },
  {
    category: 'loadingVoucherDocument',
    label: 'Bon Muat / Bon Bongkar',
    acceptedCategories: ['loadingVoucherDocument', 'unloadingVoucherDocument'],
  },
  {
    category: 'tilaGatepassDocumentFile',
    label: 'TILA / Delivery Card / Gatepass / SP2',
    acceptedCategories: ['tilaGatepassDocumentFile'],
  },
];

function mapInvoiceDocument(row) {
  return {
    id: row.id,
    source: row.source,
    jobId: row.job_id,
    containerNumber: row.container_number || '',
    category: row.category,
    label: invoiceDocumentLabels[row.category] || row.category || 'Dokumen',
    referenceNumber: row.reference_number || '',
    documentDate: row.document_date,
    notes: row.notes || '',
    uploadedByName: row.uploaded_by_name || '',
    uploadedAt: row.created_at,
    file: {
      name: row.file_name || invoiceDocumentLabels[row.category] || 'Dokumen',
      size: row.file_size == null ? 0 : Number(row.file_size),
      type: row.mime_type || '',
      path: row.id,
      storagePath: row.storage_path || '',
    },
  };
}

export function mapInvoiceDocuments(rows = []) {
  const containerJobs = new Map();
  const jobSequences = new Map();
  const salesDocuments = [];
  const financeDocuments = [];

  rows.forEach((row) => {
    if (row.source === 'Finance') {
      if (row.id) {
        const mapped = mapInvoiceDocument(row);
        financeDocuments.push({
          ...mapped,
          label: invoiceDocumentLabels[row.category] || mapped.label,
          ready: true,
        });
      }
      return;
    }

    if (row.source === 'Sales') {
      if (row.id) {
        const mapped = mapInvoiceDocument(row);
        salesDocuments.push({
          ...mapped,
          label: invoiceDocumentLabels[row.category] || mapped.label,
          ready: true,
        });
      }
      return;
    }

    if (!row.job_id) return;
    if (!jobSequences.has(row.job_id)) jobSequences.set(row.job_id, jobSequences.size + 1);
    const job = containerJobs.get(row.job_id) || {
      id: row.job_id,
      containerNumber: row.container_number || '',
      jobReference: `Container ${jobSequences.get(row.job_id)} (nomor belum diisi)`,
      attachments: new Map(),
      otherDocuments: [],
    };
    if (row.id && row.category === 'otherDocument') {
      job.otherDocuments.push(row);
    } else if (row.id && row.category) {
      job.attachments.set(row.category, row);
    }
    containerJobs.set(row.job_id, job);
  });

  const operationalDocuments = [...containerJobs.values()].flatMap((job) => (
    operationalInvoiceDocumentSlots.map((slot) => {
      const attachment = slot.acceptedCategories
        .map((category) => job.attachments.get(category))
        .find(Boolean);

      if (attachment) {
        return {
          ...mapInvoiceDocument(attachment),
          category: slot.category,
          label: slot.label,
          jobReference: job.jobReference,
          ready: true,
        };
      }

      return {
        id: `${job.id}-${slot.category}`,
        source: 'Operational',
        jobId: job.id,
        containerNumber: job.containerNumber,
        jobReference: job.jobReference,
        category: slot.category,
        label: slot.label,
        referenceNumber: '',
        documentDate: null,
        notes: '',
        uploadedByName: '',
        uploadedAt: null,
        ready: false,
        file: null,
      };
    })
  ));

  const additionalOperationalDocuments = [...containerJobs.values()].flatMap((job) => (
    job.otherDocuments.map((attachment) => ({
      ...mapInvoiceDocument(attachment),
      label: attachment.notes || attachment.reference_number || attachment.file_name || invoiceDocumentLabels.otherDocument,
      jobReference: job.jobReference,
      ready: true,
    }))
  ));

  return [...financeDocuments, ...operationalDocuments, ...additionalOperationalDocuments, ...salesDocuments];
}

export function invoiceOrdersCte() {
  return `
    ${financeRowsCte()},
    order_job_statuses as (
      select
        sales_order_id,
        count(*)::int as planned_jobs_count,
        count(*) filter (where status = 'cancelled')::int as cancelled_jobs_count,
        count(*) filter (where status = 'repo_stored')::int as repo_stored_jobs_count
      from container_jobs
      group by sales_order_id
    ),
    debit_note_expense_totals as (
      select
        sales_order_id,
        sum(amount)::numeric as debit_note_amount,
        count(*)::int as debit_note_item_count
      from container_job_expenses
      where expense_group = 'reimbursement'
        and sales_order_id is not null
        and payment_status <> 'batal'
      group by sales_order_id
    ),
    debit_note_payment_totals as (
      select sales_order_id, coalesce(sum(amount), 0)::numeric as debit_note_total_paid
      from debit_note_payments
      where voided_at is null
      group by sales_order_id
    ),
    manual_revenue_totals as (
      select sales_order_id, sum(total_amount)::numeric as manual_revenue_amount
      from manual_revenue_lines
      where status = 'active'
      group by sales_order_id
    ),
    internal_cost_totals as (
      select sales_order_id, sum(amount)::numeric as operational_expense_amount
      from container_job_expenses
      where expense_group = 'operational'
        and sales_order_id is not null
        and payment_status <> 'batal'
      group by sales_order_id
    ),
    invoice_orders as (
      select
        so.id,
        coalesce(so.accurate_so_number, so.so_number) as so_number,
        so.accurate_so_number,
        so.invoice_number,
        coalesce(so.billing_status, 'belum_invoice') as billing_status,
        so.invoice_issued_at,
        coalesce(so.invoice_document_status, 'belum_upload') as invoice_document_status,
        so.invoice_document_uploaded_at,
        so.invoice_document_uploaded_by_name,
        so.tax_invoice_document_uploaded_at,
        so.tax_invoice_document_uploaded_by_name,
        so.invoice_document_sent_at,
        so.invoice_document_sent_by_name,
        so.invoice_document_delivery_method,
        so.invoice_document_delivery_notes,
        case
          when so.invoice_issued_at is null then null
          when lower(coalesce(so.payment_type, 'cash')) = 'tempo'
            then so.invoice_issued_at + (greatest(coalesce(so.payment_term_days, 0), 1) * interval '1 day')
          else so.invoice_issued_at
        end as due_date,
        so.invoice_input_by_name,
        so.debit_note_number,
        so.debit_note_issued_at,
        so.debit_note_input_by_name,
        so.debit_note_document_uploaded_at,
        so.debit_note_document_uploaded_by_name,
        case
          when so.debit_note_issued_at is null then null
          when lower(coalesce(so.payment_type, 'cash')) = 'tempo'
            then so.debit_note_issued_at + (greatest(coalesce(so.payment_term_days, 0), 1) * interval '1 day')
          else so.debit_note_issued_at
        end as debit_note_due_date,
        coalesce(max(det.debit_note_amount), 0)::numeric as debit_note_amount,
        coalesce(max(det.debit_note_item_count), 0)::int as debit_note_item_count,
        coalesce(max(dnpt.debit_note_total_paid), 0)::numeric as debit_note_total_paid,
        coalesce(max(mrt.manual_revenue_amount), 0)::numeric as manual_revenue_amount,
        coalesce(max(ict.operational_expense_amount), 0)::numeric as operational_expense_amount,
        coalesce(sum(fr.journey_money) filter (where fr.journey_money is not null), 0)::numeric as journey_money_total,
        bool_or(coalesce(fr.journey_money_needs_review, false)) as journey_money_needs_review,
        coalesce(sum(fr.additional_cost), 0)::numeric as additional_cost_total,
        coalesce(sum(fr.driver_commission_cost), 0)::numeric as driver_commission_cost_total,
        coalesce(
          array_agg(distinct fr.container_number) filter (where fr.container_number is not null),
          array[]::text[]
        ) as container_numbers,
        coalesce(
          array_agg(distinct fr.destination) filter (where fr.destination is not null and fr.destination <> ''),
          array[]::text[]
        ) as destinations,
        so.customer_id,
        so.customer_name,
        so.destination,
        so.so_date,
        so.trip_date,
        so.updated_at,
        ${paymentTermsExpression('so')} as payment_terms,
        max(fr.completed_at) as completed_at,
        count(fr.id)::int as total_jobs_count,
        count(fr.id)::int as billed_jobs_count,
        coalesce(max(ojs.planned_jobs_count), count(fr.id))::int as planned_jobs_count,
        coalesce(max(ojs.cancelled_jobs_count), 0)::int as cancelled_jobs_count,
        coalesce(max(ojs.repo_stored_jobs_count), 0)::int as repo_stored_jobs_count,
        count(fr.id) filter (
          where fr.inap_started_at is not null
             or nullif(btrim(coalesce(fr.inap_reason, '')), '') is not null
        )::int as inap_jobs_count,
        count(fr.id) filter (where fr.document_status = 'BELUM_LENGKAP')::int as incomplete_documents_count,
        count(fr.id) filter (where fr.document_status = 'SIAP_DITAGIHKAN')::int as ready_documents_count,
        count(fr.id) filter (where fr.has_travel_document)::int as travel_document_uploaded_count,
        coalesce(sum(fr.total_revenue) filter (where fr.total_revenue is not null), nullif(so.total_amount, 0), 0)::numeric
          + coalesce(max(mrt.manual_revenue_amount), 0)::numeric as billing_amount,
        bool_and(fr.has_loading_document) as has_loading_document,
        bool_and(fr.has_tila_gatepass_document) as has_tila_gatepass_document,
        bool_and(fr.has_travel_document) as has_travel_document,
        coalesce(
          (
            select array_agg(
              concat(grouped.service_name, ' ', grouped.container_size, ' - ', grouped.trip_quantity, ' ritase')
              order by grouped.container_size, grouped.service_name
            )
            from (
              select
                coalesce(item.service_name, 'Jasa Angkut') as service_name,
                coalesce(item.container_size, '') as container_size,
                sum(item.trip_quantity)::int as trip_quantity
              from finance_rows item
              where item.sales_order_id = so.id
              group by coalesce(item.service_name, 'Jasa Angkut'), coalesce(item.container_size, '')
            ) grouped
          ),
          array[]::text[]
        ) || coalesce(
          (
            select array_agg(
              concat(
                coalesce(line_item.value->>'serviceName', line_item.value->>'service_name', 'Jasa'),
                ' - ',
                greatest(coalesce(nullif(line_item.value->>'qty', '')::numeric, 1), 0)::int,
                ' item'
              )
              order by coalesce(line_item.value->>'serviceName', line_item.value->>'service_name', 'Jasa')
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(to_jsonb(so)->'line_items') = 'array' then to_jsonb(so)->'line_items'
                else '[]'::jsonb
              end
            ) line_item
            where lower(btrim(coalesce(line_item.value->>'serviceName', line_item.value->>'service_name', ''))) in (
              lower('Bon Muat/Bongkar'),
              lower('Tila/Gatepass'),
              lower('Handling'),
              lower('Stevedoring and Port Service'),
              lower('Jasa Handling'),
              lower('Jasa Lainnya')
            )
          ),
          array[]::text[]
        ) || coalesce(
          (
            select array_agg(
              concat(mrl.description, ' (', mrl.quantity, ' ', mrl.unit, ') - Rp ', mrl.total_amount::text)
              order by mrl.created_at
            )
            from manual_revenue_lines mrl
            where mrl.sales_order_id = so.id and mrl.status = 'active'
          ),
          array[]::text[])
        as billing_items
      from sales_orders so
      join finance_rows fr on fr.sales_order_id = so.id
      left join order_job_statuses ojs on ojs.sales_order_id = so.id
      left join debit_note_expense_totals det on det.sales_order_id = so.id
      left join debit_note_payment_totals dnpt on dnpt.sales_order_id = so.id
      left join manual_revenue_totals mrt on mrt.sales_order_id = so.id
      left join internal_cost_totals ict on ict.sales_order_id = so.id
      where so.status = 'completed'
        and so.finance_verification_status = 'verified'
        and nullif(btrim(so.accurate_so_number), '') is not null
      group by so.id
    )
  `;
}

export async function getFinanceDashboard(options = {}) {
  const { whereSql, params } = buildFinanceFilters(options);
  const [result, queueResult] = await Promise.all([
    query(
      `
        ${financeRowsCte()}
        select
          count(*)::int as total_completed_trips,
          count(distinct customer_name)::int as total_customers,
          coalesce(sum(trip_quantity), 0)::int as total_completed_containers,
          coalesce(sum(total_revenue) filter (where total_revenue is not null), 0)::numeric as total_revenue,
          coalesce(sum(transport_revenue) filter (where transport_revenue is not null), 0)::numeric as total_transport_revenue,
          coalesce(sum(reimbursement_amount), 0)::numeric as total_reimbursement_amount,
          coalesce(sum(journey_money) filter (where journey_money is not null), 0)::numeric as total_journey_money,
          coalesce(sum(additional_cost), 0)::numeric as total_additional_cost,
          coalesce(sum(estimated_margin) filter (where estimated_margin is not null), 0)::numeric as estimated_margin,
          count(*) filter (where document_status = 'SIAP_DITAGIHKAN' and invoice_status = 'BELUM_DIBUAT')::int as ready_to_invoice,
          count(*) filter (where document_status = 'BELUM_LENGKAP')::int as incomplete_documents,
          count(*) filter (where invoice_status = 'BELUM_DIBUAT')::int as not_invoiced,
          count(*) filter (where invoice_status <> 'BELUM_DIBUAT')::int as invoiced,
          count(*) filter (where total_revenue is null)::int as missing_revenue,
          count(*) filter (where journey_money is null)::int as missing_journey_money,
          count(*) filter (where journey_money_needs_review)::int as journey_money_needs_review_count
        from finance_rows
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        ${invoiceOrdersCte()}
        select
          (
            select count(*)::int
            from sales_orders so
            where so.status not in ('completed', 'cancelled')
              and (so.finance_verification_status <> 'verified' or nullif(btrim(so.accurate_so_number), '') is null)
          ) as pending_so,
          (
            select count(*)::int
            from sales_orders so
            where so.status not in ('completed', 'cancelled')
              and so.finance_verification_status = 'verified'
              and nullif(btrim(so.accurate_so_number), '') is not null
          ) as verified_orders,
          (
            select count(*)::int
            from container_jobs cj
            join sales_orders so on so.id = cj.sales_order_id
            where so.status <> 'cancelled'
              and cj.rpuj_status = 'submitted'
              and coalesce(cj.execution_source, 'internal') = 'internal'
          ) as rpuj_submitted,
          (
            select count(*)::int
            from container_jobs cj
            join sales_orders so on so.id = cj.sales_order_id
            where so.status <> 'cancelled'
              and cj.rpuj_status = 'approved'
              and coalesce(cj.execution_source, 'internal') = 'internal'
          ) as rpuj_approved_waiting_transfer,
          (
            select count(*)::int
            from container_jobs cj
            join sales_orders so on so.id = cj.sales_order_id
            where so.status <> 'cancelled'
              and cj.rpuj_status = 'paid'
              and coalesce(cj.execution_source, 'internal') = 'internal'
          ) as rpuj_paid,
          (
            select count(*)::int
            from invoice_orders
            where nullif(btrim(invoice_number), '') is null
          ) as invoice_need_number,
          (
            select count(*)::int
            from invoice_orders
            where nullif(btrim(invoice_number), '') is not null
              and billing_status <> 'lunas'
          ) as invoice_waiting_sales,
          (
            select count(*)::int
            from invoice_orders
            where billing_status = 'lunas'
          ) as invoice_paid,
          (
            select count(*)::int
            from invoice_orders
            where nullif(btrim(invoice_number), '') is not null
              and invoice_document_uploaded_at is null
          ) as missing_invoice_documents,
          (
            select count(*)::int
            from invoice_orders
            where nullif(btrim(invoice_number), '') is not null
              and invoice_document_uploaded_at is null
          ) as missing_invoice_document,
          (
            select count(*)::int
            from invoice_orders
            where nullif(btrim(invoice_number), '') is not null
              and tax_invoice_document_uploaded_at is null
          ) as missing_tax_invoice_document,
          (
            select count(*)::int
            from invoice_orders
            where nullif(btrim(invoice_number), '') is not null
              and invoice_document_uploaded_at is not null
              and coalesce(invoice_document_status, 'belum_upload') <> 'terkirim'
              and billing_status <> 'lunas'
          ) as complete_invoice_documents,
          (
            select count(*)::int
            from invoice_orders
            where coalesce(invoice_document_status, 'belum_upload') = 'terkirim'
              and billing_status <> 'lunas'
          ) as sent_waiting_payment,
          (
            select count(*)::int
            from invoice_orders
            where nullif(btrim(invoice_number), '') is not null
              and invoice_document_uploaded_at is null
              and coalesce(invoice_issued_at::date, completed_at::date) <= current_date - interval '3 days'
          ) as overdue_document_upload,
          (
            select count(*)::int
            from invoice_orders
            where billing_status <> 'lunas'
              and due_date is not null
              and due_date::date < current_date
          ) as overdue_payment
      `,
    ),
  ]);

  const row = result.rows[0] || {};
  const queue = queueResult.rows[0] || {};
  return {
    totalCompletedTrips: Number(row.total_completed_trips || 0),
    totalCustomers: Number(row.total_customers || 0),
    totalCompletedContainers: Number(row.total_completed_containers || 0),
    totalRevenue: Number(row.total_revenue || 0),
    totalTransportRevenue: Number(row.total_transport_revenue || 0),
    totalReimbursementAmount: Number(row.total_reimbursement_amount || 0),
    totalJourneyMoney: Number(row.total_journey_money || 0),
    totalAdditionalCost: Number(row.total_additional_cost || 0),
    estimatedMargin: Number(row.estimated_margin || 0),
    readyToInvoice: Number(row.ready_to_invoice || 0),
    incompleteDocuments: Number(row.incomplete_documents || 0),
    notInvoiced: Number(row.not_invoiced || 0),
    invoiced: Number(row.invoiced || 0),
    missingRevenue: Number(row.missing_revenue || 0),
    missingJourneyMoney: Number(row.missing_journey_money || 0),
    journeyMoneyNeedsReviewCount: Number(row.journey_money_needs_review_count || 0),
    queues: {
      pendingSo: Number(queue.pending_so || 0),
      verifiedOrders: Number(queue.verified_orders || 0),
      rpujSubmitted: Number(queue.rpuj_submitted || 0),
      rpujApprovedWaitingTransfer: Number(queue.rpuj_approved_waiting_transfer || 0),
      rpujPaid: Number(queue.rpuj_paid || 0),
      invoiceNeedNumber: Number(queue.invoice_need_number || 0),
      invoiceWaitingSales: Number(queue.invoice_waiting_sales || 0),
      invoicePaid: Number(queue.invoice_paid || 0),
    },
    invoiceWorkflow: {
      needNumber: Number(queue.invoice_need_number || 0),
      missingInvoiceDocuments: Number(queue.missing_invoice_documents || 0),
      missingInvoiceDocument: Number(queue.missing_invoice_document || 0),
      missingTaxInvoiceDocument: Number(queue.missing_tax_invoice_document || 0),
      completeInvoiceDocuments: Number(queue.complete_invoice_documents || 0),
      sentWaitingPayment: Number(queue.sent_waiting_payment || 0),
      overdueDocumentUpload: Number(queue.overdue_document_upload || 0),
      overduePayment: Number(queue.overdue_payment || 0),
    },
  };
}

export async function getOrderVerificationsPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildOrderVerificationFilters(options);
  const { whereSql: summaryWhereSql, params: summaryParams } = buildOrderVerificationFilters({
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    query: options.query,
  });
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        select
          so.id,
          so.so_number,
          so.accurate_so_number,
          so.finance_verification_status,
          so.finance_verified_by_name,
          so.finance_verified_at,
          so.do_number,
          so.so_date,
          so.trip_date,
          so.customer_name,
          so.customer_pic,
          so.customer_phone,
          so.customer_address,
          so.shipment_type,
          so.job_type,
          so.vessel_name,
          so.job_description,
          so.container_summary,
          so.price,
          so.total_amount,
          to_jsonb(so)->'line_items' as line_items,
          so.terminal,
          ${paymentTermsExpression('so')} as payment_terms,
          so.origin,
          so.destination,
          so.quantity,
          so.status,
          so.sales_name,
          so.created_by_name,
          so.cancelled_at,
          so.cancel_request_status,
          so.cancel_request_note,
          so.cancel_requested_by_name,
          so.cancel_requested_by_role,
          so.cancel_requested_at,
          so.cancel_reviewed_by_name,
          so.cancel_reviewed_at,
          so.cancel_review_note,
          so.created_at,
          so.updated_at,
          so.notes,
          to_jsonb(so)->'reference_documents' as reference_documents,
          coalesce(count(cj.id) filter (where upper(replace(cj.container_size, ' ', '')) = '20FT'), 0)::int as qty_20ft,
          coalesce(count(cj.id) filter (where upper(replace(cj.container_size, ' ', '')) = '40FT'), 0)::int as qty_40ft
        from sales_orders so
        left join container_jobs cj on cj.sales_order_id = so.id and cj.status <> 'cancelled'
        ${whereSql}
        group by so.id
        order by
          coalesce(so.so_date, so.created_at::date) desc nulls last,
          so.created_at desc,
          so.id desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from sales_orders so
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        select
          count(*) filter (where so.status <> 'cancelled' and (so.finance_verification_status <> 'verified' or nullif(btrim(so.accurate_so_number), '') is null))::int as pending_so,
          count(*) filter (where so.finance_verification_status = 'verified' and nullif(btrim(so.accurate_so_number), '') is not null)::int as verified,
          count(*) filter (where so.status = 'cancelled')::int as cancelled
        from sales_orders so
        ${summaryWhereSql}
      `,
      summaryParams,
    ),
  ]);

  return {
    rows: rows.rows.map(mapOrderVerificationRow),
    total: Number(total.rows[0]?.total || 0),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Number(total.rows[0]?.total || 0) / pageSize)),
    summary: {
      pendingSo: Number(summary.rows[0]?.pending_so || 0),
      verified: Number(summary.rows[0]?.verified || 0),
      cancelled: Number(summary.rows[0]?.cancelled || 0),
    },
  };
}

export async function updateOrderVerificationSoNumber(id, payload = {}) {
  const soNumber = String(payload.soNumber || '').trim();
  if (!soNumber) {
    const error = new Error('Nomor SO Finance wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select id, so_number, accurate_so_number, finance_verification_status
        from sales_orders
        where id = $1
          and status <> 'cancelled'
      `,
      [id],
    );

    if (!existing.rows[0]) {
      const error = new Error('Request order Finance tidak ditemukan atau sudah dibatalkan.');
      error.statusCode = 404;
      error.code = 'FINANCE_ORDER_VERIFICATION_NOT_FOUND';
      throw error;
    }

    if (String(existing.rows[0].accurate_so_number || '').trim()) {
      const error = new Error('Nomor SO Finance sudah pernah diinput. Gunakan fitur ajukan koreksi nomor SO untuk mengubahnya.');
      error.statusCode = 409;
      error.code = 'FINANCE_SO_NUMBER_ALREADY_ASSIGNED';
      throw error;
    }

    const duplicate = await client.query(
      `
        select id
        from sales_orders
        where lower(accurate_so_number) = lower($1)
          and id <> $2
        limit 1
      `,
      [soNumber, id],
    );

    if (duplicate.rows[0]) {
      const error = new Error('Nomor SO Finance sudah digunakan oleh order lain.');
      error.statusCode = 409;
      error.code = 'SO_NUMBER_DUPLICATE';
      throw error;
    }

    await client.query(
      `
        update sales_orders
        set accurate_so_number = $1,
            finance_verification_status = 'verified',
            finance_verified_by_name = $2,
            finance_verified_at = now(),
            updated_by_name = $2,
            updated_at = now()
        where id = $3
      `,
      [soNumber, payload.actorName || 'Finance', id],
    );

    const updated = await client.query(
      `
        select
          so.id,
          so.so_number,
          so.accurate_so_number,
          so.finance_verification_status,
          so.finance_verified_by_name,
          so.finance_verified_at,
          so.do_number,
          so.so_date,
          so.trip_date,
          so.customer_name,
          so.customer_pic,
          so.customer_phone,
          so.customer_address,
          so.shipment_type,
          so.job_type,
          so.vessel_name,
          so.job_description,
          so.container_summary,
          so.price,
          so.total_amount,
          to_jsonb(so)->'line_items' as line_items,
          so.terminal,
          ${paymentTermsExpression('so')} as payment_terms,
          so.origin,
          so.destination,
          so.quantity,
          so.status,
          so.sales_name,
          so.created_by_name,
          so.cancelled_at,
          so.cancel_request_status,
          so.cancel_request_note,
          so.cancel_requested_by_name,
          so.cancel_requested_by_role,
          so.cancel_requested_at,
          so.cancel_reviewed_by_name,
          so.cancel_reviewed_at,
          so.cancel_review_note,
          so.created_at,
          so.updated_at,
          so.notes,
          to_jsonb(so)->'reference_documents' as reference_documents,
          coalesce(count(cj.id) filter (where upper(replace(cj.container_size, ' ', '')) = '20FT'), 0)::int as qty_20ft,
          coalesce(count(cj.id) filter (where upper(replace(cj.container_size, ' ', '')) = '40FT'), 0)::int as qty_40ft
        from sales_orders so
        left join container_jobs cj on cj.sales_order_id = so.id and cj.status <> 'cancelled'
        where so.id = $1
        group by so.id
      `,
      [id],
    );

    return mapOrderVerificationRow(updated.rows[0]);
  });
}

export async function createFinanceCorrectionRequest(salesOrderId, payload = {}) {
  const { correctionType, requestedValue, reason } = validateFinanceCorrectionInput(payload);
  const field = getFinanceCorrectionField(correctionType);

  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select
          so.id,
          so.so_number,
          so.accurate_so_number,
          so.invoice_number,
          so.status,
          so.billing_status,
          coalesce(count(cj.id) filter (where cj.status not in ('cancelled', 'completed')), 0)::int as active_jobs_count
        from sales_orders so
        left join container_jobs cj on cj.sales_order_id = so.id
        where so.id = $1
        group by so.id
      `,
      [salesOrderId],
    );

    const order = existing.rows[0];
    if (!order) {
      const error = new Error('Sales Order untuk koreksi Finance tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'FINANCE_CORRECTION_ORDER_NOT_FOUND';
      throw error;
    }

    const currentValue = String(order[field] || '').trim();
    if (currentValue && currentValue.toLowerCase() === requestedValue.toLowerCase()) {
      const error = new Error('Nomor baru sama dengan nomor yang sedang digunakan.');
      error.statusCode = 409;
      error.code = 'FINANCE_CORRECTION_VALUE_UNCHANGED';
      throw error;
    }

    const duplicate = await client.query(
      `
        select id
        from sales_orders
        where lower(${field}) = lower($1)
          and id <> $2
        limit 1
      `,
      [requestedValue, salesOrderId],
    );

    if (duplicate.rows[0]) {
      const error = new Error(correctionType === 'invoice_number'
        ? 'Nomor invoice baru sudah digunakan oleh Sales Order lain.'
        : 'Nomor SO baru sudah digunakan oleh Sales Order lain.');
      error.statusCode = 409;
      error.code = correctionType === 'invoice_number' ? 'INVOICE_NUMBER_DUPLICATE' : 'SO_NUMBER_DUPLICATE';
      throw error;
    }

    const pending = await client.query(
      `
        select id
        from finance_correction_requests
        where status = $3
          and (
            (sales_order_id = $1 and correction_type = $2)
            or (correction_type = $2 and lower(requested_value) = lower($4))
          )
        limit 1
      `,
      [salesOrderId, correctionType, financeCorrectionStatuses.pending, requestedValue],
    );

    if (pending.rows[0]) {
      const error = new Error('Masih ada request koreksi yang menunggu approval untuk nomor ini.');
      error.statusCode = 409;
      error.code = 'FINANCE_CORRECTION_PENDING_EXISTS';
      throw error;
    }

    const requiresAdminApproval = isFinanceCorrectionAdminApprovalRequired(order, correctionType);
    const status = requiresAdminApproval ? financeCorrectionStatuses.pending : financeCorrectionStatuses.applied;
    if (!requiresAdminApproval) {
      await applyFinanceCorrectionValue(client, salesOrderId, correctionType, requestedValue, payload.actorName || 'Finance');
    }

    const inserted = await client.query(
      `
        insert into finance_correction_requests (
          sales_order_id,
          correction_type,
          current_value,
          requested_value,
          reason,
          status,
          requires_admin_approval,
          requested_by_name,
          requested_by_role,
          applied_at,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        returning *
      `,
      [
        salesOrderId,
        correctionType,
        currentValue,
        requestedValue,
        reason,
        status,
        requiresAdminApproval,
        payload.actorName || 'Finance',
        payload.actorRole || 'finance',
        requiresAdminApproval ? null : new Date().toISOString(),
        JSON.stringify({
          salesOrderStatus: order.status || '',
          billingStatus: order.billing_status || '',
          activeJobsCount: Number(order.active_jobs_count || 0),
        }),
      ],
    );

    return mapFinanceCorrectionRequest({
      ...inserted.rows[0],
      so_number: correctionType === 'so_number' && !requiresAdminApproval ? requestedValue : order.accurate_so_number || order.so_number,
      invoice_number: correctionType === 'invoice_number' && !requiresAdminApproval ? requestedValue : order.invoice_number,
    });
  });
}

export async function getFinanceCorrectionRequestsBySalesOrder(salesOrderId) {
  const result = await query(
    `
      select
        fcr.*,
        coalesce(so.accurate_so_number, so.so_number) as so_number,
        so.invoice_number
      from finance_correction_requests fcr
      join sales_orders so on so.id = fcr.sales_order_id
      where fcr.sales_order_id = $1
      order by fcr.created_at desc
      `,
      [salesOrderId],
    );

  return result.rows.map(mapFinanceCorrectionRequest);
}

function buildFinanceCorrectionFilters(options = {}) {
  const params = [];
  const clauses = [];

  if (options.status) {
    params.push(String(options.status).trim());
    clauses.push(`fcr.status = $${params.length}`);
  }

  if (options.correctionType || options.type) {
    params.push(normalizeFinanceCorrectionType(options.correctionType || options.type));
    clauses.push(`fcr.correction_type = $${params.length}`);
  }

  if (options.query || options.search) {
    params.push(`%${String(options.query || options.search).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.accurate_so_number ilike $${params.length}
      or so.invoice_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or fcr.current_value ilike $${params.length}
      or fcr.requested_value ilike $${params.length}
      or fcr.reason ilike $${params.length}
    )`);
  }

  return { whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

export async function getFinanceCorrectionRequestsPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildFinanceCorrectionFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        select
          fcr.*,
          coalesce(so.accurate_so_number, so.so_number) as so_number,
          so.invoice_number,
          so.customer_name,
          so.destination
        from finance_correction_requests fcr
        join sales_orders so on so.id = fcr.sales_order_id
        ${whereSql}
        order by
          case when fcr.status = 'pending' then 0 else 1 end,
          fcr.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from finance_correction_requests fcr
        join sales_orders so on so.id = fcr.sales_order_id
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        select
          count(*) filter (where status = 'pending')::int as pending,
          count(*) filter (where status = 'applied')::int as applied,
          count(*) filter (where status = 'rejected')::int as rejected
        from finance_correction_requests
      `,
    ),
  ]);

  return {
    rows: rows.rows.map(mapFinanceCorrectionRequest),
    page,
    pageSize,
    total: Number(total.rows[0]?.total || 0),
    totalPages: Math.max(1, Math.ceil(Number(total.rows[0]?.total || 0) / pageSize)),
    summary: {
      pending: Number(summary.rows[0]?.pending || 0),
      applied: Number(summary.rows[0]?.applied || 0),
      rejected: Number(summary.rows[0]?.rejected || 0),
    },
  };
}

async function getPendingCorrectionForReview(client, id) {
  const result = await client.query(
    `
      select
        fcr.*,
        coalesce(so.accurate_so_number, so.so_number) as so_number,
        so.invoice_number,
        so.customer_name,
        so.destination
      from finance_correction_requests fcr
      join sales_orders so on so.id = fcr.sales_order_id
      where fcr.id = $1
      for update of fcr
    `,
    [id],
  );

  const correction = result.rows[0];
  if (!correction) {
    const error = new Error('Request koreksi Finance tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'FINANCE_CORRECTION_NOT_FOUND';
    throw error;
  }

  if (correction.status !== financeCorrectionStatuses.pending) {
    const error = new Error('Request koreksi Finance sudah diproses.');
    error.statusCode = 409;
    error.code = 'FINANCE_CORRECTION_ALREADY_REVIEWED';
    throw error;
  }

  return correction;
}

export async function approveFinanceCorrectionRequest(id, payload = {}) {
  const reviewNote = String(payload.reviewNote || payload.note || '').trim();
  if (reviewNote.length > 500) {
    const error = new Error('Catatan approval maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'FINANCE_CORRECTION_REVIEW_NOTE_TOO_LONG';
    throw error;
  }

  return withTransaction(async (client) => {
    const correction = await getPendingCorrectionForReview(client, id);
    const field = getFinanceCorrectionField(correction.correction_type);

    const duplicate = await client.query(
      `
        select id
        from sales_orders
        where lower(${field}) = lower($1)
          and id <> $2
        limit 1
      `,
      [correction.requested_value, correction.sales_order_id],
    );

    if (duplicate.rows[0]) {
      const error = new Error(correction.correction_type === 'invoice_number'
        ? 'Nomor invoice baru sudah digunakan oleh Sales Order lain.'
        : 'Nomor SO baru sudah digunakan oleh Sales Order lain.');
      error.statusCode = 409;
      error.code = correction.correction_type === 'invoice_number' ? 'INVOICE_NUMBER_DUPLICATE' : 'SO_NUMBER_DUPLICATE';
      throw error;
    }

    await applyFinanceCorrectionValue(
      client,
      correction.sales_order_id,
      correction.correction_type,
      correction.requested_value,
      payload.actorName || 'Admin',
    );

    const updated = await client.query(
      `
        update finance_correction_requests
        set status = $1,
            reviewed_by_name = $2,
            reviewed_by_role = $3,
            reviewed_at = now(),
            review_note = $4,
            applied_at = now(),
            updated_at = now()
        where id = $5
        returning *
      `,
      [
        financeCorrectionStatuses.applied,
        payload.actorName || 'Admin',
        payload.actorRole || 'admin',
        reviewNote || null,
        id,
      ],
    );

    return mapFinanceCorrectionRequest({
      ...updated.rows[0],
      so_number: correction.correction_type === 'so_number' ? correction.requested_value : correction.so_number,
      invoice_number: correction.correction_type === 'invoice_number' ? correction.requested_value : correction.invoice_number,
      customer_name: correction.customer_name,
      destination: correction.destination,
    });
  });
}

export async function rejectFinanceCorrectionRequest(id, payload = {}) {
  const reviewNote = String(payload.reviewNote || payload.note || '').trim();
  if (!reviewNote) {
    const error = new Error('Catatan reject koreksi wajib diisi.');
    error.statusCode = 400;
    error.code = 'FINANCE_CORRECTION_REJECT_NOTE_REQUIRED';
    throw error;
  }
  if (reviewNote.length > 500) {
    const error = new Error('Catatan reject maksimal 500 karakter.');
    error.statusCode = 400;
    error.code = 'FINANCE_CORRECTION_REVIEW_NOTE_TOO_LONG';
    throw error;
  }

  return withTransaction(async (client) => {
    const correction = await getPendingCorrectionForReview(client, id);
    const updated = await client.query(
      `
        update finance_correction_requests
        set status = $1,
            reviewed_by_name = $2,
            reviewed_by_role = $3,
            reviewed_at = now(),
            review_note = $4,
            updated_at = now()
        where id = $5
        returning *
      `,
      [
        financeCorrectionStatuses.rejected,
        payload.actorName || 'Admin',
        payload.actorRole || 'admin',
        reviewNote,
        id,
      ],
    );

    return mapFinanceCorrectionRequest({
      ...updated.rows[0],
      so_number: correction.so_number,
      invoice_number: correction.invoice_number,
      customer_name: correction.customer_name,
      destination: correction.destination,
    });
  });
}

export async function getRpujRequestsPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildRpujFilters(options);
  const { whereSql: summaryWhereSql, params: summaryBaseParams } = buildRpujFilters({
    query: options.query,
  });
  const summaryParams = [...summaryBaseParams];
  const requestedDateSql = buildRpujSummaryDateCondition(
    'coalesce(cj.rpuj_requested_at::date, cj.received_at::date, so.trip_date, cj.created_at::date)',
    options,
    summaryParams,
  );
  const reviewedDateSql = buildRpujSummaryDateCondition(
    'coalesce(cj.rpuj_reviewed_at::date, cj.rpuj_requested_at::date, cj.updated_at::date, cj.created_at::date)',
    options,
    summaryParams,
  );
  const paidDateSql = buildRpujSummaryDateCondition(
    'coalesce(cj.rpuj_transfer_uploaded_at::date, cj.rpuj_reviewed_at::date, cj.rpuj_requested_at::date, cj.updated_at::date, cj.created_at::date)',
    options,
    summaryParams,
  );
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${rpujRowsSelect()}
        ${whereSql}
        order by
          coalesce(
            case when cj.rpuj_status = 'paid' then cj.rpuj_transfer_uploaded_at end,
            case when cj.rpuj_status in ('approved', 'rejected') then cj.rpuj_reviewed_at end,
            cj.rpuj_requested_at,
            cj.updated_at,
            cj.created_at
          ) desc nulls last,
          so.trip_date desc nulls last,
          cj.created_at desc
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
        select
          count(*) filter (where cj.rpuj_status = 'submitted' ${requestedDateSql})::int as submitted,
          count(*) filter (where cj.rpuj_status = 'approved' ${reviewedDateSql})::int as approved,
          count(*) filter (where cj.rpuj_status = 'paid' ${paidDateSql})::int as paid,
          count(*) filter (where cj.rpuj_status = 'rejected' ${reviewedDateSql})::int as rejected
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${summaryWhereSql}
      `,
      summaryParams,
    ),
  ]);

  return {
    rows: rows.rows.map(mapRpujRequestRow),
    total: Number(total.rows[0]?.total || 0),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Number(total.rows[0]?.total || 0) / pageSize)),
    summary: {
      submitted: Number(summary.rows[0]?.submitted || 0),
      approved: Number(summary.rows[0]?.approved || 0),
      paid: Number(summary.rows[0]?.paid || 0),
      rejected: Number(summary.rows[0]?.rejected || 0),
    },
  };
}

async function getRpujRequestById(client, id) {
  const result = await client.query(
    `
      ${rpujRowsSelect()}
      where cj.id = $1
      limit 1
    `,
    [id],
  );
  return result.rows[0] ? mapRpujRequestRow(result.rows[0]) : null;
}

function mapOperationalFundRequestRow(row) {
  const transferProof = row.transfer_proof_attachment_id
    ? {
        id: row.transfer_proof_attachment_id,
        name: row.transfer_proof_file_name || '',
        size: row.transfer_proof_file_size == null ? 0 : Number(row.transfer_proof_file_size),
        type: row.transfer_proof_mime_type || '',
        path: row.transfer_proof_attachment_id,
        storagePath: row.transfer_proof_storage_path || '',
      }
    : null;

  return {
    id: row.id,
    requestDate: row.request_date,
    amount: Number(row.amount || 0),
    purpose: row.purpose || '',
    status: row.status,
    requestedBy: row.requested_by_name || '',
    requestedAt: row.requested_at,
    reviewedBy: row.reviewed_by_name || '',
    reviewedAt: row.reviewed_at,
    rejectionNote: row.rejection_note || '',
    transferUploadedBy: row.transfer_uploaded_by_name || '',
    transferUploadedAt: row.transfer_uploaded_at,
    transferProof: transferProof?.name || '',
    transferProofFile: transferProof,
    createdByName: row.created_by_name || '',
    updatedByName: row.updated_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function operationalFundRequestSelect() {
  return `
    select
      ofr.*,
      proof.file_name as transfer_proof_file_name,
      proof.mime_type as transfer_proof_mime_type,
      proof.file_size as transfer_proof_file_size,
      proof.storage_path as transfer_proof_storage_path
    from operational_fund_requests ofr
    left join attachments proof on proof.id = ofr.transfer_proof_attachment_id
  `;
}

function mapOperationalFundBatchRow(row = {}) {
  return {
    id: row.id,
    batchDate: row.batch_date,
    status: row.status || 'open',
    totalCredit: Number(row.total_credit || 0),
    openingBalance: Number(row.opening_balance || 0),
    topUpAmount: Number(row.top_up_amount || 0),
    totalDebit: Number(row.total_debit || 0),
    totalAdjustment: Number(row.total_adjustment || 0),
    balance: Number(row.balance || 0),
    transactionCount: Number(row.transaction_count || 0),
    creditCount: Number(row.credit_count || 0),
    debitCount: Number(row.debit_count || 0),
    uncheckedCount: Number(row.unchecked_count || 0),
    needClarificationCount: Number(row.need_clarification_count || 0),
    checkedCount: Number(row.checked_count || 0),
    closedByName: row.closed_by_name || '',
    closedAt: row.closed_at || null,
    closeNote: row.close_note || '',
    createdByName: row.created_by_name || '',
    updatedByName: row.updated_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function operationalFundBatchSelect() {
  return `
    select
      batch.*,
      coalesce(sum(oft.amount) filter (where oft.transaction_type = 'credit' and oft.status = 'posted'), 0)::numeric as total_credit,
      coalesce(sum(oft.amount) filter (where oft.transaction_type = 'debit' and oft.status = 'posted'), 0)::numeric as total_debit,
      coalesce(sum(oft.amount) filter (where oft.transaction_type = 'adjustment' and oft.status = 'posted'), 0)::numeric as total_adjustment,
      (
        coalesce(sum(oft.amount) filter (where oft.transaction_type = 'credit' and oft.status = 'posted'), 0)
        - coalesce(sum(oft.amount) filter (where oft.transaction_type = 'debit' and oft.status = 'posted'), 0)
        + coalesce(sum(oft.amount) filter (where oft.transaction_type = 'adjustment' and oft.status = 'posted'), 0)
      )::numeric as balance,
      count(oft.id) filter (where oft.status = 'posted')::int as transaction_count,
      count(oft.id) filter (where oft.transaction_type = 'credit' and oft.status = 'posted')::int as credit_count,
      coalesce(sum(oft.amount) filter (where oft.transaction_type = 'credit' and oft.category = 'saldo_awal' and oft.status = 'posted'), 0)::numeric as opening_balance,
      coalesce(sum(oft.amount) filter (where oft.transaction_type = 'credit' and oft.category <> 'saldo_awal' and oft.status = 'posted'), 0)::numeric as top_up_amount,
      count(oft.id) filter (where oft.transaction_type = 'debit' and oft.status = 'posted')::int as debit_count,
      count(oft.id) filter (
        where oft.transaction_type = 'debit'
          and oft.status = 'posted'
          and coalesce(expense.id, admin_expense.id) is not null
          and coalesce(expense.finance_check_status, admin_expense.finance_check_status, 'belum_dicek') in ('belum_dicek', 'dikoreksi')
      )::int as unchecked_count,
      count(oft.id) filter (
        where oft.transaction_type = 'debit'
          and oft.status = 'posted'
          and coalesce(expense.id, admin_expense.id) is not null
          and coalesce(expense.finance_check_status, admin_expense.finance_check_status) = 'perlu_klarifikasi'
      )::int as need_clarification_count,
      count(oft.id) filter (
        where oft.transaction_type = 'debit'
          and oft.status = 'posted'
          and coalesce(expense.id, admin_expense.id) is not null
          and coalesce(expense.finance_check_status, admin_expense.finance_check_status) = 'sudah_dicek'
      )::int as checked_count
    from operational_fund_batches batch
    left join operational_fund_transactions oft on oft.batch_id = batch.id
    left join container_job_expenses expense on expense.id = oft.container_job_expense_id
    left join container_job_expenses admin_expense
      on oft.source = 'container_job_expense_admin_fee'
      and admin_expense.id = case
        when oft.source_ref_id ~ '^admin-transfer:[0-9a-fA-F-]{36}$'
          then split_part(oft.source_ref_id, ':', 2)::uuid
        else null
      end
  `;
}

async function ensureOperationalFundBatch(client, batchDate, actorName = 'System') {
  const result = await client.query(
    `
      insert into operational_fund_batches (
        batch_date,
        status,
        created_by_name,
        updated_by_name
      )
      values ($1, 'open', $2, $2)
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

function nextDateString(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function getOperationalFundBatchesPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const clauses = ['1=1'];
  const params = [];
  if (options.status) {
    params.push(options.status);
    clauses.push(`batch.status = $${params.length}`);
  }
  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`batch.batch_date >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`batch.batch_date <= $${params.length}`);
  }
  const whereSql = `where ${clauses.join(' and ')}`;
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total] = await Promise.all([
    query(
      `
        ${operationalFundBatchSelect()}
        ${whereSql}
        group by batch.id
        order by batch.batch_date desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from operational_fund_batches batch
        ${whereSql}
      `,
      params,
    ),
  ]);
  const totalRows = Number(total.rows[0]?.total || 0);
  return {
    rows: rows.rows.map(mapOperationalFundBatchRow),
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
  };
}

export async function closeOperationalFundBatchRecord(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query('select id, status from operational_fund_batches where id = $1 for update', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Batch rekening dropping tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'OPERATIONAL_FUND_BATCH_NOT_FOUND';
      throw error;
    }
    if (existing.rows[0].status === 'closed') {
      const error = new Error('Batch rekening dropping sudah ditutup.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_FUND_BATCH_ALREADY_CLOSED';
      throw error;
    }

    const pending = await client.query(
      `
        select count(*)::int as total
        from operational_fund_transactions oft
        left join container_job_expenses expense on expense.id = oft.container_job_expense_id
        left join container_job_expenses admin_expense
          on oft.source = 'container_job_expense_admin_fee'
          and admin_expense.id = case
            when oft.source_ref_id ~ '^admin-transfer:[0-9a-fA-F-]{36}$'
              then split_part(oft.source_ref_id, ':', 2)::uuid
            else null
          end
        where oft.batch_id = $1
          and oft.status = 'posted'
          and oft.transaction_type = 'debit'
          and coalesce(expense.id, admin_expense.id) is not null
          and coalesce(expense.finance_check_status, admin_expense.finance_check_status, 'belum_dicek') <> 'sudah_dicek'
      `,
      [id],
    );
    if (Number(pending.rows[0]?.total || 0) > 0) {
      const error = new Error('Batch belum bisa ditutup karena masih ada uang keluar yang belum valid.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_FUND_BATCH_HAS_UNCHECKED_DEBIT';
      throw error;
    }

    await client.query(
      `
        update operational_fund_batches
        set status = 'closed',
            closed_by_name = $1,
            closed_at = now(),
            close_note = $2,
            updated_by_name = $1,
            updated_at = now()
        where id = $3
      `,
      [payload.actorName || 'Finance', payload.closeNote || null, id],
    );

    const result = await client.query(
      `
        ${operationalFundBatchSelect()}
        where batch.id = $1
        group by batch.id
        limit 1
      `,
      [id],
    );
    const closedBatch = mapOperationalFundBatchRow(result.rows[0]);
    if (closedBatch.balance > 0) {
      const nextBatchDate = nextDateString(closedBatch.batchDate);
      const nextBatch = await ensureOperationalFundBatch(client, nextBatchDate, payload.actorName || 'Finance');
      await client.query(
        `
          insert into operational_fund_transactions (
            batch_id,
            transaction_date,
            transaction_type,
            category,
            amount,
            description,
            top_name,
            source,
            source_ref_id,
            created_by_name,
            updated_by_name
          )
          values ($1, $2, 'credit', 'saldo_awal', $3, $4, $5, 'batch_carry_forward', $6, $5, $5)
          on conflict (source_ref_id)
            where source = 'batch_carry_forward'
              and status = 'posted'
          do update set
            batch_id = excluded.batch_id,
            transaction_date = excluded.transaction_date,
            amount = excluded.amount,
            description = excluded.description,
            top_name = excluded.top_name,
            updated_by_name = excluded.updated_by_name,
            updated_at = now()
        `,
        [
          nextBatch.id,
          nextBatchDate,
          closedBatch.balance,
          `Saldo awal dari batch ${closedBatch.batchDate}`,
          payload.actorName || 'Finance',
          closedBatch.id,
        ],
      );
    }
    return closedBatch;
  });
}

// Buka kembali batch yang sudah ditutup (Admin-only, alasan wajib divalidasi di service layer).
// Baris ini TIDAK dihapus/diedit langsung -- status dikembalikan ke 'open' dan closed_at/closed_by_name/
// close_note dikosongkan supaya tampilannya konsisten dengan batch open biasa; riwayat siapa yang
// membuka kembali dan alasannya tercatat di activity log, bukan kolom tabel ini.
// Kalau batch ini pernah membawa sisa saldo ke batch besok (carry-forward) saat ditutup, transaksi
// carry-forward itu di-void supaya saldo tidak dobel terhitung -- tapi ditolak kalau batch besok
// itu SENDIRI sudah ditutup, karena membatalkannya diam-diam akan mengubah saldo batch yang
// seharusnya sudah final.
export async function reopenOperationalFundBatchRecord(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'select id, batch_date, status, closed_at, closed_by_name from operational_fund_batches where id = $1 for update',
      [id],
    );
    if (!existing.rows[0]) {
      const error = new Error('Batch rekening dropping tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'OPERATIONAL_FUND_BATCH_NOT_FOUND';
      throw error;
    }
    if (existing.rows[0].status !== 'closed') {
      const error = new Error('Batch rekening dropping ini belum ditutup.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_FUND_BATCH_NOT_CLOSED';
      throw error;
    }

    const carryForward = await client.query(
      `
        select oft.id, oft.batch_id, oft.amount, nb.batch_date, nb.status as next_batch_status
        from operational_fund_transactions oft
        join operational_fund_batches nb on nb.id = oft.batch_id
        where oft.source = 'batch_carry_forward'
          and oft.source_ref_id = $1
          and oft.status = 'posted'
        for update of oft
      `,
      [id],
    );
    const carryForwardRow = carryForward.rows[0];
    if (carryForwardRow && carryForwardRow.next_batch_status === 'closed') {
      const error = new Error(
        `Batch ini tidak bisa dibuka lagi karena sisa saldonya sudah mengalir ke batch tanggal ${carryForwardRow.batch_date} yang sudah ditutup. Buka dulu batch tanggal tersebut sebelum membuka batch ini.`,
      );
      error.statusCode = 409;
      error.code = 'OPERATIONAL_FUND_BATCH_CARRY_FORWARD_LOCKED';
      throw error;
    }
    if (carryForwardRow) {
      await client.query(
        `
          update operational_fund_transactions
          set status = 'void',
              updated_by_name = $1,
              updated_at = now()
          where id = $2
        `,
        [payload.actorName || 'Admin', carryForwardRow.id],
      );
    }

    await client.query(
      `
        update operational_fund_batches
        set status = 'open',
            closed_by_name = null,
            closed_at = null,
            close_note = null,
            updated_by_name = $1,
            updated_at = now()
        where id = $2
      `,
      [payload.actorName || 'Admin', id],
    );

    const result = await client.query(
      `
        ${operationalFundBatchSelect()}
        where batch.id = $1
        group by batch.id
        limit 1
      `,
      [id],
    );
    return {
      batch: mapOperationalFundBatchRow(result.rows[0]),
      previousClosedAt: existing.rows[0].closed_at,
      previousClosedByName: existing.rows[0].closed_by_name || '',
      carryForwardVoided: Boolean(carryForwardRow),
      carryForwardAmount: carryForwardRow ? Number(carryForwardRow.amount) : 0,
    };
  });
}

function buildOperationalFundRequestFilters(options = {}) {
  const clauses = ['1=1'];
  const params = [];
  if (options.status) {
    params.push(options.status);
    clauses.push(`ofr.status = $${params.length}`);
  }
  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`ofr.request_date >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`ofr.request_date <= $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      ofr.purpose ilike $${params.length}
      or ofr.requested_by_name ilike $${params.length}
      or ofr.reviewed_by_name ilike $${params.length}
      or ofr.transfer_uploaded_by_name ilike $${params.length}
    )`);
  }
  return { whereSql: `where ${clauses.join(' and ')}`, params };
}

export async function getOperationalFundRequestsPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildOperationalFundRequestFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${operationalFundRequestSelect()}
        ${whereSql}
        order by ofr.request_date desc, ofr.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from operational_fund_requests ofr
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        select
          count(*) filter (where status = 'submitted')::int as submitted,
          count(*) filter (where status = 'approved')::int as approved,
          count(*) filter (where status = 'transferred')::int as transferred,
          count(*) filter (where status = 'rejected')::int as rejected,
          coalesce(sum(amount) filter (where status in ('approved', 'transferred')), 0)::numeric as approved_amount,
          coalesce(sum(amount) filter (where status = 'transferred'), 0)::numeric as transferred_amount
        from operational_fund_requests ofr
        ${whereSql}
      `,
      params,
    ),
  ]);

  const totalRows = Number(total.rows[0]?.total || 0);
  return {
    rows: rows.rows.map(mapOperationalFundRequestRow),
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
    summary: {
      submitted: Number(summary.rows[0]?.submitted || 0),
      approved: Number(summary.rows[0]?.approved || 0),
      transferred: Number(summary.rows[0]?.transferred || 0),
      rejected: Number(summary.rows[0]?.rejected || 0),
      approvedAmount: Number(summary.rows[0]?.approved_amount || 0),
      transferredAmount: Number(summary.rows[0]?.transferred_amount || 0),
    },
  };
}

async function getOperationalFundRequestById(client, id) {
  const result = await client.query(
    `
      ${operationalFundRequestSelect()}
      where ofr.id = $1
      limit 1
    `,
    [id],
  );
  return result.rows[0] ? mapOperationalFundRequestRow(result.rows[0]) : null;
}

export async function createOperationalFundRequestRecord(payload = {}) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        insert into operational_fund_requests (
          request_date,
          amount,
          purpose,
          requested_by_name,
          created_by_name,
          updated_by_name
        )
        values ($1, $2, $3, $4, $4, $4)
        returning id
      `,
      [
        payload.requestDate,
        payload.amount,
        payload.purpose || null,
        payload.actorName || 'Operational',
      ],
    );
    return getOperationalFundRequestById(client, result.rows[0].id);
  });
}

export async function depositOperationalFundRecord(payload = {}) {
  return withTransaction(async (client) => {
    const batch = await ensureOperationalFundBatch(client, payload.requestDate, payload.actorName || 'Finance');
    const result = await client.query(
      `
        insert into operational_fund_transactions (
          id,
          batch_id,
          transaction_date,
          transaction_type,
          category,
          amount,
          description,
          proof_attachment_id,
          top_name,
          source,
          source_ref_id,
          created_by_name,
          updated_by_name
        )
        values ($1, $2, $3, 'credit', 'deposit_saldo', $4, $5, $6, $7, 'finance_deposit', $8, $7, $7)
        returning id, transaction_date, amount, description, proof_attachment_id, top_name, created_at, updated_at
      `,
      [
        payload.id,
        batch.id,
        payload.requestDate,
        payload.amount,
        payload.purpose || 'Deposit saldo operasional harian dari Finance',
        payload.proofAttachmentId,
        payload.actorName || 'Finance',
        String(payload.id),
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      batchId: batch.id,
      batchDate: batch.batch_date,
      requestDate: row.transaction_date,
      amount: Number(row.amount || 0),
      purpose: row.description || '',
      status: 'transferred',
      transferProofFile: row.proof_attachment_id ? { id: row.proof_attachment_id, path: row.proof_attachment_id } : null,
      requestedBy: row.top_name || '',
      reviewedBy: row.top_name || '',
      transferUploadedBy: row.top_name || '',
      createdByName: row.top_name || '',
      updatedByName: row.top_name || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function approveOperationalFundRequestRecord(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query('select id, status from operational_fund_requests where id = $1', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan saldo operasional tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'OPERATIONAL_FUND_REQUEST_NOT_FOUND';
      throw error;
    }
    if (!['submitted', 'rejected'].includes(existing.rows[0].status)) {
      const error = new Error('Pengajuan saldo hanya bisa disetujui saat menunggu review atau setelah ditolak.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_FUND_APPROVAL_INVALID_STATUS';
      throw error;
    }

    await client.query(
      `
        update operational_fund_requests
        set status = 'approved',
            reviewed_by_name = $1,
            reviewed_at = now(),
            rejection_note = null,
            updated_by_name = $1,
            updated_at = now()
        where id = $2
      `,
      [payload.actorName || 'Finance', id],
    );
    return getOperationalFundRequestById(client, id);
  });
}

export async function rejectOperationalFundRequestRecord(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query('select id, status from operational_fund_requests where id = $1', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan saldo operasional tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'OPERATIONAL_FUND_REQUEST_NOT_FOUND';
      throw error;
    }
    if (!['submitted', 'approved'].includes(existing.rows[0].status)) {
      const error = new Error('Pengajuan saldo hanya bisa ditolak saat menunggu review atau sudah disetujui.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_FUND_REJECTION_INVALID_STATUS';
      throw error;
    }

    await client.query(
      `
        update operational_fund_requests
        set status = 'rejected',
            reviewed_by_name = $1,
            reviewed_at = now(),
            rejection_note = $2,
            updated_by_name = $1,
            updated_at = now()
        where id = $3
      `,
      [payload.actorName || 'Finance', payload.rejectionNote, id],
    );
    return getOperationalFundRequestById(client, id);
  });
}

export async function markOperationalFundTransferUploadedRecord(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'select id, request_date, amount, status from operational_fund_requests where id = $1',
      [id],
    );
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan saldo operasional tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'OPERATIONAL_FUND_REQUEST_NOT_FOUND';
      throw error;
    }
    if (!['approved', 'transferred'].includes(existing.rows[0].status)) {
      const error = new Error('Bukti transfer hanya bisa diupload setelah saldo disetujui Finance.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_FUND_TRANSFER_INVALID_STATUS';
      throw error;
    }
    const batch = await ensureOperationalFundBatch(client, existing.rows[0].request_date, payload.actorName || 'Finance');

    await client.query(
      `
        update operational_fund_requests
        set status = 'transferred',
            transfer_uploaded_by_name = $1,
            transfer_uploaded_at = now(),
            transfer_proof_attachment_id = coalesce($2, transfer_proof_attachment_id),
            updated_by_name = $1,
            updated_at = now()
        where id = $3
      `,
      [payload.actorName || 'Finance', payload.transferProofAttachmentId || null, id],
    );

    const existingTransaction = await client.query(
      `
        update operational_fund_transactions
        set batch_id = $2,
            transaction_date = $3,
            category = 'deposit_saldo',
            amount = $4,
            description = $5,
            proof_attachment_id = $6,
            top_name = $7,
            source = 'finance_deposit',
            source_ref_id = $8,
            updated_by_name = $7,
            updated_at = now()
        where fund_request_id = $1
          and category in ('dropping_in', 'deposit_saldo')
          and status = 'posted'
        returning id
      `,
      [
        id,
        batch.id,
        existing.rows[0].request_date,
        existing.rows[0].amount,
        'Transfer saldo operasional harian dari Finance',
        payload.transferProofAttachmentId || null,
        payload.actorName || 'Finance',
        String(id),
      ],
    );

    if (!existingTransaction.rows[0]) {
      await client.query(
        `
          insert into operational_fund_transactions (
            fund_request_id,
            batch_id,
            transaction_date,
            transaction_type,
            category,
            amount,
            description,
            proof_attachment_id,
            top_name,
            source,
            source_ref_id,
            created_by_name,
            updated_by_name
          )
          values ($1, $2, $3, 'credit', 'deposit_saldo', $4, $5, $6, $7, 'finance_deposit', $8, $7, $7)
        `,
        [
          id,
          batch.id,
          existing.rows[0].request_date,
          existing.rows[0].amount,
          'Transfer saldo operasional harian dari Finance',
          payload.transferProofAttachmentId || null,
          payload.actorName || 'Finance',
          String(id),
        ],
      );
    }

    return getOperationalFundRequestById(client, id);
  });
}

function mapOperationalFundTransactionRow(row) {
  const transferProofs = (Array.isArray(row.transfer_proofs) ? row.transfer_proofs : []).map((proof) => ({
    id: proof.id,
    name: proof.name || '',
    size: Number(proof.size || 0),
    type: proof.type || '',
    path: proof.id,
    storagePath: proof.storagePath || '',
  }));
  const proofAttachment = row.proof_attachment_id
    ? {
        id: row.proof_attachment_id,
        name: row.proof_file_name || '',
        size: row.proof_file_size == null ? 0 : Number(row.proof_file_size),
        type: row.proof_mime_type || '',
        path: row.proof_attachment_id,
        storagePath: row.proof_storage_path || '',
      }
    : (transferProofs[0] || null);

  return {
    id: row.id,
    batchId: row.batch_id || '',
    batchDate: row.batch_date || row.transaction_date,
    batchStatus: row.batch_status || 'open',
    fundRequestId: row.fund_request_id || '',
    containerJobId: row.container_job_id || '',
    containerJobExpenseId: row.container_job_expense_id || '',
    transactionDate: row.transaction_date,
    transactionType: row.transaction_type,
    category: row.category,
    amount: Number(row.amount || 0),
    description: row.description || '',
    topName: row.top_name || '',
    driverName: row.driver_name || '',
    doNumber: row.do_number || '',
    customerName: row.customer_name || '',
    moneyIn: Number(row.money_in || 0),
    moneyOut: Number(row.money_out || 0),
    runningBalance: Number(row.running_balance || 0),
    status: row.status || 'posted',
    proofAttachmentId: row.proof_attachment_id || '',
    proofAttachment,
    transferProofs,
    requestDate: row.request_date || null,
    soNumber: getDisplayFinanceSoNumber(row),
    customer: row.customer_name || '',
    destination: row.destination || '',
    containerNumber: row.container_number || '',
    expenseCategory: row.expense_category || '',
    expensePaymentStatus: row.expense_payment_status || '',
    financeCheckStatus: row.finance_check_status || '',
    source: row.source || 'manual',
    sourceRefId: row.source_ref_id || '',
    expenseGroup: row.expense_group || '',
    inputSource: row.input_source || '',
    createdByName: row.created_by_name || '',
    updatedByName: row.updated_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function operationalFundTransactionSelect() {
  return `
    select
      oft.*,
      batch.batch_date,
      batch.status as batch_status,
      ofr.request_date,
      coalesce(so.accurate_so_number, so.so_number) as so_number,
      coalesce(oft.top_name, oft.created_by_name, '') as top_name,
      coalesce(oft.driver_name, expense.recipient_name, cj.assignment_snapshot->>'driver', '') as driver_name,
      coalesce(oft.do_number, so.do_number, cj.destination, '') as do_number,
      coalesce(oft.customer_name, so.customer_name, '') as customer_name,
      cj.destination,
      cj.container_number,
      expense.category as expense_category,
      expense.expense_group,
      expense.input_source,
      expense.payment_status as expense_payment_status,
      expense.finance_check_status,
      case when oft.transaction_type = 'credit' then oft.amount else 0 end as money_in,
      case when oft.transaction_type = 'debit' then oft.amount else 0 end as money_out,
      (
        select coalesce(sum(
          case
            when previous_oft.transaction_type = 'credit' then previous_oft.amount
            when previous_oft.transaction_type = 'debit' then -previous_oft.amount
            when previous_oft.transaction_type = 'adjustment' then previous_oft.amount
            else 0
          end
        ), 0)::numeric
        from operational_fund_transactions previous_oft
        where previous_oft.status = 'posted'
          and (
            (oft.batch_id is not null and previous_oft.batch_id = oft.batch_id)
            or (oft.batch_id is null and previous_oft.batch_id is null)
          )
          and (
            previous_oft.transaction_date < oft.transaction_date
            or (
              previous_oft.transaction_date = oft.transaction_date
              and previous_oft.created_at < oft.created_at
            )
            or (
              previous_oft.transaction_date = oft.transaction_date
              and previous_oft.created_at = oft.created_at
              and previous_oft.id <= oft.id
            )
          )
      ) as running_balance,
      proof.file_name as proof_file_name,
      proof.mime_type as proof_mime_type,
      proof.file_size as proof_file_size,
      proof.storage_path as proof_storage_path,
      coalesce(expense_proofs.transfer_proofs, '[]'::jsonb) as transfer_proofs
    from operational_fund_transactions oft
    left join operational_fund_batches batch on batch.id = oft.batch_id
    left join operational_fund_requests ofr on ofr.id = oft.fund_request_id
    left join container_job_expenses expense on expense.id = oft.container_job_expense_id
    left join container_jobs cj on cj.id = coalesce(oft.container_job_id, expense.container_job_id)
    left join sales_orders so on so.id = cj.sales_order_id
    left join attachments proof on proof.id = oft.proof_attachment_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', attachment.id,
          'name', attachment.file_name,
          'size', attachment.file_size,
          'type', attachment.mime_type,
          'storagePath', attachment.storage_path
        ) order by item.created_at asc, item.id asc
      ) as transfer_proofs
      from container_job_expense_transfer_proofs item
      join attachments attachment on attachment.id = item.attachment_id
      where item.container_job_expense_id = oft.container_job_expense_id
    ) expense_proofs on true
  `;
}

function buildOperationalFundTransactionFilters(options = {}) {
  const clauses = ['1=1'];
  const params = [];
  const status = options.status || 'posted';
  if (status !== 'all') {
    params.push(status);
    clauses.push(`oft.status = $${params.length}`);
  }
  if (options.transactionType) {
    params.push(options.transactionType);
    clauses.push(`oft.transaction_type = $${params.length}`);
  }
  if (options.category) {
    params.push(options.category);
    clauses.push(`oft.category = $${params.length}`);
  }
  if (options.batchId) {
    params.push(options.batchId);
    clauses.push(`oft.batch_id = $${params.length}`);
  }
  if (options.batchDate) {
    params.push(options.batchDate);
    clauses.push(`coalesce(batch.batch_date, oft.transaction_date) = $${params.length}`);
  }
  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`oft.transaction_date >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`oft.transaction_date <= $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      oft.description ilike $${params.length}
      or oft.top_name ilike $${params.length}
      or oft.driver_name ilike $${params.length}
      or oft.do_number ilike $${params.length}
      or oft.customer_name ilike $${params.length}
      or oft.created_by_name ilike $${params.length}
      or ofr.purpose ilike $${params.length}
      or so.so_number ilike $${params.length}
      or so.accurate_so_number ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or cj.destination ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or expense.description ilike $${params.length}
    )`);
  }
  return { whereSql: `where ${clauses.join(' and ')}`, params };
}

export async function getOperationalFundTransactionsPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildOperationalFundTransactionFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${operationalFundTransactionSelect()}
        ${whereSql}
        order by oft.transaction_date desc, oft.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from operational_fund_transactions oft
        left join operational_fund_batches batch on batch.id = oft.batch_id
        left join operational_fund_requests ofr on ofr.id = oft.fund_request_id
        left join container_job_expenses expense on expense.id = oft.container_job_expense_id
        left join container_jobs cj on cj.id = coalesce(oft.container_job_id, expense.container_job_id)
        left join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        select
          coalesce(sum(oft.amount) filter (where oft.transaction_type = 'credit' and oft.status = 'posted'), 0)::numeric as total_credit,
          coalesce(sum(oft.amount) filter (where oft.transaction_type = 'debit' and oft.status = 'posted'), 0)::numeric as total_debit,
          coalesce(sum(oft.amount) filter (where oft.transaction_type = 'adjustment' and oft.status = 'posted'), 0)::numeric as total_adjustment,
          count(*) filter (where oft.transaction_type = 'credit')::int as credit_count,
          count(*) filter (where oft.transaction_type = 'debit')::int as debit_count,
          count(*) filter (where oft.status = 'void')::int as void_count
        from operational_fund_transactions oft
        left join operational_fund_batches batch on batch.id = oft.batch_id
        left join operational_fund_requests ofr on ofr.id = oft.fund_request_id
        left join container_job_expenses expense on expense.id = oft.container_job_expense_id
        left join container_jobs cj on cj.id = coalesce(oft.container_job_id, expense.container_job_id)
        left join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
  ]);

  const totalRows = Number(total.rows[0]?.total || 0);
  const totalCredit = Number(summary.rows[0]?.total_credit || 0);
  const totalDebit = Number(summary.rows[0]?.total_debit || 0);
  const totalAdjustment = Number(summary.rows[0]?.total_adjustment || 0);
  return {
    rows: rows.rows.map(mapOperationalFundTransactionRow),
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
    summary: {
      totalCredit,
      totalDebit,
      totalAdjustment,
      balance: totalCredit - totalDebit + totalAdjustment,
      creditCount: Number(summary.rows[0]?.credit_count || 0),
      debitCount: Number(summary.rows[0]?.debit_count || 0),
      voidCount: Number(summary.rows[0]?.void_count || 0),
    },
  };
}

function mapFinanceContainerJobExpenseRow(row) {
  const proofAttachment = row.proof_attachment_id
    ? {
        id: row.proof_attachment_id,
        name: row.proof_file_name || '',
        size: row.proof_file_size == null ? 0 : Number(row.proof_file_size),
        type: row.proof_mime_type || '',
        path: row.proof_attachment_id,
        storagePath: row.proof_storage_path || '',
      }
    : null;

  return {
    id: row.id,
    salesOrderId: row.sales_order_id || '',
    containerJobId: row.container_job_id || '',
    soNumber: getDisplayFinanceSoNumber(row),
    internalSoNumber: getDisplayOrderNumber(row),
    accurateSoNumber: row.accurate_so_number || '',
    customer: row.customer_name || '',
    destination: row.destination || '',
    tripDate: row.trip_date || null,
    containerNumber: row.container_number || '',
    containerSize: row.container_size || '',
    jobStatus: row.job_status || '',
    driverName: row.driver_name || '',
    truck: row.truck || '',
    category: row.category || '',
    amount: Number(row.amount || 0),
    description: row.description || '',
    recipientType: row.recipient_type || '',
    recipientName: row.recipient_name || '',
    paymentStatus: row.payment_status || 'belum_dibayar',
    paidAt: row.paid_at || null,
    paidByName: row.paid_by_name || '',
    proofAttachmentId: row.proof_attachment_id || '',
    proofAttachment,
    financeCheckStatus: row.finance_check_status || 'belum_dicek',
    financeCheckedByName: row.finance_checked_by_name || '',
    financeCheckedAt: row.finance_checked_at || null,
    financeNote: row.finance_note || '',
    adminFeeAmount: Number(row.admin_fee_amount || 0),
    adjustmentNote: row.adjustment_note || '',
    normalTransferAmount: Number(row.normal_transfer_amount || 0),
    totalActualTransfer: Number(row.total_actual_transfer || 0),
    adjustmentAmount: Number(row.adjustment_amount || 0),
    transferProofCount: Number(row.transfer_proof_count || 0),
    batchStatus: row.batch_status || 'open',
    source: row.source || 'manual',
    sourceRefId: row.source_ref_id || '',
    expenseGroup: row.expense_group || 'operational',
    inputSource: row.input_source || 'finance',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at || null,
    updatedByName: row.updated_by_name || '',
    updatedAt: row.updated_at || null,
  };
}

function containerJobExpenseReconciliationSelect() {
  return `
    select
      expense.*,
      coalesce(expense.sales_order_id, cj.sales_order_id) as sales_order_id,
      coalesce(so.accurate_so_number, so.so_number) as so_number,
      so.so_number as internal_so_number,
      so.accurate_so_number,
      so.customer_name,
      cj.destination,
      so.trip_date,
      cj.container_number,
      cj.container_size,
      cj.status as job_status,
      cj.assignment_snapshot->>'driver' as driver_name,
      cj.assignment_snapshot->>'plateNumber' as truck,
      proof.file_name as proof_file_name,
      proof.mime_type as proof_mime_type,
      proof.file_size as proof_file_size,
      proof.storage_path as proof_storage_path,
      greatest(expense.amount - coalesce(expense.admin_fee_amount, 0), 0) as normal_transfer_amount,
      coalesce(transfer_proofs.total_actual_transfer, 0) as total_actual_transfer,
      coalesce(transfer_proofs.total_actual_transfer, 0)
        - greatest(expense.amount - coalesce(expense.admin_fee_amount, 0), 0) as adjustment_amount,
      coalesce(transfer_proofs.transfer_proof_count, 0) as transfer_proof_count
      , coalesce(expense_batch.batch_status, 'open') as batch_status
    from container_job_expenses expense
    join container_jobs cj on cj.id = expense.container_job_id
    join sales_orders so on so.id = cj.sales_order_id
    left join attachments proof on proof.id = expense.proof_attachment_id
    left join lateral (
      select coalesce(sum(item.amount), 0)::numeric as total_actual_transfer,
             count(*)::int as transfer_proof_count
      from container_job_expense_transfer_proofs item
      where item.container_job_expense_id = expense.id
    ) transfer_proofs on true
    left join lateral (
      select batch.status as batch_status
      from operational_fund_transactions transaction
      join operational_fund_batches batch on batch.id = transaction.batch_id
      where transaction.container_job_expense_id = expense.id
        and transaction.transaction_type = 'debit'
        and transaction.status = 'posted'
      order by transaction.created_at asc
      limit 1
    ) expense_batch on true
  `;
}

function buildContainerJobExpenseFilters(options = {}) {
  const clauses = ['1=1'];
  const params = [];
  if (options.financeCheckStatus === 'open') {
    clauses.push(`(
      expense.finance_check_status in ('belum_dicek', 'dikoreksi')
      or (
        expense.finance_check_status = 'sudah_dicek'
        and coalesce((
          select batch.status
          from operational_fund_transactions transaction
          join operational_fund_batches batch on batch.id = transaction.batch_id
          where transaction.container_job_expense_id = expense.id
            and transaction.transaction_type = 'debit'
            and transaction.status = 'posted'
          order by transaction.created_at asc
          limit 1
        ), 'open') = 'open'
      )
    )`);
  } else if (options.financeCheckStatus) {
    params.push(options.financeCheckStatus);
    clauses.push(`expense.finance_check_status = $${params.length}`);
  }
  if (options.paymentStatus) {
    params.push(options.paymentStatus);
    clauses.push(`expense.payment_status = $${params.length}`);
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
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.accurate_so_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or cj.destination ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
      or expense.description ilike $${params.length}
      or expense.recipient_name ilike $${params.length}
    )`);
  }
  return { whereSql: `where ${clauses.join(' and ')}`, params };
}

export async function getContainerJobExpensesReconciliationPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildContainerJobExpenseFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${containerJobExpenseReconciliationSelect()}
        ${whereSql}
        order by coalesce(expense.paid_at, expense.created_at) desc, expense.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from container_job_expenses expense
        join container_jobs cj on cj.id = expense.container_job_id
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        select
          count(*) filter (where expense.finance_check_status = 'belum_dicek')::int as belum_dicek,
          count(*) filter (where expense.finance_check_status = 'sudah_dicek')::int as sudah_dicek,
          count(*) filter (where expense.finance_check_status = 'perlu_klarifikasi')::int as perlu_klarifikasi,
          count(*) filter (where expense.finance_check_status = 'dikoreksi')::int as dikoreksi,
          coalesce(sum(expense.amount), 0)::numeric as total_amount,
          coalesce(sum(expense.amount) filter (where expense.finance_check_status in ('belum_dicek', 'dikoreksi')), 0)::numeric as pending_amount
        from container_job_expenses expense
        join container_jobs cj on cj.id = expense.container_job_id
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
  ]);

  const totalRows = Number(total.rows[0]?.total || 0);
  return {
    rows: rows.rows.map(mapFinanceContainerJobExpenseRow),
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
    summary: {
      belumDicek: Number(summary.rows[0]?.belum_dicek || 0),
      sudahDicek: Number(summary.rows[0]?.sudah_dicek || 0),
      perluKlarifikasi: Number(summary.rows[0]?.perlu_klarifikasi || 0),
      dikoreksi: Number(summary.rows[0]?.dikoreksi || 0),
      totalAmount: Number(summary.rows[0]?.total_amount || 0),
      pendingAmount: Number(summary.rows[0]?.pending_amount || 0),
    },
  };
}

async function getContainerJobExpenseReconciliationById(client, id) {
  const result = await client.query(
    `
      ${containerJobExpenseReconciliationSelect()}
      where expense.id = $1
      limit 1
    `,
    [id],
  );
  return result.rows[0] ? mapFinanceContainerJobExpenseRow(result.rows[0]) : null;
}

export async function reconcileContainerJobExpenseRecord(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `select id, container_job_id, category, amount, description, recipient_name, payment_status,
              paid_at, created_at, proof_attachment_id, source, source_ref_id
       from container_job_expenses where id = $1`,
      [id],
    );
    if (!existing.rows[0]) {
      const error = new Error('Transaksi biaya container job tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_EXPENSE_NOT_FOUND';
      throw error;
    }
    const existingExpense = existing.rows[0];
    const proofAttachmentId = payload.proofAttachmentId || existingExpense.proof_attachment_id || null;
    const proofSummary = await client.query(
      `select coalesce(sum(amount), 0)::numeric as total_actual_transfer, count(*)::int as proof_count
       from container_job_expense_transfer_proofs where container_job_expense_id = $1`,
      [id],
    );
    const transferProofTotal = Number(proofSummary.rows[0]?.total_actual_transfer || 0);
    const transferProofCount = Number(proofSummary.rows[0]?.proof_count || 0);
    const totalActualTransfer = transferProofCount > 0
      ? transferProofTotal
      : (proofAttachmentId ? Number(existingExpense.amount || 0) : 0);
    const adminFeeAmount = Number(payload.adminFeeAmount || 0);
    const normalTransferAmount = Math.max(0, Number(existingExpense.amount || 0) - adminFeeAmount);
    const adjustmentAmount = totalActualTransfer - normalTransferAmount;
    if (payload.financeCheckStatus === 'sudah_dicek' && existingExpense.payment_status === 'sudah_dibayar' && !proofAttachmentId && transferProofCount === 0) {
      const error = new Error('Bukti pembayaran wajib diupload Finance sebelum transaksi ditandai sudah dicek.');
      error.statusCode = 400;
      error.code = 'CONTAINER_JOB_EXPENSE_PROOF_REQUIRED';
      throw error;
    }

    const batchResult = await client.query(
      `
        select
          oft.id as transaction_id,
          oft.amount as transaction_amount,
          batch.id as batch_id,
          batch.status,
          oft.transaction_date,
          oft.container_job_id,
          oft.description,
          oft.top_name,
          oft.driver_name,
          oft.do_number,
          oft.customer_name
        from operational_fund_transactions oft
        join operational_fund_batches batch on batch.id = oft.batch_id
        where (
            oft.container_job_expense_id = $1
            or (
              oft.container_job_expense_id is null
              and oft.source = $2
              and oft.source_ref_id = $3
            )
          )
          and oft.transaction_type = 'debit'
          and oft.status = 'posted'
        order by case when oft.container_job_expense_id = $1 then 0 else 1 end, oft.created_at asc
        limit 1
        for update of batch
      `,
      [id, existingExpense.source, existingExpense.source_ref_id],
    );
    if (batchResult.rows[0]?.status === 'closed') {
      const error = new Error('Batch rekening dropping biaya ini sudah ditutup. Status cek tidak bisa diubah lagi.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_FUND_BATCH_CLOSED';
      throw error;
    }
    const adminFeeSourceRefId = `admin-transfer:${id}`;
    const existingAdminFee = payload.financeCheckStatus === 'sudah_dicek'
      ? await client.query(
          `select id, amount
           from operational_fund_transactions
           where source = 'container_job_expense_admin_fee'
             and source_ref_id = $1
             and status = 'posted'
           limit 1`,
          [adminFeeSourceRefId],
        )
      : { rows: [] };
    if (payload.financeCheckStatus === 'sudah_dicek') {
      let mainTransaction = batchResult.rows[0];
      if (!mainTransaction?.transaction_id) {
        const transactionDate = existingExpense.paid_at || existingExpense.created_at;
        const batch = await ensureOperationalFundBatch(client, transactionDate, payload.actorName || 'Finance');
        mainTransaction = {
          transaction_id: null,
          transaction_amount: 0,
          batch_id: batch.id,
          status: batch.status,
          transaction_date: transactionDate,
          container_job_id: existingExpense.container_job_id,
          description: existingExpense.description,
          top_name: payload.actorName || 'Finance',
          driver_name: existingExpense.recipient_name,
          do_number: null,
          customer_name: null,
        };
      }
      const balance = await client.query(
        `select coalesce(sum(case when transaction_type = 'credit' then amount when transaction_type = 'debit' then -amount when transaction_type = 'adjustment' then amount else 0 end), 0)::numeric as balance
         from operational_fund_transactions where batch_id = $1 and status = 'posted'`,
        [mainTransaction.batch_id],
      );
      const existingAmount = Number(mainTransaction.transaction_amount || 0);
      const existingAdminAmount = Number(existingAdminFee.rows[0]?.amount || 0);
      if (Number(balance.rows[0]?.balance || 0) + existingAmount + existingAdminAmount < totalActualTransfer + adminFeeAmount) {
        const error = new Error('Saldo rekening dropping tidak cukup untuk menyesuaikan total transfer aktual.');
        error.statusCode = 409;
        error.code = 'OPERATIONAL_FUND_BALANCE_INSUFFICIENT';
        throw error;
      }
      if (mainTransaction.transaction_id) {
        await client.query(
          `update operational_fund_transactions
           set container_job_expense_id = $1,
               amount = $2,
               updated_by_name = $3,
               updated_at = now()
           where id = $4`,
          [id, totalActualTransfer, payload.actorName || 'Finance', mainTransaction.transaction_id],
        );
      } else {
        const inserted = await client.query(
          `insert into operational_fund_transactions (
             batch_id, container_job_id, container_job_expense_id, transaction_date,
             transaction_type, category, amount, description, top_name, driver_name,
             source, source_ref_id, created_by_name, updated_by_name
           )
           values ($1, $2, $3, $4::date, 'debit', $5, $6, $7, $8, $9, $10, $11, $8, $8)
           on conflict (container_job_expense_id)
             where container_job_expense_id is not null
               and transaction_type = 'debit'
               and status = 'posted'
           do update set
             amount = excluded.amount,
             updated_by_name = excluded.updated_by_name,
             updated_at = now()
           returning id`,
          [
            mainTransaction.batch_id,
            existingExpense.container_job_id,
            id,
            mainTransaction.transaction_date,
            'container_job_expense',
            totalActualTransfer,
            existingExpense.description || 'Biaya rekening dropping',
            payload.actorName || 'Finance',
            existingExpense.recipient_name || null,
            existingExpense.source,
            existingExpense.source_ref_id,
          ],
        );
        mainTransaction.transaction_id = inserted.rows[0].id;
      }
      batchResult.rows[0] = mainTransaction;
    }

    await client.query(
      `
        update container_job_expenses
        set finance_check_status = $1,
            finance_checked_by_name = $2,
            finance_checked_at = now(),
            finance_note = $3,
            proof_attachment_id = coalesce($4, proof_attachment_id),
            admin_fee_amount = $5,
            adjustment_note = $6,
            updated_by_name = $2,
            updated_at = now()
        where id = $7
      `,
      [
        payload.financeCheckStatus,
        payload.actorName || 'Finance',
        payload.financeNote || null,
        payload.proofAttachmentId || null,
        Number(payload.adminFeeAmount || 0),
        payload.adjustmentNote || null,
        id,
      ],
    );
    if (payload.proofAttachmentId) {
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
        [payload.proofAttachmentId, payload.actorName || 'Finance', id],
      );
    }
    if (payload.financeCheckStatus === 'sudah_dicek') {
      if (adminFeeAmount === 0) {
        if (existingAdminFee.rows[0]) {
          await client.query(
            `update operational_fund_transactions
             set status = 'void',
                 description = concat(description, ' - dibatalkan saat edit validasi'),
                 updated_by_name = $1,
                 updated_at = now()
             where id = $2`,
            [payload.actorName || 'Finance', existingAdminFee.rows[0].id],
          );
        }
        return getContainerJobExpenseReconciliationById(client, id);
      }
      const batchRow = batchResult.rows[0];
      if (!batchRow?.batch_id) {
        const error = new Error('Transaksi utama belum masuk batch rekening dropping.');
        error.statusCode = 409;
        error.code = 'OPERATIONAL_FUND_TRANSACTION_NOT_FOUND';
        throw error;
      }
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
        [batchRow.batch_id],
      );
      const existingAdminAmount = Number(existingAdminFee.rows[0]?.amount || 0);
      const currentBalance = Number(balanceResult.rows[0]?.balance || 0);
      if (currentBalance + existingAdminAmount < adminFeeAmount) {
        const error = new Error('Saldo rekening dropping tidak cukup untuk biaya admin transfer.');
        error.statusCode = 409;
        error.code = 'OPERATIONAL_FUND_BALANCE_INSUFFICIENT';
        throw error;
      }
      const description = payload.adminFeeNote
        ? `Admin transfer - ${payload.adminFeeNote}`
        : `Admin transfer - ${batchRow.description || 'Biaya rekening dropping'}`;
      if (existingAdminFee.rows[0]) {
        await client.query(
          `
            update operational_fund_transactions
            set amount = $1,
                description = $2,
                proof_attachment_id = $3,
                updated_by_name = $4,
                updated_at = now()
            where id = $5
          `,
          [
            adminFeeAmount,
            description,
            proofAttachmentId,
            payload.actorName || 'Finance',
            existingAdminFee.rows[0].id,
          ],
        );
      } else {
        await client.query(
          `
            insert into operational_fund_transactions (
              batch_id,
              container_job_id,
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
            values ($1, $2, $3, 'debit', 'lainnya', $4, $5, $6, $7, $8, $9, $10, 'container_job_expense_admin_fee', $11, $12, $12)
          `,
          [
            batchRow.batch_id,
            batchRow.container_job_id || null,
            batchRow.transaction_date,
            adminFeeAmount,
            description,
            proofAttachmentId,
            batchRow.top_name || payload.actorName || 'Finance',
            batchRow.driver_name || null,
            batchRow.do_number || null,
            batchRow.customer_name || null,
            adminFeeSourceRefId,
            payload.actorName || 'Finance',
          ],
        );
      }
    }

    return getContainerJobExpenseReconciliationById(client, id);
  });
}

function mapContainerJobExpenseTransferProof(row) {
  if (!row) return null;
  return {
    id: row.id,
    containerJobExpenseId: row.container_job_expense_id,
    attachmentId: row.attachment_id,
    amount: Number(row.amount || 0),
    transferDate: row.transfer_date,
    note: row.note || '',
    createdByName: row.created_by_name || '',
    updatedByName: row.updated_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachment: {
      id: row.attachment_id,
      name: row.file_name || '',
      size: row.file_size == null ? 0 : Number(row.file_size),
      type: row.mime_type || '',
      path: row.attachment_id,
      storagePath: row.storage_path || '',
    },
  };
}

const containerJobExpenseTransferProofSelect = `
  select
    proof.*,
    attachment.file_name,
    attachment.file_size,
    attachment.mime_type,
    attachment.storage_path
  from container_job_expense_transfer_proofs proof
  join attachments attachment on attachment.id = proof.attachment_id
`;

async function lockOpenExpenseBatch(client, expenseId) {
  const result = await client.query(
    `
      select expense.id, batch.status as batch_status
      from container_job_expenses expense
      left join operational_fund_transactions transaction
        on transaction.container_job_expense_id = expense.id
        and transaction.transaction_type = 'debit'
        and transaction.status = 'posted'
      left join operational_fund_batches batch on batch.id = transaction.batch_id
      where expense.id = $1
      order by transaction.created_at asc
      limit 1
      for update of expense
    `,
    [expenseId],
  );
  if (!result.rows[0]) {
    const error = new Error('Transaksi biaya container job tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'CONTAINER_JOB_EXPENSE_NOT_FOUND';
    throw error;
  }
  if (result.rows[0].batch_status === 'closed') {
    const error = new Error('Batch rekening dropping biaya ini sudah ditutup. Bukti transfer tidak dapat diubah.');
    error.statusCode = 409;
    error.code = 'OPERATIONAL_FUND_BATCH_CLOSED';
    throw error;
  }
}

export async function listContainerJobExpenseTransferProofs(id) {
  const expense = await query('select id from container_job_expenses where id = $1', [id]);
  if (!expense.rows[0]) {
    const error = new Error('Transaksi biaya container job tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'CONTAINER_JOB_EXPENSE_NOT_FOUND';
    throw error;
  }
  const result = await query(
    `${containerJobExpenseTransferProofSelect}
     where proof.container_job_expense_id = $1
     order by proof.transfer_date asc, proof.created_at asc`,
    [id],
  );
  return result.rows.map(mapContainerJobExpenseTransferProof);
}

export async function createContainerJobExpenseTransferProofRecord(id, payload = {}) {
  return withTransaction(async (client) => {
    await lockOpenExpenseBatch(client, id);
    const result = await client.query(
      `
        insert into container_job_expense_transfer_proofs (
          container_job_expense_id, attachment_id, amount, transfer_date, note,
          created_by_name, updated_by_name
        )
        values ($1, $2, $3, $4, $5, $6, $6)
        returning id
      `,
      [id, payload.attachmentId, payload.amount, payload.transferDate, payload.note || null, payload.actorName],
    );
    await client.query(
      `update container_job_expenses
       set proof_attachment_id = coalesce(proof_attachment_id, $1),
           updated_by_name = $2, updated_at = now()
       where id = $3`,
      [payload.attachmentId, payload.actorName, id],
    );
    const saved = await client.query(
      `${containerJobExpenseTransferProofSelect} where proof.id = $1`,
      [result.rows[0].id],
    );
    return mapContainerJobExpenseTransferProof(saved.rows[0]);
  });
}

export async function updateContainerJobExpenseTransferProofRecord(id, proofId, payload = {}) {
  return withTransaction(async (client) => {
    await lockOpenExpenseBatch(client, id);
    const result = await client.query(
      `
        update container_job_expense_transfer_proofs
        set amount = $1, transfer_date = $2, note = $3,
            updated_by_name = $4, updated_at = now()
        where id = $5 and container_job_expense_id = $6
        returning id
      `,
      [payload.amount, payload.transferDate, payload.note || null, payload.actorName, proofId, id],
    );
    if (!result.rows[0]) {
      const error = new Error('Bukti transfer UJ tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_NOT_FOUND';
      throw error;
    }
    if (payload.financeCheckStatus === 'sudah_dicek' && adjustmentAmount !== 0 && !String(payload.adjustmentNote || '').trim()) {
      const error = new Error('Catatan penyesuaian wajib diisi karena total aktual berbeda dari nominal normal.');
      error.statusCode = 400;
      error.code = 'CONTAINER_JOB_EXPENSE_ADJUSTMENT_NOTE_REQUIRED';
      throw error;
    }
    const saved = await client.query(
      `${containerJobExpenseTransferProofSelect} where proof.id = $1`,
      [proofId],
    );
    return mapContainerJobExpenseTransferProof(saved.rows[0]);
  });
}

export async function deleteContainerJobExpenseTransferProofRecord(id, proofId, payload = {}) {
  return withTransaction(async (client) => {
    await lockOpenExpenseBatch(client, id);
    const result = await client.query(
      `delete from container_job_expense_transfer_proofs
       where id = $1 and container_job_expense_id = $2
       returning *`,
      [proofId, id],
    );
    if (!result.rows[0]) {
      const error = new Error('Bukti transfer UJ tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_NOT_FOUND';
      throw error;
    }
    await client.query(
      `
        update container_job_expenses expense
        set proof_attachment_id = (
              select proof.attachment_id
              from container_job_expense_transfer_proofs proof
              where proof.container_job_expense_id = expense.id
              order by proof.transfer_date asc, proof.created_at asc
              limit 1
            ),
            updated_by_name = $1,
            updated_at = now()
        where expense.id = $2 and expense.proof_attachment_id = $3
      `,
      [payload.actorName, id, result.rows[0].attachment_id],
    );
    return mapContainerJobExpenseTransferProof(result.rows[0]);
  });
}

export async function approveRpujRequest(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query('select id, rpuj_status, execution_source from container_jobs where id = $1', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan RPUJ tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'RPUJ_REQUEST_NOT_FOUND';
      throw error;
    }
    if ((existing.rows[0].execution_source || 'internal') === 'vendor') {
      const error = new Error('Ritasi Vendor tidak memiliki pengajuan UJ.');
      error.statusCode = 409;
      error.code = 'RPUJ_VENDOR_FORBIDDEN';
      throw error;
    }
    if (!['submitted', 'rejected'].includes(existing.rows[0].rpuj_status)) {
      const error = new Error('RPUJ hanya bisa disetujui saat menunggu approval atau setelah ditolak.');
      error.statusCode = 409;
      error.code = 'RPUJ_APPROVAL_INVALID_STATUS';
      throw error;
    }

    await client.query(
      `
        update container_jobs
        set rpuj_status = 'approved',
            rpuj_reviewed_by_name = $1,
            rpuj_reviewed_at = now(),
            rpuj_rejection_note = null,
            updated_by_name = $1,
            updated_at = now()
        where id = $2
      `,
      [payload.actorName || 'Finance', id],
    );

    return getRpujRequestById(client, id);
  });
}

export async function rejectRpujRequest(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query('select id, rpuj_status, execution_source from container_jobs where id = $1', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan RPUJ tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'RPUJ_REQUEST_NOT_FOUND';
      throw error;
    }
    if ((existing.rows[0].execution_source || 'internal') === 'vendor') {
      const error = new Error('Ritasi Vendor tidak memiliki pengajuan UJ.');
      error.statusCode = 409;
      error.code = 'RPUJ_VENDOR_FORBIDDEN';
      throw error;
    }
    if (!['submitted', 'approved'].includes(existing.rows[0].rpuj_status)) {
      const error = new Error('RPUJ hanya bisa ditolak saat menunggu approval atau sudah disetujui.');
      error.statusCode = 409;
      error.code = 'RPUJ_REJECTION_INVALID_STATUS';
      throw error;
    }

    await client.query(
      `
        update container_jobs
        set rpuj_status = 'rejected',
            rpuj_reviewed_by_name = $1,
            rpuj_reviewed_at = now(),
            rpuj_rejection_note = $2,
            updated_by_name = $1,
            updated_at = now()
        where id = $3
      `,
      [payload.actorName || 'Finance', payload.rejectionNote || null, id],
    );

    return getRpujRequestById(client, id);
  });
}

export async function markRpujTransferUploaded(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query('select id, rpuj_status, execution_source from container_jobs where id = $1', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan RPUJ tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'RPUJ_REQUEST_NOT_FOUND';
      throw error;
    }
    if ((existing.rows[0].execution_source || 'internal') === 'vendor') {
      const error = new Error('Ritasi Vendor tidak memiliki pengajuan UJ.');
      error.statusCode = 409;
      error.code = 'RPUJ_VENDOR_FORBIDDEN';
      throw error;
    }
    if (!['approved', 'paid'].includes(existing.rows[0].rpuj_status)) {
      const error = new Error('Bukti transfer hanya bisa diupload setelah RPUJ disetujui Finance.');
      error.statusCode = 409;
      error.code = 'RPUJ_TRANSFER_INVALID_STATUS';
      throw error;
    }

    await client.query(
      `
        update container_jobs
        set rpuj_status = 'paid',
            rpuj_transfer_uploaded_by_name = $1,
            rpuj_transfer_uploaded_at = now(),
            updated_by_name = $1,
            updated_at = now()
        where id = $2
      `,
      [payload.actorName || 'Finance', id],
    );

    return getRpujRequestById(client, id);
  });
}

export async function getInvoiceOrdersPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildInvoiceFilters(options);
  const { whereSql: summaryWhereSql, params: summaryParams } = buildInvoiceFilters({
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    dateBasis: options.dateBasis,
    periodBasis: options.status,
  });
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${invoiceOrdersCte()}
        select *
        from invoice_orders
        ${whereSql}
        order by
          updated_at desc nulls last,
          invoice_issued_at desc nulls last,
          completed_at desc nulls last,
          so_number desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        ${invoiceOrdersCte()}
        select count(*)::int as total
        from invoice_orders
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        ${invoiceOrdersCte()}
        select
          count(*) filter (
            where nullif(btrim(invoice_number), '') is null
              or invoice_document_uploaded_at is null
          )::int as need_number,
          count(*) filter (
            where nullif(btrim(invoice_number), '') is not null
              and invoice_document_uploaded_at is not null
              and billing_status <> 'lunas'
          )::int as in_progress,
          count(*) filter (where billing_status = 'lunas')::int as paid,
          count(*) filter (
            where nullif(btrim(invoice_number), '') is not null
              and invoice_document_uploaded_at is null
          )::int as missing_invoice_documents,
          count(*) filter (where nullif(btrim(invoice_number), '') is not null and invoice_document_uploaded_at is null)::int as missing_invoice_document,
          count(*) filter (where nullif(btrim(invoice_number), '') is not null and tax_invoice_document_uploaded_at is null)::int as missing_tax_invoice_document,
          count(*) filter (
            where nullif(btrim(invoice_number), '') is not null
              and invoice_document_uploaded_at is not null
              and coalesce(invoice_document_status, 'belum_upload') <> 'terkirim'
              and billing_status <> 'lunas'
          )::int as complete_invoice_documents,
          count(*) filter (
            where coalesce(invoice_document_status, 'belum_upload') = 'terkirim'
              and billing_status <> 'lunas'
          )::int as sent_invoice_documents,
          count(*)::int as all_invoices,
          count(*) filter (where coalesce(has_travel_document, false) = false)::int as sj_incomplete,
          count(*) filter (where coalesce(has_travel_document, false) = true)::int as sj_complete,
          count(*) filter (
            where nullif(btrim(invoice_number), '') is not null
              and invoice_document_uploaded_at is not null
              and coalesce(invoice_document_status, 'belum_upload') <> 'terkirim'
          )::int as not_sent_to_customer,
          count(*) filter (where coalesce(invoice_document_status, 'belum_upload') = 'terkirim')::int as sent_to_customer,
          count(*) filter (
            where billing_status <> 'lunas'
              and due_date is not null
              and (due_date at time zone 'Asia/Jakarta')::date >= (now() at time zone 'Asia/Jakarta')::date
              and (due_date at time zone 'Asia/Jakarta')::date <= (now() at time zone 'Asia/Jakarta')::date + 7
          )::int as due_soon,
          count(*) filter (
            where billing_status <> 'lunas'
              and due_date is not null
              and (due_date at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date
          )::int as overdue
        from invoice_orders
        ${summaryWhereSql}
      `,
      summaryParams,
    ),
  ]);

  return {
    rows: rows.rows.map(mapInvoiceOrderRow),
    total: Number(total.rows[0]?.total || 0),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Number(total.rows[0]?.total || 0) / pageSize)),
    summary: {
      needNumber: Number(summary.rows[0]?.need_number || 0),
      inProgress: Number(summary.rows[0]?.in_progress || 0),
      paid: Number(summary.rows[0]?.paid || 0),
      missingInvoiceDocuments: Number(summary.rows[0]?.missing_invoice_documents || 0),
      missingInvoiceDocument: Number(summary.rows[0]?.missing_invoice_document || 0),
      missingTaxInvoiceDocument: Number(summary.rows[0]?.missing_tax_invoice_document || 0),
      completeInvoiceDocuments: Number(summary.rows[0]?.complete_invoice_documents || 0),
      sentInvoiceDocuments: Number(summary.rows[0]?.sent_invoice_documents || 0),
      allInvoices: Number(summary.rows[0]?.all_invoices || 0),
      sjIncomplete: Number(summary.rows[0]?.sj_incomplete || 0),
      sjComplete: Number(summary.rows[0]?.sj_complete || 0),
      notSentToCustomer: Number(summary.rows[0]?.not_sent_to_customer || 0),
      sentToCustomer: Number(summary.rows[0]?.sent_to_customer || 0),
      dueSoon: Number(summary.rows[0]?.due_soon || 0),
      overdue: Number(summary.rows[0]?.overdue || 0),
    },
  };
}

export function outstandingOrdersCte() {
  return `
    ${invoiceOrdersCte()},
    payment_totals as (
      select sales_order_id, coalesce(sum(amount), 0)::numeric as total_paid
      from sales_order_payments
      where voided_at is null
      group by sales_order_id
    ),
    outstanding_orders_all as (
      select
        io.*,
        coalesce(customer_master.name, io.customer_name) as customer_rollup_name,
        so.ots_data_review_status,
        coalesce(pt.total_paid, 0)::numeric as total_paid,
        greatest(io.billing_amount - coalesce(pt.total_paid, 0), 0)::numeric as outstanding_amount,
        case
          when io.due_date is null then 'unknown'
          when (io.due_date at time zone 'Asia/Jakarta')::date >= (now() at time zone 'Asia/Jakarta')::date then 'current'
          when (now() at time zone 'Asia/Jakarta')::date - (io.due_date at time zone 'Asia/Jakarta')::date <= 15 then 'overdue_1_15'
          when (now() at time zone 'Asia/Jakarta')::date - (io.due_date at time zone 'Asia/Jakarta')::date <= 30 then 'overdue_16_30'
          when (now() at time zone 'Asia/Jakarta')::date - (io.due_date at time zone 'Asia/Jakarta')::date <= 60 then 'overdue_31_60'
          else 'overdue_60_plus'
        end as aging_bucket,
        case
          when io.due_date is null then 0
          else greatest(((now() at time zone 'Asia/Jakarta')::date - (io.due_date at time zone 'Asia/Jakarta')::date)::int, 0)
        end as days_overdue
      from invoice_orders io
      join sales_orders so on so.id = io.id
      left join customers customer_master on customer_master.id = so.customer_id and customer_master.archived_at is null
      left join payment_totals pt on pt.sales_order_id = io.id
    ),
    -- Data historis sebelum Agustus 2026 hanya menjadi piutang jika memiliki nomor invoice.
    -- Mulai Agustus, seluruh sisa tagihan dipantau karena proses invoice dikelola di sistem ini.
    outstanding_orders as (
      select *
      from outstanding_orders_all
      where outstanding_amount > 0
        and (
          so_date >= date '2026-08-01'
          or nullif(btrim(invoice_number), '') is not null
        )
    )
  `;
}

export function buildOutstandingFilters(options = {}) {
  const clauses = [];
  const params = [];

  if (options.agingBucket) {
    appendOutstandingAgingBucketFilter(clauses, params, options.agingBucket);
  }
  if (options.dataReviewStatus) {
    params.push(options.dataReviewStatus);
    clauses.push(`ots_data_review_status = $${params.length}`);
  }
  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`trip_date >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`trip_date <= $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so_number ilike $${params.length}
      or accurate_so_number ilike $${params.length}
      or ${orderNumberSearchFromColumnSql('id')} ilike $${params.length}
      or invoice_number ilike $${params.length}
      or customer_name ilike $${params.length}
      or customer_rollup_name ilike $${params.length}
      or destination ilike $${params.length}
    )`);
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

function appendOutstandingAgingBucketFilter(clauses, params, agingBucket) {
  const normalizedBucket = String(agingBucket || '').trim();
  if (!normalizedBucket) return;

  if (normalizedBucket === 'overdue_all') {
    clauses.push(`aging_bucket in ('overdue_1_15', 'overdue_16_30', 'overdue_31_60', 'overdue_60_plus')`);
    return;
  }

  const bucketAliases = {
    overdue_1_30: ['overdue_1_15', 'overdue_16_30'],
    overdue_61_90: ['overdue_60_plus'],
    overdue_90_plus: ['overdue_60_plus'],
  };
  const buckets = bucketAliases[normalizedBucket] || [normalizedBucket];
  params.push(buckets);
  clauses.push(`aging_bucket = any($${params.length}::text[])`);
}

function mapOutstandingOrderRow(row) {
  return {
    id: row.id,
    soNumber: getDisplayFinanceSoNumber(row) || '-',
    invoiceNumber: row.invoice_number || '',
    customer: row.customer_name || '-',
    customerRollupName: row.customer_rollup_name || row.customer_name || '-',
    destination: row.destination || '-',
    destinations: Array.isArray(row.destinations) ? row.destinations.filter(Boolean) : [],
    billingStatus: row.billing_status,
    billingAmount: Number(row.billing_amount || 0),
    totalPaid: Number(row.total_paid || 0),
    outstandingAmount: Number(row.outstanding_amount || 0),
    invoiceDate: row.invoice_issued_at,
    dueDate: row.due_date,
    paymentTerms: row.payment_terms || '-',
    agingBucket: row.aging_bucket,
    daysOverdue: Number(row.days_overdue || 0),
    dataReviewStatus: row.ots_data_review_status || 'ok',
  };
}

export async function getSalesOrderOutstandingPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildOutstandingFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, summary] = await Promise.all([
    query(
      `
        ${outstandingOrdersCte()}
        select *, count(*) over ()::int as full_count
        from outstanding_orders
        ${whereSql}
        order by
          due_date asc nulls last,
          so_number asc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        ${outstandingOrdersCte()}
        select
          coalesce(sum(outstanding_amount), 0)::numeric as total_outstanding_amount,
          count(*)::int as total_orders,
          count(*) filter (where aging_bucket = 'current')::int as current_count,
          count(*) filter (where aging_bucket = 'overdue_1_15')::int as overdue_1_15_count,
          count(*) filter (where aging_bucket = 'overdue_16_30')::int as overdue_16_30_count,
          count(*) filter (where aging_bucket in ('overdue_1_15', 'overdue_16_30'))::int as overdue_1_30_count,
          count(*) filter (where aging_bucket = 'overdue_31_60')::int as overdue_31_60_count,
          count(*) filter (where aging_bucket = 'overdue_60_plus')::int as overdue_60_plus_count,
          count(*) filter (where aging_bucket = 'unknown')::int as unknown_due_date_count,
          count(*) filter (where ots_data_review_status = 'perlu_dicek')::int as needs_review_count
        from outstanding_orders
      `,
      [],
    ),
  ]);

  const total = rows.rows[0]?.full_count ? Number(rows.rows[0].full_count) : 0;

  return {
    rows: rows.rows.map(mapOutstandingOrderRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      totalOutstandingAmount: Number(summary.rows[0]?.total_outstanding_amount || 0),
      totalOrders: Number(summary.rows[0]?.total_orders || 0),
      current: Number(summary.rows[0]?.current_count || 0),
      overdue1To15: Number(summary.rows[0]?.overdue_1_15_count || 0),
      overdue16To30: Number(summary.rows[0]?.overdue_16_30_count || 0),
      overdue1To30: Number(summary.rows[0]?.overdue_1_30_count || 0),
      overdue31To60: Number(summary.rows[0]?.overdue_31_60_count || 0),
      overdue60Plus: Number(summary.rows[0]?.overdue_60_plus_count || 0),
      overdue61To90: 0,
      overdue90Plus: Number(summary.rows[0]?.overdue_60_plus_count || 0),
      unknownDueDate: Number(summary.rows[0]?.unknown_due_date_count || 0),
      needsReview: Number(summary.rows[0]?.needs_review_count || 0),
    },
  };
}

export function buildCustomerOutstandingFilters(options = {}) {
  const clauses = [];
  const params = [];

  appendOutstandingAgingBucketFilter(clauses, params, options.agingBucket);
  if (options.dateFrom) {
    params.push(options.dateFrom);
    clauses.push(`trip_date >= $${params.length}`);
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    clauses.push(`trip_date <= $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(customer_rollup_name ilike $${params.length} or customer_name ilike $${params.length})`);
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

const CUSTOMER_OUTSTANDING_SORT_OPTIONS = {
  outstanding_desc: 'total_outstanding_amount desc, customer_name asc',
  oldest_overdue_desc: 'oldest_overdue_days desc, total_outstanding_amount desc, customer_name asc',
  overdue_desc: 'overdue_amount desc, customer_name asc',
  customer_asc: 'customer_name asc',
};

function resolveCustomerOutstandingSort(sortBy) {
  return CUSTOMER_OUTSTANDING_SORT_OPTIONS[sortBy] || CUSTOMER_OUTSTANDING_SORT_OPTIONS.outstanding_desc;
}

function mapCustomerOutstandingRollupRow(row) {
  return {
    customer: row.customer_name || '-',
    invoiceCount: Number(row.invoice_count || 0),
    totalOutstandingAmount: Number(row.total_outstanding_amount || 0),
    currentAmount: Number(row.current_amount || 0),
    overdueAmount: Number(row.overdue_amount || 0),
    overdue1To15Amount: Number(row.overdue_1_15_amount || 0),
    overdue16To30Amount: Number(row.overdue_16_30_amount || 0),
    overdue1To30Amount: Number(row.overdue_1_30_amount || 0),
    overdue31To60Amount: Number(row.overdue_31_60_amount || 0),
    overdue60PlusAmount: Number(row.overdue_60_plus_amount || 0),
    overdue61To90Amount: 0,
    overdue90PlusAmount: Number(row.overdue_60_plus_amount || 0),
    oldestOverdueDays: Number(row.oldest_overdue_days || 0),
    needsReview: Boolean(row.needs_review),
  };
}

export async function getCustomerOutstandingRollupPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildCustomerOutstandingFilters(options);
  const orderBySql = resolveCustomerOutstandingSort(options.sortBy);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${outstandingOrdersCte()}
        select
          customer_rollup_name as customer_name,
          count(*)::int as invoice_count,
          coalesce(sum(outstanding_amount), 0)::numeric as total_outstanding_amount,
          coalesce(sum(outstanding_amount) filter (where aging_bucket = 'current'), 0)::numeric as current_amount,
          coalesce(sum(outstanding_amount) filter (where aging_bucket not in ('current', 'unknown')), 0)::numeric as overdue_amount,
          coalesce(sum(outstanding_amount) filter (where aging_bucket = 'overdue_1_15'), 0)::numeric as overdue_1_15_amount,
          coalesce(sum(outstanding_amount) filter (where aging_bucket = 'overdue_16_30'), 0)::numeric as overdue_16_30_amount,
          coalesce(sum(outstanding_amount) filter (where aging_bucket in ('overdue_1_15', 'overdue_16_30')), 0)::numeric as overdue_1_30_amount,
          coalesce(sum(outstanding_amount) filter (where aging_bucket = 'overdue_31_60'), 0)::numeric as overdue_31_60_amount,
          coalesce(sum(outstanding_amount) filter (where aging_bucket = 'overdue_60_plus'), 0)::numeric as overdue_60_plus_amount,
          coalesce(max(days_overdue), 0)::int as oldest_overdue_days,
          bool_or(ots_data_review_status = 'perlu_dicek') as needs_review
        from outstanding_orders
        ${whereSql}
        group by customer_rollup_name
        order by ${orderBySql}
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        ${outstandingOrdersCte()}
        select count(*)::int as total
        from (
          select customer_rollup_name
          from outstanding_orders
          ${whereSql}
          group by customer_rollup_name
        ) grouped
      `,
      params,
    ),
    // Sama seperti summary di getSalesOrderOutstandingPage: dihitung dari SELURUH outstanding_orders
    // (tidak ikut whereSql) supaya kartu ringkasan tetap menggambarkan kondisi global, bukan hasil
    // filter tabel. Digabung ke endpoint rollup ini supaya CustomerOutstandingPage.jsx cukup satu
    // kali fetch untuk data tabel + ringkasan, bukan dua kali menjalankan outstandingOrdersCte().
    query(
      `
        ${outstandingOrdersCte()}
        select
          coalesce(sum(outstanding_amount), 0)::numeric as total_outstanding_amount,
          count(*)::int as total_orders,
          count(distinct customer_rollup_name)::int as total_customers,
          count(*) filter (where aging_bucket = 'current')::int as current_count,
          count(*) filter (where aging_bucket = 'overdue_1_15')::int as overdue_1_15_count,
          count(*) filter (where aging_bucket = 'overdue_16_30')::int as overdue_16_30_count,
          count(*) filter (where aging_bucket in ('overdue_1_15', 'overdue_16_30'))::int as overdue_1_30_count,
          count(*) filter (where aging_bucket = 'overdue_31_60')::int as overdue_31_60_count,
          count(*) filter (where aging_bucket = 'overdue_60_plus')::int as overdue_60_plus_count,
          count(*) filter (where aging_bucket = 'unknown')::int as unknown_due_date_count,
          count(*) filter (where ots_data_review_status = 'perlu_dicek')::int as needs_review_count
        from outstanding_orders
      `,
      [],
    ),
  ]);

  const totalCustomers = Number(total.rows[0]?.total || 0);

  return {
    rows: rows.rows.map(mapCustomerOutstandingRollupRow),
    total: totalCustomers,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCustomers / pageSize)),
    summary: {
      totalOutstandingAmount: Number(summary.rows[0]?.total_outstanding_amount || 0),
      totalOrders: Number(summary.rows[0]?.total_orders || 0),
      totalCustomers: Number(summary.rows[0]?.total_customers || 0),
      current: Number(summary.rows[0]?.current_count || 0),
      overdue1To15: Number(summary.rows[0]?.overdue_1_15_count || 0),
      overdue16To30: Number(summary.rows[0]?.overdue_16_30_count || 0),
      overdue1To30: Number(summary.rows[0]?.overdue_1_30_count || 0),
      overdue31To60: Number(summary.rows[0]?.overdue_31_60_count || 0),
      overdue60Plus: Number(summary.rows[0]?.overdue_60_plus_count || 0),
      overdue61To90: 0,
      overdue90Plus: Number(summary.rows[0]?.overdue_60_plus_count || 0),
      unknownDueDate: Number(summary.rows[0]?.unknown_due_date_count || 0),
      needsReview: Number(summary.rows[0]?.needs_review_count || 0),
    },
  };
}

export async function getCustomerOutstandingSummary(customerName) {
  const normalized = String(customerName || '').trim();
  if (!normalized) {
    return {
      customer: '',
      openInvoiceCount: 0,
      totalOutstandingAmount: 0,
      worstDaysOverdue: 0,
      overdueCount: 0,
      needsReview: 0,
    };
  }

  const result = await query(
    `
      ${outstandingOrdersCte()}
      select
        count(*)::int as open_invoice_count,
        coalesce(sum(outstanding_amount), 0)::numeric as total_outstanding_amount,
        coalesce(max(days_overdue), 0)::int as worst_days_overdue,
        count(*) filter (where aging_bucket not in ('current', 'unknown'))::int as overdue_count,
        count(*) filter (where ots_data_review_status = 'perlu_dicek')::int as needs_review_count
      from outstanding_orders
      where lower(btrim(customer_rollup_name)) = lower(btrim($1))
    `,
    [normalized],
  );

  const row = result.rows[0] || {};
  return {
    customer: normalized,
    openInvoiceCount: Number(row.open_invoice_count || 0),
    totalOutstandingAmount: Number(row.total_outstanding_amount || 0),
    worstDaysOverdue: Number(row.worst_days_overdue || 0),
    overdueCount: Number(row.overdue_count || 0),
    needsReview: Number(row.needs_review_count || 0),
  };
}

function mapDebitNoteItem(row) {
  return {
    id: row.id,
    category: row.category || '',
    amount: row.amount == null ? 0 : Number(row.amount),
    description: row.description || '',
    recipientName: row.recipient_name || '',
    paymentStatus: row.payment_status || '',
    createdAt: row.created_at,
    containerJobId: row.container_job_id || '',
    containerNumber: row.container_number || '',
  };
}

function mapContainerBreakdownRow(row) {
  return {
    containerJobId: row.container_job_id,
    containerNumber: row.container_number || '',
    destination: row.destination || '',
    invoiceAmount: row.invoice_amount == null ? 0 : Number(row.invoice_amount),
    debitNoteAmount: row.debit_note_amount == null ? 0 : Number(row.debit_note_amount),
    hasInap: Boolean(row.inap_started_at || row.inap_reason),
    inapStartedAt: row.inap_started_at,
    inapEndedAt: row.inap_ended_at,
    inapReason: row.inap_reason || '',
    inapNotes: row.inap_notes || '',
    inapCreatedByName: row.inap_created_by_name || '',
  };
}

export async function getCustomerOutstandingRollupExport(options = {}, db = { query }) {
  const { whereSql, params } = buildCustomerOutstandingFilters(options);
  const orderBySql = resolveCustomerOutstandingSort(options.sortBy);
  const rows = await db.query(
    `
      ${outstandingOrdersCte()}
      select
        customer_rollup_name as customer_name,
        count(*)::int as invoice_count,
        coalesce(sum(outstanding_amount), 0)::numeric as total_outstanding_amount,
        coalesce(sum(outstanding_amount) filter (where aging_bucket = 'current'), 0)::numeric as current_amount,
        coalesce(sum(outstanding_amount) filter (where aging_bucket not in ('current', 'unknown')), 0)::numeric as overdue_amount,
        coalesce(sum(outstanding_amount) filter (where aging_bucket = 'overdue_1_15'), 0)::numeric as overdue_1_15_amount,
        coalesce(sum(outstanding_amount) filter (where aging_bucket = 'overdue_16_30'), 0)::numeric as overdue_16_30_amount,
        coalesce(sum(outstanding_amount) filter (where aging_bucket in ('overdue_1_15', 'overdue_16_30')), 0)::numeric as overdue_1_30_amount,
        coalesce(sum(outstanding_amount) filter (where aging_bucket = 'overdue_31_60'), 0)::numeric as overdue_31_60_amount,
        coalesce(sum(outstanding_amount) filter (where aging_bucket = 'overdue_60_plus'), 0)::numeric as overdue_60_plus_amount,
        coalesce(max(days_overdue), 0)::int as oldest_overdue_days,
        bool_or(ots_data_review_status = 'perlu_dicek') as needs_review
      from outstanding_orders
      ${whereSql}
      group by customer_rollup_name
      order by ${orderBySql}
    `,
    params,
  );

  return { rows: rows.rows.map(mapCustomerOutstandingRollupRow) };
}

function mapManualRevenueLineRow(row) {
  return {
    id: row.id,
    containerJobId: row.container_job_id || '',
    containerNumber: row.container_number || '',
    chargeType: row.charge_type || 'inap',
    description: row.description || '',
    quantity: row.quantity == null ? 0 : Number(row.quantity),
    unit: row.unit || '',
    unitPrice: row.unit_price == null ? 0 : Number(row.unit_price),
    totalAmount: row.total_amount == null ? 0 : Number(row.total_amount),
    note: row.note || '',
    status: row.status || 'active',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedByName: row.updated_by_name || '',
    updatedAt: row.updated_at,
    voidedAt: row.voided_at,
    voidedByName: row.voided_by_name || '',
    voidReason: row.void_reason || '',
    pickupItemId: row.container_pickup_item_id || '',
    pickupMovementId: row.pickup_movement_id || '',
  };
}

export async function getInvoiceOrderDetail(id) {
  const [invoice, documents, debitNoteRows, containerBreakdown, manualRevenueRows] = await Promise.all([
    query(
      `
        ${invoiceOrdersCte()}
        select *
        from invoice_orders
        where id = $1
        limit 1
      `,
      [id],
    ),
    query(
      `
        select
          a.id, a.category, a.reference_number, a.document_date, a.file_name,
          a.storage_path, a.mime_type, a.file_size, a.notes, a.uploaded_by_name,
          a.created_at,
          case
            when a.category in ('invoicePdf', 'taxInvoicePdf', 'debitNotePdf') then 'Finance'
            else 'Sales'
          end as source,
          null::uuid as job_id,
          null::text as container_number
        from attachments a
        where a.entity_type = 'sales_order'
          and a.entity_id = $1

        union all

        select
          a.id, a.category, a.reference_number, a.document_date, a.file_name,
          a.storage_path, a.mime_type, a.file_size, a.notes, a.uploaded_by_name,
          a.created_at, 'Operational'::text as source, cj.id as job_id,
          cj.container_number
        from container_jobs cj
        left join attachments a
          on a.entity_type = 'container_job'
         and a.entity_id = cj.id
         and a.category in (
           'eirDocument',
           'travelDocumentFile',
           'loadingVoucherDocument',
           'unloadingVoucherDocument',
           'tilaGatepassDocumentFile',
           'otherDocument'
         )
        where cj.sales_order_id = $1

        order by source, job_id, created_at asc
      `,
      [id],
    ),
    query(
      `
        select
          expense.id, expense.category, expense.amount, expense.description,
          expense.recipient_name, expense.payment_status, expense.created_at,
          expense.container_job_id, cj.container_number
        from container_job_expenses expense
        left join container_jobs cj on cj.id = expense.container_job_id
        where expense.sales_order_id = $1
          and expense.expense_group = 'reimbursement'
        order by cj.container_number asc nulls last, expense.created_at asc
      `,
      [id],
    ),
    query(
      `
        ${financeRowsCte()}
        select
          fr.id as container_job_id,
          fr.container_number,
          fr.destination,
          fr.total_revenue as invoice_amount,
          fr.inap_started_at,
          fr.inap_ended_at,
          fr.inap_reason,
          fr.inap_notes,
          fr.inap_created_by_name,
          coalesce(cje.debit_note_amount, 0)::numeric as debit_note_amount
        from finance_rows fr
        left join (
          select container_job_id, sum(amount)::numeric as debit_note_amount
          from container_job_expenses
          where expense_group = 'reimbursement'
            and container_job_id is not null
            and payment_status <> 'batal'
          group by container_job_id
        ) cje on cje.container_job_id = fr.id
        where fr.sales_order_id = $1
        order by fr.container_number asc nulls last, fr.id asc
      `,
      [id],
    ),
    query(
      `
        select
          mrl.id, mrl.container_job_id, cj.container_number, mrl.charge_type, mrl.description,
          mrl.quantity, mrl.unit, mrl.unit_price, mrl.total_amount, mrl.note, mrl.status,
          mrl.created_by_name, mrl.created_at, mrl.updated_by_name, mrl.updated_at,
          mrl.voided_at, mrl.voided_by_name, mrl.void_reason,
          mrl.container_pickup_item_id, cpi.movement_id as pickup_movement_id
        from manual_revenue_lines mrl
        left join container_jobs cj on cj.id = mrl.container_job_id
        left join container_pickup_items cpi on cpi.id = mrl.container_pickup_item_id
        where mrl.sales_order_id = $1
        order by mrl.created_at asc
      `,
      [id],
    ),
  ]);

  if (!invoice.rows[0]) return null;
  // debitNoteItems sengaja tetap menampilkan item yang sudah 'batal' (transparansi riwayat), tapi
  // totalnya wajib mengecualikan item batal supaya tidak ikut menagih customer untuk biaya yang
  // sudah dikoreksi/dibatalkan. Pola yang sama dipakai manualRevenueLines: baris void tetap
  // ditampilkan (transparansi), tapi manualRevenueAmount di mapInvoiceOrderRow sudah mengecualikannya.
  const debitNoteItems = debitNoteRows.rows.map(mapDebitNoteItem);
  return {
    ...mapInvoiceOrderRow(invoice.rows[0]),
    documents: mapInvoiceDocuments(documents.rows),
    debitNoteItems,
    debitNoteAmount: debitNoteItems
      .filter((item) => item.paymentStatus !== 'batal')
      .reduce((sum, item) => sum + item.amount, 0),
    containerBreakdown: containerBreakdown.rows.map(mapContainerBreakdownRow),
    manualRevenueLines: manualRevenueRows.rows.map(mapManualRevenueLineRow),
  };
}

async function ensureSalesOrderNotPaidForRevenueLine(client, salesOrderId) {
  const locked = await client.query(
    'select id, billing_status from sales_orders where id = $1 for update',
    [salesOrderId],
  );
  if (!locked.rows[0]) {
    const error = new Error('Sales Order tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'SALES_ORDER_NOT_FOUND';
    throw error;
  }
  if (locked.rows[0].billing_status === 'lunas') {
    const error = new Error('Invoice sudah lunas. Void pembayaran dulu sebelum mengubah revenue line, supaya outstanding tidak berubah diam-diam.');
    error.statusCode = 409;
    error.code = 'REVENUE_LINE_INVOICE_ALREADY_PAID';
    throw error;
  }
  return locked.rows[0];
}

async function recomputeBillingAmount(client, salesOrderId) {
  const invoiceResult = await client.query(
    `
      ${invoiceOrdersCte()}
      select billing_amount
      from invoice_orders
      where id = $1
      limit 1
    `,
    [salesOrderId],
  );
  return Number(invoiceResult.rows[0]?.billing_amount || 0);
}

export async function createManualRevenueLine(salesOrderId, payload = {}) {
  return withTransaction(async (client) => {
    await ensureSalesOrderNotPaidForRevenueLine(client, salesOrderId);

    const quantity = Number(payload.quantity);
    const unitPrice = Number(payload.unitPrice);
    const totalAmount = Math.round(quantity * unitPrice);

    const inserted = await client.query(
      `
        insert into manual_revenue_lines (
          sales_order_id, container_job_id, charge_type, description, quantity, unit,
          unit_price, total_amount, note, status, created_by_name, updated_by_name
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        returning id, container_job_id, charge_type, description, quantity, unit, unit_price,
          total_amount, note, status, created_by_name, created_at, updated_by_name, updated_at,
          voided_at, voided_by_name, void_reason
      `,
      [
        salesOrderId,
        payload.containerJobId || null,
        payload.chargeType || 'inap',
        payload.description,
        quantity,
        payload.unit,
        unitPrice,
        totalAmount,
        payload.note || null,
        payload.status === 'draft' ? 'draft' : 'active',
        payload.actorName || 'Finance',
      ],
    );

    const billingAmount = await recomputeBillingAmount(client, salesOrderId);
    return { line: mapManualRevenueLineRow(inserted.rows[0]), billingAmount };
  });
}

export async function updateManualRevenueLine(salesOrderId, lineId, payload = {}) {
  return withTransaction(async (client) => {
    await ensureSalesOrderNotPaidForRevenueLine(client, salesOrderId);

    const existing = await client.query(
      'select * from manual_revenue_lines where id = $1 and sales_order_id = $2 for update',
      [lineId, salesOrderId],
    );
    if (!existing.rows[0]) {
      const error = new Error('Revenue line tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'REVENUE_LINE_NOT_FOUND';
      throw error;
    }
    if (existing.rows[0].voided_at) {
      const error = new Error('Revenue line yang sudah dibatalkan tidak bisa diubah.');
      error.statusCode = 409;
      error.code = 'REVENUE_LINE_ALREADY_VOIDED';
      throw error;
    }
    // Revenue Repo dibuat otomatis per pickup item dengan tarif tetap dan sengaja masih 'draft'
    // (belum masuk invoice) sampai kebijakan invoice Repo diputuskan. Koreksi hanya lewat void.
    if (existing.rows[0].container_pickup_item_id) {
      const error = new Error('Revenue Repo dibuat otomatis dari pickup container titip dan tidak bisa diubah. Gunakan Batalkan bila perlu koreksi.');
      error.statusCode = 409;
      error.code = 'REPO_REVENUE_LINE_LOCKED';
      throw error;
    }

    const quantity = Number(payload.quantity ?? existing.rows[0].quantity);
    const unitPrice = Number(payload.unitPrice ?? existing.rows[0].unit_price);
    const totalAmount = Math.round(quantity * unitPrice);

    const updated = await client.query(
      `
        update manual_revenue_lines
        set container_job_id = $2,
            charge_type = $3,
            description = $4,
            quantity = $5,
            unit = $6,
            unit_price = $7,
            total_amount = $8,
            note = $9,
            status = $10,
            updated_by_name = $11,
            updated_at = now()
        where id = $1
        returning id, container_job_id, charge_type, description, quantity, unit, unit_price,
          total_amount, note, status, created_by_name, created_at, updated_by_name, updated_at,
          voided_at, voided_by_name, void_reason
      `,
      [
        lineId,
        payload.containerJobId ?? existing.rows[0].container_job_id,
        payload.chargeType || existing.rows[0].charge_type,
        payload.description ?? existing.rows[0].description,
        quantity,
        payload.unit ?? existing.rows[0].unit,
        unitPrice,
        totalAmount,
        payload.note ?? existing.rows[0].note,
        payload.status === 'draft' || payload.status === 'active' ? payload.status : existing.rows[0].status,
        payload.actorName || 'Finance',
      ],
    );

    const billingAmount = await recomputeBillingAmount(client, salesOrderId);
    return { line: mapManualRevenueLineRow(updated.rows[0]), billingAmount };
  });
}

export async function voidManualRevenueLine(salesOrderId, lineId, payload = {}) {
  return withTransaction(async (client) => {
    await ensureSalesOrderNotPaidForRevenueLine(client, salesOrderId);

    const existing = await client.query(
      'select * from manual_revenue_lines where id = $1 and sales_order_id = $2 for update',
      [lineId, salesOrderId],
    );
    if (!existing.rows[0]) {
      const error = new Error('Revenue line tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'REVENUE_LINE_NOT_FOUND';
      throw error;
    }
    if (existing.rows[0].voided_at) {
      const error = new Error('Revenue line ini sudah dibatalkan sebelumnya.');
      error.statusCode = 409;
      error.code = 'REVENUE_LINE_ALREADY_VOIDED';
      throw error;
    }

    const reason = String(payload.reason || '').trim();
    if (!reason) {
      const error = new Error('Alasan pembatalan wajib diisi.');
      error.statusCode = 400;
      error.code = 'REVENUE_LINE_VOID_REASON_REQUIRED';
      throw error;
    }

    const voided = await client.query(
      `
        update manual_revenue_lines
        set status = 'void', voided_at = now(), voided_by_name = $2, void_reason = $3
        where id = $1
        returning id, container_job_id, charge_type, description, quantity, unit, unit_price,
          total_amount, note, status, created_by_name, created_at, updated_by_name, updated_at,
          voided_at, voided_by_name, void_reason
      `,
      [lineId, payload.actorName || 'Finance', reason],
    );

    const billingAmount = await recomputeBillingAmount(client, salesOrderId);
    return { line: mapManualRevenueLineRow(voided.rows[0]), billingAmount };
  });
}

export async function updateInvoiceNumber(id, payload = {}) {
  const invoiceNumber = String(payload.invoiceNumber || '').trim();
  if (!invoiceNumber) {
    const error = new Error('Nomor invoice wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select id, invoice_number, billing_status
        from sales_orders
        where id = $1
          and status = 'completed'
      `,
      [id],
    );

    if (!existing.rows[0]) {
      const error = new Error('Sales Order selesai untuk invoice tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'FINANCE_INVOICE_ORDER_NOT_FOUND';
      throw error;
    }

    const currentInvoice = String(existing.rows[0].invoice_number || '').trim();
    if (currentInvoice && currentInvoice.toLowerCase() !== invoiceNumber.toLowerCase()) {
      const error = new Error('Nomor invoice sudah terisi. Perubahan nomor invoice dilakukan dari alur koreksi terpisah.');
      error.statusCode = 409;
      error.code = 'INVOICE_NUMBER_ALREADY_SET';
      throw error;
    }

    const duplicate = await client.query(
      `
        select id
        from sales_orders
        where lower(invoice_number) = lower($1)
          and id <> $2
        limit 1
      `,
      [invoiceNumber, id],
    );
    if (duplicate.rows[0]) {
      const error = new Error('Nomor invoice sudah digunakan oleh Sales Order lain.');
      error.statusCode = 409;
      error.code = 'INVOICE_NUMBER_DUPLICATE';
      throw error;
    }

    await client.query(
      `
        update sales_orders
        set invoice_number = $1,
            billing_status = case
              when coalesce(billing_status, 'belum_invoice') = 'belum_invoice' then 'belum_dikirim'
              else billing_status
            end,
            invoice_issued_at = coalesce(invoice_issued_at, now()),
            invoice_input_by_name = coalesce(invoice_input_by_name, $2),
            updated_by_name = $2,
            updated_at = now()
        where id = $3
      `,
      [invoiceNumber, payload.actorName || 'Finance', id],
    );

    const updated = await client.query(
      `
        ${invoiceOrdersCte()}
        select *
        from invoice_orders
        where id = $1
        limit 1
      `,
      [id],
    );
    return updated.rows[0] ? mapInvoiceOrderRow(updated.rows[0]) : null;
  });
}

export async function markInvoiceDocumentUploaded(id, patch = {}) {
  const category = patch.category === 'taxInvoicePdf'
    ? 'taxInvoicePdf'
    : patch.category === 'debitNotePdf'
      ? 'debitNotePdf'
      : 'invoicePdf';
  const actorName = patch.actorName || 'Finance';
  const isInvoice = category === 'invoicePdf';

  if (category === 'debitNotePdf') {
    return withTransaction(async (client) => {
      const existing = await client.query(
        `
          select id
          from sales_orders
          where id = $1
            and status = 'completed'
        `,
        [id],
      );

      if (!existing.rows[0]) {
        const error = new Error('Sales Order selesai untuk invoice tidak ditemukan.');
        error.statusCode = 404;
        error.code = 'FINANCE_INVOICE_ORDER_NOT_FOUND';
        throw error;
      }

      await client.query(
        `
          update sales_orders
          set debit_note_document_uploaded_at = now(),
              debit_note_document_uploaded_by_name = $1,
              updated_by_name = $1,
              updated_at = now()
          where id = $2
        `,
        [actorName, id],
      );

      const updated = await client.query(
        `
          ${invoiceOrdersCte()}
          select *
          from invoice_orders
          where id = $1
          limit 1
        `,
        [id],
      );
      return updated.rows[0] ? mapInvoiceOrderRow(updated.rows[0]) : null;
    });
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select id
        from sales_orders
        where id = $1
          and status = 'completed'
      `,
      [id],
    );

    if (!existing.rows[0]) {
      const error = new Error('Sales Order selesai untuk invoice tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'FINANCE_INVOICE_ORDER_NOT_FOUND';
      throw error;
    }

    const attachmentFlags = await client.query(
      `
        select
          bool_or(category = 'invoicePdf') as has_invoice_pdf,
          bool_or(category = 'taxInvoicePdf') as has_tax_invoice_pdf
        from attachments
        where entity_type = 'sales_order'
          and entity_id = $1
          and category in ('invoicePdf', 'taxInvoicePdf')
      `,
      [id],
    );
    const flags = attachmentFlags.rows[0] || {};
    const hasInvoicePdf = Boolean(flags.has_invoice_pdf) || isInvoice;
    const nextStatus = hasInvoicePdf ? 'siap_dikirim' : 'belum_upload';

    await client.query(
      `
        update sales_orders
        set invoice_document_status = case
              when coalesce(invoice_document_status, 'belum_upload') = 'terkirim' then invoice_document_status
              else $1
            end,
            invoice_document_uploaded_at = case
              when $2 then now()
              else invoice_document_uploaded_at
            end,
            invoice_document_uploaded_by_name = case
              when $2 then $3
              else invoice_document_uploaded_by_name
            end,
            tax_invoice_document_uploaded_at = case
              when $4 then now()
              else tax_invoice_document_uploaded_at
            end,
            tax_invoice_document_uploaded_by_name = case
              when $4 then $3
              else tax_invoice_document_uploaded_by_name
            end,
            updated_by_name = $3,
            updated_at = now()
        where id = $5
      `,
      [nextStatus, isInvoice, actorName, !isInvoice, id],
    );

    const updated = await client.query(
      `
        ${invoiceOrdersCte()}
        select *
        from invoice_orders
        where id = $1
        limit 1
      `,
      [id],
    );
    return updated.rows[0] ? mapInvoiceOrderRow(updated.rows[0]) : null;
  });
}

function mapSalesOrderPaymentRow(row = {}) {
  const proofAttachment = row.proof_attachment_id
    ? {
        id: row.proof_attachment_id,
        name: row.proof_file_name || 'Bukti Pembayaran',
        size: row.proof_file_size == null ? 0 : Number(row.proof_file_size),
        type: row.proof_mime_type || '',
        path: row.proof_attachment_id,
      }
    : null;
  return {
    id: row.id,
    salesOrderId: row.sales_order_id,
    amount: Number(row.amount || 0),
    paymentDate: row.payment_date,
    referenceNumber: row.reference_number || '',
    note: row.note || '',
    recordedByName: row.recorded_by_name || '',
    proofAttachmentId: row.proof_attachment_id || null,
    proofAttachment,
    createdAt: row.created_at,
    voidedAt: row.voided_at || null,
    voidedByName: row.voided_by_name || '',
    voidReason: row.void_reason || '',
  };
}

export async function listSalesOrderPayments(salesOrderId) {
  const result = await query(
    `
      select sop.id, sop.sales_order_id, sop.amount, sop.payment_date, sop.reference_number, sop.note,
        sop.recorded_by_name, sop.created_at, sop.proof_attachment_id,
        proof.file_name as proof_file_name,
        proof.mime_type as proof_mime_type,
        proof.file_size as proof_file_size,
        sop.voided_at, sop.voided_by_name, sop.void_reason
      from sales_order_payments sop
      left join attachments proof on proof.id = sop.proof_attachment_id
      where sop.sales_order_id = $1
      order by sop.payment_date desc, sop.created_at desc
    `,
    [salesOrderId],
  );
  return result.rows.map(mapSalesOrderPaymentRow);
}

async function computeSalesOrderPaymentSummary(client, id) {
  const invoiceResult = await client.query(
    `
      ${invoiceOrdersCte()}
      select billing_amount
      from invoice_orders
      where id = $1
      limit 1
    `,
    [id],
  );
  const billingAmount = Number(invoiceResult.rows[0]?.billing_amount || 0);

  const [paidResult, statusResult] = await Promise.all([
    client.query(
      'select coalesce(sum(amount), 0)::numeric as total_paid from sales_order_payments where sales_order_id = $1 and voided_at is null',
      [id],
    ),
    client.query('select billing_status from sales_orders where id = $1', [id]),
  ]);
  const totalPaid = Number(paidResult.rows[0]?.total_paid || 0);

  return {
    billingAmount,
    totalPaid,
    outstandingAmount: Math.max(billingAmount - totalPaid, 0),
    billingStatus: statusResult.rows[0]?.billing_status || null,
  };
}

// proof_attachment_id sengaja TIDAK dibandingkan: setiap submit (termasuk replay) meng-upload
// bukti transfernya sendiri lewat createAttachment, jadi attachment id-nya wajar berbeda-beda
// walau ini submit ulang yang sama secara bisnis. Kesamaan yang dicek adalah nominal dan
// referensi transaksinya, bukan record attachment mana yang kebetulan tersimpan.
function ensurePaymentPayloadMatches(existingRow, payload) {
  return Number(existingRow.amount) === Number(payload.amount)
    && String(existingRow.reference_number || '') === String(payload.referenceNumber || '')
    && String(existingRow.note || '') === String(payload.note || '');
}

export async function recordCustomerInvoicePayments(payload = {}) {
  return withTransaction(async (client) => {
    const allocations = Array.isArray(payload.allocations) ? payload.allocations : [];
    if (!allocations.length) {
      const error = new Error('Minimal satu invoice wajib dipilih untuk alokasi pembayaran.');
      error.statusCode = 400;
      error.code = 'CUSTOMER_PAYMENT_ALLOCATIONS_REQUIRED';
      throw error;
    }

    const totalAmount = Number(payload.totalAmount || 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      const error = new Error('Total transfer wajib lebih dari 0.');
      error.statusCode = 400;
      error.code = 'CUSTOMER_PAYMENT_TOTAL_AMOUNT_INVALID';
      throw error;
    }

    const allocationTotal = allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
    if (!Number.isFinite(allocationTotal) || allocationTotal <= 0) {
      const error = new Error('Total alokasi pembayaran wajib lebih dari 0.');
      error.statusCode = 400;
      error.code = 'CUSTOMER_PAYMENT_ALLOCATION_AMOUNT_INVALID';
      throw error;
    }
    if (allocationTotal > totalAmount) {
      const error = new Error('Total alokasi tidak boleh melebihi total transfer.');
      error.statusCode = 409;
      error.code = 'CUSTOMER_PAYMENT_ALLOCATION_EXCEEDS_TRANSFER';
      throw error;
    }

    const idempotencyBase = payload.idempotencyKey || null;
    const payments = [];
    const summaries = [];

    for (const allocation of allocations) {
      const salesOrderId = String(allocation.salesOrderId || allocation.id || '').trim();
      const amount = Number(allocation.amount || 0);
      if (!salesOrderId || !Number.isFinite(amount) || amount <= 0) {
        const error = new Error('Setiap alokasi wajib memiliki invoice dan nominal lebih dari 0.');
        error.statusCode = 400;
        error.code = 'CUSTOMER_PAYMENT_ALLOCATION_INVALID';
        throw error;
      }

      const locked = await client.query(
        'select id, status, invoice_number, billing_status from sales_orders where id = $1 for update',
        [salesOrderId],
      );
      if (!locked.rows[0]) {
        const error = new Error('Sales Order tidak ditemukan.');
        error.statusCode = 404;
        error.code = 'SALES_ORDER_NOT_FOUND';
        throw error;
      }
      if (locked.rows[0].status !== 'completed') {
        const error = new Error('Pembayaran hanya bisa dicatat setelah Sales Order selesai.');
        error.statusCode = 400;
        error.code = 'SALES_ORDER_PAYMENT_ORDER_NOT_COMPLETED';
        throw error;
      }
      if (!String(locked.rows[0].invoice_number || '').trim()) {
        const error = new Error('Nomor invoice belum tersedia. Input nomor invoice terlebih dahulu sebelum mencatat pembayaran.');
        error.statusCode = 409;
        error.code = 'SALES_ORDER_PAYMENT_INVOICE_NUMBER_REQUIRED';
        throw error;
      }

      const idempotencyKey = idempotencyBase ? `${idempotencyBase}:${salesOrderId}` : null;
      const allocationPayload = {
        amount,
        referenceNumber: payload.referenceNumber || null,
        note: payload.note || null,
      };
      if (idempotencyKey) {
        const existing = await client.query(
          'select * from sales_order_payments where idempotency_key = $1 limit 1',
          [idempotencyKey],
        );
        if (existing.rows[0]) {
          if (!ensurePaymentPayloadMatches(existing.rows[0], allocationPayload)) {
            const error = new Error('Percobaan submit ini memakai kunci yang sama dengan pembayaran lain yang datanya berbeda. Silakan catat sebagai entri baru.');
            error.statusCode = 409;
            error.code = 'SALES_ORDER_PAYMENT_IDEMPOTENCY_KEY_MISMATCH';
            throw error;
          }
          payments.push(mapSalesOrderPaymentRow(existing.rows[0]));
          summaries.push({ salesOrderId, ...(await computeSalesOrderPaymentSummary(client, salesOrderId)) });
          continue;
        }
      }

      const invoiceResult = await client.query(
        `
          ${invoiceOrdersCte()}
          select billing_amount
          from invoice_orders
          where id = $1
          limit 1
        `,
        [salesOrderId],
      );
      if (!invoiceResult.rows[0]) {
        const error = new Error('Sales Order ini belum siap ditagihkan. Pastikan dokumen lengkap dan sudah diverifikasi Finance.');
        error.statusCode = 409;
        error.code = 'SALES_ORDER_PAYMENT_NOT_INVOICEABLE';
        throw error;
      }
      const billingAmount = Number(invoiceResult.rows[0].billing_amount || 0);
      const paidResult = await client.query(
        'select coalesce(sum(amount), 0)::numeric as total_paid from sales_order_payments where sales_order_id = $1 and voided_at is null',
        [salesOrderId],
      );
      const totalPaid = Number(paidResult.rows[0].total_paid || 0);
      const remaining = billingAmount - totalPaid;
      if (remaining <= 0) {
        const error = new Error('Sales Order ini sudah lunas.');
        error.statusCode = 409;
        error.code = 'SALES_ORDER_PAYMENT_ALREADY_PAID';
        throw error;
      }
      if (amount > remaining) {
        const error = new Error(`Nominal pembayaran melebihi sisa outstanding. Sisa outstanding Rp ${remaining.toLocaleString('id-ID')}.`);
        error.statusCode = 409;
        error.code = 'SALES_ORDER_PAYMENT_EXCEEDS_OUTSTANDING';
        throw error;
      }

      const inserted = await client.query(
        `
          insert into sales_order_payments (
            sales_order_id, amount, payment_date, reference_number, proof_attachment_id, note,
            recorded_by_user_id, recorded_by_name, idempotency_key
          )
          values ($1, $2, coalesce($3::date, (now() at time zone 'Asia/Jakarta')::date), $4, $5, $6, $7, $8, $9)
          returning id, sales_order_id, amount, payment_date, reference_number, note, recorded_by_name, created_at, proof_attachment_id
        `,
        [
          salesOrderId,
          amount,
          payload.paymentDate || null,
          payload.referenceNumber || null,
          payload.proofAttachmentId || null,
          payload.note || null,
          payload.actorUserId || null,
          payload.actorName || 'Finance',
          idempotencyKey,
        ],
      );

      const newTotalPaid = totalPaid + amount;
      const nextBillingStatus = newTotalPaid >= billingAmount
        ? 'lunas'
        : (locked.rows[0].billing_status === 'lunas' ? 'menunggu_pembayaran' : locked.rows[0].billing_status);
      if (nextBillingStatus !== locked.rows[0].billing_status) {
        await client.query(
          `
            update sales_orders
            set billing_status = $2,
                updated_by_name = $3,
                updated_at = now()
            where id = $1
          `,
          [salesOrderId, nextBillingStatus, payload.actorName || 'Finance'],
        );
      }

      payments.push(mapSalesOrderPaymentRow(inserted.rows[0]));
      summaries.push({
        salesOrderId,
        billingAmount,
        totalPaid: newTotalPaid,
        outstandingAmount: Math.max(billingAmount - newTotalPaid, 0),
        billingStatus: nextBillingStatus,
      });
    }

    return {
      payments,
      summaries,
      totalAmount,
      allocatedAmount: allocationTotal,
      unallocatedAmount: Math.max(totalAmount - allocationTotal, 0),
      proofAttachmentId: payload.proofAttachmentId,
    };
  });
}

// Fondasi Customer Outstanding (Phase 1): satu-satunya jalur yang boleh membawa Sales Order
// ke status 'lunas' adalah pembayaran yang benar-benar menutup sisa outstanding-nya, dicatat
// Finance di sini. Ini sengaja menggantikan flip manual billing_status='lunas' yang sebelumnya
// bisa dilakukan Sales/Admin lewat updateInvoiceDeliveryStatus (lihat sales-orders.service.js).
//
// Idempotency key wajib dicek SEBELUM validasi saldo:
// replay dari submit yang sama (double-click/retry jaringan) harus balik ke hasil yang sama tanpa
// insert dobel dan tanpa divalidasi ulang terhadap sisa outstanding yang sudah berkurang akibat
// pembayaran pertama (kalau tidak, replay yang sah bisa ditolak keliru sebagai "melebihi outstanding").
export async function recordSalesOrderPayment(id, payload = {}) {
  return withTransaction(async (client) => {
    const locked = await client.query(
      'select id, status, invoice_number, billing_status from sales_orders where id = $1 for update',
      [id],
    );
    if (!locked.rows[0]) {
      const error = new Error('Sales Order tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'SALES_ORDER_NOT_FOUND';
      throw error;
    }
    if (locked.rows[0].status !== 'completed') {
      const error = new Error('Pembayaran hanya bisa dicatat setelah Sales Order selesai.');
      error.statusCode = 400;
      error.code = 'SALES_ORDER_PAYMENT_ORDER_NOT_COMPLETED';
      throw error;
    }
    if (!String(locked.rows[0].invoice_number || '').trim()) {
      const error = new Error('Nomor invoice belum tersedia. Input nomor invoice terlebih dahulu sebelum mencatat pembayaran.');
      error.statusCode = 409;
      error.code = 'SALES_ORDER_PAYMENT_INVOICE_NUMBER_REQUIRED';
      throw error;
    }
    const idempotencyKey = payload.idempotencyKey || null;
    if (idempotencyKey) {
      const existing = await client.query(
        'select * from sales_order_payments where idempotency_key = $1 limit 1',
        [idempotencyKey],
      );
      if (existing.rows[0]) {
        if (!ensurePaymentPayloadMatches(existing.rows[0], payload)) {
          const error = new Error('Percobaan submit ini memakai kunci yang sama dengan pembayaran lain yang datanya berbeda. Silakan catat sebagai entri baru.');
          error.statusCode = 409;
          error.code = 'SALES_ORDER_PAYMENT_IDEMPOTENCY_KEY_MISMATCH';
          throw error;
        }
        const summary = await computeSalesOrderPaymentSummary(client, id);
        return { payment: mapSalesOrderPaymentRow(existing.rows[0]), ...summary };
      }
    }

    const invoiceResult = await client.query(
      `
        ${invoiceOrdersCte()}
        select billing_amount
        from invoice_orders
        where id = $1
        limit 1
      `,
      [id],
    );
    if (!invoiceResult.rows[0]) {
      const error = new Error('Sales Order ini belum siap ditagihkan. Pastikan dokumen lengkap dan sudah diverifikasi Finance.');
      error.statusCode = 409;
      error.code = 'SALES_ORDER_PAYMENT_NOT_INVOICEABLE';
      throw error;
    }
    const billingAmount = Number(invoiceResult.rows[0].billing_amount || 0);

    const paidResult = await client.query(
      'select coalesce(sum(amount), 0)::numeric as total_paid from sales_order_payments where sales_order_id = $1 and voided_at is null',
      [id],
    );
    const totalPaid = Number(paidResult.rows[0].total_paid || 0);
    const remaining = billingAmount - totalPaid;

    // Dicek dari sisa outstanding yang dihitung ulang, bukan dari flag billing_status='lunas' yang
    // tersimpan: billing_amount dihitung live dari finance_rows, jadi sebuah SO yang sudah lunas
    // bisa saja kebuka lagi (mis. koreksi revenue menaikkan tagihan) dan tetap harus bisa dibayar.
    if (remaining <= 0) {
      const error = new Error('Sales Order ini sudah lunas.');
      error.statusCode = 409;
      error.code = 'SALES_ORDER_PAYMENT_ALREADY_PAID';
      throw error;
    }

    const amount = Number(payload.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error('Nominal pembayaran wajib lebih dari 0.');
      error.statusCode = 400;
      error.code = 'SALES_ORDER_PAYMENT_AMOUNT_INVALID';
      throw error;
    }
    if (amount > remaining) {
      const error = new Error(`Nominal pembayaran melebihi sisa outstanding. Sisa outstanding Rp ${remaining.toLocaleString('id-ID')}.`);
      error.statusCode = 409;
      error.code = 'SALES_ORDER_PAYMENT_EXCEEDS_OUTSTANDING';
      throw error;
    }

    const inserted = await client.query(
      `
        insert into sales_order_payments (
          sales_order_id, amount, payment_date, reference_number, proof_attachment_id, note,
          recorded_by_user_id, recorded_by_name, idempotency_key
        )
        values ($1, $2, coalesce($3::date, (now() at time zone 'Asia/Jakarta')::date), $4, $5, $6, $7, $8, $9)
        on conflict (idempotency_key) where idempotency_key is not null do nothing
        returning id, sales_order_id, amount, payment_date, reference_number, note, recorded_by_name, created_at, proof_attachment_id
      `,
      [
        id,
        amount,
        payload.paymentDate || null,
        payload.referenceNumber || null,
        payload.proofAttachmentId || null,
        payload.note || null,
        payload.actorUserId || null,
        payload.actorName || 'Finance',
        idempotencyKey,
      ],
    );

    if (!inserted.rows[0]) {
      const raced = await client.query(
        'select * from sales_order_payments where idempotency_key = $1 limit 1',
        [idempotencyKey],
      );
      if (!raced.rows[0] || !ensurePaymentPayloadMatches(raced.rows[0], payload)) {
        const error = new Error('Percobaan submit ini memakai kunci yang sama dengan pembayaran lain yang datanya berbeda. Silakan catat sebagai entri baru.');
        error.statusCode = 409;
        error.code = 'SALES_ORDER_PAYMENT_IDEMPOTENCY_KEY_MISMATCH';
        throw error;
      }
      const summary = await computeSalesOrderPaymentSummary(client, id);
      return { payment: mapSalesOrderPaymentRow(raced.rows[0]), ...summary };
    }

    const newTotalPaid = totalPaid + amount;
    const isFullyPaid = newTotalPaid >= billingAmount;
    // Kalau status tersimpan sebelumnya 'lunas' tapi ternyata masih ada sisa (billing_amount naik
    // gara-gara koreksi setelah lunas), turunkan lagi ke 'menunggu_pembayaran' supaya statusnya
    // tidak nyangkut "lunas" padahal baru saja terbukti masih ada piutang yang dibayar sebagian.
    const nextBillingStatus = isFullyPaid
      ? 'lunas'
      : (locked.rows[0].billing_status === 'lunas' ? 'menunggu_pembayaran' : locked.rows[0].billing_status);
    if (nextBillingStatus !== locked.rows[0].billing_status) {
      await client.query(
        `
          update sales_orders
          set billing_status = $2,
              updated_by_name = $3,
              updated_at = now()
          where id = $1
        `,
        [id, nextBillingStatus, payload.actorName || 'Finance'],
      );
    }

    return {
      payment: mapSalesOrderPaymentRow(inserted.rows[0]),
      billingAmount,
      totalPaid: newTotalPaid,
      outstandingAmount: Math.max(billingAmount - newTotalPaid, 0),
      billingStatus: nextBillingStatus,
    };
  });
}

// Void resmi untuk pembayaran invoice yang salah catat (SO salah, nominal salah, dsb). Baris
// pembayaran TIDAK dihapus (tetap tersimpan sebagai riwayat, ditandai voided_at/voided_by_name/
// void_reason) supaya jejaknya utuh -- hanya dikeluarkan dari perhitungan total_paid/outstanding.
// Admin-only, alasan wajib (dicek di service layer).
export async function voidSalesOrderPayment(salesOrderId, paymentId, payload = {}) {
  return withTransaction(async (client) => {
    const locked = await client.query(
      'select id, billing_status from sales_orders where id = $1 for update',
      [salesOrderId],
    );
    if (!locked.rows[0]) {
      const error = new Error('Sales Order tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'SALES_ORDER_NOT_FOUND';
      throw error;
    }

    const paymentResult = await client.query(
      'select * from sales_order_payments where id = $1 and sales_order_id = $2 for update',
      [paymentId, salesOrderId],
    );
    const paymentRow = paymentResult.rows[0];
    if (!paymentRow) {
      const error = new Error('Pembayaran tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'SALES_ORDER_PAYMENT_NOT_FOUND';
      throw error;
    }
    if (paymentRow.voided_at) {
      const error = new Error('Pembayaran ini sudah dibatalkan sebelumnya.');
      error.statusCode = 409;
      error.code = 'SALES_ORDER_PAYMENT_ALREADY_VOIDED';
      throw error;
    }

    const reason = String(payload.reason || '').trim();
    if (!reason) {
      const error = new Error('Alasan pembatalan wajib diisi.');
      error.statusCode = 400;
      error.code = 'SALES_ORDER_PAYMENT_VOID_REASON_REQUIRED';
      throw error;
    }

    const voided = await client.query(
      `
        update sales_order_payments
        set voided_at = now(), voided_by_name = $2, void_reason = $3
        where id = $1
        returning id, sales_order_id, amount, payment_date, reference_number, note, recorded_by_name, created_at,
          proof_attachment_id, voided_at, voided_by_name, void_reason
      `,
      [paymentId, payload.actorName || 'Admin', reason],
    );

    const invoiceResult = await client.query(
      `
        ${invoiceOrdersCte()}
        select billing_amount
        from invoice_orders
        where id = $1
        limit 1
      `,
      [salesOrderId],
    );
    const billingAmount = Number(invoiceResult.rows[0]?.billing_amount || 0);
    const paidResult = await client.query(
      'select coalesce(sum(amount), 0)::numeric as total_paid from sales_order_payments where sales_order_id = $1 and voided_at is null',
      [salesOrderId],
    );
    const totalPaid = Number(paidResult.rows[0].total_paid || 0);
    const outstandingAmount = Math.max(billingAmount - totalPaid, 0);
    const nextBillingStatus = outstandingAmount > 0 && locked.rows[0].billing_status === 'lunas'
      ? 'menunggu_pembayaran'
      : locked.rows[0].billing_status;
    if (nextBillingStatus !== locked.rows[0].billing_status) {
      await client.query(
        `update sales_orders set billing_status = $2, updated_by_name = $3, updated_at = now() where id = $1`,
        [salesOrderId, nextBillingStatus, payload.actorName || 'Admin'],
      );
    }

    return {
      payment: mapSalesOrderPaymentRow(voided.rows[0]),
      billingAmount,
      totalPaid,
      outstandingAmount,
      billingStatus: nextBillingStatus,
    };
  });
}

// Debit Note (reimbursement) receivable: mirror persis pola Invoice Outstanding di atas, tapi
// sumber tagihannya container_job_expenses (expense_group='reimbursement'), bukan finance_rows.
// Digabung satu Debit Note per SO (jumlah seluruh item reimbursement pada SO tersebut), sengaja
// TIDAK digabung ke angka Trucking OTS (lihat FiturOutstanding.md prinsip #10).
function debitNoteOrdersCte() {
  return `
    with debit_note_expense_totals as (
      select
        sales_order_id,
        sum(amount)::numeric as debit_note_amount,
        count(*)::int as item_count
      from container_job_expenses
      where expense_group = 'reimbursement'
        and sales_order_id is not null
        and payment_status <> 'batal'
      group by sales_order_id
    ),
    debit_note_orders as (
      select
        so.id,
        coalesce(so.accurate_so_number, so.so_number) as so_number,
        so.customer_name,
        so.destination,
        coalesce(
          (
            select array_agg(distinct cj.destination) filter (where cj.destination is not null and cj.destination <> '')
            from container_jobs cj
            where cj.sales_order_id = so.id
          ),
          array[]::text[]
        ) as destinations,
        so.debit_note_number,
        so.debit_note_issued_at,
        so.debit_note_input_by_name,
        case
          when so.debit_note_issued_at is null then null
          when lower(coalesce(so.payment_type, 'cash')) = 'tempo'
            then so.debit_note_issued_at + (greatest(coalesce(so.payment_term_days, 0), 1) * interval '1 day')
          else so.debit_note_issued_at
        end as due_date,
        ${paymentTermsExpression('so')} as payment_terms,
        det.debit_note_amount,
        det.item_count
      from sales_orders so
      join debit_note_expense_totals det on det.sales_order_id = so.id
      where so.status = 'completed'
    )
  `;
}

function buildDebitNoteFilters(options = {}) {
  const clauses = [];
  const params = [];

  if (options.status === 'need-number') {
    clauses.push(`nullif(btrim(debit_note_number), '') is null`);
  } else if (options.status === 'issued') {
    clauses.push(`nullif(btrim(debit_note_number), '') is not null`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so_number ilike $${params.length}
      or accurate_so_number ilike $${params.length}
      or ${orderNumberSearchFromColumnSql('id')} ilike $${params.length}
      or debit_note_number ilike $${params.length}
      or customer_name ilike $${params.length}
      or destination ilike $${params.length}
    )`);
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

function mapDebitNoteOrderRow(row) {
  return {
    id: row.id,
    soNumber: getDisplayFinanceSoNumber(row) || '-',
    customer: row.customer_name || '-',
    destination: row.destination || '-',
    destinations: Array.isArray(row.destinations) ? row.destinations.filter(Boolean) : [],
    debitNoteNumber: row.debit_note_number || '',
    debitNoteIssuedAt: row.debit_note_issued_at,
    debitNoteInputBy: row.debit_note_input_by_name || '',
    dueDate: row.due_date,
    paymentTerms: row.payment_terms || '-',
    debitNoteAmount: Number(row.debit_note_amount || 0),
    itemCount: Number(row.item_count || 0),
  };
}

export async function getDebitNoteOrdersPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildDebitNoteFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${debitNoteOrdersCte()}
        select *
        from debit_note_orders
        ${whereSql}
        order by debit_note_issued_at desc nulls last, so_number desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        ${debitNoteOrdersCte()}
        select count(*)::int as total
        from debit_note_orders
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        ${debitNoteOrdersCte()}
        select
          count(*) filter (where nullif(btrim(debit_note_number), '') is null)::int as need_number,
          count(*) filter (where nullif(btrim(debit_note_number), '') is not null)::int as issued
        from debit_note_orders
      `,
      [],
    ),
  ]);

  return {
    rows: rows.rows.map(mapDebitNoteOrderRow),
    total: Number(total.rows[0]?.total || 0),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Number(total.rows[0]?.total || 0) / pageSize)),
    summary: {
      needNumber: Number(summary.rows[0]?.need_number || 0),
      issued: Number(summary.rows[0]?.issued || 0),
    },
  };
}

export async function updateDebitNoteNumber(id, payload = {}) {
  const debitNoteNumber = String(payload.debitNoteNumber || '').trim();
  if (!debitNoteNumber) {
    const error = new Error('Nomor Debit Note wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select id, debit_note_number
        from sales_orders
        where id = $1
          and status = 'completed'
      `,
      [id],
    );
    if (!existing.rows[0]) {
      const error = new Error('Sales Order selesai untuk Debit Note tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'FINANCE_DEBIT_NOTE_ORDER_NOT_FOUND';
      throw error;
    }

    const currentNumber = String(existing.rows[0].debit_note_number || '').trim();
    if (currentNumber && currentNumber.toLowerCase() !== debitNoteNumber.toLowerCase()) {
      const error = new Error('Nomor Debit Note sudah terisi.');
      error.statusCode = 409;
      error.code = 'DEBIT_NOTE_NUMBER_ALREADY_SET';
      throw error;
    }

    const duplicate = await client.query(
      `
        select id
        from sales_orders
        where lower(debit_note_number) = lower($1)
          and id <> $2
        limit 1
      `,
      [debitNoteNumber, id],
    );
    if (duplicate.rows[0]) {
      const error = new Error('Nomor Debit Note sudah digunakan oleh Sales Order lain.');
      error.statusCode = 409;
      error.code = 'DEBIT_NOTE_NUMBER_DUPLICATE';
      throw error;
    }

    await client.query(
      `
        update sales_orders
        set debit_note_number = $1,
            debit_note_issued_at = coalesce(debit_note_issued_at, now()),
            debit_note_input_by_name = coalesce(debit_note_input_by_name, $2),
            updated_by_name = $2,
            updated_at = now()
        where id = $3
      `,
      [debitNoteNumber, payload.actorName || 'Finance', id],
    );

    const updated = await client.query(
      `
        ${debitNoteOrdersCte()}
        select *
        from debit_note_orders
        where id = $1
        limit 1
      `,
      [id],
    );
    return updated.rows[0] ? mapDebitNoteOrderRow(updated.rows[0]) : null;
  });
}

function debitNoteOutstandingCte() {
  return `
    ${debitNoteOrdersCte()},
    debit_note_payment_totals as (
      select sales_order_id, coalesce(sum(amount), 0)::numeric as total_paid
      from debit_note_payments
      where voided_at is null
      group by sales_order_id
    ),
    debit_note_outstanding_all as (
      select
        dno.*,
        coalesce(pt.total_paid, 0)::numeric as total_paid,
        greatest(dno.debit_note_amount - coalesce(pt.total_paid, 0), 0)::numeric as outstanding_amount,
        case
          when dno.due_date is null then 'unknown'
          when (dno.due_date at time zone 'Asia/Jakarta')::date >= (now() at time zone 'Asia/Jakarta')::date then 'current'
          when (now() at time zone 'Asia/Jakarta')::date - (dno.due_date at time zone 'Asia/Jakarta')::date <= 30 then 'overdue_1_30'
          when (now() at time zone 'Asia/Jakarta')::date - (dno.due_date at time zone 'Asia/Jakarta')::date <= 60 then 'overdue_31_60'
          when (now() at time zone 'Asia/Jakarta')::date - (dno.due_date at time zone 'Asia/Jakarta')::date <= 90 then 'overdue_61_90'
          else 'overdue_90_plus'
        end as aging_bucket,
        case
          when dno.due_date is null then 0
          else greatest(((now() at time zone 'Asia/Jakarta')::date - (dno.due_date at time zone 'Asia/Jakarta')::date)::int, 0)
        end as days_overdue
      from debit_note_orders dno
      left join debit_note_payment_totals pt on pt.sales_order_id = dno.id
      where nullif(btrim(dno.debit_note_number), '') is not null
    ),
    debit_note_outstanding as (
      select *
      from debit_note_outstanding_all
      where outstanding_amount > 0
    )
  `;
}

function buildDebitNoteOutstandingFilters(options = {}) {
  const clauses = [];
  const params = [];

  if (options.agingBucket) {
    params.push(options.agingBucket);
    clauses.push(`aging_bucket = $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so_number ilike $${params.length}
      or debit_note_number ilike $${params.length}
      or customer_name ilike $${params.length}
      or destination ilike $${params.length}
    )`);
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

function mapDebitNoteOutstandingRow(row) {
  return {
    id: row.id,
    soNumber: getDisplayFinanceSoNumber(row) || '-',
    debitNoteNumber: row.debit_note_number || '',
    customer: row.customer_name || '-',
    destination: row.destination || '-',
    debitNoteAmount: Number(row.debit_note_amount || 0),
    totalPaid: Number(row.total_paid || 0),
    outstandingAmount: Number(row.outstanding_amount || 0),
    debitNoteIssuedAt: row.debit_note_issued_at,
    dueDate: row.due_date,
    paymentTerms: row.payment_terms || '-',
    agingBucket: row.aging_bucket,
    daysOverdue: Number(row.days_overdue || 0),
  };
}

export async function getDebitNoteOutstandingPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildDebitNoteOutstandingFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, summary] = await Promise.all([
    query(
      `
        ${debitNoteOutstandingCte()}
        select *, count(*) over ()::int as full_count
        from debit_note_outstanding
        ${whereSql}
        order by due_date asc nulls last, so_number asc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        ${debitNoteOutstandingCte()}
        select
          coalesce(sum(outstanding_amount), 0)::numeric as total_outstanding_amount,
          count(*)::int as total_orders,
          count(*) filter (where aging_bucket = 'current')::int as current_count,
          count(*) filter (where aging_bucket = 'overdue_1_30')::int as overdue_1_30_count,
          count(*) filter (where aging_bucket = 'overdue_31_60')::int as overdue_31_60_count,
          count(*) filter (where aging_bucket = 'overdue_61_90')::int as overdue_61_90_count,
          count(*) filter (where aging_bucket = 'overdue_90_plus')::int as overdue_90_plus_count,
          count(*) filter (where aging_bucket = 'unknown')::int as unknown_due_date_count
        from debit_note_outstanding
      `,
      [],
    ),
  ]);

  const total = rows.rows[0]?.full_count ? Number(rows.rows[0].full_count) : 0;

  return {
    rows: rows.rows.map(mapDebitNoteOutstandingRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      totalOutstandingAmount: Number(summary.rows[0]?.total_outstanding_amount || 0),
      totalOrders: Number(summary.rows[0]?.total_orders || 0),
      current: Number(summary.rows[0]?.current_count || 0),
      overdue1To30: Number(summary.rows[0]?.overdue_1_30_count || 0),
      overdue31To60: Number(summary.rows[0]?.overdue_31_60_count || 0),
      overdue61To90: Number(summary.rows[0]?.overdue_61_90_count || 0),
      overdue90Plus: Number(summary.rows[0]?.overdue_90_plus_count || 0),
      unknownDueDate: Number(summary.rows[0]?.unknown_due_date_count || 0),
    },
  };
}

function mapDebitNotePaymentRow(row = {}) {
  return {
    id: row.id,
    salesOrderId: row.sales_order_id,
    amount: Number(row.amount || 0),
    paymentDate: row.payment_date,
    referenceNumber: row.reference_number || '',
    note: row.note || '',
    recordedByName: row.recorded_by_name || '',
    proofAttachmentId: row.proof_attachment_id || null,
    createdAt: row.created_at,
    voidedAt: row.voided_at || null,
    voidedByName: row.voided_by_name || '',
    voidReason: row.void_reason || '',
  };
}

export async function listDebitNotePayments(salesOrderId) {
  const result = await query(
    `
      select id, sales_order_id, amount, payment_date, reference_number, note, recorded_by_name, created_at,
        proof_attachment_id, voided_at, voided_by_name, void_reason
      from debit_note_payments
      where sales_order_id = $1
      order by payment_date desc, created_at desc
    `,
    [salesOrderId],
  );
  return result.rows.map(mapDebitNotePaymentRow);
}

async function computeDebitNotePaymentSummary(client, id) {
  const debitNoteResult = await client.query(
    `
      ${debitNoteOrdersCte()}
      select debit_note_amount
      from debit_note_orders
      where id = $1
      limit 1
    `,
    [id],
  );
  const debitNoteAmount = Number(debitNoteResult.rows[0]?.debit_note_amount || 0);

  const paidResult = await client.query(
    'select coalesce(sum(amount), 0)::numeric as total_paid from debit_note_payments where sales_order_id = $1 and voided_at is null',
    [id],
  );
  const totalPaid = Number(paidResult.rows[0]?.total_paid || 0);

  return {
    debitNoteAmount,
    totalPaid,
    outstandingAmount: Math.max(debitNoteAmount - totalPaid, 0),
  };
}

function ensureDebitNotePaymentPayloadMatches(existingRow, payload) {
  return Number(existingRow.amount) === Number(payload.amount)
    && String(existingRow.reference_number || '') === String(payload.referenceNumber || '')
    && String(existingRow.note || '') === String(payload.note || '');
}

export async function recordDebitNotePayment(id, payload = {}) {
  return withTransaction(async (client) => {
    const locked = await client.query(
      'select id, status, debit_note_number from sales_orders where id = $1 for update',
      [id],
    );
    if (!locked.rows[0]) {
      const error = new Error('Sales Order tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'SALES_ORDER_NOT_FOUND';
      throw error;
    }
    if (locked.rows[0].status !== 'completed') {
      const error = new Error('Pembayaran Debit Note hanya bisa dicatat setelah Sales Order selesai.');
      error.statusCode = 400;
      error.code = 'DEBIT_NOTE_PAYMENT_ORDER_NOT_COMPLETED';
      throw error;
    }
    if (!String(locked.rows[0].debit_note_number || '').trim()) {
      const error = new Error('Nomor Debit Note belum tersedia. Input nomor Debit Note terlebih dahulu sebelum mencatat pembayaran.');
      error.statusCode = 409;
      error.code = 'DEBIT_NOTE_PAYMENT_NUMBER_REQUIRED';
      throw error;
    }
    if (!payload.proofAttachmentId) {
      const error = new Error('Bukti transfer wajib dilampirkan sebelum pembayaran bisa dicatat.');
      error.statusCode = 400;
      error.code = 'DEBIT_NOTE_PAYMENT_PROOF_REQUIRED';
      throw error;
    }

    const idempotencyKey = payload.idempotencyKey || null;
    if (idempotencyKey) {
      const existing = await client.query(
        'select * from debit_note_payments where idempotency_key = $1 limit 1',
        [idempotencyKey],
      );
      if (existing.rows[0]) {
        if (!ensureDebitNotePaymentPayloadMatches(existing.rows[0], payload)) {
          const error = new Error('Percobaan submit ini memakai kunci yang sama dengan pembayaran lain yang datanya berbeda. Silakan catat sebagai entri baru.');
          error.statusCode = 409;
          error.code = 'DEBIT_NOTE_PAYMENT_IDEMPOTENCY_KEY_MISMATCH';
          throw error;
        }
        const summary = await computeDebitNotePaymentSummary(client, id);
        return { payment: mapDebitNotePaymentRow(existing.rows[0]), ...summary };
      }
    }

    const debitNoteResult = await client.query(
      `
        ${debitNoteOrdersCte()}
        select debit_note_amount
        from debit_note_orders
        where id = $1
        limit 1
      `,
      [id],
    );
    if (!debitNoteResult.rows[0]) {
      const error = new Error('Sales Order ini belum memiliki biaya reimbursement yang bisa ditagihkan.');
      error.statusCode = 409;
      error.code = 'DEBIT_NOTE_PAYMENT_NOT_BILLABLE';
      throw error;
    }
    const debitNoteAmount = Number(debitNoteResult.rows[0].debit_note_amount || 0);

    const paidResult = await client.query(
      'select coalesce(sum(amount), 0)::numeric as total_paid from debit_note_payments where sales_order_id = $1 and voided_at is null',
      [id],
    );
    const totalPaid = Number(paidResult.rows[0].total_paid || 0);
    const remaining = debitNoteAmount - totalPaid;

    if (remaining <= 0) {
      const error = new Error('Debit Note ini sudah lunas.');
      error.statusCode = 409;
      error.code = 'DEBIT_NOTE_PAYMENT_ALREADY_PAID';
      throw error;
    }

    const amount = Number(payload.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error('Nominal pembayaran wajib lebih dari 0.');
      error.statusCode = 400;
      error.code = 'DEBIT_NOTE_PAYMENT_AMOUNT_INVALID';
      throw error;
    }
    if (amount > remaining) {
      const error = new Error(`Nominal pembayaran melebihi sisa outstanding. Sisa outstanding Rp ${remaining.toLocaleString('id-ID')}.`);
      error.statusCode = 409;
      error.code = 'DEBIT_NOTE_PAYMENT_EXCEEDS_OUTSTANDING';
      throw error;
    }

    const inserted = await client.query(
      `
        insert into debit_note_payments (
          sales_order_id, amount, payment_date, reference_number, proof_attachment_id, note,
          recorded_by_user_id, recorded_by_name, idempotency_key
        )
        values ($1, $2, coalesce($3::date, (now() at time zone 'Asia/Jakarta')::date), $4, $5, $6, $7, $8, $9)
        on conflict (idempotency_key) where idempotency_key is not null do nothing
        returning id, sales_order_id, amount, payment_date, reference_number, note, recorded_by_name, created_at, proof_attachment_id
      `,
      [
        id,
        amount,
        payload.paymentDate || null,
        payload.referenceNumber || null,
        payload.proofAttachmentId || null,
        payload.note || null,
        payload.actorUserId || null,
        payload.actorName || 'Finance',
        idempotencyKey,
      ],
    );

    if (!inserted.rows[0]) {
      const raced = await client.query(
        'select * from debit_note_payments where idempotency_key = $1 limit 1',
        [idempotencyKey],
      );
      if (!raced.rows[0] || !ensureDebitNotePaymentPayloadMatches(raced.rows[0], payload)) {
        const error = new Error('Percobaan submit ini memakai kunci yang sama dengan pembayaran lain yang datanya berbeda. Silakan catat sebagai entri baru.');
        error.statusCode = 409;
        error.code = 'DEBIT_NOTE_PAYMENT_IDEMPOTENCY_KEY_MISMATCH';
        throw error;
      }
      const summary = await computeDebitNotePaymentSummary(client, id);
      return { payment: mapDebitNotePaymentRow(raced.rows[0]), ...summary };
    }

    return {
      payment: mapDebitNotePaymentRow(inserted.rows[0]),
      debitNoteAmount,
      totalPaid: totalPaid + amount,
      outstandingAmount: Math.max(debitNoteAmount - (totalPaid + amount), 0),
    };
  });
}

// Void resmi untuk pembayaran Debit Note yang salah catat -- mirror persis voidSalesOrderPayment
// di atas (baris tidak dihapus, hanya ditandai voided_at/voided_by_name/void_reason dan
// dikeluarkan dari perhitungan total_paid/outstanding). Admin-only, alasan wajib.
export async function voidDebitNotePayment(salesOrderId, paymentId, payload = {}) {
  return withTransaction(async (client) => {
    const locked = await client.query('select id from sales_orders where id = $1 for update', [salesOrderId]);
    if (!locked.rows[0]) {
      const error = new Error('Sales Order tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'SALES_ORDER_NOT_FOUND';
      throw error;
    }

    const paymentResult = await client.query(
      'select * from debit_note_payments where id = $1 and sales_order_id = $2 for update',
      [paymentId, salesOrderId],
    );
    const paymentRow = paymentResult.rows[0];
    if (!paymentRow) {
      const error = new Error('Pembayaran Debit Note tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'DEBIT_NOTE_PAYMENT_NOT_FOUND';
      throw error;
    }
    if (paymentRow.voided_at) {
      const error = new Error('Pembayaran ini sudah dibatalkan sebelumnya.');
      error.statusCode = 409;
      error.code = 'DEBIT_NOTE_PAYMENT_ALREADY_VOIDED';
      throw error;
    }

    const reason = String(payload.reason || '').trim();
    if (!reason) {
      const error = new Error('Alasan pembatalan wajib diisi.');
      error.statusCode = 400;
      error.code = 'DEBIT_NOTE_PAYMENT_VOID_REASON_REQUIRED';
      throw error;
    }

    const voided = await client.query(
      `
        update debit_note_payments
        set voided_at = now(), voided_by_name = $2, void_reason = $3
        where id = $1
        returning id, sales_order_id, amount, payment_date, reference_number, note, recorded_by_name, created_at,
          proof_attachment_id, voided_at, voided_by_name, void_reason
      `,
      [paymentId, payload.actorName || 'Admin', reason],
    );

    const summary = await computeDebitNotePaymentSummary(client, salesOrderId);

    return {
      payment: mapDebitNotePaymentRow(voided.rows[0]),
      ...summary,
    };
  });
}

export async function getCompletedTripsPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildFinanceFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${financeRowsCte()}
        select *
        from finance_rows
        ${whereSql}
        order by completed_at desc nulls last, so_number asc, container_number asc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        ${financeRowsCte()}
        select count(*)::int as total
        from finance_rows
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        ${financeRowsCte()}
        select count(distinct customer_name)::int as customers,
               count(distinct destination)::int as destinations
        from finance_rows
        ${whereSql}
      `,
      params,
    ),
  ]);

  return {
    rows: rows.rows.map(mapFinanceRow),
    total: Number(total.rows[0]?.total || 0),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Number(total.rows[0]?.total || 0) / pageSize)),
    summary: {
      customers: Number(summary.rows[0]?.customers || 0),
      destinations: Number(summary.rows[0]?.destinations || 0),
    },
  };
}

export async function getCompletedTripDetail(id) {
  const trip = await query(
    `
      ${financeRowsCte()}
      select *
      from finance_rows
      where id = $1
      limit 1
    `,
    [id],
  );

  if (!trip.rows[0]) return null;

  const attachments = await query(
    `
      select id, entity_id, category, reference_number, document_date, file_name, storage_path,
             mime_type, file_size, notes, uploaded_by_name, created_at
      from attachments
      where entity_type = 'container_job'
        and entity_id = $1
      order by created_at asc
    `,
    [id],
  );

  return {
    ...mapFinanceRow(trip.rows[0]),
    attachments: attachments.rows.map(mapAttachment),
  };
}
