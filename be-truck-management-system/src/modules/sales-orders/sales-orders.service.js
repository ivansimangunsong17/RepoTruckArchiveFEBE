import {
  cancelSalesOrder,
  createSalesOrder,
  findSalesOrderById,
  findSalesOrdersPage,
  requestSalesOrderCancellation as requestSalesOrderCancellationRepository,
  reviewSalesOrderCancellation as reviewSalesOrderCancellationRepository,
  updateSalesOrderBillingStatus,
  updateSalesOrder,
} from './sales-orders.repository.js';
import {
  billingStatusRequiresInvoice,
  normalizeSalesOrderBillingStatus,
} from './sales-orders.billing-status.js';

const SERVICE_OPTIONS = [
  'Jasa Angkut D20',
  'Jasa Angkut D40',
  'Bon Muat/Bongkar',
  'Tila/Gatepass',
  'Jasa Handling',
  'Jasa Lainnya',
];

const SALES_INVOICE_DELIVERY_STATUSES = [
  'belum_dikirim',
  'belum_diterima',
  'belum_dikonfirmasi',
  'menunggu_pembayaran',
  'revisi_dispute',
  'lunas',
];

function isContainerService(serviceName) {
  return serviceName === 'Jasa Angkut D20' || serviceName === 'Jasa Angkut D40';
}

function isOtherService(serviceName) {
  return serviceName === 'Jasa Lainnya';
}

function normalizeLineItem(item = {}) {
  const serviceName = SERVICE_OPTIONS.includes(item.serviceName) ? item.serviceName : 'Jasa Angkut D20';
  const qty = Math.max(1, Number(item.qty || 0));
  const price = Math.max(0, Number(item.price || 0));
  return {
    id: item.id || '',
    serviceName,
    containerType: isContainerService(serviceName) ? (item.containerType || item.cargoType || '') : '',
    qty,
    price,
    total: Number(item.total || qty * price),
    notes: isOtherService(serviceName) ? (item.notes || '') : '',
  };
}

function normalizeLineItems(payload) {
  if (Array.isArray(payload.lineItems) && payload.lineItems.length) {
    return payload.lineItems.map(normalizeLineItem);
  }

  const legacyItems = [];
  const serviceName = SERVICE_OPTIONS.includes(payload.serviceName) ? payload.serviceName : '';
  const price = Number(payload.price || 0);
  const d20Qty = Math.max(0, Number(payload.container20Qty || 0));
  const d40Qty = Math.max(0, Number(payload.container40Qty || 0));

  if (serviceName && serviceName !== 'Campuran') {
    legacyItems.push(normalizeLineItem({
      serviceName,
      containerType: payload.cargoType || payload.container || '',
      qty: Math.max(1, Number(payload.quantity || d20Qty || d40Qty || 1)),
      price,
    }));
  } else if (d20Qty || d40Qty) {
    if (d20Qty) {
      legacyItems.push(normalizeLineItem({
        serviceName: 'Jasa Angkut D20',
        containerType: payload.cargoType || payload.container || '',
        qty: d20Qty,
        price,
      }));
    }
    if (d40Qty) {
      legacyItems.push(normalizeLineItem({
        serviceName: 'Jasa Angkut D40',
        containerType: payload.cargoType || payload.container || '',
        qty: d40Qty,
        price,
      }));
    }
    if (!d20Qty && !d40Qty && payload.serviceName) {
      legacyItems.push(normalizeLineItem({
        serviceName: 'Bon Muat/Bongkar',
        qty: Math.max(1, Number(payload.quantity || 1)),
        price,
      }));
    }
  } else if (price || payload.quantity) {
    legacyItems.push(normalizeLineItem({
      serviceName: payload.serviceName && SERVICE_OPTIONS.includes(payload.serviceName) ? payload.serviceName : 'Bon Muat/Bongkar',
      containerType: payload.cargoType || payload.container || '',
      qty: Math.max(1, Number(payload.quantity || 1)),
      price,
    }));
  }

  return legacyItems;
}

function normalizeContainerSize(size) {
  return String(size || '20FT').toUpperCase().replace(/\s/g, '') === '40FT' ? '40FT' : '20FT';
}

