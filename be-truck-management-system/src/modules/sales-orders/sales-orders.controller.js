import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  getSalesOrder,
  listSalesOrders,
  removeSalesOrder,
  requestSalesOrderCancellation,
  saveSalesOrder,
  reviewSalesOrderCancellation,
  updateInvoiceDeliveryStatus,
} from './sales-orders.service.js';

export async function listSalesOrdersController(request, response) {
  const result = await listSalesOrders(request.query);
  sendSuccess(response, result);
}

export async function createSalesOrderController(request, response) {
  if (request.user?.role !== 'sales') {
    const error = new Error('Input Sales Order hanya dapat dilakukan oleh user Sales.');
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
  await Promise.all((saved.containers || []).map((container) => safeRecordActivityLog(request, {
    action: 'CREATE_CONTAINER_JOB',
    module: 'container_jobs',
    entityType: 'container_job',
    entityId: container.id,
    afterData: container,
    metadata: { salesOrderId: saved.id, soNumber: saved.soNumber },
  })));
  sendSuccess(response, saved, 'Sales Order berhasil disimpan.', 201);
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
  });
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
