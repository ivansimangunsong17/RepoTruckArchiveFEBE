import { normalizeSalesOrderBillingStatus } from './sales-orders.billing-status.js';

function normalizeContainerSize(size) {
  const normalized = String(size || '20FT').toUpperCase().replace(/\s/g, '');
  return normalized === '40FT' ? '40FT' : '20FT';
}

function normalizePaymentType(value) {
  return String(value || '').trim().toLowerCase() === 'tempo' ? 'tempo' : 'cash';
}

function normalizePaymentTermDays(paymentType, value) {
  const days = Math.max(0, Number(value || 0));
  return paymentType === 'tempo' ? Math.max(1, days || 30) : 0;
}

function toLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function normalizeDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalDateKey(value);
  }
  const raw = String(value).trim();
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return toLocalDateKey(parsed);
}

function mapAttachmentFile(attachment) {
  return attachment
    ? {
        name: attachment.fileName || '',
        size: attachment.fileSize == null ? 0 : Number(attachment.fileSize),
        type: attachment.mimeType || '',
        path: attachment.id,
        storagePath: attachment.storagePath || '',
      }
    : null;
}

function firstAttachment(...attachments) {
  return attachments.find(Boolean);
}

function mapReferenceDocumentAttachment(attachment) {
  return {
    documentType: attachment.category || 'Delivery Order',
    referenceNumber: attachment.referenceNumber || '',
    documentDate: attachment.documentDate || '',
    file: mapAttachmentFile(attachment),
    notes: attachment.notes || '',
  };
}

function normalizeLineItem(item = {}) {
  return {
    id: item.id || '',
    serviceName: item.serviceName || 'Jasa Angkut D20',
    containerType: item.containerType || '',
    qty: item.qty == null ? 1 : Number(item.qty),
    price: item.price == null ? 0 : Number(item.price),
    total: item.total == null ? Number(item.qty || 1) * Number(item.price || 0) : Number(item.total),
    notes: item.serviceName === 'Jasa Lainnya' ? (item.notes || '') : '',
  };
}