function normalizeReferenceDocuments(referenceDocuments = []) {
  return referenceDocuments
    .filter((document) => document && (document.documentType || document.referenceNumber || document.documentDate || document.file || document.notes))
    .map((document) => ({
      documentType: document.documentType || 'Delivery Order',
      referenceNumber: document.referenceNumber || '',
      documentDate: document.documentDate || '',
      file: document.file
        ? {
            name: document.file.name || '',
            size: document.file.size || 0,
            type: document.file.type || '',
          }
        : null,
      notes: document.notes || '',
    }));
}

function normalizeContainers(payload) {
  const source = Array.isArray(payload.containers) ? payload.containers : [];
  if (source.length) {
    return source.map((container) => ({
      ...container,
      containerNumber: String(container.containerNumber || '').trim().toUpperCase(),
      size: normalizeContainerSize(container.size),
      type: container.type || 'Dry',
      notes: container.notes || '',
      rpujStatus: container.rpujStatus || 'pending',
      status: container.status || 'received',
      receivedAt: container.receivedAt || payload.receivedAt || new Date().toISOString(),
      runningAt: container.runningAt || null,
      completedAt: container.completedAt || null,
    }));
  }

  const lineItems = normalizeLineItems(payload);
  if (lineItems.length) {
    const containers = [];
    lineItems.forEach((item) => {
      if (!isContainerService(item.serviceName)) return;
      const size = item.serviceName === 'Jasa Angkut D40' ? '40FT' : '20FT';
      for (let index = 0; index < Math.max(0, Number(item.qty || 0)); index += 1) {
        containers.push({
          containerNumber: '',
          size,
          type: item.containerType || 'Dry',
          notes: item.serviceName,
          rpujStatus: 'pending',
          status: 'received',
        });
      }
    });
    return containers;
  }

  const container20Qty = Math.max(0, Number(payload.container20Qty || 0));
  const container40Qty = Math.max(0, Number(payload.container40Qty || 0));
  const containers = [];

  for (let index = 0; index < container20Qty; index += 1) {
    containers.push({
      containerNumber: '',
      size: '20FT',
      type: 'Dry',
      notes: '',
      rpujStatus: 'pending',
      status: 'received',
    });
  }

  for (let index = 0; index < container40Qty; index += 1) {
    containers.push({
      containerNumber: '',
      size: '40FT',
      type: 'Dry',
      notes: '',
      rpujStatus: 'pending',
      status: 'received',
    });
  }

  return containers;
}

function normalizeSalesOrderPayload(payload) {
  const lineItems = normalizeLineItems(payload);
  const containers = normalizeContainers({ ...payload, lineItems });
  const price = Number(payload.price || 0);
  const quantity = Number(payload.quantity || lineItems.reduce((total, item) => total + Number(item.qty || 0), 0) || containers.length || 0);
  const totalAmount = Number(
    payload.totalAmount
    || lineItems.reduce((total, item) => total + Number(item.total || Number(item.qty || 0) * Number(item.price || 0)), 0)
    || price * (quantity || containers.length)
    || 0,
  );
  const uniqueServices = [...new Set(lineItems.map((item) => item.serviceName).filter(Boolean))];
  const summaryName = uniqueServices.length === 1 ? uniqueServices[0] : uniqueServices.length > 1 ? 'Campuran' : payload.serviceName || null;
  const uniqueContainerTypes = [...new Set(lineItems.map((item) => item.containerType).filter(Boolean))];

  return {
    ...payload,
    shipment: payload.shipment || 'import',
    jobType: payload.jobType || 'Trucking Container',
    lineItems,
    serviceName: summaryName,
    price,
    quantity: quantity || containers.length,
    totalAmount,
    unit: payload.unit || 'Container',
    container: payload.container || lineItems.map((item) => {
      const typeLabel = item.containerType ? ` - ${item.containerType}` : '';
      const notesLabel = isOtherService(item.serviceName) && item.notes ? ` (${item.notes})` : '';
      return `${item.serviceName}${typeLabel}${notesLabel} x${item.qty}`;
    }).join(' + ') || null,
    cargoType: uniqueContainerTypes.length === 1 ? uniqueContainerTypes[0] : payload.cargoType || null,
    containers,
    billingStatus: normalizeSalesOrderBillingStatus(payload.billingStatus),
    referenceDocuments: normalizeReferenceDocuments(payload.referenceDocuments),
  };
}

