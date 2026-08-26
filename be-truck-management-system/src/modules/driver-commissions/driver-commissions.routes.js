import {
  approveDriverCommissionBatchController,
  driverCommissionBatchDetailController,
  driverCommissionBatchesController,
  driverCommissionPeriodReportController,
  eligibleDriverCommissionsController,
  payDriverCommissionPaymentController,
  rejectDriverCommissionBatchController,
  submitDriverCommissionBatchController,
  uploadDriverCommissionPaymentProofController,
  voidDriverCommissionPaymentController,
} from './driver-commissions.controller.js';

export const driverCommissionRoutes = [
  {
    method: 'GET',
    path: '/api/driver-commissions/eligible',
    permissions: ['container_job.read', 'finance.read', 'report.read'],
    handler: eligibleDriverCommissionsController,
  },
  {
    method: 'GET',
    path: '/api/driver-commissions/period-report',
    permissions: ['container_job.read', 'finance.read', 'report.read'],
    handler: driverCommissionPeriodReportController,
  },
  {
    method: 'GET',
    path: '/api/driver-commissions/batches',
    permissions: ['container_job.read', 'finance.read', 'report.read'],
    handler: driverCommissionBatchesController,
  },
  {
    method: 'GET',
    path: '/api/driver-commissions/batches/:id',
    permissions: ['container_job.read', 'finance.read', 'report.read'],
    handler: driverCommissionBatchDetailController,
  },
  {
    method: 'POST',
    path: '/api/driver-commissions/batches',
    permissions: ['container_job.update', 'container_job.update_status'],
    handler: submitDriverCommissionBatchController,
  },
  {
    method: 'PATCH',
    path: '/api/driver-commissions/batches/:id/approve',
    permission: 'finance.rpuj_approval.approve',
    handler: approveDriverCommissionBatchController,
  },
  {
    method: 'PATCH',
    path: '/api/driver-commissions/batches/:id/reject',
    permission: 'finance.rpuj_approval.reject',
    handler: rejectDriverCommissionBatchController,
  },
  {
    method: 'PATCH',
    path: '/api/driver-commissions/payments/:id/pay',
    permission: 'finance.transfer_proof.upload',
    handler: payDriverCommissionPaymentController,
  },
  {
    method: 'PATCH',
    path: '/api/driver-commissions/payments/:id/void',
    permission: 'driver_commission.void',
    handler: voidDriverCommissionPaymentController,
  },
  {
    method: 'POST',
    path: '/api/driver-commissions/payments/:id/transfer-proof',
    permission: 'finance.transfer_proof.upload',
    handler: uploadDriverCommissionPaymentProofController,
  },
];
