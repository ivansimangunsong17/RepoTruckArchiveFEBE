import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverCommissionPage from './DriverCommissionPage';
import {
  approveDriverCommissionBatch,
  fetchDriverCommissionBatchDetail,
  fetchDriverCommissionBatches,
  fetchDriverCommissionPeriodReport,
  markDriverCommissionPaymentPaid,
  recordDriverCommissionDeduction,
  voidDriverCommissionDeduction,
} from '../../services/finance/driverCommissionService';
import { downloadPdfReport } from '../../utils/simplePdfReport';
import { downloadCsv } from '../../utils/csvExport';

const notify = vi.fn();
const confirmAction = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      role: 'finance',
      permissions: [
        'finance.read',
        'finance.rpuj_approval.approve',
        'finance.transfer_proof.upload',
        'finance.driver_commission.deduction.manage',
      ],
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
  markDriverCommissionPaymentPaid: vi.fn(),
  recordDriverCommissionDeduction: vi.fn(),
  rejectDriverCommissionBatch: vi.fn(),
  uploadDriverCommissionTransferProof: vi.fn(),
  voidDriverCommissionDeduction: vi.fn(),
  voidDriverCommissionPayment: vi.fn(),
}));

vi.mock('../../utils/simplePdfReport', () => ({
  downloadPdfReport: vi.fn(),
}));

vi.mock('../../utils/csvExport', () => ({
  downloadCsv: vi.fn(),
}));

const periodReport = {
  periodStart: '2026-09-13',
  periodEnd: '2026-09-19',
  status: 'submitted',
  activeBatch: {
    id: 'batch-1',
    status: 'submitted',
    periodStart: '2026-09-13',
    periodEnd: '2026-09-19',
    submittedAt: '2026-09-20T03:00:00.000Z',
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
      grossAmount: 125000,
      deductionAmount: 25000,
      netAmount: 100000,
      deductions: [
        {
          id: 'deduction-1',
          paymentId: 'payment-1',
          deductionType: 'hutang_sopir',
          amount: 25000,
          reason: 'Potongan hutang sopir sesuai catatan Finance',
          operationalNote: 'Komisi dipotong Rp25.000 karena ada hutang aktif. Detail ada di Finance.',
          status: 'active',
          createdByName: 'Sprint2C Finance',
          createdAt: '2026-09-20T04:00:00.000Z',
        },
      ],
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
          completedDate: '2026-09-13',
          amount: 50000,
        },
      ],
    },
  ],
};

const batchDetail = {
  id: 'batch-1',
  status: 'submitted',
  periodStart: '2026-09-13',
  periodEnd: '2026-09-19',
  totalItems: 2,
  totalAmount: 125000,
  submittedAt: '2026-09-20T03:00:00.000Z',
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
      grossAmount: 125000,
      deductionAmount: 25000,
      netAmount: 100000,
      deductions: [
        {
          id: 'deduction-1',
          paymentId: 'payment-1',
          deductionType: 'hutang_sopir',
          amount: 25000,
          reason: 'Potongan hutang sopir sesuai catatan Finance',
          operationalNote: 'Komisi dipotong Rp25.000 karena ada hutang aktif. Detail ada di Finance.',
          status: 'active',
          createdByName: 'Sprint2C Finance',
          createdAt: '2026-09-20T04:00:00.000Z',
        },
      ],
      status: 'pending',
      items: [],
    },
  ],
};

const paidBatchDetail = {
  ...batchDetail,
  payments: [
    {
      ...batchDetail.payments[0],
      status: 'paid',
      paidAt: '2026-09-21T02:00:00.000Z',
      paidByName: 'Sprint2C Finance',
    },
  ],
};