function getActorName(actor) {
  return actor?.name || actor?.email || 'System';
}

function canSalesAccessOrder(actor, order) {
  if (actor?.role !== 'sales') return true;
  if (!order) return false;
  if (order.createdByUserId) return order.createdByUserId === actor.sub;
  return String(order.createdBy || '').trim() === getActorName(actor);
}

function ensureCanAccessSalesOrder(actor, order) {
  if (canSalesAccessOrder(actor, order)) return;
  const error = new Error('Sales Order ini bukan milik akun sales Anda.');
  error.statusCode = 403;
  error.code = 'SALES_ORDER_OWNER_FORBIDDEN';
  throw error;
}

function applyActorToPayload(payload, actor, currentOrder = null) {
  const actorName = getActorName(actor);
  if (currentOrder) {
    return {
      ...payload,
      createdBy: currentOrder.createdBy || actorName,
      createdByUserId: currentOrder.createdByUserId || null,
      updatedBy: actorName,
      updatedByUserId: actor?.sub || null,
      soNumber: currentOrder.soNumber || payload.soNumber || '',
      financeVerificationStatus: currentOrder.financeVerificationStatus || payload.financeVerificationStatus || 'pending_so',
      financeVerifiedBy: currentOrder.financeVerifiedBy || payload.financeVerifiedBy || null,
      financeVerifiedAt: currentOrder.financeVerifiedAt || payload.financeVerifiedAt || null,
      invoiceNumber: currentOrder.invoiceNumber || '',
      billingStatus: actor?.role === 'sales'
        ? currentOrder.billingStatus || 'belum_invoice'
        : payload.billingStatus || currentOrder.billingStatus || 'belum_invoice',
    };
  }

  return {
    ...payload,
    soNumber: '',
    financeVerificationStatus: 'pending_so',
    financeVerifiedBy: null,
    financeVerifiedAt: null,
    createdBy: actorName,
    createdByUserId: actor?.sub || null,
    updatedBy: actorName,
    updatedByUserId: actor?.sub || null,
  };
}

