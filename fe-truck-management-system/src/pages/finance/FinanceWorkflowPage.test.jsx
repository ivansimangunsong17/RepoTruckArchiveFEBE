import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceWorkflowPage from './FinanceWorkflowPage';
import { downloadCsv } from '../../utils/csvExport';
import {
  addFinanceOrderLineItem,
  approveOperationalFundRequest,
  closeOperationalFundBatch,
  createOperationalFundRequest,
  depositOperationalFund,
  fetchFinanceContainerJobExpenses,
  fetchFinanceInvoiceCorrections,
  fetchFinanceInvoiceDetail,
  fetchFinanceInvoices,
  fetchFinanceOrderCorrections,
  fetchFinanceOrderVerifications,
  fetchFinanceRpujRequests,
  fetchOperationalFundBatches,
  fetchOperationalFundRequests,
  fetchOperationalFundTransactions,
  reconcileFinanceContainerJobExpense,
  rejectOperationalFundRequest,
  requestFinanceInvoiceCorrection,
  requestFinanceOrderSoCorrection,
  updateFinanceInvoiceNumber,
  updateFinanceOrderSoNumber,
  uploadFinanceInvoiceDocument,
} from '../../services/finance/financeService';

const mockAuthState = vi.hoisted(() => ({
  user: { id: 'finance-1', role: 'finance', fullName: 'Fitri Finance' },
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuthState.user }),
}));

vi.mock('../../services/finance/financeService', () => ({
  addFinanceOrderLineItem: vi.fn(),
  approveOperationalFundRequest: vi.fn(),
  closeOperationalFundBatch: vi.fn(),
  createOperationalFundRequest: vi.fn(),
  depositOperationalFund: vi.fn(),
  fetchFinanceContainerJobExpenses: vi.fn(),
  fetchFinanceInvoiceCorrections: vi.fn(),
  fetchFinanceInvoiceDetail: vi.fn(),
  fetchFinanceInvoices: vi.fn().mockResolvedValue({ rows: [] }),
  fetchFinanceOrderCorrections: vi.fn(),
  fetchFinanceOrderVerifications: vi.fn(),
  fetchFinanceRpujRequests: vi.fn(),
  fetchOperationalFundBatches: vi.fn(),
  fetchOperationalFundRequests: vi.fn(),
  fetchOperationalFundTransactions: vi.fn(),
  reconcileFinanceContainerJobExpense: vi.fn(),
  rejectOperationalFundRequest: vi.fn(),
  requestFinanceInvoiceCorrection: vi.fn(),
  requestFinanceOrderSoCorrection: vi.fn(),
  updateFinanceInvoiceNumber: vi.fn(),
  updateFinanceOrderSoNumber: vi.fn(),
  uploadFinanceInvoiceDocument: vi.fn(),
}));

vi.mock('../../utils/csvExport', () => ({
  downloadCsv: vi.fn(),
}));

const orderRow = {
  id: 'order-1',
  orderDate: '2026-07-19',
  salesName: 'Sales Test',
  customer: 'PT Customer Test',
  destination: 'Cikarang',
  runningDate: '2026-07-20',
  verificationStatus: 'pending_so',
  internalSoNumber: 'SO-ARM-202607-0001',
  soNumber: '',
  price: 2600000,
  totalAmount: 5200000,
  lineItems: [
    { serviceName: 'Jasa Angkut 20FT', containerType: '20FT', qty: 2, price: 2600000, total: 5200000 },
  ],
};

const cancelledOrderRow = {
  id: 'order-cancelled-1',
  orderDate: '2026-07-18',
  salesName: 'Sales Test',
  customer: 'PT Customer Batal',
  destination: 'Bekasi',
  runningDate: '2026-07-21',
  status: 'SO Batal',
  verificationStatus: 'cancelled',
  operationalStatus: 'cancelled',
  internalSoNumber: 'SO-ARM-202607-0002',
  soNumber: 'SO-CANCEL-001',
  cancelReason: 'Customer membatalkan pengiriman setelah nomor SO terbit.',
  cancelledAt: '2026-07-19T08:30:00.000Z',
  cancelledByName: 'Admin Test',
};

const rpujRow = {
  id: 'job-1',
  soNumber: 'SO-TEST-001',
  jobNumber: 'JOB-TEST-001',
  containerNumber: 'CONT-TEST-001',
  containerSize: '20FT',
  customer: 'PT Customer Test',
  destination: 'Cikarang',
  driver: 'Driver Test',
  driverBankAccount: 'BCA 123456',
  truck: 'B 1000 AA',
  totalUj: 600000,
  additionalCost: 100000,
  hasDriverCommission: true,
  driverCommissionAmount: 50000,
  driverCommissionNote: 'Komisi Cikarang',
  totalRequest: 700000,
  status: 'Menunggu Approval Finance',
  rpujStatus: 'submitted',
};

