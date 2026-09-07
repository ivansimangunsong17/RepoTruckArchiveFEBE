import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  fetchCustomerOutstandingSummary,
  getSalesOrder,
  listSalesOrders,
  removeSalesOrder,
  requestSalesOrderCancellation,
  saveSalesOrder,
  reviewSalesOrderCancellation,
  updateInvoiceDeliveryStatus,
} from './sales-orders.service.js';
import {
  HISTORICAL_ENTRY_PERMISSION,
  payloadRequestsHistoricalEntry,
} from '../historical-entry/historical-entry.permissions.js';
import { actorHasPermission } from '../../utils/permissions.js';

function isHistoricalRecord(record = {}) {
  return record?.entrySource === 'historical' || Boolean(record?.historicalPeriod);
}

function historicalMetadata(record = {}) {
  return {
    entrySource: record.entrySource || 'historical',
    historicalPeriod: record.historicalPeriod || '',
    historicalNotes: record.historicalNotes || '',
    soNumber: record.soNumber || record.so_number || '',
  };
}

const adminCorrectionAuditFields = {
  customer: 'Customer',
  destination: 'Tujuan',
  container: 'Container/Layanan',
  serviceName: 'Jenis Layanan',
  cargoType: 'Ukuran Container',
  totalAmount: 'Total Nilai',
  paymentType: 'Jenis Pembayaran',
  paymentTermDays: 'Termin Pembayaran',
};

export function isAdminCorrectionPayload(payload = {}) {
  return payload.adminCorrectionMode === true || String(payload.adminCorrectionMode || '').toLowerCase() === 'true';
}

export function adminCorrectionMetadata(payload = {}, order = {}) {
  if (!isAdminCorrectionPayload(payload)) return {};
  return {
    adminCorrection: true,
    adminCorrectionReason: String(payload.adminCorrectionReason || '').trim(),
    soNumber: order.soNumber,
  };
}

function normalizeAuditValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function adminCorrectionChanges(before = {}, after = {}) {
  return Object.entries(adminCorrectionAuditFields)
    .filter(([field]) => normalizeAuditValue(before[field]) !== normalizeAuditValue(after[field]))
    .map(([field, label]) => ({
      field,
      label,
      before: before[field] ?? null,
      after: after[field] ?? null,
    }));
}

function historicalContainerMetadata(order = {}, container = {}) {
  return {
    salesOrderId: order.id,
    soNumber: order.soNumber || order.so_number || container.soNumber || container.so_number || '',
    containerNumber: container.containerNumber || container.container_number || '',
    entrySource: container.entrySource || order.entrySource || 'historical',
    historicalPeriod: container.historicalPeriod || order.historicalPeriod || '',
    historicalNotes: container.historicalNotes || order.historicalNotes || '',
  };
}

export async function listSalesOrdersController(request, response) {
  const result = await listSalesOrders(request.query);
  sendSuccess(response, result);
}

export async function createSalesOrderController(request, response) {
  const canCreateSalesOrder = request.user?.role === 'sales';
  const canCreateHistoricalOrder = payloadRequestsHistoricalEntry(request.body)
    && actorHasPermission(request.user, HISTORICAL_ENTRY_PERMISSION);
  if (!canCreateSalesOrder && !canCreateHistoricalOrder) {
    const error = new Error('Input Sales Order hanya dapat dilakukan oleh Sales. Data bulan sebelumnya hanya dapat diinput oleh Admin.');
    error.statusCode = 403;
    error.code = 'SALES_ORDER_CREATE_SALES_ONLY';
    throw error;
  }

  const saved = await saveSalesOrder(request.body, null, request.user);
  await safeRecordActivityLog(request, {
    action: 'CREATE_SALES_ORDER',
    module: 'sales_orders',
    entityType: 'sales_order',
    entityId: saved.id,
    afterData: saved,
  });
  if (isHistoricalRecord(saved)) {
    await safeRecordActivityLog(request, {
      action: 'CREATE_HISTORICAL_SALES_ORDER',
      module: 'historical_entry',
      entityType: 'sales_order',
      entityId: saved.id,
      afterData: saved,
      metadata: historicalMetadata(saved),
    });
  }
  await Promise.all((saved.containers || []).map((container) => safeRecordActivityLog(request, {
    action: 'CREATE_CONTAINER_JOB',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: container.id,
    afterData: container,
    metadata: { salesOrderId: saved.id, soNumber: saved.soNumber },
  })));
  await Promise.all((saved.containers || [])
    .filter((container) => isHistoricalRecord(container) || isHistoricalRecord(saved))
    .map((container) => safeRecordActivityLog(request, {
      action: 'CREATE_HISTORICAL_CONTAINER_JOB',
      module: 'historical_entry',
      entityType: 'container_job',
      entityId: container.id,
      afterData: container,
      metadata: historicalContainerMetadata(saved, container),
    })));
  sendSuccess(response, saved, 'Sales Order berhasil disimpan.', 201);
}

