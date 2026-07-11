function normalizeContainerSize(size) {
  const normalized = String(size || '20FT').toUpperCase().replace(/\s/g, '');
  return normalized === '40FT' ? '40FT' : '20FT';
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
    },
  ];
}

export function mapContainerJob(row, attachments = []) {
  const assignment = row.assignment_snapshot || {};
  const attachmentMap = attachments.reduce((map, attachment) => {
    map[attachment.category] = attachment;
    return map;
  }, {});
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
    spkNumber: row.spk_number,
    loadingVoucher: row.loading_voucher_number,
    unloadingVoucher: row.unloading_voucher_number,
    travelDocument: row.travel_document_number,
    weighingDocument: row.weighing_document_number,
    spkDocument: mapAttachmentFile(attachmentMap.spkDocument),
    loadingVoucherDocument: mapAttachmentFile(attachmentMap.loadingVoucherDocument),
    unloadingVoucherDocument: mapAttachmentFile(attachmentMap.unloadingVoucherDocument),
    travelDocumentFile: mapAttachmentFile(attachmentMap.travelDocumentFile),
    weighingDocumentFile: mapAttachmentFile(attachmentMap.weighingDocumentFile),
    otherDocuments,
    status: row.status,
    receivedAt: row.received_at,
    runningAt: row.running_at,
    completedAt: row.completed_at,
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
    jobDescription: row.job_description,
    invoiceNumber: row.invoice_number,
    billingStatus: row.billing_status,
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
    updatedBy: row.updated_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

  return {
    so_number: form.soNumber,
    do_number: form.doNumber || null,
    so_date: form.soDate || new Date().toISOString().slice(0, 10),
    trip_date: form.tripDate || form.plannedDate || form.soDate || new Date().toISOString().slice(0, 10),
    received_at: form.receivedAt || new Date().toISOString(),
    customer_id: customer?.id || form.customerId || null,
    customer_name: customer?.name || form.customer,
    customer_pic: customer?.pic_name || form.customerPic || null,
    customer_phone: customer?.phone || form.customerPhone || null,
    customer_address: customer?.address || form.customerAddress || null,
    shipment_type: form.shipment || 'import',
    job_type: form.jobType || 'Trucking Container',
    job_description: form.jobDescription || form.notes || null,
    invoice_number: form.invoiceNumber || null,
    billing_status: form.billingStatus || (form.invoiceNumber ? 'invoice_issued' : 'pending_invoice'),
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
    sales_name: form.salesName || form.createdBy || 'Sales',
    created_by_name: form.createdBy || form.salesName || 'Sales',
    updated_by_name: form.updatedBy || form.createdBy || form.salesName || 'Sales',
    notes: form.notes || form.jobDescription || null,
    reference_documents: JSON.stringify(form.referenceDocuments || []),
  };
}

export function toContainerJobDb(container, order, actorName = 'Operational') {
  return {
    sales_order_id: order.id,
    container_number: container.containerNumber,
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
    status: container.status || 'received',
    received_at: container.receivedAt || order.received_at || new Date().toISOString(),
    running_at: container.runningAt || null,
    completed_at: container.completedAt || null,
    created_by_name: order.created_by_name || actorName,
    updated_by_name: container.updatedBy || actorName,
  };
}
