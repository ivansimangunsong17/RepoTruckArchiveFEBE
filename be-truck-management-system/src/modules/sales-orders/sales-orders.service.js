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
import { normalizeInvoiceDocumentDeliveryMethod } from './sales-orders.invoice-documents.js';
import { isSalesOrderLockedByFinanceNumber, isSalesOrderLockedByRpuj } from './sales-orders.rpuj-lock.js';
import { ensureCanManageHistoricalEntry } from '../historical-entry/historical-entry.permissions.js';
import { ensureHistoricalPeriodEditable } from '../historical-entry/historical-entry.service.js';
import { getCustomerOutstandingSummary, listSalesOrderPayments } from '../finance/finance.repository.js';
import { hasActiveCommissionItemsForSalesOrder } from '../driver-commissions/driver-commissions.repository.js';
import { hasActiveSalesOrderExpenses, hasSalesOrderDebitNoteDocument } from './sales-orders.repository.js';

const SERVICE_OPTIONS = [
  'Jasa Angkut D20',
  'Jasa Angkut D40',
  'Bon Muat/Bongkar',
  'Tila/Gatepass',
  'Handling',
  'Jasa Lainnya',
];
const SERVICE_ALIASES = {
  'Jasa Handling': 'Handling',
  'Stevedoring and Port Service': 'Handling',
};

// 'lunas' sengaja TIDAK ada di daftar ini. Status lunas hanya boleh terjadi lewat pembayaran yang
// benar-benar tercatat dan menutup outstanding (lihat finance.repository.js#recordSalesOrderPayment) —
// Sales/Admin tidak lagi bisa flip status ini secara manual lewat updateInvoiceDeliveryStatus.
const SALES_INVOICE_DELIVERY_STATUSES = [
  'belum_dikirim',
  'belum_diterima',
  'belum_dikonfirmasi',
  'menunggu_pembayaran',
  'revisi_dispute',
];

// Status order vendor (Phase 4) sengaja independen dari status ritasi/container job -- hanya
// dua nilai yang boleh diset manual lewat form biasa: "Dicatat" (waiting_operational) dan
// "Selesai" (completed). "Batal" tetap eksklusif lewat endpoint cancel/cancel-request yang
// sudah ada (cascade, activity log, approval), bukan lewat field status di form biasa.

// Sama seperti BACKDATE_REASON_MIN_LENGTH di container-jobs.service.js -- diduplikasi (bukan
// diimpor) karena kedua modul memvalidasi bentuk payload yang berbeda (SO+containers vs container
// job tunggal), dan supaya sales-orders module tidak perlu bergantung ke container-jobs module.
const BACKDATE_CONTAINER_REASON_MIN_LENGTH = 8;

function isContainerService(serviceName) {
  return serviceName === 'Jasa Angkut D20' || serviceName === 'Jasa Angkut D40';
}

function isOtherService(serviceName) {
  return serviceName === 'Jasa Lainnya';
}

function normalizeServiceName(value) {
  const serviceName = String(value || '').trim();
  const canonical = SERVICE_ALIASES[serviceName] || serviceName;
  return SERVICE_OPTIONS.includes(canonical) ? canonical : '';
}

function normalizeLineItem(item = {}) {
  const serviceName = normalizeServiceName(item.serviceName) || 'Jasa Angkut D20';
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
    destination: String(item.destination || '').trim(),
  };
}

function normalizeLineItems(payload) {
  if (Array.isArray(payload.lineItems) && payload.lineItems.length) {
    return payload.lineItems.map(normalizeLineItem);
  }

  const legacyItems = [];
  const serviceName = normalizeServiceName(payload.serviceName);
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
      serviceName: normalizeServiceName(payload.serviceName) || 'Bon Muat/Bongkar',
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
          destination: item.destination || payload.destination || '',
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
  const paymentType = String(payload.paymentType || '').trim().toLowerCase() === 'tempo' ? 'tempo' : 'cash';
  const paymentTermDays = paymentType === 'tempo' ? Math.max(1, Number(payload.paymentTermDays || 30)) : 0;
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
    paymentType,
    paymentTermDays,
    referenceDocuments: normalizeReferenceDocuments(payload.referenceDocuments),
  };
}

const ADMIN_CORRECTION_REASON_MIN_LENGTH = 8;

