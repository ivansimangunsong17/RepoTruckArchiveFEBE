import { query } from '../../db/client.js';

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function normalizeInvoiceStatusExpression(column = 'billing_status') {
  return `
    case
      when ${column} in ('draft') then 'DRAFT'
      when ${column} in ('belum_dikirim', 'invoice_issued') then 'SUDAH_DIBUAT'
      when ${column} in ('belum_diterima', 'belum_dikonfirmasi', 'menunggu_pembayaran', 'waiting_payment') then 'SUDAH_DIKIRIM'
      when ${column} in ('lunas', 'paid') then 'LUNAS'
      else 'BELUM_DIBUAT'
    end
  `;
}

function financeRowsCte() {
  const invoiceStatusSql = normalizeInvoiceStatusExpression('so.billing_status');

  return `
    with attachment_flags as (
      select entity_id,
             bool_or(category = 'spkDocument') as has_spk_file,
             bool_or(category = 'loadingVoucherDocument') as has_loading_file,
             bool_or(category in ('tilaGatepassDocumentFile', 'unloadingVoucherDocument', 'weighingDocumentFile', 'deliveryCard', 'gatepass')) as has_tila_gatepass_file,
             bool_or(category = 'travelDocumentFile') as has_travel_file
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
    finance_rows as (
      select
        cj.id,
        cj.sales_order_id,
        so.so_number,
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
        so.destination,
        so.trip_date,
        so.price,
        so.total_amount,
        cj.container_number,
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
        cj.received_at,
        cj.running_at,
        cj.completed_at,
        cj.assignment_snapshot,
        coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1)) as tariff,
        1::int as trip_quantity,
        coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1)) as total_revenue,
        case
          when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(dl.uj_40ft, 0)
          else nullif(dl.uj_20ft, 0)
        end as journey_money,
        coalesce(((regexp_match(coalesce(cj.rpuj_notes, ''), '"amount"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)'))[1])::numeric, 0) as additional_cost,
        case
          when coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1)) is not null
            and case
              when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(dl.uj_40ft, 0)
              else nullif(dl.uj_20ft, 0)
            end is not null
          then coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1))
            - case
              when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(dl.uj_40ft, 0)
              else nullif(dl.uj_20ft, 0)
            end
            - coalesce(((regexp_match(coalesce(cj.rpuj_notes, ''), '"amount"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)'))[1])::numeric, 0)
          else null
        end as estimated_margin,
        case
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
            when coalesce(nullif(so.price, 0), nullif(so.total_amount, 0) / greatest(coalesce(jc.total_jobs, 1), 1)) is not null
              and case
                when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(dl.uj_40ft, 0)
                else nullif(dl.uj_20ft, 0)
              end is not null
            then 'SIAP_DITAGIHKAN'
            else 'LENGKAP'
          end
          else 'BELUM_LENGKAP'
        end as document_status,
        (nullif(btrim(cj.spk_number), '') is not null or coalesce(af.has_spk_file, false)) as has_spk_document,
        (nullif(btrim(cj.loading_voucher_number), '') is not null or coalesce(af.has_loading_file, false)) as has_loading_document,
        (
          nullif(btrim(coalesce(cj.tila_gatepass_document_number, cj.unloading_voucher_number, cj.weighing_document_number, '')), '') is not null
          or coalesce(af.has_tila_gatepass_file, false)
        ) as has_tila_gatepass_document,
        (nullif(btrim(cj.travel_document_number), '') is not null or coalesce(af.has_travel_file, false)) as has_travel_document
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join job_counts jc on jc.sales_order_id = so.id
      left join destination_locations dl on lower(trim(dl.name)) = lower(trim(so.destination)) and dl.archived_at is null
      left join attachment_flags af on af.entity_id = cj.id
      where cj.status = 'completed'
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

function mapFinanceRow(row) {
  const tariff = row.tariff == null ? null : Number(row.tariff);
  const totalRevenue = row.total_revenue == null ? null : Number(row.total_revenue);
  const journeyMoney = row.journey_money == null ? null : Number(row.journey_money);
  const additionalCost = Number(row.additional_cost || 0);
  const estimatedMargin = row.estimated_margin == null ? null : Number(row.estimated_margin);

  return {
    id: row.id,
    orderId: row.sales_order_id,
    completedDate: row.completed_at,
    soNumber: row.so_number,
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
    journeyMoney,
    additionalCost,
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

export async function getFinanceDashboard(options = {}) {
  const { whereSql, params } = buildFinanceFilters(options);
  const result = await query(
    `
      ${financeRowsCte()}
      select
        count(*)::int as total_completed_trips,
        count(distinct customer_name)::int as total_customers,
        coalesce(sum(trip_quantity), 0)::int as total_completed_containers,
        coalesce(sum(total_revenue) filter (where total_revenue is not null), 0)::numeric as total_revenue,
        coalesce(sum(journey_money) filter (where journey_money is not null), 0)::numeric as total_journey_money,
        coalesce(sum(additional_cost), 0)::numeric as total_additional_cost,
        coalesce(sum(estimated_margin) filter (where estimated_margin is not null), 0)::numeric as estimated_margin,
        count(*) filter (where document_status = 'SIAP_DITAGIHKAN' and invoice_status = 'BELUM_DIBUAT')::int as ready_to_invoice,
        count(*) filter (where document_status = 'BELUM_LENGKAP')::int as incomplete_documents,
        count(*) filter (where invoice_status = 'BELUM_DIBUAT')::int as not_invoiced,
        count(*) filter (where invoice_status <> 'BELUM_DIBUAT')::int as invoiced,
        count(*) filter (where total_revenue is null)::int as missing_revenue,
        count(*) filter (where journey_money is null)::int as missing_journey_money
      from finance_rows
      ${whereSql}
    `,
    params,
  );

  const row = result.rows[0] || {};
  return {
    totalCompletedTrips: Number(row.total_completed_trips || 0),
    totalCustomers: Number(row.total_customers || 0),
    totalCompletedContainers: Number(row.total_completed_containers || 0),
    totalRevenue: Number(row.total_revenue || 0),
    totalJourneyMoney: Number(row.total_journey_money || 0),
    totalAdditionalCost: Number(row.total_additional_cost || 0),
    estimatedMargin: Number(row.estimated_margin || 0),
    readyToInvoice: Number(row.ready_to_invoice || 0),
    incompleteDocuments: Number(row.incomplete_documents || 0),
    notInvoiced: Number(row.not_invoiced || 0),
    invoiced: Number(row.invoiced || 0),
    missingRevenue: Number(row.missing_revenue || 0),
    missingJourneyMoney: Number(row.missing_journey_money || 0),
  };
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
