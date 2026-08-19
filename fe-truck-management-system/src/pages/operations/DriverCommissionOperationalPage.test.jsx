import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverCommissionOperationalPage from './DriverCommissionOperationalPage';
import {
  fetchDriverCommissionPeriodReport,
  submitDriverCommissionBatch,
} from '../../services/finance/driverCommissionService';

const notify = vi.fn();
const confirmAction = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      role: 'operational',
      permissions: ['container_job.read', 'container_job.update'],
    },
  }),
}));

vi.mock('../../contexts/FeedbackContext', () => ({
  useFeedback: () => ({ notify, confirmAction }),
}));

vi.mock('../../services/finance/driverCommissionService', () => ({
  fetchDriverCommissionPeriodReport: vi.fn(),
  submitDriverCommissionBatch: vi.fn(),
}));

const reportFixture = {
  periodStart: '2026-08-13',
  periodEnd: '2026-08-19',
  status: 'draft',
  activeBatch: null,
  summary: {
    totalDrivers: 2,
    totalItems: 3,
    totalAmount: 225000,
    unsubmittedItems: 3,
    submittedItems: 0,
    paidItems: 0,
    paidAmount: 0,
    unpaidAmount: 225000,
  },
  drivers: [
    {
      driverId: 'driver-1',
      driverName: 'Rahmat',
      totalItems: 2,
      totalAmount: 125000,
      unpaidAmount: 125000,
      unpaidItems: 2,
      submittedItems: 0,
      approvedItems: 0,
      paidItems: 0,
      items: [
        {
          containerJobId: 'job-1',
          soNumber: 'SO-001',
          containerNumber: 'CONT-001',
          containerSize: '20FT',
          customerName: 'PT A',
          destination: 'Cikarang',
          truckPlateNumber: 'B 1000 AA',
          completedDate: '2026-08-13',
          amount: 50000,
          paymentStatus: 'unsubmitted',
        },
      ],
    },
    {
      driverKey: 'name:jajam',
      driverId: null,
      driverName: 'Jajam',
      totalItems: 1,
      totalAmount: 100000,
      unpaidAmount: 100000,
      unpaidItems: 1,
      submittedItems: 0,
      approvedItems: 0,
      paidItems: 0,
      items: [
        {
          containerJobId: 'job-2',
          soNumber: 'SO-002',
          containerNumber: 'CONT-002',
          containerSize: '40FT',
          customerName: 'PT B',
          destination: 'Karawang',
          truckPlateNumber: 'B 2000 BB',
          completedDate: '2026-08-14',
          amount: 100000,
          paymentStatus: 'unsubmitted',
        },
      ],
    },
  ],
};

describe('DriverCommissionOperationalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDriverCommissionPeriodReport.mockResolvedValue(reportFixture);
    submitDriverCommissionBatch.mockResolvedValue({ id: 'batch-1' });
    confirmAction.mockResolvedValue(true);
  });

  it('menampilkan report komisi per sopir dan detail container', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    expect((await screen.findAllByText('Rahmat')).length).toBeGreaterThan(0);
    expect(screen.getByText('Jajam')).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    expect(await screen.findByRole('dialog', { name: /Rahmat/i })).toBeInTheDocument();
    expect(screen.getByText('CONT-001')).toBeInTheDocument();
  });

  it('membuka detail sopir tanpa master driver id memakai driverKey', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    await screen.findByText('Jajam');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[1]);

    expect(await screen.findByText('CONT-002')).toBeInTheDocument();
  });

  it('mengajukan batch komisi dengan periode otomatis', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    await screen.findAllByText('Rahmat');
    expect(screen.queryByLabelText('Dari')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sampai')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ajukan ke finance/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /ajukan ke finance/i }));

    await waitFor(() => {
      expect(confirmAction).toHaveBeenCalled();
      expect(submitDriverCommissionBatch).toHaveBeenCalledWith(expect.objectContaining({
        periodStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }));
    });
  });

  it('tidak menampilkan pilihan tanggal manual', async () => {
    render(<DriverCommissionOperationalPage />);

    await screen.findAllByText('Rahmat');

    expect(screen.queryByLabelText('Dari')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sampai')).not.toBeInTheDocument();
    expect(screen.getByText(/otomatis kamis sampai rabu/i)).toBeInTheDocument();
  });
});
