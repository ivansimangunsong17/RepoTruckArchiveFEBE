import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OperationalDroppingAccountPage from './OperationalDroppingAccountPage';
import { downloadCsv } from '../../utils/csvExport';
import {
  correctContainerJobExpense,
  createContainerJobExpense,
  fetchContainerJobExpenseLedger,
  fetchContainerJobsPage,
  updateDroppingExpense,
  uploadContainerJobExpenseProof,
  uploadUjTransferProof,
} from '../../services/archive/containerJobService';
import { fetchOperationalFundBatches, fetchOperationalFundTransactions } from '../../services/finance/financeService';

const notify = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      role: 'operational',
      fullName: 'Fitri Operational',
      permissions: ['container_job.read', 'container_job.update'],
    },
  }),
}));

vi.mock('../../hooks/useFeedback', () => ({
  useFeedback: () => ({ notify }),
}));

vi.mock('../../services/archive/containerJobService', () => ({
  correctContainerJobExpense: vi.fn(),
  createContainerJobExpense: vi.fn(),
  fetchContainerJobExpenseLedger: vi.fn(),
  fetchContainerJobsPage: vi.fn(),
  updateDroppingExpense: vi.fn(),
  uploadContainerJobExpenseProof: vi.fn(),
  uploadUjTransferProof: vi.fn(),
}));

vi.mock('../../services/finance/financeService', () => ({
  fetchOperationalFundBatches: vi.fn(),
  fetchOperationalFundTransactions: vi.fn(),
}));

vi.mock('../../utils/csvExport', () => ({
  downloadCsv: vi.fn(),
}));

