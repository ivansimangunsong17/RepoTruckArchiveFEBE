import {
  cancelSalesOrderController,
  createSalesOrderController,
  getSalesOrderController,
  listSalesOrdersController,
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
    method: 'DELETE',
    path: '/api/sales-orders/:id',
    permission: 'sales_order.cancel',
    handler: cancelSalesOrderController,
  },
];