const invoiceRow = {
  id: 'invoice-1',
  soNumber: 'SO-TEST-001',
  customer: 'PT Customer Test',
  destination: 'Cikarang',
  invoiceStatus: 'Menunggu Update Status',
  invoiceNumber: 'INV-TEST-001',
};

const invoiceSummary = {
  needNumber: 0,
  inProgress: 1,
  paid: 2,
  missingInvoiceDocuments: 1,
  missingInvoiceDocument: 1,
  missingTaxInvoiceDocument: 1,
  completeInvoiceDocuments: 1,
  sentInvoiceDocuments: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState.user = { id: 'finance-1', role: 'finance', fullName: 'Fitri Finance' };
  fetchFinanceOrderVerifications.mockResolvedValue({ rows: [orderRow, cancelledOrderRow] });
  fetchFinanceRpujRequests.mockResolvedValue({
    rows: [rpujRow],
    total: 1,
    totalPages: 1,
    summary: { submitted: 1, approved: 0, paid: 0, rejected: 0 },
  });
  fetchOperationalFundRequests.mockResolvedValue({
    rows: [],
    total: 0,
    totalPages: 1,
    summary: { submitted: 0, approved: 0, transferred: 0, rejected: 0, approvedAmount: 0, transferredAmount: 0 },
  });
  fetchOperationalFundBatches.mockResolvedValue({
    rows: [{
      id: 'batch-2026-08-20',
      batchDate: '2026-08-20',
      status: 'open',
      totalCredit: 0,
      totalDebit: 0,
      balance: 0,
      transactionCount: 0,
      creditCount: 0,
      debitCount: 0,
      uncheckedCount: 0,
      needClarificationCount: 0,
      checkedCount: 0,
    }],
    total: 1,
    totalPages: 1,
  });
  fetchOperationalFundTransactions.mockResolvedValue({
    rows: [],
    total: 0,
    totalPages: 1,
    summary: { totalCredit: 0, totalDebit: 0, totalAdjustment: 0, balance: 0, creditCount: 0, debitCount: 0, voidCount: 0 },
  });
  fetchFinanceContainerJobExpenses.mockResolvedValue({
    rows: [],
    total: 0,
    totalPages: 1,
    summary: { belumDicek: 0, sudahDicek: 0, perluKlarifikasi: 0, dikoreksi: 0, totalAmount: 0, pendingAmount: 0 },
  });
  reconcileFinanceContainerJobExpense.mockResolvedValue({ id: 'expense-1', financeCheckStatus: 'sudah_dicek' });
  createOperationalFundRequest.mockResolvedValue({
    id: 'fund-new',
    requestDate: '2026-08-20',
    amount: 20000000,
    purpose: 'Dropping operasional harian',
    status: 'submitted',
  });
  depositOperationalFund.mockResolvedValue({
    id: 'fund-deposit',
    requestDate: '2026-08-20',
    amount: 20000000,
    purpose: 'Deposit saldo operasional harian dari Finance',
    status: 'transferred',
  });
  closeOperationalFundBatch.mockResolvedValue({
    id: 'batch-2026-08-20',
    batchDate: '2026-08-20',
    status: 'closed',
    totalCredit: 20000000,
    totalDebit: 600000,
    balance: 19400000,
    openingBalance: 0,
    topUpAmount: 20000000,
    uncheckedCount: 0,
    needClarificationCount: 0,
  });
  approveOperationalFundRequest.mockResolvedValue({ id: 'fund-1', status: 'approved' });
  rejectOperationalFundRequest.mockResolvedValue({ id: 'fund-1', status: 'rejected' });
  fetchFinanceInvoices.mockResolvedValue({ rows: [invoiceRow], summary: invoiceSummary });
  fetchFinanceOrderCorrections.mockResolvedValue([]);
  fetchFinanceInvoiceCorrections.mockResolvedValue([]);
  requestFinanceOrderSoCorrection.mockResolvedValue({ status: 'pending' });
  requestFinanceInvoiceCorrection.mockResolvedValue({ status: 'pending' });
  uploadFinanceInvoiceDocument.mockResolvedValue({
    ...invoiceRow,
    invoiceDocumentStatus: 'belum_upload',
    invoiceDocumentStatusLabel: 'Belum Upload',
  });
  fetchFinanceInvoiceDetail.mockResolvedValue({
    ...invoiceRow,
    billingItems: ['Jasa Angkut D20 - 1 ritase', 'Bon Muat/Bongkar - 1 item'],
    plannedJobsCount: 2,
    billedJobsCount: 1,
    cancelledJobsCount: 1,
    cancellationNote: '1 container dibatalkan; tagihan hanya menghitung container yang selesai.',
    documents: [
      {
        id: 'attachment-1',
        label: 'Surat Jalan',
        source: 'Operational',
        jobId: 'job-1',
        containerNumber: 'CONT-TEST-001',
        referenceNumber: 'SJ-001',
        ready: true,
        file: { name: 'surat-jalan.pdf', path: 'attachment-1', type: 'application/pdf', size: 100 },
      },
      {
        id: 'attachment-other-1',
        category: 'otherDocument',
        label: 'Foto segel',
        source: 'Operational',
        jobId: 'job-1',
        containerNumber: 'CONT-TEST-001',
        referenceNumber: '',
        ready: true,
        file: { name: 'foto-segel.pdf', path: 'attachment-other-1', type: 'application/pdf', size: 100 },
      },
      ...[
        ['eirDocument', 'EIR'],
        ['loadingVoucherDocument', 'Bon Muat / Bon Bongkar'],
        ['tilaGatepassDocumentFile', 'TILA / Delivery Card / Gatepass / SP2'],
      ].map(([category, label]) => ({
        id: `job-1-${category}`,
        category,
        label,
        source: 'Operational',
        jobId: 'job-1',
        containerNumber: 'CONT-TEST-001',
        ready: false,
        file: null,
      })),
      {
        id: 'attachment-3',
        label: 'EIR',
        source: 'Operational',
        jobId: 'job-2',
        containerNumber: 'CONT-TEST-002',
        referenceNumber: 'EIR-002',
        ready: true,
        file: { name: 'eir-container-2.pdf', path: 'attachment-3', type: 'application/pdf', size: 100 },
      },
      ...[
        ['travelDocumentFile', 'Surat Jalan'],
        ['loadingVoucherDocument', 'Bon Muat / Bon Bongkar'],
        ['tilaGatepassDocumentFile', 'TILA / Delivery Card / Gatepass / SP2'],
      ].map(([category, label]) => ({
        id: `job-2-${category}`,
        category,
        label,
        source: 'Operational',
        jobId: 'job-2',
        containerNumber: 'CONT-TEST-002',
        ready: false,
        file: null,
      })),
      {
        id: 'attachment-2',
        label: 'Delivery Order',
        source: 'Sales',
        referenceNumber: 'DO-001',
        ready: true,
        file: { name: 'delivery-order.pdf', path: 'attachment-2', type: 'application/pdf', size: 100 },
      },
    ],
  });
});

