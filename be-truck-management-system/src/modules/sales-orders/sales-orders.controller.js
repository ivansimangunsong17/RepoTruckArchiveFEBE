import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import {
  getSalesOrder,
  listSalesOrders,
  removeSalesOrder,
  saveSalesOrder,
} from './sales-orders.service.js';

export async function listSalesOrdersController(request, response) {
  const result = await listSalesOrders(request.query);
  sendSuccess(response, result);
}

export async function createSalesOrderController(request, response) {
  const saved = await saveSalesOrder(request.body);
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
  const saved = await saveSalesOrder(request.body, request.params.id);
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

export async function cancelSalesOrderController(request, response) {
  const before = await getSalesOrder(request.params.id);
  const cancelled = await removeSalesOrder(request.params.id);
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
