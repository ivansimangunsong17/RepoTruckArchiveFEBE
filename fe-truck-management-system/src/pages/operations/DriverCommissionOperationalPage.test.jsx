import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverCommissionOperationalPage from './DriverCommissionOperationalPage';
import {
  fetchDriverCommissionBatches,
  fetchDriverCommissionPeriodReport,
  submitDriverCommissionBatch,
} from '../../services/finance/driverCommissionService';
import { downloadPdfReport } from '../../utils/simplePdfReport';
import { downloadCsv } from '../../utils/csvExport';

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
  fetchDriverCommissionBatches: vi.fn(),
  fetchDriverCommissionPeriodReport: vi.fn(),
  submitDriverCommissionBatch: vi.fn(),
}));

vi.mock('../../utils/simplePdfReport', () => ({
  downloadPdfReport: vi.fn(),
}));

vi.mock('../../utils/csvExport', () => ({
  downloadCsv: vi.fn(),
}));

const reportFixture = {
  periodStart: '2026-08-08',
  periodEnd: '2026-08-14',
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
      grossAmount: 125000,
      deductionAmount: 25000,
      netAmount: 100000,
      deductions: [
        {
          id: 'deduction-1',
          deductionType: 'hutang_sopir',
          amount: 25000,
          reason: 'Potongan hutang sopir sesuai catatan Finance',
          operationalNote: 'Komisi dipotong Rp25.000 karena ada hutang aktif. Detail ada di Finance.',
          status: 'active',
        },
      ],
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
          completedDate: '2026-08-08',
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

const previousPeriodReport = {
  ...reportFixture,
  periodStart: '2026-08-01',
  periodEnd: '2026-08-07',
  status: 'submitted',
  activeBatch: {
    id: 'batch-previous',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-07',
    status: 'submitted',
    submittedAt: '2026-08-08T03:00:00.000Z',
  },
  summary: {
    totalDrivers: 1,
    totalItems: 1,
    totalAmount: 100000,
    unsubmittedItems: 0,
    submittedItems: 1,
    paidItems: 0,
    paidAmount: 0,
    unpaidAmount: 100000,
  },
  drivers: [
    {
      driverId: 'driver-3',
      driverName: 'Asep',
      totalItems: 1,
      totalAmount: 100000,
      unpaidAmount: 100000,
      unpaidItems: 1,
      submittedItems: 1,
      approvedItems: 0,
      paidItems: 0,
      items: [
        {
          containerJobId: 'job-previous',
          soNumber: 'SO-003',
          containerNumber: 'CONT-003',
          containerSize: '20FT',
          customerName: 'PT C',
          destination: 'Bekasi',
          truckPlateNumber: 'B 3000 CC',
          completedDate: '2026-08-01',
          amount: 100000,
          paymentStatus: 'pending',
        },
      ],
    },
  ],
};

describe('DriverCommissionOperationalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [] });
    fetchDriverCommissionPeriodReport.mockResolvedValue(reportFixture);
    submitDriverCommissionBatch.mockResolvedValue({ id: 'batch-1' });
    confirmAction.mockResolvedValue(true);
  });

  it('menampilkan report komisi per sopir dan detail container', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    expect((await screen.findAllByText('Rahmat')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Pilih batch komisi')).toBeInTheDocument();
    expect(screen.getByText('Jajam')).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    expect(await screen.findByRole('dialog', { name: /Rahmat/i })).toBeInTheDocument();
    expect(screen.getByText('CONT-001')).toBeInTheDocument();
  });

  it('mengunduh PDF report komisi yang sedang tampil', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    await screen.findByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    expect(downloadPdfReport).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Report Komisi Sopir',
      filename: expect.stringContaining('komisi-sopir-operational'),
      rows: expect.arrayContaining([
        expect.objectContaining({ driverName: 'Rahmat', totalItems: 2 }),
      ]),
      meta: expect.arrayContaining([
        { label: 'Sebelum Potongan', value: expect.stringMatching(/Rp\s*225\.000/) },
        { label: 'Potongan Finance', value: expect.stringMatching(/Rp\s*25\.000/) },
        { label: 'Harus Dibayar', value: expect.stringMatching(/Rp\s*200\.000/) },
      ]),
    }));
  });

  it('mengunduh CSV dengan satu baris untuk setiap rincian ritasi sopir', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    await screen.findByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /download csv/i }));

    expect(downloadCsv).toHaveBeenCalledWith(
      expect.stringContaining('komisi-sopir-operational-detail'),
      expect.arrayContaining(['Nama Sopir', 'Nomor SO', 'Nomor Container', 'Komisi Ritasi (Sebelum Potongan)', 'Total Harus Dibayar ke Sopir']),
      expect.arrayContaining([
        expect.arrayContaining(['Rahmat', 'SO-001', 'CONT-001', 50000, 125000, 25000, 100000]),
        expect.arrayContaining(['Jajam', 'SO-002', 'CONT-002']),
      ]),
    );
  });

  it('membuka detail sopir tanpa master driver id memakai driverKey', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    await screen.findByText('Jajam');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[1]);

    expect(await screen.findByText('CONT-002')).toBeInTheDocument();
  });

  it('memuat report sesuai batch yang dipilih dari dropdown', async () => {
    const user = userEvent.setup();
    fetchDriverCommissionBatches.mockResolvedValue({
      rows: [
        {
          id: 'batch-previous',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-07',
          status: 'submitted',
          totalItems: 1,
          totalAmount: 100000,
        },
      ],
    });
    fetchDriverCommissionPeriodReport.mockImplementation(({ periodStart }) => (
      Promise.resolve(periodStart === '2026-08-01' ? previousPeriodReport : reportFixture)
    ));

    render(<DriverCommissionOperationalPage />);

    const batchTrigger = await screen.findByLabelText('Pilih batch komisi');
    await user.click(batchTrigger);
    await user.click(await screen.findByRole('button', { name: /01 agustus 2026 - 07 agustus 2026/i }));

    await waitFor(() => {
      expect(fetchDriverCommissionPeriodReport).toHaveBeenLastCalledWith({
        periodStart: '2026-08-01',
        periodEnd: '2026-08-07',
      });
    });
    expect(await screen.findByText('Asep')).toBeInTheDocument();
  });

  it('membuka modal pilih batch dari card Periode dan memilih batch mengganti report', async () => {
    const user = userEvent.setup();
    fetchDriverCommissionBatches.mockResolvedValue({
      rows: [
        {
          id: 'batch-previous',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-07',
          status: 'submitted',
          totalItems: 1,
          totalAmount: 100000,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });
    fetchDriverCommissionPeriodReport.mockImplementation(({ periodStart }) => (
      Promise.resolve(periodStart === '2026-08-01' ? previousPeriodReport : reportFixture)
    ));

    render(<DriverCommissionOperationalPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /periode/i }));

    const dialog = await screen.findByRole('dialog', { name: /riwayat batch yang sudah diajukan/i });
    await user.click(within(dialog).getByText(/01 Agustus 2026 - 07 Agustus 2026/i));

    await waitFor(() => {
      expect(fetchDriverCommissionPeriodReport).toHaveBeenLastCalledWith({
        periodStart: '2026-08-01',
        periodEnd: '2026-08-07',
      });
    });
    expect(screen.queryByRole('dialog', { name: /riwayat batch yang sudah diajukan/i })).not.toBeInTheDocument();
    expect(await screen.findByText('Asep')).toBeInTheDocument();
  });

  it('memfilter riwayat batch berdasarkan bulan di modal Riwayat Batch', async () => {
    const user = userEvent.setup();
    fetchDriverCommissionBatches.mockResolvedValue({
      rows: [
        {
          id: 'batch-previous',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-07',
          status: 'submitted',
          totalItems: 1,
          totalAmount: 100000,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });

    render(<DriverCommissionOperationalPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /periode/i }));
    await screen.findByRole('dialog', { name: /riwayat batch yang sudah diajukan/i });

    fetchDriverCommissionBatches.mockClear();
    await user.selectOptions(screen.getByLabelText('Filter batch komisi bulan'), '07');

    await waitFor(() => {
      expect(fetchDriverCommissionBatches).toHaveBeenLastCalledWith(expect.objectContaining({
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      }));
    });
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
    expect(screen.getByText(/otomatis sabtu sampai jumat/i)).toBeInTheDocument();
  });

  it('menampilkan badge "Ada Potongan Finance" untuk sopir yang komisinya dipotong', async () => {
    render(<DriverCommissionOperationalPage />);

    await screen.findAllByText('Rahmat');
    expect(screen.getAllByText('Ada Potongan Finance').length).toBeGreaterThan(0);
    expect(screen.queryByText('Jajam')?.closest('tr')).not.toHaveTextContent('Ada Potongan Finance');
  });

  it('menampilkan komisi bruto, potongan, net, dan catatan Finance read-only di detail sopir', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    const dialog = await screen.findByRole('dialog', { name: /Rahmat/i });
    expect(within(dialog).getByText('Sebelum Potongan')).toBeInTheDocument();
    expect(within(dialog).getByText('Potongan Finance')).toBeInTheDocument();
    expect(within(dialog).getByText('Harus Dibayar')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Rp\s*25\.000/i).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Rp\s*100\.000/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Komisi dipotong Rp25.000 karena ada hutang aktif. Detail ada di Finance.')).toBeInTheDocument();
  });

  it('tidak menampilkan tombol kelola potongan (tambah/void) di detail sopir Operational', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionOperationalPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    const dialog = await screen.findByRole('dialog', { name: /Rahmat/i });
    expect(within(dialog).queryByRole('button', { name: /tambah potongan/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^batalkan$/i })).not.toBeInTheDocument();
  });
});