const olderPeriodReport = {
  ...periodReport,
  periodStart: '2026-09-06',
  periodEnd: '2026-09-12',
  activeBatch: {
    id: 'batch-2',
    status: 'approved',
    periodStart: '2026-09-06',
    periodEnd: '2026-09-12',
    submittedAt: '2026-09-13T03:00:00.000Z',
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
          completedDate: '2026-09-06',
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
  periodStart: '2026-09-06',
  periodEnd: '2026-09-12',
  totalItems: 1,
  totalAmount: 75000,
  submittedAt: '2026-09-13T03:00:00.000Z',
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
    expect(screen.getByLabelText('Pilih batch komisi')).toHaveTextContent('13 September 2026');
    expect(screen.getByLabelText('Pilih batch komisi')).toHaveTextContent('19 September 2026');
    expect(screen.getAllByText(/BCA 123456/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    expect(await screen.findByRole('dialog', { name: /Rahmat/i })).toBeInTheDocument();
    expect(screen.getByText('CONT-001')).toBeInTheDocument();
  });

  it('menampilkan notice ketika batch berubah setelah diajukan', async () => {
    const user = userEvent.setup();
    const revisedBatch = {
      ...batchDetail,
      revisionCount: 1,
      lastRevisedAt: '2026-08-16T03:00:00.000Z',
      lastRevisedByName: 'Admin Test',
      lastRevisionReason: 'Sopir sebelumnya salah dipilih',
      lastRevisionPreviousDriverName: 'Sopir Lama',
      lastRevisionNextDriverName: 'Sopir Baru',
    };
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [revisedBatch] });
    fetchDriverCommissionBatchDetail.mockResolvedValue(revisedBatch);

    render(<DriverCommissionPage />);

    expect(await screen.findByText('Batch berubah setelah diajukan')).toBeInTheDocument();
    expect(screen.getByText(/Sopir Lama dipindahkan ke Sopir Baru/i)).toBeInTheDocument();
    expect(screen.getByText(/Sopir sebelumnya salah dipilih/i)).toBeInTheDocument();
    const approveButton = screen.getByRole('button', { name: /approve/i });
    expect(approveButton).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /sudah memeriksa ulang/i }));

    expect(approveButton).toBeEnabled();
  });

  it('mengunduh PDF pembayaran komisi yang sedang tampil', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    expect(downloadPdfReport).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Pembayaran Komisi Sopir',
      filename: expect.stringContaining('komisi-sopir-finance'),
      rows: expect.arrayContaining([
        expect.objectContaining({ driverName: 'Rahmat', account: 'BCA 123456' }),
      ]),
      meta: expect.arrayContaining([
        { label: 'Sebelum Potongan', value: expect.stringMatching(/Rp\s*125\.000/) },
        { label: 'Potongan Finance', value: expect.stringMatching(/Rp\s*25\.000/) },
        { label: 'Harus Dibayar', value: expect.stringMatching(/Rp\s*100\.000/) },
      ]),
    }));
  });

  it('mengunduh CSV pembayaran dengan rincian ritasi per sopir', async () => {
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /download csv/i }));

    expect(downloadCsv).toHaveBeenCalledWith(
      expect.stringContaining('komisi-sopir-finance-detail'),
      expect.arrayContaining(['Nama Sopir', 'Nomor SO', 'Nomor Container', 'Komisi Ritasi (Sebelum Potongan)', 'Total Harus Dibayar ke Sopir']),
      expect.arrayContaining([
        expect.arrayContaining(['Rahmat', 'SO-001', 'CONT-001', 50000, 125000, 25000, 100000]),
      ]),
    );
  });

  it('mengganti report saat batch dipilih dari dropdown', async () => {
    const user = userEvent.setup();
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [batchDetail, olderBatchDetail] });
    fetchDriverCommissionBatchDetail.mockImplementation((id) => Promise.resolve(id === 'batch-2' ? olderBatchDetail : batchDetail));
    fetchDriverCommissionPeriodReport.mockImplementation(({ periodStart }) => Promise.resolve(periodStart === '2026-09-06' ? olderPeriodReport : periodReport));

    render(<DriverCommissionPage />);

    const batchTrigger = await screen.findByLabelText('Pilih batch komisi');
    await waitFor(() => expect(batchTrigger).toHaveTextContent('13 September 2026'));

    await user.click(batchTrigger);
    await user.click(await screen.findByRole('button', { name: /pilih batch 06 september 2026 - 12 september 2026/i }));

    await waitFor(() => {
      expect(fetchDriverCommissionBatchDetail).toHaveBeenLastCalledWith('batch-2');
      expect(fetchDriverCommissionPeriodReport).toHaveBeenLastCalledWith({
        periodStart: '2026-09-06',
        periodEnd: '2026-09-12',
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
    fetchDriverCommissionPeriodReport.mockImplementation(({ periodStart }) => Promise.resolve(periodStart === '2026-09-06' ? olderPeriodReport : periodReport));

    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getByRole('button', { name: /periode/i }));

    const dialog = await screen.findByRole('dialog', { name: /pilih batch komisi/i });
    expect(within(dialog).getByText(/13 September 2026 - 19 September 2026/i)).toBeInTheDocument();

    await user.click(within(dialog).getByText(/06 September 2026 - 12 September 2026/i));

    await waitFor(() => {
      expect(fetchDriverCommissionBatchDetail).toHaveBeenLastCalledWith('batch-2');
      expect(fetchDriverCommissionPeriodReport).toHaveBeenLastCalledWith({
        periodStart: '2026-09-06',
        periodEnd: '2026-09-12',
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

  it('menampilkan komisi bruto, potongan Finance, dan net dibayar per sopir di tabel', async () => {
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    expect(screen.getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp\s*25\.000/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp\s*100\.000/i).length).toBeGreaterThan(0);
  });

  it('finance bisa membuka modal potongan dan menambah potongan baru', async () => {
    const user = userEvent.setup();
    recordDriverCommissionDeduction.mockResolvedValue({ ...batchDetail, id: 'batch-1' });
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);
    expect(await screen.findByText('Potongan Komisi')).toBeInTheDocument();
    expect(screen.getByText(/Potongan hutang sopir sesuai catatan Finance/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /tambah potongan/i }));
    await user.type(screen.getByPlaceholderText('100000'), '50000');
    expect(screen.getByRole('dialog', { name: /tambah potongan/i })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Potongan kasbon sopir sesuai catatan Finance/), 'Kasbon belum lunas dari minggu lalu');
    await user.click(screen.getByRole('button', { name: /simpan potongan/i }));

    await waitFor(() => {
      expect(recordDriverCommissionDeduction).toHaveBeenCalledWith('payment-1', expect.objectContaining({
        amount: 50000,
        reason: 'Kasbon belum lunas dari minggu lalu',
        operationalNote: '',
      }));
    });
  });

  it('tidak menampilkan tombol tambah potongan saat komisi sopir belum diajukan ke Finance (belum ada payment)', async () => {
    const eligibleOnlyReport = {
      ...periodReport,
      status: 'draft',
      activeBatch: null,
      drivers: [
        {
          driverKey: 'name:budi',
          driverId: null,
          driverName: 'Budi',
          paymentMethod: 'bank',
          bankName: 'BRI',
          bankAccountNumber: '999',
          bankAccountHolder: 'Budi',
          batchId: null,
          batchStatus: null,
          paymentId: null,
          paymentStatus: 'unsubmitted',
          totalItems: 1,
          totalAmount: 65000,
          grossAmount: 65000,
          deductionAmount: 0,
          netAmount: 65000,
          deductions: [],
          items: [],
        },
      ],
    };
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [] });
    fetchDriverCommissionPeriodReport.mockResolvedValue(eligibleOnlyReport);
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    await screen.findAllByText('Budi');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);
    expect(await screen.findByText('Potongan Komisi')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /tambah potongan/i })).not.toBeInTheDocument();
    expect(screen.getByText(/diajukan Operational ke Finance/i)).toBeInTheDocument();
    expect(recordDriverCommissionDeduction).not.toHaveBeenCalled();
  });

  it('finance tidak bisa tambah atau membatalkan potongan setelah payment sudah paid', async () => {
    fetchDriverCommissionBatchDetail.mockResolvedValue(paidBatchDetail);
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [paidBatchDetail] });
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);
    expect(await screen.findByText('Potongan Komisi')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /tambah potongan/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^batalkan$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Potongan terkunci karena pembayaran sudah paid/i)).toBeInTheDocument();
  });

  it('upload bukti transfer menampilkan nominal net yang harus ditransfer', async () => {
    const approvedBatchDetail = { ...batchDetail, status: 'approved' };
    fetchDriverCommissionBatchDetail.mockResolvedValue(approvedBatchDetail);
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [approvedBatchDetail] });
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    expect(await screen.findByText(/Nominal yang harus dibayarkan: Rp\s*100\.000/i)).toBeInTheDocument();
  });

  it('finance bisa menandai komisi lunas via potongan penuh tanpa upload bukti transfer', async () => {
    const fullyDeductedBatch = {
      ...batchDetail,
      status: 'approved',
      payments: [
        {
          ...batchDetail.payments[0],
          status: 'pending',
          deductionAmount: 125000,
          netAmount: 0,
          deductions: [
            {
              id: 'deduction-full',
              paymentId: 'payment-1',
              deductionType: 'hutang_sopir',
              amount: 125000,
              reason: 'Potongan hutang sopir sampai lunas',
              status: 'active',
              createdByName: 'Sprint2C Finance',
              createdAt: '2026-09-20T04:00:00.000Z',
            },
          ],
        },
      ],
    };
    const paidFullyDeductedBatch = {
      ...fullyDeductedBatch,
      status: 'paid',
      payments: [
        {
          ...fullyDeductedBatch.payments[0],
          status: 'paid',
          paidAt: '2026-09-21T02:00:00.000Z',
          paidByName: 'Sprint2C Finance',
          paymentNote: 'Lunas via potongan Finance penuh.',
        },
      ],
    };
    fetchDriverCommissionBatchDetail
      .mockResolvedValueOnce(fullyDeductedBatch)
      .mockResolvedValue(paidFullyDeductedBatch);
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [fullyDeductedBatch] });
    markDriverCommissionPaymentPaid.mockResolvedValue(paidFullyDeductedBatch);
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);

    expect(await screen.findByText(/Komisi sudah habis dipotong Finance/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nominal yang harus dibayarkan/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tandai lunas via potongan/i }));

    await waitFor(() => {
      expect(markDriverCommissionPaymentPaid).toHaveBeenCalledWith('payment-1', {
        paymentNote: 'Lunas via potongan Finance penuh.',
      });
    });
  });

  it('report menampilkan status dan bukti khusus untuk komisi lunas via potongan penuh', async () => {
    const fullyDeductedReport = {
      ...periodReport,
      status: 'paid',
      activeBatch: {
        ...periodReport.activeBatch,
        status: 'paid',
      },
      summary: {
        totalDrivers: 1,
        totalItems: 1,
        totalAmount: 125000,
        paidAmount: 125000,
        unpaidAmount: 0,
      },
      drivers: [
        {
          ...periodReport.drivers[0],
          batchStatus: 'paid',
          paymentStatus: 'paid',
          grossAmount: 125000,
          deductionAmount: 125000,
          netAmount: 0,
          paidAt: '2026-09-21T02:00:00.000Z',
          paidByName: 'Sprint2C Finance',
          paymentProofAttachment: null,
          paymentProofAttachmentId: null,
          paymentNote: 'Lunas via potongan Finance penuh.',
        },
      ],
    };
    const fullyDeductedBatch = {
      ...batchDetail,
      status: 'paid',
      payments: [
        {
          ...batchDetail.payments[0],
          status: 'paid',
          deductionAmount: 125000,
          netAmount: 0,
          paidAt: '2026-09-21T02:00:00.000Z',
          paidByName: 'Sprint2C Finance',
          paymentProofAttachmentId: null,
          paymentNote: 'Lunas via potongan Finance penuh.',
        },
      ],
    };
    fetchDriverCommissionPeriodReport.mockResolvedValue(fullyDeductedReport);
    fetchDriverCommissionBatchDetail.mockResolvedValue(fullyDeductedBatch);
    fetchDriverCommissionBatches.mockResolvedValue({ rows: [fullyDeductedBatch] });
    const user = userEvent.setup();
    render(<DriverCommissionPage />);

    expect(await screen.findByText('Lunas via Potongan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    expect(downloadPdfReport).toHaveBeenCalledWith(expect.objectContaining({
      rows: expect.arrayContaining([
        expect.objectContaining({
          driverName: 'Rahmat',
          netAmount: 0,
          statusLabel: 'Lunas via Potongan',
          proofStatus: 'Tidak Ada Transfer',
        }),
      ]),
    }));
  });

  it('finance bisa membatalkan potongan yang belum paid', async () => {
    const user = userEvent.setup();
    voidDriverCommissionDeduction.mockResolvedValue({ ...batchDetail, id: 'batch-1' });
    render(<DriverCommissionPage />);

    await screen.findAllByText('Rahmat');
    await user.click(screen.getAllByRole('button', { name: /detail/i })[0]);
    await screen.findByText('Potongan Komisi');

    await user.click(screen.getByRole('button', { name: /^batalkan$/i }));
    expect(screen.getByRole('dialog', { name: /konfirmasi pembatalan/i })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/kasbon sudah dilunasi sopir/i), 'Hutang sudah lunas');
    await user.click(screen.getByRole('button', { name: /konfirmasi batalkan/i }));

    await waitFor(() => {
      expect(voidDriverCommissionDeduction).toHaveBeenCalledWith('deduction-1', 'Hutang sudah lunas');
    });
  });
});