function parseLineItems(value) {
  if (Array.isArray(value)) return value.map(normalizeLineItem);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(normalizeLineItem) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function fallbackLineItems(row) {
  const serviceName = row.service_name || row.serviceName || row.container_summary || 'Jasa Angkut';
  const quantity = row.quantity == null ? 1 : Number(row.quantity);
  const price = row.price == null ? 0 : Number(row.price);
  const total = row.total_amount == null ? quantity * price : Number(row.total_amount);

  if (!serviceName && !quantity && !price && !total) {
    return [];
  }

  return [
    {
      id: '',
      serviceName,
      containerType: row.cargo_type || '',
      qty: quantity,
      price,
      total,
      notes: '',
    },
  ];
}

export function mapContainerJob(row, attachments = []) {
  const assignment = row.assignment_snapshot || {};
  const attachmentMap = attachments.reduce((map, attachment) => {
    map[attachment.category] = attachment;
    return map;
  }, {});
  const tilaGatepassPrimaryAttachment = firstAttachment(
    attachmentMap.tilaGatepassDocumentFile,
    attachmentMap.unloadingVoucherDocument,
    attachmentMap.weighingDocumentFile,
  );
  const tilaGatepassLegacyDocumentFiles = [
    ['Legacy TILA / Delivery Card', attachmentMap.unloadingVoucherDocument],
    ['Legacy Gatepass / SP2', attachmentMap.weighingDocumentFile],
  ]
    .filter(([, attachment]) => attachment && attachment.id !== tilaGatepassPrimaryAttachment?.id)
    .map(([name, attachment]) => ({
      name,
      file: mapAttachmentFile(attachment),
    }));
  const otherDocuments = attachments
    .filter((attachment) => attachment.category === 'otherDocument')
    .map((attachment) => ({
      name: attachment.notes || attachment.referenceNumber || attachment.fileName || 'Other Document',
      file: mapAttachmentFile(attachment),
    }));

  return {
    id: row.id,
    containerNumber: row.container_number,
    size: row.container_size,
    type: row.container_type,
    notes: row.container_notes,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    driver: assignment.driver || null,
    plateNumber: assignment.plateNumber || null,
    chassis: assignment.vehicleDetail || null,
    rpujStatus: row.rpuj_status,
    rpujNotes: row.rpuj_notes,
    rpujRequestedBy: row.rpuj_requested_by_name || '',
    rpujRequestedAt: row.rpuj_requested_at,
    rpujReviewedBy: row.rpuj_reviewed_by_name || '',
    rpujReviewedAt: row.rpuj_reviewed_at,
    rpujRejectionNote: row.rpuj_rejection_note || '',
    rpujTransferUploadedBy: row.rpuj_transfer_uploaded_by_name || '',
    rpujTransferUploadedAt: row.rpuj_transfer_uploaded_at,
    rpujTransferProof: mapAttachmentFile(attachmentMap.rpujTransferProof),
    spkNumber: row.spk_number,
    loadingVoucher: row.loading_voucher_number,
    tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
    tilaGatepassMigrationNote: row.tila_gatepass_migration_note || '',
    unloadingVoucher: row.unloading_voucher_number,
    travelDocument: row.travel_document_number,
    weighingDocument: row.weighing_document_number,
    spkDocument: mapAttachmentFile(attachmentMap.spkDocument),
    loadingVoucherDocument: mapAttachmentFile(attachmentMap.loadingVoucherDocument),
    repoEirDocument: mapAttachmentFile(attachmentMap.repoEirDocument),
    tilaGatepassDocumentFile: mapAttachmentFile(tilaGatepassPrimaryAttachment),
    tilaGatepassLegacyDocumentFiles,
    unloadingVoucherDocument: mapAttachmentFile(attachmentMap.unloadingVoucherDocument),
    travelDocumentFile: mapAttachmentFile(attachmentMap.travelDocumentFile),
    weighingDocumentFile: mapAttachmentFile(attachmentMap.weighingDocumentFile),
    otherDocuments,
    status: row.status,
    receivedAt: row.received_at,
    runningAt: row.running_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelledByName: row.cancelled_by_name || '',
    cancelReason: row.cancel_reason || row.cancel_request_note || '',
    cancelSource: row.cancel_source || '',
    cancelRequestStatus: row.cancel_request_status || 'none',
    cancelRequestNote: row.cancel_request_note || '',
    cancelRequestedByName: row.cancel_requested_by_name || '',
    cancelRequestedByRole: row.cancel_requested_by_role || '',
    cancelRequestedAt: row.cancel_requested_at,
    cancelReviewedByName: row.cancel_reviewed_by_name || '',
    cancelReviewedAt: row.cancel_reviewed_at,
    cancelReviewNote: row.cancel_review_note || '',
    repoLocation: row.repo_location || '',
    repoStoredAt: row.repo_stored_at,
    repoEirNumber: row.repo_eir_number || '',
    repoReason: row.repo_reason || '',
    repoNotes: row.repo_notes || '',
    repoContainerCondition: row.repo_container_condition || '',
    repoReleasedDriverId: row.repo_released_driver_id,
    repoReleasedVehicleId: row.repo_released_vehicle_id,
    repoCreatedByName: row.repo_created_by_name || '',
    repoPickedUpAt: row.repo_picked_up_at,
    repoPickedUpByName: row.repo_picked_up_by_name || '',
    createdBy: row.created_by_name,
    updatedBy: row.updated_by_name,
    updatedAt: row.updated_at,
  };
}

export function mapSalesOrder(row, containers = [], attachments = []) {
  const referenceDocuments = attachments.length
    ? attachments.map(mapReferenceDocumentAttachment)
    : Array.isArray(row.reference_documents)
      ? row.reference_documents
      : [];
  const parsedLineItems = parseLineItems(row.line_items);
  const lineItems = parsedLineItems.length ? parsedLineItems : fallbackLineItems(row);

  return {
    id: row.id,
    customerId: row.customer_id,
    soNumber: row.so_number,
    financeVerificationStatus: row.finance_verification_status || (row.so_number ? 'verified' : 'pending_so'),
    financeVerifiedBy: row.finance_verified_by_name || '',
    financeVerifiedAt: row.finance_verified_at,
    doNumber: row.do_number,
    soDate: row.so_date,
    tripDate: row.trip_date,
    receivedAt: row.received_at,
    customer: row.customer_name,
    customerPic: row.customer_pic,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    shipment: row.shipment_type,
    jobType: row.job_type,
    vesselName: row.vessel_name || '',
    jobDescription: row.job_description,
    invoiceNumber: row.invoice_number,
    invoiceIssuedAt: row.invoice_issued_at,
    invoiceInputBy: row.invoice_input_by_name || '',
    billingStatus: normalizeSalesOrderBillingStatus(row.billing_status),
    paymentType: normalizePaymentType(row.payment_type),
    paymentTermDays: normalizePaymentTermDays(normalizePaymentType(row.payment_type), row.payment_term_days),
    paymentTerms: normalizePaymentType(row.payment_type) === 'tempo'
      ? `Tempo ${normalizePaymentTermDays('tempo', row.payment_term_days)} hari`
      : 'Cash',
    container: row.container_summary,
    lineItems,
    terminal: row.terminal,
    serviceName: row.service_name,
    container20Qty: row.do20_quantity == null ? 0 : Number(row.do20_quantity),
    container40Qty: row.do40_quantity == null ? 0 : Number(row.do40_quantity),
    cargoType: row.cargo_type,
    origin: row.origin,
    destination: row.destination,
    price: row.price == null ? 0 : Number(row.price),
    quantity: row.quantity == null ? containers.length : Number(row.quantity),
    unit: row.unit,
    totalAmount: row.total_amount == null ? 0 : Number(row.total_amount),
    status: row.status,
    notes: row.notes,
    salesName: row.sales_name,
    createdBy: row.created_by_name,
    createdByUserId: row.created_by_user_id,
    updatedBy: row.updated_by_name,
    updatedByUserId: row.updated_by_user_id,
    soDate: normalizeDateOnly(row.so_date),
    tripDate: normalizeDateOnly(row.trip_date),
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
    cancelRequestStatus: row.cancel_request_status || 'none',
    cancelRequestNote: row.cancel_request_note || '',
    cancelRequestedByName: row.cancel_requested_by_name || '',
    cancelRequestedByRole: row.cancel_requested_by_role || '',
    cancelRequestedAt: row.cancel_requested_at,
    cancelReviewedByName: row.cancel_reviewed_by_name || '',
    cancelReviewedAt: row.cancel_reviewed_at,
    cancelReviewNote: row.cancel_review_note || '',
    containers,
    referenceDocuments,
  };
}

export function toSalesOrderDb(form, customer) {
  const containers = Array.isArray(form.containers) ? form.containers : [];
  const quantity = Number(form.quantity || containers.length || 1);
  const price = Number(form.price || 0);
  const totalAmount = Number(form.totalAmount || price * quantity || 0);
  const lineItems = Array.isArray(form.lineItems) ? form.lineItems.map(normalizeLineItem) : [];
  const paymentType = normalizePaymentType(form.paymentType);

  return {
    so_number: String(form.soNumber || '').trim() || null,
    finance_verification_status: form.financeVerificationStatus || (String(form.soNumber || '').trim() ? 'verified' : 'pending_so'),
    finance_verified_by_name: form.financeVerifiedBy || null,
    finance_verified_at: form.financeVerifiedAt || null,
    do_number: form.doNumber || null,
    so_date: normalizeDateOnly(form.soDate) || new Date().toISOString().slice(0, 10),
    trip_date: normalizeDateOnly(form.tripDate || form.plannedDate || form.soDate) || new Date().toISOString().slice(0, 10),
    received_at: form.receivedAt || new Date().toISOString(),
    customer_id: customer?.id || form.customerId || null,
    customer_name: customer?.name || form.customer,
    customer_pic: customer?.pic_name || form.customerPic || null,
    customer_phone: customer?.phone || form.customerPhone || null,
    customer_address: customer?.address || form.customerAddress || null,
    shipment_type: form.shipment || 'import',
    job_type: form.jobType || 'Trucking Container',
    vessel_name: form.vesselName || form.shipName || form.namaKapal || null,
    job_description: form.jobDescription || form.notes || null,
    invoice_number: form.invoiceNumber || null,
    billing_status: normalizeSalesOrderBillingStatus(form.billingStatus),
    payment_type: paymentType,
    payment_term_days: normalizePaymentTermDays(paymentType, form.paymentTermDays),
    container_summary: form.container || null,
    line_items: JSON.stringify(lineItems),
    terminal: form.terminal || null,
    service_name: form.serviceName || null,
    do20_quantity: Number(form.container20Qty || 0),
    do40_quantity: Number(form.container40Qty || 0),
    cargo_type: form.cargoType || null,
    price,
    quantity,
    unit: form.unit || 'Container',
    total_amount: totalAmount,
    origin: form.origin,
    destination: form.destination,
    status: form.status || 'waiting_operational',
    sales_name: customer?.sales_name || form.salesName || null,
    created_by_name: form.createdBy || form.salesName || 'Sales',
    created_by_user_id: form.createdByUserId || null,
    updated_by_name: form.updatedBy || form.createdBy || form.salesName || 'Sales',
    updated_by_user_id: form.updatedByUserId || null,
    notes: form.notes || form.jobDescription || null,
    reference_documents: JSON.stringify(form.referenceDocuments || []),
  };
}

export function toContainerJobDb(container, order, actorName = 'Operational') {
  return {
    sales_order_id: order.id,
    container_number: String(container.containerNumber || '').trim().toUpperCase() || null,
    container_size: normalizeContainerSize(container.size || container.containerSize),
    container_type: container.type || 'Dry',
    container_notes: container.notes || null,
    rpuj_status: container.rpujStatus || 'pending',
    rpuj_notes: container.rpujNotes || null,
    spk_number: container.spkNumber || null,
    loading_voucher_number: container.loadingVoucher || null,
    unloading_voucher_number: container.unloadingVoucher || null,
    travel_document_number: container.travelDocument || null,
    weighing_document_number: container.weighingDocument || null,
    tila_gatepass_document_number: container.tilaGatepassDocument || container.unloadingVoucher || container.weighingDocument || null,
    status: container.status || 'received',
    received_at: container.receivedAt || order.received_at || new Date().toISOString(),
    running_at: container.runningAt || null,
    completed_at: container.completedAt || null,
    repo_location: container.repoLocation || null,
    repo_stored_at: container.repoStoredAt || null,
    repo_eir_number: container.repoEirNumber || null,
    repo_reason: container.repoReason || null,
    repo_notes: container.repoNotes || null,
    repo_container_condition: container.repoContainerCondition || null,
    repo_released_driver_id: container.repoReleasedDriverId || null,
    repo_released_vehicle_id: container.repoReleasedVehicleId || null,
    repo_created_by_name: container.repoCreatedByName || null,
    repo_picked_up_at: container.repoPickedUpAt || null,
    repo_picked_up_by_name: container.repoPickedUpByName || null,
    created_by_name: order.created_by_name || actorName,
    updated_by_name: container.updatedBy || actorName,
  };
}
