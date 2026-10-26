import {
  cancelSalesOrderController,
  createSalesOrderController,
  customerOutstandingSummaryController,
  getSalesOrderController,
  listActiveOperationalSalesOrdersController,
  listSalesOrdersController,
  requestCancelSalesOrderController,
  reviewCancelSalesOrderController,
  updateInvoiceDeliveryStatusController,
  updateSalesOrderController,
} from './sales-orders.controller.js';

export const salesOrderRoutes = [
  {
    method: 'GET',
    path: '/api/sales-orders',
    permission: 'sales_order.read',
    handler: listSalesOrdersController,
  },
  {
    method: 'POST',
    path: '/api/sales-orders',
    permission: 'sales_order.create',
    handler: createSalesOrderController,
  },
  {
    method: 'GET',
    path: '/api/sales-orders/active-operational',
    permission: 'sales_order.read',
    handler: listActiveOperationalSalesOrdersController,
  },
  {
    method: 'GET',
    path: '/api/sales-orders/customer-outstanding',
    permission: 'sales_order.customer_outstanding.read',
    handler: customerOutstandingSummaryController,
  },
  {
    method: 'GET',
    path: '/api/sales-orders/:id',
    permission: 'sales_order.read',
    handler: getSalesOrderController,
  },
  {
    method: 'PATCH',
    path: '/api/sales-orders/:id',
    permission: 'sales_order.update',
    handler: updateSalesOrderController,
  },
  {
    method: 'PATCH',
    path: '/api/sales-orders/:id/invoice-delivery-status',
    permission: 'finance.invoice.delivery_status.update',
    handler: updateInvoiceDeliveryStatusController,
  },
  {
    method: 'PUT',
    path: '/api/sales-orders/:id',
    permission: 'sales_order.update',
    handler: updateSalesOrderController,
  },
  {
    method: 'PATCH',
    path: '/api/sales-orders/:id/cancel',
    permission: 'sales_order.cancel',
    handler: cancelSalesOrderController,
  },
  {
    method: 'PATCH',
    path: '/api/sales-orders/:id/cancel-request',
    permission: 'sales_order.update',
    handler: requestCancelSalesOrderController,
  },
  {
    method: 'PATCH',
    path: '/api/sales-orders/:id/cancel-review',
    permission: 'sales_order.cancel_review',
    handler: reviewCancelSalesOrderController,
  },
  {
    method: 'DELETE',
    path: '/api/sales-orders/:id',
    permission: 'sales_order.cancel',
    handler: cancelSalesOrderController,
  },
];