function getActorName(actor) {
  return actor?.name || actor?.email || 'System';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeRole(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

function isAdmin(actor) {
  return normalizeRole(actor) === 'admin';
}

export function isAdminCorrectionMode(payload = {}) {
  return payload?.adminCorrectionMode === true || String(payload?.adminCorrectionMode || '').toLowerCase() === 'true';
}

export function adminCorrectionReason(payload = {}) {
  return normalizeText(payload?.adminCorrectionReason);
}

export function canUseAdminCorrection(actor, payload = {}) {
  return Boolean(
    isAdmin(actor)
      && isAdminCorrectionMode(payload)
      && adminCorrectionReason(payload).length >= ADMIN_CORRECTION_REASON_MIN_LENGTH
  );
}

function ensureAdminCorrectionContract(actor, payload = {}) {
  if (!isAdminCorrectionMode(payload)) return;
  if (!isAdmin(actor)) {
    const error = new Error('Mode koreksi admin hanya dapat digunakan oleh Admin.');
    error.statusCode = 403;
    error.code = 'ADMIN_CORRECTION_ADMIN_ONLY';
    throw error;
  }
  if (adminCorrectionReason(payload).length < ADMIN_CORRECTION_REASON_MIN_LENGTH) {
    const error = new Error(`Alasan koreksi admin wajib diisi minimal ${ADMIN_CORRECTION_REASON_MIN_LENGTH} karakter.`);
    error.statusCode = 400;
    error.code = 'ADMIN_CORRECTION_REASON_REQUIRED';
    throw error;
  }
}

function hasSalesOrderAttachment(order, category) {
  return (order.referenceDocuments || []).some((document) => (
    document.documentType === category && Boolean(document.file?.path)
  ));
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

async function canSalesReviseAfterFinanceSo(order) {
  if (!isSalesOrderLockedByFinanceNumber(order) && !isSalesOrderLockedByRpuj(order)) return true;
  const containers = order.containers || [];
  if (containers.some((container) => container.status !== 'received')) return false;
  if (isSalesOrderLockedByRpuj(order)) return false;
  if (String(order.invoiceNumber || '').trim()) return false;
  if (hasSalesOrderAttachment(order, 'invoicePdf') || hasSalesOrderAttachment(order, 'taxInvoicePdf')) return false;
  const [hasExpense, hasDebitNoteDoc, payments, hasCommission] = await Promise.all([
    hasActiveSalesOrderExpenses(order.id),
    hasSalesOrderDebitNoteDocument(order.id),
    listSalesOrderPayments(order.id),
    hasActiveCommissionItemsForSalesOrder(order.id),
  ]);
  if (hasExpense || hasDebitNoteDoc || hasCommission) return false;
  if (payments.some((payment) => !payment.voidedAt)) return false;
  return true;
}

export async function ensureSalesOrderStillSafeForSalesRevision(order) {
  if (await canSalesReviseAfterFinanceSo(order)) return;
  const error = new Error('Order ini sudah diproses Operational/Finance lanjutan. Revisi atau pembatalan hanya bisa dilakukan oleh Admin/Koreksi.');
  error.statusCode = 403;
  error.code = 'SALES_ORDER_ADVANCED_PROCESSING_LOCKED';
  throw error;
}

async function ensureSalesOrderUnlockedForSales(actor, order) {
  if (actor?.role !== 'sales') return;
  // Order vendor tidak punya ritasi internal/biaya operasional yang perlu dikunci oleh flow
  // Operational/Finance, jadi sales pemilik tetap boleh koreksi status vendor termasuk batal.
  if (order?.isVendorOrder) return;
  await ensureSalesOrderStillSafeForSalesRevision(order);
}

function isHistoricalOrderContext(order = {}, payload = {}) {
  return Boolean(
    order?.entrySource === 'historical'
      || order?.historicalPeriod
      || String(payload?.entrySource || '').trim().toLowerCase() === 'historical'
      || String(payload?.historicalPeriod || '').trim()
  );
}

async function ensureSalesOrderUnlockedForUpdate(actor, order, payload = {}) {
  if (normalizeRole(actor) !== 'admin') {
    await ensureSalesOrderUnlockedForSales(actor, order);
    return;
  }
  // Data historis sengaja dibuat dengan financeVerificationStatus 'verified' langsung saat backfill,
  // jadi lock ini tidak relevan untuknya — koreksinya sudah dijaga oleh historical_periods.status
  // (lihat ensureHistoricalPeriodEditable), bukan oleh lock RPUJ/nomor Finance.
  if (isHistoricalOrderContext(order, payload)) return;
  if (canUseAdminCorrection(actor, payload)) return;

  if (isSalesOrderLockedByFinanceNumber(order)) {
    const error = new Error('Sales Order terkunci karena Finance sudah menerbitkan nomor SO. Aktifkan mode koreksi admin dengan alasan untuk mengubah data ini.');
    error.statusCode = 403;
    error.code = 'SALES_ORDER_FINANCE_NUMBER_LOCKED_CORRECTION_REQUIRED';
    throw error;
  }
  if (!isSalesOrderLockedByRpuj(order)) return;
  const error = new Error('Sales Order terkunci karena RPUJ sudah dikirim. Aktifkan mode koreksi admin dengan alasan untuk mengubah data ini.');
  error.statusCode = 403;
  error.code = 'SALES_ORDER_RPUJ_LOCKED_CORRECTION_REQUIRED';
  throw error;
}

function applyActorToPayload(payload, actor, currentOrder = null) {
  const actorName = getActorName(actor);
  const isHistoricalPayload = String(payload.entrySource || '').trim().toLowerCase() === 'historical'
    || Boolean(String(payload.historicalPeriod || '').trim());
  if (currentOrder) {
    const nextSoNumber = currentOrder.soNumber || payload.soNumber || '';
    const nextAccurateSoNumber = currentOrder.accurateSoNumber || payload.accurateSoNumber || '';
    const shouldVerifyHistoricalSo = isHistoricalPayload
      && nextSoNumber
      && String(currentOrder.financeVerificationStatus || '').trim().toLowerCase() === 'pending_so';
    const verifiedAt = shouldVerifyHistoricalSo ? new Date().toISOString() : null;
    return {
      ...payload,
      createdBy: currentOrder.createdBy || actorName,
      createdByUserId: currentOrder.createdByUserId || null,
      updatedBy: actorName,
      updatedByUserId: actor?.sub || null,
      soNumber: nextSoNumber,
      accurateSoNumber: shouldVerifyHistoricalSo ? nextSoNumber : nextAccurateSoNumber,
      financeVerificationStatus: shouldVerifyHistoricalSo
        ? 'verified'
        : currentOrder.financeVerificationStatus || payload.financeVerificationStatus || (nextAccurateSoNumber ? 'verified' : 'pending_so'),
      financeVerifiedBy: shouldVerifyHistoricalSo
        ? actorName
        : currentOrder.financeVerifiedBy || payload.financeVerifiedBy || null,
      financeVerifiedAt: shouldVerifyHistoricalSo
        ? verifiedAt
        : currentOrder.financeVerifiedAt || payload.financeVerifiedAt || null,
      invoiceNumber: currentOrder.invoiceNumber || '',
      invoiceDocumentStatus: currentOrder.invoiceDocumentStatus || 'belum_upload',
      invoiceDocumentUploadedAt: currentOrder.invoiceDocumentUploadedAt || null,
      invoiceDocumentUploadedBy: currentOrder.invoiceDocumentUploadedBy || null,
      taxInvoiceDocumentUploadedAt: currentOrder.taxInvoiceDocumentUploadedAt || null,
      taxInvoiceDocumentUploadedBy: currentOrder.taxInvoiceDocumentUploadedBy || null,
      invoiceDocumentSentAt: currentOrder.invoiceDocumentSentAt || null,
      invoiceDocumentSentBy: currentOrder.invoiceDocumentSentBy || null,
      invoiceDocumentDeliveryMethod: currentOrder.invoiceDocumentDeliveryMethod || null,
      invoiceDocumentDeliveryNotes: currentOrder.invoiceDocumentDeliveryNotes || null,
      billingStatus: currentOrder.billingStatus || 'belum_invoice',
    };
  }

  return {
    ...payload,
    soNumber: isHistoricalPayload ? payload.soNumber || '' : '',
    accurateSoNumber: isHistoricalPayload && payload.soNumber ? payload.soNumber : '',
    financeVerificationStatus: isHistoricalPayload && payload.soNumber ? 'verified' : 'pending_so',
    financeVerifiedBy: isHistoricalPayload && payload.soNumber ? actorName : null,
    financeVerifiedAt: isHistoricalPayload && payload.soNumber ? new Date().toISOString() : null,
    invoiceNumber: '',
    invoiceDocumentStatus: 'belum_upload',
    invoiceDocumentUploadedAt: null,
    invoiceDocumentUploadedBy: null,
    taxInvoiceDocumentUploadedAt: null,
    taxInvoiceDocumentUploadedBy: null,
    invoiceDocumentSentAt: null,
    invoiceDocumentSentBy: null,
    invoiceDocumentDeliveryMethod: null,
    invoiceDocumentDeliveryNotes: null,
    billingStatus: 'belum_invoice',
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

    const missingContainerPrice = payload.lineItems.find((item) => isContainerService(item.serviceName) && Number(item.price || 0) <= 0);
    if (missingContainerPrice) {
      const error = new Error('Harga container D20/D40 wajib diisi lebih dari 0.');
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

  const paymentType = String(payload.paymentType || 'cash').trim().toLowerCase();
  if (!['cash', 'tempo'].includes(paymentType)) {
    const error = new Error('Jenis pembayaran harus Cash atau Tempo.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  if (paymentType === 'tempo' && Number(payload.paymentTermDays || 0) < 1) {
    const error = new Error('Termin pembayaran wajib diisi minimal 1 hari untuk pembayaran Tempo.');
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

  // Ritasi susulan/backdate (Phase 2) bisa dibuat langsung sebagai container baru di Sales Order,
  // bukan cuma lewat update ritasi yang sudah ada -- alasannya tetap wajib diisi di jalur ini juga.
  const backdateContainerMissingReason = (Array.isArray(payload.containers) ? payload.containers : [])
    .find((container) => container?.isBackdateEntry && String(container?.backdateReason || '').trim().length < BACKDATE_CONTAINER_REASON_MIN_LENGTH);
  if (backdateContainerMissingReason) {
    const error = new Error(`Alasan ritasi susulan/backdate wajib diisi minimal ${BACKDATE_CONTAINER_REASON_MIN_LENGTH} karakter.`);
    error.statusCode = 400;
    error.code = 'BACKDATE_REASON_REQUIRED';
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
    invoiceDocumentStatus: query.invoiceDocumentStatus || '',
    entrySource: query.entrySource || '',
    historicalPeriod: query.historicalPeriod || '',
    dateFrom: query.dateFrom || '',
    dateTo: query.dateTo || '',
    vendorFilter: query.vendorFilter || '',
  });
}

export function fetchCustomerOutstandingSummary(customerName) {
  return getCustomerOutstandingSummary(customerName);
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
  if (id) {
    ensureCanAccessSalesOrder(actor, currentOrder);
    ensureAdminCorrectionContract(actor, normalizedPayload);
    await ensureSalesOrderUnlockedForUpdate(actor, currentOrder, normalizedPayload);
  }
  ensureCanManageHistoricalEntry(actor, {
    payload: normalizedPayload,
    currentRecord: currentOrder,
    entityLabel: 'Data historis Sales Order',
  });
  await ensureHistoricalPeriodEditable(
    normalizedPayload.historicalPeriod || currentOrder?.historicalPeriod,
    'Sales Order data lama',
  );
  const payloadWithActor = applyActorToPayload(normalizedPayload, actor, currentOrder);
  validateSalesOrderPayload(payloadWithActor, currentOrder);
  return id ? updateSalesOrder(id, payloadWithActor) : createSalesOrder(payloadWithActor);
}

export async function updateInvoiceDeliveryStatus(id, payload = {}, actor) {
  if (!actor || !['finance', 'admin'].includes(actor.role)) {
    const error = new Error('Status pengiriman invoice hanya dapat diubah oleh Finance atau Admin.');
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

  if (normalizeSalesOrderBillingStatus(order.billingStatus) === 'lunas') {
    const error = new Error('Invoice sudah lunas. Status pengiriman tidak dapat diubah lagi lewat sini -- gunakan void pembayaran jika perlu koreksi.');
    error.statusCode = 409;
    error.code = 'INVOICE_DELIVERY_STATUS_ALREADY_PAID';
    throw error;
  }

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

  const isSendingDocument = billingStatus !== 'belum_dikirim';
  if (isSendingDocument) {
    if (!hasSalesOrderAttachment(order, 'invoicePdf') || !hasSalesOrderAttachment(order, 'taxInvoicePdf')) {
      const error = new Error('Invoice dan Faktur Pajak belum lengkap. Tunggu Finance upload dokumen dari Accurate.');
      error.statusCode = 409;
      error.code = 'INVOICE_DOCUMENTS_NOT_READY';
      throw error;
    }
  }

  const deliveryMethod = normalizeInvoiceDocumentDeliveryMethod(payload.deliveryMethod || payload.invoiceDocumentDeliveryMethod);
  if (isSendingDocument && !deliveryMethod) {
    const error = new Error('Metode pengiriman dokumen wajib diisi.');
    error.statusCode = 400;
    error.code = 'INVOICE_DOCUMENT_DELIVERY_METHOD_REQUIRED';
    throw error;
  }

  return updateSalesOrderBillingStatus(id, {
    billingStatus,
    updatedByName: getActorName(actor),
    markInvoiceDocumentSent: isSendingDocument,
    invoiceDocumentSentAt: isSendingDocument ? (payload.sentAt || payload.invoiceDocumentSentAt || new Date().toISOString()) : null,
    invoiceDocumentDeliveryMethod: isSendingDocument ? deliveryMethod : null,
    invoiceDocumentDeliveryNotes: isSendingDocument ? (payload.deliveryNotes || payload.invoiceDocumentDeliveryNotes || '') : null,
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
  await ensureSalesOrderUnlockedForSales(actor, order);
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
  await ensureSalesOrderUnlockedForSales(actor, order);
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
