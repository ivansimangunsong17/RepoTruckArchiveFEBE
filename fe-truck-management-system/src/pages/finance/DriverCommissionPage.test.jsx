import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverCommissionPage from './DriverCommissionPage';
import {
  approveDriverCommissionBatch,
  fetchDriverCommissionBatchDetail,
  fetchDriverCommissionBatches,
  fetchDriverCommissionPeriodReport,
} from '../../services/finance/driverCommissionService';

const notify = vi.fn();
const confirmAction = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      role: 'finance',
      permissions: ['finance.read', 'finance.rpuj_approval.approve', 'finance.transfer_proof.upload'],
    },
  }),
}));

vi.mock('../../contexts/FeedbackContext', () => ({
  useFeedback: () => ({ notify, confirmAction }),
}));

vi.mock('../../services/finance/driverCommissionService', () => ({
  approveDriverCommissionBatch: vi.fn(),
  fetchDriverCommissionBatchDetail: vi.fn(),
  fetchDriverCommissionBatches: vi.fn(),
  fetchDriverCommissionPeriodReport: vi.fn(),
  payDriverCommissionPayment: vi.fn(),
  rejectDriverCommissionBatch: vi.fn(),
  uploadDriverCommissionTransferProof: vi.fn(),
}));

const periodReport = {
  periodStart: '2026-08-13',
  periodEnd: '2026-08-19',
  status: 'submitted',
  activeBatch: {
    id: 'batch-1',
    status: 'submitted',
    periodStart: '2026-08-13',
    periodEnd: '2026-08-19',
    submittedAt: '2026-08-20T03:00:00.000Z',
  },
  summary: {
    totalDrivers: 1,
    totalItems: 2,
    totalAmount: 125000,
    paidAmount: 0,
    unpaidAmount: 125000,
  },
  drivers: [
    {
      driverId: 'driver-1',
      driverName: 'Rahmat',
      paymentMethod: 'bank',
      bankName: 'BCA',
      bankAccountNumber: '123456',
      bankAccountHolder: 'Rahmat',
      batchId: 'batch-1',
      batchStatus: 'submitted',
      paymentId: 'payment-1',
      paymentStatus: 'pending',
      totalItems: 2,
      totalAmount: 125000,
      items: [
        {
          id: 'item-1',
          containerJobId: 'job-1',
          soNumber: 'SO-001',
          containerNumber: 'CONT-001',
          containerSize: '20FT',
          customerName: 'PT A',
          destination: 'Cikarang',
          truckPlateNumber: 'B 1000 AA',
          completedDate: '2026-08-13',
          amount: 50000,
        },
      ],
    },
  ],
};

const batchDetail = {
  id: 'batch-1',
  status: 'submitted',
  periodStart: '2026-08-13',
  periodEnd: '2026-08-19',
  totalItems: 2,
  totalAmount: 125000,
  submittedAt: '2026-08-20T03:00:00.000Z',
  submittedByName: 'Operational',
  payments: [
    {
      id: 'payment-1',
      batchId: 'batch-1',
      driverId: 'driver-1',
      driverName: 'Rahmat',
      paymentMethod: 'bank',
      bankName: 'BCA',
      bankAccountNumber: '123456',
      bankAccountHolder: 'Rahmat',
      totalItems: 2,
      totalAmount: 125000,
      status: 'pending',
      items: [],
    },
  ],
};

describe('DriverCommissionPage finance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDriverCommissionPeriodReport.mockResolvedValue(periodReport);
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [batchDetail] });
    fetchDriverCommissionBatchDetail.mockResolvedValue(batchDetail);
    approveDriverCommissionBatch.mockResolvedValue({ ...batchDetail, status: 'approved' });
    confirmAction.mockResolvedValue(true);
  });

  it('menampilkan report komisi per sopir dan detail container', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    expect((await screen.findAllByText('Rahmat')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BCA 123456/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    expect(await screen.findByRole('dialog', { name: /Rahmat/i })).toBeInTheDocument();
    expect(screen.getByText('CONT-001')).toBeInTheDocument();
  });

  it('mengapprove batch komisi aktif', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(confirmAction).toHaveBeenCalled();
      expect(approveDriverCommissionBatch).toHaveBeenCalledWith('batch-1');
    });
  });
});
