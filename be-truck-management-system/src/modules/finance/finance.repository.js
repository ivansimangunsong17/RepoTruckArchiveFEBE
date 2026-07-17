import { query, withTransaction } from '../../db/client.js';

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
  return row.finance_verification_status === 'verified' && row.so_number ? 'verified' : 'pending_so';
}

function mapOrderVerificationRow(row) {
  const verificationStatus = normalizeVerificationStatus(row);
  const referenceDocuments = parseJsonArray(row.reference_documents);

  return {
    id: row.id,
    orderDate: row.so_date,
    salesName: row.created_by_name || row.sales_name || 'Sales',
    customer: row.customer_name,
    customerPic: row.customer_pic,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    destination: row.destination,
    origin: row.origin,
    orderType: row.shipment_type,
    paymentTerms: row.payment_terms || '-',
    runningDate: row.trip_date,
    container: formatContainerSummary(row),
    vesselName: row.vessel_name,
    terminal: row.terminal,
    depo: row.origin,
    document: referenceDocuments[0]?.file?.name || referenceDocuments[0]?.referenceNumber || '-',
    notes: row.notes || row.job_description || '',
    status: verificationStatus === 'verified' ? 'No. SO Terisi' : 'Menunggu No. SO Accurate',
    verificationStatus,
    soNumber: row.so_number || '',
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

function buildOrderVerificationFilters(options = {}) {
  const clauses = ["so.status not in ('completed', 'cancelled')"];
  const params = [];

  if (options.status === 'pending_so') {
    clauses.push("(so.finance_verification_status <> 'verified' or nullif(btrim(so.so_number), '') is null)");
  } else if (options.status === 'verified') {
    clauses.push("so.finance_verification_status = 'verified'");
    clauses.push("nullif(btrim(so.so_number), '') is not null");
  }

  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or so.destination ilike $${params.length}
      or so.created_by_name ilike $${params.length}
      or so.sales_name ilike $${params.length}
    )`);
  }

  return {
    whereSql: `where ${clauses.join(' and ')}`,
    params,
  };
}

function buildRpujFilters(options = {}) {
  const clauses = [
    "so.status <> 'cancelled'",
    "so.finance_verification_status = 'verified'",
    "nullif(btrim(so.so_number), '') is not null",
    "cj.rpuj_status <> 'pending'",
  ];
  const params = [];

  if (options.status) {
    params.push(String(options.status).trim());
    clauses.push(`cj.rpuj_status = $${params.length}`);
  }

  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or so.destination ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
    )`);
  }

  return {
    whereSql: `where ${clauses.join(' and ')}`,
    params,
  };
}

function buildInvoiceFilters(options = {}) {
  const clauses = [];
  const params = [];

  if (options.status === 'need-number') {
    clauses.push("nullif(btrim(invoice_number), '') is null");
  } else if (options.status === 'in-progress') {
    clauses.push("nullif(btrim(invoice_number), '') is not null");
    clauses.push("billing_status <> 'lunas'");
  } else if (options.status === 'paid') {
    clauses.push("billing_status = 'lunas'");
  }

  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so_number ilike $${params.length}
      or invoice_number ilike $${params.length}
      or customer_name ilike $${params.length}
      or destination ilike $${params.length}
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
      cj.spk_number,
      cj.assignment_snapshot,
      so.so_number,
      so.customer_name,
      so.shipment_type,
      so.origin,
      so.destination,
      so.trip_date,
      so.terminal,
      case
        when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(dl.uj_40ft, 0)
        else nullif(dl.uj_20ft, 0)
      end as journey_money,
      tp.id as transfer_proof_id,
      tp.file_name as transfer_proof_file_name,
      tp.storage_path as transfer_proof_storage_path,
      tp.mime_type as transfer_proof_mime_type,
      tp.file_size as transfer_proof_file_size
    from container_jobs cj
    join sales_orders so on so.id = cj.sales_order_id
    left join destination_locations dl on lower(trim(dl.name)) = lower(trim(so.destination)) and dl.archived_at is null
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
    soNumber: row.so_number,
    jobNumber: row.container_number || `JOB-${String(row.id || '').slice(0, 8).toUpperCase()}`,
    customer: row.customer_name,
    destination: row.destination,
    driver: row.assignment_snapshot?.driver || null,
    driverBankAccount: row.assignment_snapshot?.driverBankAccount || row.assignment_snapshot?.bankAccount || '',
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
    notes: otherCost.notes || row.rpuj_rejection_note || '',
    totalUj,
    additionalCost,
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
  };
}

function mapInvoiceStatusLabel(row) {
  if (row.billing_status === 'lunas') return 'Lunas';
  if (row.invoice_number) return 'Menunggu Update Status';
  return 'Butuh Nomor Invoice';
}