export async function customerOutstandingSummaryController(request, response) {
  const customerName = request.query.customer || request.query.customerName || '';
  const result = await fetchCustomerOutstandingSummary(customerName);
  sendSuccess(response, result);
}

export async function getSalesOrderController(request, response) {
  const order = await getSalesOrder(request.params.id);
  sendSuccess(response, order);
}

export async function updateSalesOrderController(request, response) {
  const before = await getSalesOrder(request.params.id);
  const saved = await saveSalesOrder(request.body, request.params.id, request.user);
  await safeRecordActivityLog(request, {
    action: 'UPDATE_SALES_ORDER',
    module: 'sales_orders',
    entityType: 'sales_order',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
    metadata: adminCorrectionMetadata(request.body, saved),
  });
  if (isAdminCorrectionPayload(request.body)) {
    const changes = adminCorrectionChanges(before, saved);
    await safeRecordActivityLog(request, {
      action: 'ADMIN_CORRECTION_SALES_ORDER',
      module: 'sales_orders',
      entityType: 'sales_order',
      entityId: saved.id,
      beforeData: Object.fromEntries(changes.map((item) => [item.field, item.before])),
      afterData: Object.fromEntries(changes.map((item) => [item.field, item.after])),
      metadata: {
        ...adminCorrectionMetadata(request.body, saved),
        changedFields: changes.map((item) => item.label),
      },
    });
  }
  if (isHistoricalRecord(before) || isHistoricalRecord(saved)) {
    await safeRecordActivityLog(request, {
      action: 'UPDATE_HISTORICAL_SALES_ORDER',
      module: 'historical_entry',
      entityType: 'sales_order',
      entityId: saved.id,
      beforeData: before,
      afterData: saved,
      metadata: historicalMetadata(saved),
    });
  }
  if (request.user?.role === 'sales' && String(before.accurateSoNumber || '').trim()) {
    const beforeIds = new Set((before.containers || []).map((container) => container.id));
    const afterIds = new Set((saved.containers || []).map((container) => container.id));
    await safeRecordActivityLog(request, {
      action: 'SALES_REVISION_AFTER_FINANCE_SO',
      module: 'sales_orders',
      entityType: 'sales_order',
      entityId: saved.id,
      beforeData: before,
      afterData: saved,
      metadata: {
        salesOrderId: saved.id,
        internalSoNumber: saved.soNumber,
        financeSoNumber: saved.accurateSoNumber,
        quantityBefore: (before.containers || []).length,
        quantityAfter: (saved.containers || []).length,
        addedContainerJobIds: (saved.containers || []).filter((container) => !beforeIds.has(container.id)).map((container) => container.id),
        removedContainerJobIds: (before.containers || []).filter((container) => !afterIds.has(container.id)).map((container) => container.id),
        note: request.body?.note || request.body?.reason || '',
      },
    });
  }

  const beforeContainerIds = new Set((before.containers || []).map((container) => container.id));
  await Promise.all((saved.containers || [])
    .filter((container) => !beforeContainerIds.has(container.id))
    .map((container) => safeRecordActivityLog(request, {
      action: 'CREATE_CONTAINER_JOB',
      module: 'container_jobs',
      entityType: 'container_job',
      entityId: container.id,
      afterData: container,
      metadata: { salesOrderId: saved.id, soNumber: saved.soNumber },
    })));
  await Promise.all((saved.containers || [])
    .filter((container) => !beforeContainerIds.has(container.id) && (isHistoricalRecord(container) || isHistoricalRecord(saved)))
    .map((container) => safeRecordActivityLog(request, {
      action: 'CREATE_HISTORICAL_CONTAINER_JOB',
      module: 'historical_entry',
      entityType: 'container_job',
      entityId: container.id,
      afterData: container,
      metadata: historicalContainerMetadata(saved, container),
    })));
  sendSuccess(response, saved, 'Sales Order berhasil diperbarui.');
}

