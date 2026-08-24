import { render, screen, waitFor, within } from '@testing-library/react';
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

const olderPeriodReport = {
  ...periodReport,
  periodStart: '2026-08-06',
  periodEnd: '2026-08-12',
  activeBatch: {
    id: 'batch-2',
    status: 'approved',
    periodStart: '2026-08-06',
    periodEnd: '2026-08-12',
    submittedAt: '2026-08-13T03:00:00.000Z',
  },
  summary: {
    totalDrivers: 1,
    totalItems: 1,
    totalAmount: 75000,
    paidAmount: 0,
    unpaidAmount: 75000,
  },
  drivers: [
    {
      driverId: 'driver-2',
      driverName: 'Jajam',
      paymentMethod: 'bank',
      bankName: 'Mandiri',
      bankAccountNumber: '987654',
      bankAccountHolder: 'Jajam',
      batchId: 'batch-2',
      batchStatus: 'approved',
      paymentId: 'payment-2',
      paymentStatus: 'pending',
      totalItems: 1,
      totalAmount: 75000,
      items: [
        {
          id: 'item-2',
          containerJobId: 'job-2',
          soNumber: 'SO-002',
          containerNumber: 'CONT-002',
          containerSize: '40FT',
          customerName: 'PT B',
          destination: 'Karawang',
          truckPlateNumber: 'B 2000 BB',
          completedDate: '2026-08-06',
          amount: 75000,
        },
      ],
    },
  ],
};

const olderBatchDetail = {
  ...batchDetail,
  id: 'batch-2',
  status: 'approved',
  periodStart: '2026-08-06',
  periodEnd: '2026-08-12',
  totalItems: 1,
  totalAmount: 75000,
  submittedAt: '2026-08-13T03:00:00.000Z',
  payments: [
    {
      id: 'payment-2',
      batchId: 'batch-2',
      driverId: 'driver-2',
      driverName: 'Jajam',
      paymentMethod: 'bank',
      bankName: 'Mandiri',
      bankAccountNumber: '987654',
      bankAccountHolder: 'Jajam',
      totalItems: 1,
      totalAmount: 75000,
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
    expect(screen.getByLabelText('Pilih batch komisi')).toHaveTextContent('13 Agustus 2026');
    expect(screen.getByLabelText('Pilih batch komisi')).toHaveTextContent('19 Agustus 2026');
    expect(screen.getAllByText(/BCA 123456/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    expect(await screen.findByRole('dialog', { name: /Rahmat/i })).toBeInTheDocument();
    expect(screen.getByText('CONT-001')).toBeInTheDocument();
  });

  it('mengganti report saat batch dipilih dari dropdown', async () => {
    const user = userEvent.setup();
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [batchDetail, olderBatchDetail] });
    fetchDriverCommissionBatchDetail.mockImplementation((id) => Promise.resolve(id === 'batch-2' ? olderBatchDetail : batchDetail));
    fetchDriverCommissionPeriodReport.mockImplementation(({ periodStart }) => Promise.resolve(periodStart === '2026-08-06' ? olderPeriodReport : periodReport));

    render(<DriverCommissionPage />);

    const batchTrigger = await screen.findByLabelText('Pilih batch komisi');
    await waitFor(() => expect(batchTrigger).toHaveTextContent('13 Agustus 2026'));

    await user.click(batchTrigger);
    await user.click(await screen.findByRole('button', { name: /pilih batch 06 agustus 2026 - 12 agustus 2026/i }));

    await waitFor(() => {
      expect(fetchDriverCommissionBatchDetail).toHaveBeenLastCalledWith('batch-2');
      expect(fetchDriverCommissionPeriodReport).toHaveBeenLastCalledWith({
        periodStart: '2026-08-06',
        periodEnd: '2026-08-12',
      });
    });
    expect(await screen.findByText('Jajam')).toBeInTheDocument();
  });

  it('membuka modal pilih batch dari card Periode dan memilih batch mengganti report', async () => {
    const user = userEvent.setup();
    fetchDriverCommissionBatches.mockResolvedValue({
      rows: [batchDetail, olderBatchDetail],
      pagination: { page: 1, pageSize: 20, total: 2 },
    });
    fetchDriverCommissionBatchDetail.mockImplementation((id) => Promise.resolve(id === 'batch-2' ? olderBatchDetail : batchDetail));
    fetchDriverCommissionPeriodReport.mockImplementation(({ periodStart }) => Promise.resolve(periodStart === '2026-08-06' ? olderPeriodReport : periodReport));

    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /periode/i }));

    const dialog = await screen.findByRole('dialog', { name: /pilih batch komisi/i });
    expect(within(dialog).getByText(/13 Agustus 2026 - 19 Agustus 2026/i)).toBeInTheDocument();

    await user.click(within(dialog).getByText(/06 Agustus 2026 - 12 Agustus 2026/i));

    await waitFor(() => {
      expect(fetchDriverCommissionBatchDetail).toHaveBeenLastCalledWith('batch-2');
      expect(fetchDriverCommissionPeriodReport).toHaveBeenLastCalledWith({
        periodStart: '2026-08-06',
        periodEnd: '2026-08-12',
      });
    });
    expect(screen.queryByRole('dialog', { name: /pilih batch komisi/i })).not.toBeInTheDocument();
    expect(await screen.findByText('Jajam')).toBeInTheDocument();
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