describe('FinanceWorkflowPage validation modals', () => {
  it('mengirim filter bulan dan tanggal order dibuat untuk verifikasi order', async () => {
    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    await waitFor(() => {
      expect(fetchFinanceOrderVerifications).toHaveBeenCalledWith(expect.objectContaining({
        page: 1,
        pageSize: 20,
        status: 'pending_so',
      }));
    });

    fireEvent.change(screen.getByLabelText('Tahun order dibuat'), { target: { value: '2026' } });
    fireEvent.change(screen.getByLabelText('Bulan order dibuat'), { target: { value: '07' } });

    await waitFor(() => {
      expect(fetchFinanceOrderVerifications).toHaveBeenLastCalledWith(expect.objectContaining({
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      }));
    });

    fireEvent.change(screen.getByLabelText('Tanggal awal order dibuat'), { target: { value: '2026-07-10' } });

    await waitFor(() => {
      expect(fetchFinanceOrderVerifications).toHaveBeenLastCalledWith(expect.objectContaining({
        dateFrom: '2026-07-10',
        dateTo: '2026-07-31',
      }));
    });
    expect(screen.getByLabelText('Bulan order dibuat')).toHaveValue('');
  });

  it('mengosongkan filter bulan order jika tahun yang dipilih ekstrem', async () => {
    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    await screen.findByLabelText('Bulan order dibuat');
    fireEvent.change(screen.getByLabelText('Tahun order dibuat'), { target: { value: '2026' } });
    fireEvent.change(screen.getByLabelText('Bulan order dibuat'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Tahun order dibuat'), { target: { value: '275760' } });

    expect(screen.getByLabelText('Bulan order dibuat')).toHaveValue('');
    await waitFor(() => {
      expect(fetchFinanceOrderVerifications).toHaveBeenLastCalledWith(expect.not.objectContaining({
        dateFrom: expect.any(String),
        dateTo: expect.any(String),
      }));
    });
  });

  it('memakai pagination 20 data untuk verifikasi order', async () => {
    const user = userEvent.setup();
    const orderRows = Array.from({ length: 20 }, (_, index) => ({
      ...orderRow,
      id: `order-${index + 1}`,
      internalSoNumber: `SO-ARM-202608-${String(index + 1).padStart(4, '0')}`,
    }));
    fetchFinanceOrderVerifications.mockResolvedValue({
      rows: orderRows,
      total: 47,
      totalPages: 3,
      summary: {
        pendingSo: 47,
        verified: 318,
        cancelled: 9,
      },
    });

    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    expect(await screen.findByText('Menampilkan 1-20 dari 47 data')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));

    await waitFor(() => {
      expect(fetchFinanceOrderVerifications).toHaveBeenLastCalledWith(expect.objectContaining({
        page: 2,
        pageSize: 20,
        status: 'pending_so',
      }));
    });
  });

  it('menampilkan jumlah tab verifikasi order dari summary backend', async () => {
    fetchFinanceOrderVerifications.mockResolvedValue({
      rows: [orderRow],
      summary: {
        pendingSo: 47,
        verified: 318,
        cancelled: 9,
      },
    });

    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    expect(await screen.findByRole('tab', { name: /Belum Ada Nomor SO/i })).toHaveTextContent('47');
    expect(screen.getByRole('tab', { name: /SO Terisi/i })).toHaveTextContent('318');
    expect(screen.getByRole('tab', { name: /SO Batal/i })).toHaveTextContent('9');
  });

  it('tidak menampilkan flow approval RPUJ legacy di Rekening Dropping Finance', async () => {
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    expect(await screen.findByText('Batch Dropping Harian')).toBeInTheDocument();
    expect(screen.getByText('Catatan Saldo')).toBeInTheDocument();
    expect(screen.getByText('Perlu Dicek Finance')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Butuh Approval/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Siap Transfer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /UJ Dikirim/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Bulan Dropping')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload Bukti' })).not.toBeInTheDocument();
    expect(fetchFinanceRpujRequests).not.toHaveBeenCalled();
  });

  it('menampilkan modal validasi sebelum close batch rekening dropping', async () => {
    const user = userEvent.setup();
    fetchOperationalFundBatches.mockResolvedValue({
      rows: [{
        id: 'batch-2026-08-20',
        batchDate: '2026-08-20',
        status: 'open',
        totalCredit: 20000000,
        totalDebit: 600000,
        balance: 19400000,
        openingBalance: 0,
        topUpAmount: 20000000,
        uncheckedCount: 0,
        needClarificationCount: 0,
        checkedCount: 1,
      }],
      total: 1,
      totalPages: 1,
    });
    fetchOperationalFundTransactions.mockResolvedValue({
      rows: [],
      total: 0,
      totalPages: 1,
      summary: {
        totalCredit: 20000000,
        totalDebit: 600000,
        totalAdjustment: 0,
        balance: 19400000,
        creditCount: 1,
        debitCount: 1,
        voidCount: 0,
      },
    });

    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    await user.click(await screen.findByRole('button', { name: /close batch/i }));

    expect(closeOperationalFundBatch).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Validasi Close Batch');
    expect(dialog).toHaveTextContent(/Rp\s*19\.400\.000/i);
    expect(dialog).toHaveTextContent('21 Agustus 2026');

    await user.click(within(dialog).getByRole('button', { name: 'Ya, Close Batch' }));

    await waitFor(() => {
      expect(closeOperationalFundBatch).toHaveBeenCalledWith('batch-2026-08-20', {
        closeNote: 'Close batch dropping 2026-08-20',
      });
    });
  });

  it('menampilkan dan memproses approval saldo operasional harian', async () => {
    const user = userEvent.setup();
    fetchOperationalFundRequests.mockResolvedValue({
      rows: [{
        id: 'fund-1',
        requestDate: '2026-08-20',
        amount: 20000000,
        purpose: 'Dropping operasional harian',
        status: 'submitted',
        requestedBy: 'Operational Test',
      }],
      total: 1,
      totalPages: 1,
      summary: { submitted: 1, approved: 0, transferred: 0, rejected: 0, approvedAmount: 0, transferredAmount: 0 },
    });
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    expect(await screen.findByText('Batch Dropping Harian')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajukan Saldo' })).not.toBeInTheDocument();
    expect(screen.getByText(/Rp\s*20\.000\.000/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Setujui' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Validasi Approval Saldo');
    await user.click(screen.getByRole('button', { name: 'Ya, Setujui Saldo' }));

    expect(approveOperationalFundRequest).toHaveBeenCalledWith('fund-1');
  });

  it('Finance bisa deposit saldo operasional langsung ke rekening dropping', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    await user.click(await screen.findByRole('button', { name: 'Deposit Saldo' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Deposit Saldo Operasional');
    fireEvent.change(within(dialog).getByLabelText('Tanggal'), { target: { value: '2026-08-20' } });
    await user.selectOptions(within(dialog).getByLabelText('Nominal'), '20000000');
    await user.clear(within(dialog).getByPlaceholderText('Contoh: Dropping operasional tanggal berjalan.'));
    await user.type(within(dialog).getByPlaceholderText('Contoh: Dropping operasional tanggal berjalan.'), 'Deposit saldo operasional harian dari Finance');
    const proofFile = new File(['transfer'], 'bukti-transfer.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText(/upload bukti transfer/i), proofFile);
    await user.click(within(dialog).getByRole('button', { name: 'Validasi Deposit' }));
    expect(depositOperationalFund).not.toHaveBeenCalled();

    await screen.findByText('Validasi Deposit Saldo');
    const validationDialog = screen.getByRole('dialog');
    expect(validationDialog).toHaveTextContent('Validasi Deposit Saldo');
    expect(validationDialog).toHaveTextContent(/Rp\s*20\.000\.000/i);
    expect(validationDialog).toHaveTextContent('bukti-transfer.pdf');
    await user.click(within(validationDialog).getByRole('button', { name: 'Ya, Deposit Saldo' }));

    expect(depositOperationalFund).toHaveBeenCalledWith({
      requestDate: '2026-08-20',
      amount: 20000000,
      purpose: 'Deposit saldo operasional harian dari Finance',
      proofFile,
    });
  });

  it('menampilkan mutasi rekening dropping dari ledger saldo operasional', async () => {
    const user = userEvent.setup();
    fetchOperationalFundTransactions.mockResolvedValue({
      rows: [{
        id: 'transaction-2',
        transactionDate: '2026-08-20',
        transactionType: 'debit',
        category: 'container_job_expense',
        amount: 125000,
        moneyIn: 0,
        moneyOut: 125000,
        runningBalance: 19875000,
        description: 'Tol Cikampek',
        topName: 'Fitri Operational',
        driverName: 'Driver Expense',
        doNumber: 'DO-EXP-001',
        customerName: 'PT Expense Test',
        soNumber: 'SO-EXP-001',
        customer: 'PT Expense Test',
        destination: 'Cikarang',
        status: 'posted',
        proofAttachment: {
          id: 'proof-transaction-2',
          name: 'bukti-transfer.pdf',
          path: 'proof-transaction-2',
          type: 'application/pdf',
          size: 100,
        },
      }, {
        id: 'transaction-1',
        transactionDate: '2026-08-20',
        transactionType: 'credit',
        category: 'dropping_in',
        amount: 20000000,
        moneyIn: 20000000,
        moneyOut: 0,
        runningBalance: 20000000,
        description: 'Transfer saldo operasional harian dari Finance',
        topName: 'Fitri Finance',
        status: 'posted',
        createdByName: 'Finance Test',
      }],
      total: 2,
      totalPages: 1,
      summary: { totalCredit: 20000000, totalDebit: 125000, totalAdjustment: 0, balance: 19875000, creditCount: 1, debitCount: 1, voidCount: 0 },
    });

    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    expect(await screen.findByText('Catatan Saldo')).toBeInTheDocument();
    expect(screen.getByText('Uang Masuk')).toBeInTheDocument();
    expect(screen.getByText('Uang Keluar')).toBeInTheDocument();
    expect(screen.queryByText('Driver / DO')).not.toBeInTheDocument();
    expect(screen.queryByText('TOP')).not.toBeInTheDocument();
    expect(screen.queryByText('Customer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeEnabled();
    expect(screen.getByText('Transfer saldo operasional harian dari Finance')).toBeInTheDocument();
    expect(screen.getByText('Tol Cikampek')).toBeInTheDocument();
    expect(screen.queryByText('Fitri Operational')).not.toBeInTheDocument();
    expect(screen.queryByText('Driver Expense')).not.toBeInTheDocument();
    expect(screen.queryByText('DO-EXP-001')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view bukti-transfer.pdf/i })).toBeEnabled();
    expect(screen.getAllByText(/Rp\s*19\.875\.000/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /export csv/i }));
    const [, headers, rows] = downloadCsv.mock.calls[0];
    expect(headers).toEqual(['No', 'Tanggal', 'Keterangan', 'Kategori', 'Uang Masuk', 'Uang Keluar', 'Saldo', 'Bukti']);
    expect(rows[0]).toEqual(expect.arrayContaining(['SISA SALDO', 0]));
    expect(rows[1]).toEqual(expect.arrayContaining(['UANG MASUK', 20000000]));
    expect(rows.at(-2)).toEqual(expect.arrayContaining(['TOTAL PENGELUARAN', 125000]));
    expect(rows.at(-1)).toEqual(expect.arrayContaining(['SISA SALDO', 19875000]));
    expect(fetchOperationalFundTransactions).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 8,
    }));
  });

  it('membuat pengajuan saldo operasional harian dari panel Rekening Dropping', async () => {
    const user = userEvent.setup();
    mockAuthState.user = { id: 'admin-1', role: 'admin', fullName: 'Admin Test' };
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    await user.click(await screen.findByRole('button', { name: 'Ajukan Saldo' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tanggal'), { target: { value: '2026-08-20' } });
    await user.selectOptions(within(dialog).getByLabelText('Nominal'), '20000000');
    await user.type(within(dialog).getByPlaceholderText('Contoh: Dropping operasional tanggal berjalan.'), 'Dropping operasional harian');
    await user.click(within(dialog).getByRole('button', { name: 'Ajukan Saldo' }));

    expect(createOperationalFundRequest).toHaveBeenCalledWith({
      requestDate: '2026-08-20',
      amount: 20000000,
      purpose: 'Dropping operasional harian',
    });
  });

  it('menampilkan dan menandai transaksi biaya D+1 sudah dicek', async () => {
    const user = userEvent.setup();
    fetchFinanceContainerJobExpenses.mockResolvedValue({
      rows: [{
        id: 'expense-1',
        soNumber: 'SO-EXP-001',
        containerNumber: 'CONT-EXP-001',
        customer: 'PT Expense Test',
        destination: 'Cikarang',
        driverName: 'Driver Expense',
        truck: 'B 2000 EX',
        category: 'tol',
        amount: 125000,
        description: 'Tol Cikampek',
        paymentStatus: 'sudah_dibayar',
        paidAt: '2026-08-20',
        financeCheckStatus: 'belum_dicek',
      }],
      total: 1,
      totalPages: 1,
      summary: { belumDicek: 1, sudahDicek: 0, perluKlarifikasi: 0, dikoreksi: 0, totalAmount: 125000, pendingAmount: 125000 },
    });

    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    expect(await screen.findByText('Perlu Dicek Finance')).toBeInTheDocument();
    expect(screen.getByText('Tol Cikampek')).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*125\.000/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Dicek' }));

    expect(await screen.findByText('Validasi Cek Biaya Lapangan')).toBeInTheDocument();
    expect(reconcileFinanceContainerJobExpense).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ya, Sudah Dicek' }));

    await waitFor(() => {
      expect(reconcileFinanceContainerJobExpense).toHaveBeenCalledWith('expense-1', {
        financeCheckStatus: 'sudah_dicek',
        financeNote: '',
      });
    });
  });

  it('menampilkan filter tanggal invoice di semua tab', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    expect(await screen.findByLabelText('Bulan update invoice')).toBeInTheDocument();
    expect(screen.getByLabelText('Tahun update invoice')).toBeInTheDocument();
    expect(screen.getByLabelText('Tanggal awal update invoice')).toBeInTheDocument();
    expect(screen.getByLabelText('Tanggal akhir update invoice')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tanggal awal update invoice'), { target: { value: '2026-08-01' } });
    await waitFor(() => {
      expect(fetchFinanceInvoices).toHaveBeenLastCalledWith(expect.objectContaining({
        dateBasis: 'updated',
        dateFrom: '2026-08-01',
        status: 'need-number',
      }));
    });

    await user.click(screen.getByRole('tab', { name: /Lunas/i }));
    expect(screen.getByLabelText('Bulan update invoice')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchFinanceInvoices).toHaveBeenLastCalledWith(expect.objectContaining({
        dateBasis: 'updated',
        dateFrom: '2026-08-01',
        status: 'paid',
      }));
    });
  });

  it('menampilkan jumlah tab invoice dari summary backend saat pindah menu', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await screen.findByRole('tab', { name: /Menunggu Sales/i });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Menunggu Sales/i })).toHaveTextContent('1');
      expect(screen.getByRole('tab', { name: /Lunas/i })).toHaveTextContent('2');
    });

    await user.click(screen.getByRole('tab', { name: /Lunas/i }));

    await waitFor(() => {
      expect(fetchFinanceInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'paid' }));
    });
    expect(screen.getByRole('tab', { name: /Menunggu Sales/i })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Lunas/i })).toHaveTextContent('2');
  });

  it('memakai total invoice dari backend untuk pagination lebih dari 100 data', async () => {
    const user = userEvent.setup();
    const invoiceRows = Array.from({ length: 20 }, (_, index) => ({
      ...invoiceRow,
      id: `invoice-${index + 1}`,
      soNumber: `SO-TEST-${String(index + 1).padStart(3, '0')}`,
      invoiceStatus: 'Butuh Nomor Invoice',
      invoiceNumber: '',
    }));
    fetchFinanceInvoices.mockResolvedValue({
      rows: invoiceRows,
      total: 100,
      totalPages: 5,
      summary: { ...invoiceSummary, needNumber: 100, inProgress: 300, paid: 35 },
    });

    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    expect(await screen.findByText('Menampilkan 1-20 dari 100 data filter ini (435 semua data)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));

    await waitFor(() => {
      expect(fetchFinanceInvoices).toHaveBeenLastCalledWith(expect.objectContaining({
        page: 2,
        pageSize: 20,
      }));
    });
  });

  it('mengirim filter dokumen invoice ke backend finance', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await screen.findByRole('tab', { name: /Belum Nomor \/ Dokumen/i });
    await user.click(await screen.findByRole('button', { name: /Belum Upload Invoice & Faktur Pajak/i }));

    await waitFor(() => {
      expect(fetchFinanceInvoices).toHaveBeenLastCalledWith(expect.objectContaining({
        status: 'need-number',
        invoiceDocumentFilter: 'missing-documents',
      }));
    });
  });

  it('menampilkan aksi view dan download untuk dokumen Sales dan Operational', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    await user.click(await screen.findByRole('button', { name: /(Upload|Detail) Dokumen SO-TEST-001/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('CONT-TEST-001');
    expect(dialog).toHaveTextContent('CONT-TEST-002');
    expect(dialog).toHaveTextContent('1 container dibatalkan; tagihan hanya menghitung container yang selesai.');
    expect(dialog).toHaveTextContent('Jasa Angkut D20 - 1 ritase');
    expect(dialog).toHaveTextContent('Dokumen Sales / SO');
    expect(dialog).toHaveTextContent('2/5 lengkap');
    expect(dialog).toHaveTextContent('Foto segel');
    expect(screen.getAllByText('Belum dilengkapi oleh Operational.')).toHaveLength(6);
    expect(await screen.findByRole('button', { name: /View surat-jalan.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download surat-jalan.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /View foto-segel.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download foto-segel.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /View eir-container-2.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download eir-container-2.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /View delivery-order.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download delivery-order.pdf/i })).toBeEnabled();
    expect(fetchFinanceInvoiceDetail).toHaveBeenCalledWith('invoice-1');
  });

  it('mengupload PDF Invoice Accurate dari detail invoice', async () => {
    const user = userEvent.setup();
    const detailWithoutFinanceFile = {
      ...invoiceRow,
      invoiceDocumentStatus: 'belum_upload',
      invoiceDocumentStatusLabel: 'Belum Upload',
      documents: [],
    };
    const detailWithInvoiceFile = {
      ...invoiceRow,
      invoiceDocumentStatus: 'belum_upload',
      invoiceDocumentStatusLabel: 'Belum Upload',
      invoiceDocumentUploadedAt: '2026-08-02T08:00:00.000Z',
      invoiceDocumentUploadedBy: 'Finance Test',
      documents: [{
        id: 'finance-invoice-1',
        category: 'invoicePdf',
        label: 'Invoice',
        source: 'Finance',
        ready: true,
        file: { name: 'invoice-accurate.pdf', path: 'finance-invoice-1', type: 'application/pdf', size: 128 },
      }],
    };
    fetchFinanceInvoiceDetail
      .mockResolvedValueOnce(detailWithoutFinanceFile)
      .mockResolvedValueOnce(detailWithInvoiceFile);
    uploadFinanceInvoiceDocument.mockResolvedValue({
      ...invoiceRow,
      invoiceDocumentStatus: 'belum_upload',
      invoiceDocumentStatusLabel: 'Belum Upload',
      invoiceDocumentUploadedAt: '2026-08-02T08:00:00.000Z',
      invoiceDocumentUploadedBy: 'Finance Test',
      uploadedDocument: {
        id: 'finance-invoice-1',
        category: 'invoicePdf',
        fileName: 'invoice-accurate.pdf',
        mimeType: 'application/pdf',
        fileSize: 128,
        path: 'finance-invoice-1',
        uploadedByName: 'Finance Test',
        uploadedAt: '2026-08-02T08:00:00.000Z',
      },
    });
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    await user.click(await screen.findByRole('button', { name: /(Upload|Detail) Dokumen SO-TEST-001/i }));
    const file = new File(['%PDF-1.4'], 'invoice-accurate.pdf', { type: 'application/pdf' });
    await user.upload(await screen.findByLabelText('Upload Invoice PDF'), file);

    expect(uploadFinanceInvoiceDocument).not.toHaveBeenCalled();
    expect(await screen.findByText('Siap disimpan: invoice-accurate.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Simpan Dokumen/i }));

    await waitFor(() => {
      expect(uploadFinanceInvoiceDocument).toHaveBeenCalledWith('invoice-1', 'invoice', file);
    });
    expect(await screen.findByText('Dokumen berhasil disimpan')).toBeInTheDocument();
    expect(await screen.findByText('invoice-accurate.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View invoice-accurate.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download invoice-accurate.pdf/i })).toBeEnabled();
  });

  it('menampilkan modal gagal ketika upload dokumen invoice gagal dikirim', async () => {
    const user = userEvent.setup();
    fetchFinanceInvoiceDetail.mockResolvedValueOnce({
      ...invoiceRow,
      invoiceDocumentStatus: 'belum_upload',
      invoiceDocumentStatusLabel: 'Belum Upload',
      documents: [],
    });
    uploadFinanceInvoiceDocument.mockRejectedValueOnce(new Error('Upload PDF gagal.'));
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    await user.click(await screen.findByRole('button', { name: /(Upload|Detail) Dokumen SO-TEST-001/i }));
    const file = new File(['%PDF-1.4'], 'invoice-error.pdf', { type: 'application/pdf' });
    await user.upload(await screen.findByLabelText('Upload Invoice PDF'), file);
    await user.click(screen.getByRole('button', { name: /Simpan Dokumen/i }));

    expect(await screen.findByText('Sebagian dokumen gagal disimpan')).toBeInTheDocument();
    expect(screen.getByText('Invoice: Upload PDF gagal.')).toBeInTheDocument();
  });

  it('mengajukan koreksi nomor invoice dari detail invoice', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    await user.click(await screen.findByRole('button', { name: /(Upload|Detail) Dokumen SO-TEST-001/i }));
    await user.click(await screen.findByRole('button', { name: /Ajukan Koreksi/i }));
    await user.clear(screen.getByLabelText(/Nomor Invoice Baru/i));
    await user.type(screen.getByLabelText(/Nomor Invoice Baru/i), 'INV-TEST-002');
    await user.type(screen.getByLabelText(/Alasan Koreksi/i), 'Nomor invoice sebelumnya salah ketik.');
    await user.click(screen.getAllByRole('button', { name: 'Ajukan Koreksi' }).at(-1));

    await waitFor(() => {
      expect(requestFinanceInvoiceCorrection).toHaveBeenCalledWith('invoice-1', {
        requestedValue: 'INV-TEST-002',
        reason: 'Nomor invoice sebelumnya salah ketik.',
      });
    });
  });

  it('menginput nomor SO melalui modal', async () => {
    const user = userEvent.setup();
    updateFinanceOrderSoNumber.mockResolvedValue({ ...orderRow, soNumber: 'SO-202607-019', verificationStatus: 'verified' });
    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    await user.click(await screen.findByRole('button', { name: 'Input Nomor SO' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Input Nomor SO Accurate');
    await user.type(screen.getByLabelText('Nomor SO Accurate'), 'so-202607-019');
    await user.click(screen.getByRole('button', { name: 'Simpan Nomor SO' }));

    expect(updateFinanceOrderSoNumber).toHaveBeenCalledWith('order-1', 'SO-202607-019');
  });

  it('menampilkan detail harga pada modal detail order finance', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Detail Harga');
    expect(dialog).toHaveTextContent(/Rp\s*5\.200\.000/i);
    expect(dialog).toHaveTextContent('Jasa Angkut 20FT');
    expect(dialog).toHaveTextContent(/Rp\s*2\.600\.000/i);
  });

  it('menambah rincian revenue dari modal detail order finance, dibatasi hanya layanan revenue', async () => {
    const user = userEvent.setup();
    addFinanceOrderLineItem.mockResolvedValue({
      ...orderRow,
      totalAmount: 5500000,
      lineItems: [
        ...orderRow.lineItems,
        { serviceName: 'Handling', qty: 1, price: 300000, total: 300000 },
      ],
    });
    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    await user.click(await screen.findByRole('button', { name: /Tambah Rincian Revenue/i }));

    const dialog = await screen.findByRole('dialog', { name: /Tambah Rincian Revenue/i });
    const serviceSelect = within(dialog).getByLabelText('Layanan');
    const options = within(serviceSelect).getAllByRole('option').map((option) => option.value);
    expect(options).toEqual(['Jasa Angkut D20', 'Jasa Angkut D40', 'Handling', 'Jasa Lainnya']);

    await user.selectOptions(serviceSelect, 'Handling');
    await user.clear(within(dialog).getByLabelText('Qty'));
    await user.type(within(dialog).getByLabelText('Qty'), '1');
    await user.type(within(dialog).getByLabelText(/Harga per Unit/i), '300000');
    await user.click(within(dialog).getByRole('button', { name: 'Tambah Rincian' }));

    await waitFor(() => {
      expect(addFinanceOrderLineItem).toHaveBeenCalledWith('order-1', expect.objectContaining({
        serviceName: 'Handling',
        qty: 1,
        price: 300000,
      }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Tambah Rincian Revenue/i })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog')).toHaveTextContent('Handling');
  });

  it('menampilkan status dan alasan SO batal di finance', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    await user.click(await screen.findByRole('tab', { name: /SO Batal/i }));
    expect(screen.getByText('Bekasi')).toBeInTheDocument();
    expect(screen.getAllByText('SO Batal').length).toBeGreaterThan(0);
    expect(screen.getByText('Customer membatalkan pengiriman setelah nomor SO terbit.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Input Nomor SO' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Detail' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Alasan Batal');
    expect(dialog).toHaveTextContent('Customer membatalkan pengiriman setelah nomor SO terbit.');
    expect(dialog).toHaveTextContent('Admin Test');
  });

  it('meminta validasi sebelum mengirim nomor invoice', async () => {
    const user = userEvent.setup();
    fetchFinanceInvoices.mockResolvedValue({
      rows: [{
        ...invoiceRow,
        invoiceStatus: 'Butuh Nomor Invoice',
        invoiceNumber: '',
      }],
    });
    updateFinanceInvoiceNumber.mockResolvedValue({
      ...invoiceRow,
      invoiceStatus: 'Menunggu Update Status',
      invoiceNumber: 'INV-202607-001',
    });
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.type(await screen.findByPlaceholderText('INV-...'), 'inv-202607-001');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Validasi Nomor Invoice');
    expect(screen.getByRole('dialog')).toHaveTextContent('INV-202607-001');
    expect(updateFinanceInvoiceNumber).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ya, Kirim Nomor Invoice' }));
    expect(updateFinanceInvoiceNumber).toHaveBeenCalledWith('invoice-1', 'INV-202607-001');
  });
});