function validateSalesOrderPayload(payload, currentOrder = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload Sales Order harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const required = ['customer', 'origin', 'destination'];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) {
    const error = new Error(`Field wajib belum lengkap: ${missing.join(', ')}.`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const hasLineItems = Array.isArray(payload.lineItems) && payload.lineItems.length > 0;
  if ((!Array.isArray(payload.containers) || payload.containers.length === 0) && !hasLineItems) {
    const error = new Error('Sales Order minimal memiliki 1 container.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (hasLineItems) {
    const invalidLineItem = payload.lineItems.find((item) => !item.serviceName || Number(item.qty || 0) < 1 || Number(item.price || 0) < 0);
    if (invalidLineItem) {
      const error = new Error('Setiap rincian wajib memiliki layanan, qty minimal 1, dan price tidak boleh negatif.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const missingOtherServiceNotes = payload.lineItems.find((item) => item.serviceName === 'Jasa Lainnya' && !String(item.notes || '').trim());
    if (missingOtherServiceNotes) {
      const error = new Error('Isi catatan untuk rincian Jasa Lainnya.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }

  const containersWithNumber = payload.containers.filter((container) => container.containerNumber);
  const duplicatedContainer = containersWithNumber.some((container, index) =>
    containersWithNumber.findIndex((item) => item.containerNumber === container.containerNumber) !== index,
  );
  if (duplicatedContainer) {
    const error = new Error('Nomor container wajib unik di dalam Sales Order.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const operationalStatus = currentOrder?.status || payload.status || 'waiting_operational';

  if (payload.billingStatus && payload.billingStatus !== 'belum_invoice' && operationalStatus !== 'completed') {
    const error = new Error('Status billing hanya dapat diubah setelah order selesai dari operational.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (billingStatusRequiresInvoice(payload.billingStatus) && !String(payload.invoiceNumber || '').trim()) {
    const error = new Error('Nomor invoice wajib diisi sebelum melanjutkan status billing ini.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

export function listSalesOrders(query) {
  return findSalesOrdersPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || '',
    status: query.status || '',
    invoiced: query.invoiced || '',
  });
}

export async function getSalesOrder(id) {
  const order = await findSalesOrderById(id);
  if (!order) {
    const error = new Error('Sales Order tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'SALES_ORDER_NOT_FOUND';
    throw error;
  }
  return order;
}

export async function saveSalesOrder(payload, id, actor) {
  const normalizedPayload = normalizeSalesOrderPayload(payload);
  const currentOrder = id ? await findSalesOrderById(id) : null;
  if (id && !currentOrder) {
    const error = new Error('Sales Order tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'SALES_ORDER_NOT_FOUND';
    throw error;
  }
  if (id) ensureCanAccessSalesOrder(actor, currentOrder);
  const payloadWithActor = applyActorToPayload(normalizedPayload, actor, currentOrder);
  validateSalesOrderPayload(payloadWithActor, currentOrder);
  return id ? updateSalesOrder(id, payloadWithActor) : createSalesOrder(payloadWithActor);
}

export async function updateInvoiceDeliveryStatus(id, payload = {}, actor) {
  if (!actor || !['sales', 'admin'].includes(actor.role)) {
    const error = new Error('Status pengiriman invoice hanya dapat diubah oleh Sales atau Admin.');
    error.statusCode = 403;
    error.code = 'INVOICE_DELIVERY_STATUS_FORBIDDEN';
    throw error;
  }

  const order = await findSalesOrderById(id);
  if (!order) {
    const error = new Error('Sales Order tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'SALES_ORDER_NOT_FOUND';
    throw error;
  }
  ensureCanAccessSalesOrder(actor, order);

  if (order.status !== 'completed') {
    const error = new Error('Status pengiriman invoice hanya dapat diubah setelah order selesai.');
    error.statusCode = 400;
    error.code = 'INVOICE_DELIVERY_STATUS_ORDER_NOT_COMPLETED';
    throw error;
  }

  if (!String(order.invoiceNumber || '').trim()) {
    const error = new Error('Nomor invoice belum tersedia. Tunggu Finance input nomor invoice.');
    error.statusCode = 409;
    error.code = 'INVOICE_NUMBER_REQUIRED';
    throw error;
  }

  const billingStatus = normalizeSalesOrderBillingStatus(payload.billingStatus);
  if (!SALES_INVOICE_DELIVERY_STATUSES.includes(billingStatus)) {
    const error = new Error('Status pengiriman invoice tidak valid untuk Sales.');
    error.statusCode = 400;
    error.code = 'INVALID_INVOICE_DELIVERY_STATUS';
    throw error;
  }

  return updateSalesOrderBillingStatus(id, {
    billingStatus,
    updatedByName: getActorName(actor),
  });
}

export async function removeSalesOrder(id, actor) {
  const order = await findSalesOrderById(id);
  if (!order) {
    const error = new Error('Sales Order tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'SALES_ORDER_NOT_FOUND';
    throw error;
  }
  ensureCanAccessSalesOrder(actor, order);
  return cancelSalesOrder(id);
}

export async function requestSalesOrderCancellation(id, actor, payload = {}) {
  const order = await findSalesOrderById(id);
  if (!order) {
    const error = new Error('Sales Order tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'SALES_ORDER_NOT_FOUND';
    throw error;
  }
  ensureCanAccessSalesOrder(actor, order);
  return requestSalesOrderCancellationRepository(id, {
    cancelRequestNote: payload.cancelRequestNote || '',
    cancelRequestedByName: getActorName(actor),
    cancelRequestedByRole: actor?.role || 'sales',
  });
}

export async function reviewSalesOrderCancellation(id, actor, payload = {}) {
  if (!actor || !['operational', 'admin'].includes(actor.role)) {
    const error = new Error('Approval pembatalan hanya dapat dilakukan oleh Operational atau Admin.');
    error.statusCode = 403;
    error.code = 'SALES_ORDER_CANCEL_REVIEW_FORBIDDEN';
    throw error;
  }

  return reviewSalesOrderCancellationRepository(id, {
    approved: Boolean(payload.approved),
    cancelReviewNote: payload.cancelReviewNote || '',
    cancelReviewedByName: getActorName(actor),
  });
}