export async function updateInvoiceDeliveryStatusController(request, response) {
  const before = await getSalesOrder(request.params.id);
  const saved = await updateInvoiceDeliveryStatus(request.params.id, request.body, request.user);
  const metadata = {
    soNumber: saved.soNumber,
    invoiceNumber: saved.invoiceNumber,
    beforeStatus: before.billingStatus,
    afterStatus: saved.billingStatus,
    invoiceDocumentStatus: saved.invoiceDocumentStatus,
    invoiceDocumentSentAt: saved.invoiceDocumentSentAt,
    invoiceDocumentDeliveryMethod: saved.invoiceDocumentDeliveryMethod,
  };
  if (before.billingStatus === 'belum_dikirim' && saved.billingStatus !== 'belum_dikirim') {
    await safeRecordActivityLog(request, {
      action: 'SALES_SEND_INVOICE',
      module: 'sales_orders',
      entityType: 'sales_order',
      entityId: saved.id,
      beforeData: before,
      afterData: saved,
      metadata,
    });
  }
  await safeRecordActivityLog(request, {
    action: 'SALES_UPDATE_INVOICE_DELIVERY_STATUS',
    module: 'sales_orders',
    entityType: 'sales_order',
    entityId: saved.id,
    beforeData: before,
    afterData: saved,
    metadata,
  });
  sendSuccess(response, saved, 'Status pengiriman invoice berhasil diperbarui.');
}

export async function cancelSalesOrderController(request, response) {
  const before = await getSalesOrder(request.params.id);
  const cancelled = await removeSalesOrder(request.params.id, request.user);
  await safeRecordActivityLog(request, {
    action: 'CANCEL_SALES_ORDER',
    module: 'sales_orders',
    entityType: 'sales_order',
    entityId: request.params.id,
    beforeData: before,
    afterData: { ...cancelled, status: 'cancelled' },
  });
  sendSuccess(response, cancelled, 'Sales Order berhasil dibatalkan.');
}

export async function requestCancelSalesOrderController(request, response) {
  const before = await getSalesOrder(request.params.id);
  const saved = await requestSalesOrderCancellation(request.params.id, request.user, request.body);
  await safeRecordActivityLog(request, {
    action: 'REQUEST_CANCEL_SALES_ORDER',
    module: 'sales_orders',
    entityType: 'sales_order',
    entityId: request.params.id,
    beforeData: before,
    afterData: saved,
  });
  sendSuccess(response, saved, 'Permintaan pembatalan Sales Order berhasil diajukan.');
}

export async function reviewCancelSalesOrderController(request, response) {
  const before = await getSalesOrder(request.params.id);
  const saved = await reviewSalesOrderCancellation(request.params.id, request.user, request.body);
  await safeRecordActivityLog(request, {
    action: request.body?.approved ? 'APPROVE_CANCEL_SALES_ORDER' : 'REJECT_CANCEL_SALES_ORDER',
    module: 'sales_orders',
    entityType: 'sales_order',
    entityId: request.params.id,
    beforeData: before,
    afterData: saved,
  });
  sendSuccess(response, saved, request.body?.approved ? 'Pembatalan Sales Order disetujui.' : 'Pembatalan Sales Order ditolak.');
}