describe('OperationalDroppingAccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchOperationalFundBatches.mockResolvedValue({
      rows: [{ id: 'batch-2026-08-20', batchDate: '2026-08-20', status: 'open' }],
      total: 1,
      totalPages: 1,
    });
    fetchOperationalFundTransactions.mockResolvedValue({
      rows: [
        {
          id: 'fund-transaction-2',
          containerJobId: 'job-1',
          containerJobExpenseId: 'expense-1',
          transactionDate: '2026-08-20',
          transactionType: 'debit',
          category: 'biaya_lainnya',
          expenseCategory: 'tol',
          amount: 125000,
          moneyIn: 0,
          moneyOut: 125000,
          runningBalance: 775000,
          description: 'Tol Cikampek',
          topName: 'Fitri Operational',
          driverName: 'Andi Pratama',
          doNumber: 'Cikarang',
          customerName: 'PT Sumber Logistik',
          soNumber: 'SO-ARM-202608-0001',
          containerNumber: 'CONT-001',
          destination: 'Cikarang',
          requestDate: null,
          expensePaymentStatus: 'sudah_dibayar',
          financeCheckStatus: 'belum_dicek',
          createdAt: '2026-08-20T02:00:00.000Z',
        },
        {
          id: 'fund-transaction-1',
          transactionDate: '2026-08-20',
          transactionType: 'credit',
          category: 'deposit_saldo',
          amount: 900000,
          moneyIn: 900000,
          moneyOut: 0,
          runningBalance: 900000,
          description: 'Dropping saldo harian',
          topName: 'Fitri Finance',
          createdAt: '2026-08-20T01:00:00.000Z',
        },
      ],
      total: 2,
      summary: {
        totalCredit: 900000,
        totalDebit: 125000,
        balance: 775000,
        creditCount: 1,
        debitCount: 1,
      },
    });
    fetchContainerJobsPage.mockResolvedValue({
      rows: [
        {
          id: 'job-1',
          status: 'running',
          soNumber: 'SO-ARM-202608-0001',
          containerNumber: 'CONT-001',
          customer: 'PT Sumber Logistik',
          destination: 'Cikarang',
          assignmentSnapshot: {
            driver: 'Andi Pratama',
            plateNumber: 'B 1234 XYZ',
          },
        },
      ],
    });
    fetchContainerJobExpenseLedger.mockResolvedValue({
      rows: [
        {
          id: 'expense-1',
          jobId: 'job-1',
          soNumber: 'SO-ARM-202608-0001',
          containerNumber: 'CONT-001',
          customer: 'PT Sumber Logistik',
          destination: 'Cikarang',
          driver: 'Andi Pratama',
          plateNumber: 'B 1234 XYZ',
          tripDate: '2026-08-20',
          category: 'tol',
          amount: 125000,
          description: 'Tol Cikampek',
          paymentStatus: 'sudah_dibayar',
          financeCheckStatus: 'belum_dicek',
          createdAt: '2026-08-20T02:00:00.000Z',
        },
      ],
      total: 7,
      summary: {
        totalAmount: 900000,
        needProof: 2,
        needCorrection: 1,
        waitingFinance: 4,
        checked: 3,
      },
    });
    correctContainerJobExpense.mockResolvedValue({
      id: 'expense-1',
      containerJobId: 'job-1',
      category: 'tol',
      amount: 150000,
      description: 'Tol Cikampek koreksi',
      paymentStatus: 'sudah_dibayar',
      financeCheckStatus: 'dikoreksi',
      proofAttachment: { name: 'transfer.pdf', path: 'attachment-proof-1' },
    });
    createContainerJobExpense.mockResolvedValue({
      id: 'expense-new',
      containerJobId: 'job-1',
      category: 'parkir',
      amount: 50000,
      description: 'Parkir depo',
      paymentStatus: 'sudah_dibayar',
      financeCheckStatus: 'belum_dicek',
      proofAttachment: { name: 'parkir.pdf', path: 'attachment-proof-2' },
    });
    updateDroppingExpense.mockResolvedValue({
      id: 'expense-1',
      containerJobId: 'job-1',
      category: 'parkir',
      amount: 90000,
      description: 'Tol Cikampek edit sendiri',
      paymentStatus: 'sudah_dibayar',
      financeCheckStatus: 'belum_dicek',
    });
    uploadContainerJobExpenseProof.mockResolvedValue({
      id: 'expense-1',
      containerJobId: 'job-1',
      category: 'tol',
      amount: 125000,
      description: 'Tol Cikampek',
      paymentStatus: 'sudah_dibayar',
      financeCheckStatus: 'belum_dicek',
      proofAttachment: { name: 'transfer.pdf', path: 'attachment-proof-1' },
      paidAt: '2026-08-20T03:00:00.000Z',
    });
    uploadUjTransferProof.mockResolvedValue({
      id: 'expense-uj-1',
      containerJobId: 'job-1',
      category: 'uj_awal',
      amount: 75000,
      paymentStatus: 'sudah_dibayar',
      financeCheckStatus: 'belum_dicek',
      proofAttachment: { name: 'transfer-uj.pdf', path: 'attachment-uj-proof-1' },
    });
  });

  it('menampilkan riwayat penggunaan saldo operational', async () => {
    render(<OperationalDroppingAccountPage />);

    expect(await screen.findByText('Rekening Dropping')).toBeInTheDocument();
    expect(screen.getByText('Buku Kas Rekening Dropping')).toBeInTheDocument();
    expect(screen.getByText(/SO-ARM-202608-0001/)).toBeInTheDocument();
    expect(screen.getByText('Tol Cikampek')).toBeInTheDocument();
    expect(screen.getByText('Dropping saldo harian')).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*900\.000/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp\s*775\.000/i).length).toBeGreaterThan(0);
    expect(screen.getByText('2 mutasi')).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Dicatat Oleh')).not.toBeInTheDocument();
    expect(screen.queryByText('Driver / DO')).not.toBeInTheDocument();
    expect(screen.queryByText('Customer')).not.toBeInTheDocument();
    expect(screen.queryByText('Finance')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeEnabled();
    expect(screen.getAllByText('Menunggu Finance').length).toBeGreaterThan(1);
  });

  it('mengekspor buku kas harian dengan saldo awal, total pengeluaran, dan sisa saldo', async () => {
    const user = userEvent.setup();
    render(<OperationalDroppingAccountPage />);

    await screen.findByText('Dropping saldo harian');
    await user.click(screen.getByRole('button', { name: /export csv/i }));

    const [, headers, rows] = downloadCsv.mock.calls[0];
    expect(headers).toEqual(['No', 'Tanggal', 'Keterangan', 'Dicatat Oleh', 'Driver', 'Nomor DO', 'Customer', 'Uang Masuk', 'Uang Keluar', 'Saldo', 'Status Finance', 'Bukti']);
    expect(rows[0]).toEqual(expect.arrayContaining(['SISA SALDO', 0]));
    expect(rows[1]).toEqual(expect.arrayContaining(['UANG MASUK', 900000]));
    expect(rows.at(-2)).toEqual(expect.arrayContaining(['TOTAL PENGELUARAN', 125000]));
    expect(rows.at(-1)).toEqual(expect.arrayContaining(['SISA SALDO', 775000]));
  });

  it('tidak menampilkan upload bukti di operational karena bukti divalidasi Finance', async () => {
    render(<OperationalDroppingAccountPage />);

    expect(await screen.findByText('Tol Cikampek')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload bukti/i })).not.toBeInTheDocument();
    expect(uploadContainerJobExpenseProof).not.toHaveBeenCalled();
  });

  it('mencatat biaya lainnya dari rekening dropping operational', async () => {
    const user = userEvent.setup();
    render(<OperationalDroppingAccountPage />);

    const selectedBatchDate = screen.getByLabelText('Batch rekening dropping').value;
    await user.click(await screen.findByRole('button', { name: /catat biaya/i }));
    await screen.findByRole('dialog', { name: /catat biaya penggunaan saldo/i });
    await user.click(screen.getByLabelText(/^ritasi$/i));
    await user.click(await screen.findByRole('button', { name: /SO-ARM-202608-0001/i }));
    expect(screen.queryByLabelText(/status bayar/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/kategori/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/nominal/i), '50000');
    await user.type(screen.getByLabelText(/penerima/i), 'Petugas Depo');
    await user.selectOptions(screen.getByLabelText(/^keterangan$/i), 'custom');
    await user.type(screen.getByLabelText(/keterangan manual/i), 'Parkir depo');
    await user.selectOptions(screen.getByLabelText(/jenis biaya/i), 'operational');
    expect(screen.queryByLabelText(/pilih bukti/i)).not.toBeInTheDocument();
    expect(screen.getByText(/bukti pembayaran akan diupload finance/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /validasi biaya/i }));

    expect(createContainerJobExpense).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: /validasi catat biaya penggunaan saldo/i });
    expect(dialog).toHaveTextContent('Validasi Catat Biaya');
    expect(dialog).toHaveTextContent(/Rp\s*50\.000/i);
    await user.click(screen.getByRole('button', { name: /ya, simpan biaya/i }));

    await waitFor(() => {
      expect(createContainerJobExpense).toHaveBeenCalledWith('job-1', expect.objectContaining({
        category: 'lainnya',
        expenseGroup: 'operational',
        amount: 50000,
        description: 'Parkir depo',
        recipientName: 'Petugas Depo',
        paymentStatus: 'sudah_dibayar',
        paidAt: selectedBatchDate,
        proofFile: null,
        updatedBy: 'Fitri Operational',
      }));
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Biaya tersimpan' }));
  });

  it('mencatat Uang Admin TF tanpa attachment Ops karena bukti diupload Finance', async () => {
    const user = userEvent.setup();
    render(<OperationalDroppingAccountPage />);

    const selectedBatchDate = screen.getByLabelText('Batch rekening dropping').value;
    await user.click(await screen.findByRole('button', { name: /catat biaya/i }));
    const formDialog = await screen.findByRole('dialog', { name: /catat biaya penggunaan saldo/i });
    await user.click(within(formDialog).getByLabelText(/^ritasi$/i));
    await user.click(await screen.findByRole('button', { name: /SO-ARM-202608-0001/i }));
    await user.type(within(formDialog).getByLabelText(/nominal/i), '50000');
    await user.type(within(formDialog).getByPlaceholderText(/petugas depo/i), 'Admin Pelabuhan');
    await user.selectOptions(within(formDialog).getByLabelText(/^keterangan$/i), 'Uang Admin TF');

    expect(within(formDialog).queryByLabelText(/pilih bukti/i)).not.toBeInTheDocument();
    expect(within(formDialog).getByText(/bukti pembayaran akan diupload finance/i)).toBeInTheDocument();

    await user.click(within(formDialog).getByRole('button', { name: /validasi biaya/i }));
    const validationDialog = await screen.findByRole('dialog', { name: /validasi catat biaya penggunaan saldo/i });
    expect(validationDialog).toHaveTextContent('Uang Admin TF');
    expect(validationDialog).toHaveTextContent('-');
    await user.click(within(validationDialog).getByRole('button', { name: /ya, simpan biaya/i }));

    await waitFor(() => {
      expect(createContainerJobExpense).toHaveBeenCalledWith('job-1', expect.objectContaining({
        category: 'uang_admin_tf',
        expenseGroup: 'operational',
        amount: 50000,
        description: 'Uang Admin TF',
        paidAt: selectedBatchDate,
        proofFile: null,
      }));
    });
  });

  it('menyediakan preset biaya ban di rekening dropping operational', async () => {
    const user = userEvent.setup();
    render(<OperationalDroppingAccountPage />);

    await user.click(await screen.findByRole('button', { name: /catat biaya/i }));
    await screen.findByRole('dialog', { name: /catat biaya penggunaan saldo/i });

    const descriptionSelect = screen.getByLabelText(/^keterangan$/i);
    expect(descriptionSelect).toHaveTextContent('Biaya Ganti Ban Dalam');
    expect(descriptionSelect).toHaveTextContent('Biaya BAN Kurang Angin');

    await user.selectOptions(descriptionSelect, 'Biaya Ganti Ban Dalam');
    expect(screen.queryByLabelText(/jenis biaya/i)).not.toBeInTheDocument();
  });

  it('mencatat Reimbursement Lainnya dengan keterangan tambahan wajib diisi', async () => {
    const user = userEvent.setup();
    render(<OperationalDroppingAccountPage />);

    await user.click(await screen.findByRole('button', { name: /catat biaya/i }));
    await screen.findByRole('dialog', { name: /catat biaya penggunaan saldo/i });
    await user.click(screen.getByLabelText(/^ritasi$/i));
    await user.click(await screen.findByRole('button', { name: /SO-ARM-202608-0001/i }));
    await user.type(screen.getByLabelText(/nominal/i), '50000');
    await user.type(screen.getByLabelText(/penerima/i), 'Vendor Reimbursement');
    await user.selectOptions(screen.getByLabelText(/^keterangan$/i), 'Reimbursement Lainnya');

    expect(screen.queryByLabelText(/jenis biaya/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/pilih bukti/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /validasi biaya/i }));

    expect(screen.getByText('Isi keterangan untuk Reimbursement Lainnya agar pencatatan jelas.')).toBeInTheDocument();
    expect(createContainerJobExpense).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/keterangan reimbursement lainnya/i), 'Biaya admin pelabuhan');
    await user.click(screen.getByRole('button', { name: /validasi biaya/i }));
    await user.click(await screen.findByRole('button', { name: /ya, simpan biaya/i }));

    await waitFor(() => {
      expect(createContainerJobExpense).toHaveBeenCalledWith('job-1', expect.objectContaining({
        expenseGroup: 'reimbursement',
        amount: 50000,
        description: 'Reimbursement Lainnya - Biaya admin pelabuhan',
        recipientName: 'Vendor Reimbursement',
      }));
    });
  });

  it('memfilter transaksi yang perlu koreksi dan mengirim koreksi ke Finance', async () => {
    const user = userEvent.setup();
    fetchContainerJobExpenseLedger.mockResolvedValue({
      rows: [
        {
          id: 'expense-1',
          jobId: 'job-1',
          soNumber: 'SO-ARM-202608-0001',
          containerNumber: 'CONT-001',
          customer: 'PT Sumber Logistik',
          destination: 'Cikarang',
          driver: 'Andi Pratama',
          plateNumber: 'B 1234 XYZ',
          tripDate: '2026-08-20',
          category: 'tol',
          amount: 125000,
          description: 'Tol Cikampek',
          recipientName: 'Gerbang Tol',
          paymentStatus: 'sudah_dibayar',
          financeCheckStatus: 'perlu_klarifikasi',
          financeNote: 'Nominal berbeda dengan bukti',
          proofAttachment: { name: 'transfer.pdf', path: 'attachment-proof-1' },
          proofAttachmentId: 'attachment-proof-1',
          createdAt: '2026-08-20T02:00:00.000Z',
        },
      ],
    });

    render(<OperationalDroppingAccountPage />);

    await user.selectOptions(screen.getByLabelText('Filter status rekening dropping'), 'need_correction');
    await screen.findByText('Nominal berbeda dengan bukti');
    expect(screen.getByText('Tol Cikampek')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^koreksi$/i }));
    await user.clear(screen.getByLabelText(/nominal/i));
    await user.type(screen.getByLabelText(/nominal/i), '150000');
    await user.clear(screen.getByLabelText(/keterangan/i));
    await user.type(screen.getByLabelText(/keterangan/i), 'Tol Cikampek koreksi');
    await user.click(screen.getByRole('button', { name: /kirim koreksi/i }));

    await waitFor(() => {
      expect(correctContainerJobExpense).toHaveBeenCalledWith('job-1', 'expense-1', expect.objectContaining({
        amount: 150000,
        description: 'Tol Cikampek koreksi',
        proofAttachmentId: 'attachment-proof-1',
        updatedBy: 'Fitri Operational',
      }));
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Koreksi tersimpan' }));
  });

  it('mengedit transaksi biaya sendiri selama belum dicek Finance dan batch masih open', async () => {
    const user = userEvent.setup();
    render(<OperationalDroppingAccountPage />);

    await screen.findByText('Tol Cikampek');
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const dialog = await screen.findByRole('dialog', { name: /edit transaksi biaya/i });
    await user.clear(within(dialog).getByLabelText(/nominal/i));
    await user.type(within(dialog).getByLabelText(/nominal/i), '90000');
    await user.click(within(dialog).getByRole('button', { name: /simpan perubahan/i }));

    await waitFor(() => {
      expect(updateDroppingExpense).toHaveBeenCalledWith('job-1', 'expense-1', expect.objectContaining({
        amount: 90000,
        paymentStatus: 'sudah_dibayar',
        updatedBy: 'Fitri Operational',
      }));
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Transaksi tersimpan' }));
  });

  it('tidak menampilkan tombol pindah ritasi untuk Operational', async () => {
    render(<OperationalDroppingAccountPage />);

    await screen.findByText('Tol Cikampek');
    expect(screen.queryByRole('button', { name: /pindah ritasi/i })).not.toBeInTheDocument();
  });

  it('tidak menampilkan tombol void untuk Operational', async () => {
    render(<OperationalDroppingAccountPage />);

    await screen.findByText('Tol Cikampek');
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
  });

  it('tidak menampilkan tombol edit/pindah ritasi/void kalau batch tanggal ini sudah closed', async () => {
    fetchOperationalFundBatches.mockResolvedValue({
      rows: [{ id: 'batch-2026-08-20', batchDate: '2026-08-20', status: 'closed' }],
      total: 1,
      totalPages: 1,
    });
    render(<OperationalDroppingAccountPage />);

    await screen.findByText('Tol Cikampek');
    expect(screen.getByText(/sudah ditutup Finance/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pindah ritasi/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
  });

  it('menampilkan UJ Perjalanan otomatis tanpa tombol upload bukti di Operational', async () => {
    const user = userEvent.setup();
    fetchContainerJobExpenseLedger.mockResolvedValue({
      rows: [
        {
          id: 'expense-uj-1',
          jobId: 'job-1',
          soNumber: 'SO-ARM-202608-0001',
          containerNumber: 'CONT-001',
          customer: 'PT Sumber Logistik',
          destination: 'Cikarang',
          driver: 'Andi Pratama',
          plateNumber: 'B 1234 XYZ',
          tripDate: '2026-08-20',
          category: 'uj_awal',
          amount: 75000,
          description: 'UJ PT Sumber Logistik Cikarang 20FT B 1234 XYZ',
          source: 'auto_uj_order',
          sourceRefId: 'job-1',
          paymentStatus: 'sudah_dibayar',
          financeCheckStatus: 'belum_dicek',
          proofAttachment: null,
          createdAt: '2026-08-20T02:00:00.000Z',
        },
      ],
      total: 1,
      summary: { totalAmount: 75000, needProof: 1, needCorrection: 0, waitingFinance: 1, checked: 0 },
    });

    render(<OperationalDroppingAccountPage />);

    await user.selectOptions(screen.getByLabelText('Filter status rekening dropping'), 'waiting_finance');
    await screen.findByText('UJ PT Sumber Logistik Cikarang 20FT B 1234 XYZ');
    expect(screen.getAllByText('Belum Ada Bukti').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload bukti/i })).not.toBeInTheDocument();
    expect(uploadUjTransferProof).not.toHaveBeenCalled();
  });
});