function mapPaymentStatusLabel(status) {
  const labels = {
    belum_invoice: '-',
    belum_dikirim: 'Menunggu Sales',
    belum_diterima: 'Dikirim ke Customer',
    belum_dikonfirmasi: 'Diterima Customer',
    menunggu_pembayaran: 'Follow Up',
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
  const activityLogs = [];
  if (row.completed_at) activityLogs.push(`${new Date(row.completed_at).toISOString()} - Operational menyelesaikan job`);
  if (documentStatus === 'Siap Ditagihkan') activityLogs.push(`${new Date(row.completed_at || row.updated_at).toISOString()} - Dokumen siap invoice`);
  if (invoiceNumber && row.invoice_issued_at) activityLogs.push(`${new Date(row.invoice_issued_at).toISOString()} - Finance input nomor invoice`);

  return {
    id: row.id,
    orderId: row.id,
    soNumber: row.so_number || '-',
    invoiceNumber,
    invoiceDate: row.invoice_issued_at,
    customer: row.customer_name || '-',
    destination: row.destination || '-',
    completedAt: row.completed_at,
    documentStatus,
    billingAmount: row.billing_amount == null ? 0 : Number(row.billing_amount),
    paymentTerms: row.payment_terms || '-',
    dueDate: null,
    billingItems: billingItems.length ? billingItems : ['Rincian tagihan belum tersedia'],
    documentChecklist: [
      { label: 'Nomor SO', ready: Boolean(row.so_number) },
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
  };
}

function invoiceOrdersCte() {
  return `
    ${financeRowsCte()},
    invoice_orders as (
      select
        so.id,
        so.so_number,
        so.invoice_number,
        coalesce(so.billing_status, 'belum_invoice') as billing_status,
        so.invoice_issued_at,
        so.invoice_input_by_name,
        so.customer_name,
        so.destination,
        so.updated_at,
        null::text as payment_terms,
        max(fr.completed_at) as completed_at,
        count(fr.id)::int as total_jobs_count,
        count(fr.id) filter (where fr.document_status = 'BELUM_LENGKAP')::int as incomplete_documents_count,
        count(fr.id) filter (where fr.document_status = 'SIAP_DITAGIHKAN')::int as ready_documents_count,
        coalesce(sum(fr.total_revenue) filter (where fr.total_revenue is not null), nullif(so.total_amount, 0), 0)::numeric as billing_amount,
        bool_and(fr.has_loading_document) as has_loading_document,
        bool_and(fr.has_tila_gatepass_document) as has_tila_gatepass_document,
        bool_and(fr.has_travel_document) as has_travel_document,
        array_remove(array_agg(distinct concat(coalesce(fr.service_name, 'Jasa Angkut'), ' ', coalesce(fr.container_size, ''), ' - ', fr.trip_quantity, ' ritase')), null) as billing_items
      from sales_orders so
      join finance_rows fr on fr.sales_order_id = so.id
      where so.status = 'completed'
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
    ),
    query(
      `
        ${invoiceOrdersCte()}
        select
          (
            select count(*)::int
            from sales_orders so
            where so.status not in ('completed', 'cancelled')
              and (so.finance_verification_status <> 'verified' or nullif(btrim(so.so_number), '') is null)
          ) as pending_so,
          (
            select count(*)::int
            from sales_orders so
            where so.status not in ('completed', 'cancelled')
              and so.finance_verification_status = 'verified'
              and nullif(btrim(so.so_number), '') is not null
          ) as verified_orders,
          (
            select count(*)::int
            from container_jobs cj
            join sales_orders so on so.id = cj.sales_order_id
            where so.status <> 'cancelled'
              and cj.rpuj_status = 'submitted'
          ) as rpuj_submitted,
          (
            select count(*)::int
            from container_jobs cj
            join sales_orders so on so.id = cj.sales_order_id
            where so.status <> 'cancelled'
              and cj.rpuj_status = 'approved'
          ) as rpuj_approved_waiting_transfer,
          (
            select count(*)::int
            from container_jobs cj
            join sales_orders so on so.id = cj.sales_order_id
            where so.status <> 'cancelled'
              and cj.rpuj_status = 'paid'
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
          ) as invoice_paid
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
    totalJourneyMoney: Number(row.total_journey_money || 0),
    totalAdditionalCost: Number(row.total_additional_cost || 0),
    estimatedMargin: Number(row.estimated_margin || 0),
    readyToInvoice: Number(row.ready_to_invoice || 0),
    incompleteDocuments: Number(row.incomplete_documents || 0),
    notInvoiced: Number(row.not_invoiced || 0),
    invoiced: Number(row.invoiced || 0),
    missingRevenue: Number(row.missing_revenue || 0),
    missingJourneyMoney: Number(row.missing_journey_money || 0),
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
  };
}

export async function getOrderVerificationsPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildOrderVerificationFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        select
          so.id,
          so.so_number,
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
          to_jsonb(so)->'line_items' as line_items,
          so.terminal,
          null::text as payment_terms,
          so.origin,
          so.destination,
          so.quantity,
          so.status,
          so.sales_name,
          so.created_by_name,
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
          case when so.finance_verification_status = 'verified' and nullif(btrim(so.so_number), '') is not null then 2 else 1 end,
          so.trip_date asc,
          so.created_at desc
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
          count(*) filter (where so.status not in ('completed', 'cancelled') and (so.finance_verification_status <> 'verified' or nullif(btrim(so.so_number), '') is null))::int as pending_so,
          count(*) filter (where so.status not in ('completed', 'cancelled') and so.finance_verification_status = 'verified' and nullif(btrim(so.so_number), '') is not null)::int as verified
        from sales_orders so
      `,
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
    },
  };
}

export async function updateOrderVerificationSoNumber(id, payload = {}) {
  const soNumber = String(payload.soNumber || '').trim();
  if (!soNumber) {
    const error = new Error('Nomor SO Accurate wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `
        select id, so_number, finance_verification_status
        from sales_orders
        where id = $1
          and status not in ('completed', 'cancelled')
      `,
      [id],
    );

    if (!existing.rows[0]) {
      const error = new Error('Request order Finance tidak ditemukan atau sudah selesai.');
      error.statusCode = 404;
      error.code = 'FINANCE_ORDER_VERIFICATION_NOT_FOUND';
      throw error;
    }

    const duplicate = await client.query(
      `
        select id
        from sales_orders
        where lower(so_number) = lower($1)
          and id <> $2
        limit 1
      `,
      [soNumber, id],
    );

    if (duplicate.rows[0]) {
      const error = new Error('Nomor SO Accurate sudah digunakan oleh order lain.');
      error.statusCode = 409;
      error.code = 'SO_NUMBER_DUPLICATE';
      throw error;
    }

    await client.query(
      `
        update sales_orders
        set so_number = $1,
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
          to_jsonb(so)->'line_items' as line_items,
          so.terminal,
          null::text as payment_terms,
          so.origin,
          so.destination,
          so.quantity,
          so.status,
          so.sales_name,
          so.created_by_name,
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

export async function getRpujRequestsPage(options = {}) {
  const { page, pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildRpujFilters(options);
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, total, summary] = await Promise.all([
    query(
      `
        ${rpujRowsSelect()}
        ${whereSql}
        order by
          case cj.rpuj_status
            when 'submitted' then 1
            when 'approved' then 2
            when 'paid' then 3
            when 'rejected' then 4
            else 5
          end,
          cj.rpuj_requested_at desc nulls last,
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
        select
          count(*) filter (where cj.rpuj_status = 'submitted')::int as submitted,
          count(*) filter (where cj.rpuj_status = 'approved')::int as approved,
          count(*) filter (where cj.rpuj_status = 'paid')::int as paid,
          count(*) filter (where cj.rpuj_status = 'rejected')::int as rejected
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where so.status <> 'cancelled'
          and so.finance_verification_status = 'verified'
          and nullif(btrim(so.so_number), '') is not null
          and cj.rpuj_status <> 'pending'
      `,
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

export async function approveRpujRequest(id, payload = {}) {
  return withTransaction(async (client) => {
    const existing = await client.query('select id, rpuj_status from container_jobs where id = $1', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan RPUJ tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'RPUJ_REQUEST_NOT_FOUND';
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
    const existing = await client.query('select id, rpuj_status from container_jobs where id = $1', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan RPUJ tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'RPUJ_REQUEST_NOT_FOUND';
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
    const existing = await client.query('select id, rpuj_status from container_jobs where id = $1', [id]);
    if (!existing.rows[0]) {
      const error = new Error('Pengajuan RPUJ tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'RPUJ_REQUEST_NOT_FOUND';
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
          case
            when nullif(btrim(invoice_number), '') is null then 1
            when billing_status <> 'lunas' then 2
            else 3
          end,
          completed_at desc nulls last,
          so_number asc
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
          count(*) filter (where nullif(btrim(invoice_number), '') is null)::int as need_number,
          count(*) filter (where nullif(btrim(invoice_number), '') is not null and billing_status <> 'lunas')::int as in_progress,
          count(*) filter (where billing_status = 'lunas')::int as paid
        from invoice_orders
      `,
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
    },
  };
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
