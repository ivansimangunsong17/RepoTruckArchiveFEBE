import {
  approveRpujController,
  completedTripDetailController,
  completedTripsController,
  financeDashboardController,
  invoiceOrdersController,
  orderVerificationsController,
  rejectRpujController,
  rpujRequestsController,
  updateInvoiceNumberController,
  updateOrderVerificationSoNumberController,
  uploadRpujTransferProofController,
} from './finance.controller.js';

export const financeRoutes = [
  {
    method: 'GET',
    path: '/api/finance/dashboard',
    permission: 'finance.invoice.read',
    handler: financeDashboardController,
  },
  {
    method: 'GET',
    path: '/api/finance/order-verifications',
    permission: 'finance.order_verification.read',
    handler: orderVerificationsController,
  },
  {
    method: 'PATCH',
    path: '/api/finance/order-verifications/:id/so-number',
    permission: 'finance.order_verification.update',
    handler: updateOrderVerificationSoNumberController,
  },
  {
    method: 'GET',
    path: '/api/finance/rpuj-requests',
    permission: 'finance.rpuj_approval.read',
    handler: rpujRequestsController,
  },
  {
    method: 'PATCH',
    path: '/api/finance/rpuj-requests/:id/approve',
    permission: 'finance.rpuj_approval.approve',
    handler: approveRpujController,
  },
  {
    method: 'PATCH',
    path: '/api/finance/rpuj-requests/:id/reject',
    permission: 'finance.rpuj_approval.reject',
    handler: rejectRpujController,
  },
  {
    method: 'POST',
    path: '/api/finance/rpuj-requests/:id/transfer-proof',
    permission: 'finance.transfer_proof.upload',
    handler: uploadRpujTransferProofController,
  },
  {
    method: 'GET',
    path: '/api/finance/invoices',
    permission: 'finance.invoice.read',
    handler: invoiceOrdersController,
  },
  {
    method: 'PATCH',
    path: '/api/finance/invoices/:id/number',
    permission: 'finance.invoice.update_number',
    handler: updateInvoiceNumberController,
  },
  {
    method: 'GET',
    path: '/api/finance/completed-trips',
    permission: 'finance.invoice.read',
    handler: completedTripsController,
  },
  {
    method: 'GET',
    path: '/api/finance/completed-trips/:id',
    permission: 'finance.invoice.read',
    handler: completedTripDetailController,
  },
];
