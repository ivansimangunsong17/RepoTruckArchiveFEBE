import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerOutstandingPage from './CustomerOutstandingPage';
import {
  fetchFinanceInvoicePayments,
  fetchFinanceOutstanding,
  fetchFinanceOutstandingByCustomer,
  exportFinanceOutstandingByCustomer,
  recordFinanceCustomerPayment,
  recordFinanceInvoicePayment,
} from '../../services/finance/financeService';
import { downloadCsv } from '../../utils/csvExport';
import { fetchMaster } from '../../services/master-data/masterDataService';

const notify = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'finance', permissions: ['finance.invoice.read', 'finance.invoice.payment.record'] } }),
}));

vi.mock('../../contexts/FeedbackContext', () => ({
  useFeedback: () => ({ notify }),
}));

vi.mock('../../services/finance/financeService', () => ({
  fetchFinanceOutstanding: vi.fn(),
  fetchFinanceOutstandingByCustomer: vi.fn(),
  exportFinanceOutstandingByCustomer: vi.fn(),
  fetchFinanceInvoicePayments: vi.fn(),
  recordFinanceCustomerPayment: vi.fn(),
  recordFinanceInvoicePayment: vi.fn(),
}));

vi.mock('../../utils/csvExport', () => ({
  downloadCsv: vi.fn(),
}));

vi.mock('../../services/master-data/masterDataService', () => ({ fetchMaster: vi.fn() }));

const rollupResult = {
  rows: [
    {
      customer: 'PT Mitra Kimia',
      invoiceCount: 2,
      totalOutstandingAmount: 3500000,
      currentAmount: 1000000,
      overdueAmount: 2500000,
      oldestOverdueDays: 45,
      needsReview: false,
    },
    {
      customer: 'PT Global Makmur',
      invoiceCount: 1,
      totalOutstandingAmount: 2500000,
      currentAmount: 0,
      overdueAmount: 0,
      oldestOverdueDays: 0,
      needsReview: true,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  summary: {
    totalOutstandingAmount: 6000000,
    totalOrders: 3,
    totalCustomers: 2,
    current: 1,
    overdue1To30: 0,
    overdue31To60: 1,
    overdue61To90: 0,
    overdue90Plus: 0,
    unknownDueDate: 0,
    needsReview: 1,
  },
};

const customerInvoiceRows = {
  rows: [
    {
      id: 'so-1',
      soNumber: 'SO-202608-001',
      invoiceNumber: 'INV-202608-001',
      customer: 'PT Mitra Kimia',
      billingAmount: 1500000,
      totalPaid: 500000,
      outstandingAmount: 1000000,
      dueDate: '2026-09-05',
      agingBucket: 'current',
      daysOverdue: 0,
      dataReviewStatus: 'ok',
    },
    {
      id: 'so-2',
      soNumber: 'SO-202608-002',
      invoiceNumber: 'INV-202608-002',
      customer: 'PT Mitra Kimia',
      billingAmount: 2500000,
      totalPaid: 0,
      outstandingAmount: 2500000,
      dueDate: '2026-07-20',
      agingBucket: 'overdue_31_60',
      daysOverdue: 45,
      dataReviewStatus: 'ok',
    },
  ],
};

describe('CustomerOutstandingPage finance', () => {
  beforeEach(() => {
    fetchMaster.mockResolvedValue([{ name: 'PT Mitra Kimia', salesName: 'Sales A' }, { name: 'PT Global Makmur', salesName: 'Sales B' }]);
    vi.clearAllMocks();
    fetchFinanceOutstandingByCustomer.mockResolvedValue(rollupResult);
    exportFinanceOutstandingByCustomer.mockResolvedValue({ rows: rollupResult.rows });
    fetchFinanceOutstanding.mockResolvedValue(customerInvoiceRows);
    fetchFinanceInvoicePayments.mockResolvedValue([]);
    recordFinanceCustomerPayment.mockResolvedValue({});
    recordFinanceInvoicePayment.mockResolvedValue({});
  });

  it('menampilkan ringkasan dan piutang per customer dari satu kali fetch saja', async () => {
    render(<CustomerOutstandingPage />);

    expect(await screen.findByText('PT Mitra Kimia')).toBeInTheDocument();
    expect(screen.getByText('PT Global Makmur')).toBeInTheDocument();
    expect(screen.getAllByText(/perlu ditinjau/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp\s*6\.000\.000/i).length).toBeGreaterThan(0);
    expect(screen.getByText('45 hari')).toBeInTheDocument();

    // Ringkasan dan tabel harus datang dari satu response yang sama (fetchFinanceOutstandingByCustomer);
    // fetchFinanceOutstanding (endpoint flat) hanya boleh dipanggil kalau user membuka modal Detail,
    // bukan saat halaman pertama kali dimuat.
    expect(fetchFinanceOutstandingByCustomer).toHaveBeenCalledTimes(1);
    expect(fetchFinanceOutstanding).not.toHaveBeenCalled();
  });

  it('mengirim sortBy default saat pertama kali dimuat, lalu memuat ulang dengan sortBy baru saat dropdown Urutkan diubah', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('PT Mitra Kimia');
    expect(fetchFinanceOutstandingByCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, sortBy: 'outstanding_desc' }),
    );

    await user.selectOptions(screen.getByLabelText('Urutkan'), 'oldest_overdue_desc');

    await waitFor(() => {
      expect(fetchFinanceOutstandingByCustomer).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, sortBy: 'oldest_overdue_desc' }),
      );
    });
  });

  it('meneruskan Sales customer master ke ringkasan, detail, dan export', async () => {
    const user = userEvent.setup();
    exportFinanceOutstandingByCustomer.mockResolvedValue({ rows: rollupResult.rows });
    render(<CustomerOutstandingPage />);
    await screen.findByText('PT Mitra Kimia');
    await user.selectOptions(screen.getByLabelText('Sales'), 'Sales A');
    await waitFor(() => expect(fetchFinanceOutstandingByCustomer).toHaveBeenLastCalledWith(expect.objectContaining({ salesName: 'Sales A', page: 1 })));
    await user.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    await waitFor(() => expect(fetchFinanceOutstanding).toHaveBeenCalledWith(expect.objectContaining({ salesName: 'Sales A', customerName: 'PT Mitra Kimia' })));
    await user.click(screen.getByRole('button', { name: 'Tutup detail piutang' }));
    await user.click(screen.getByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(exportFinanceOutstandingByCustomer).toHaveBeenCalledWith(expect.objectContaining({ salesName: 'Sales A' })));
  });

  it('mengirim agingBucket=overdue_all saat opsi Semua Overdue dipilih di dropdown Umur Piutang', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('PT Mitra Kimia');
    await user.selectOptions(screen.getByLabelText('Umur Piutang'), 'overdue_all');

    await waitFor(() => {
      expect(fetchFinanceOutstandingByCustomer).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, agingBucket: 'overdue_all' }),
      );
    });
  });

  it('mengirim dateFrom/dateTo saat filter Trip Date diisi, supaya semua bulan outstanding bisa ditampilkan bukan cuma Juni-Agustus', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('PT Mitra Kimia');
    await user.type(screen.getByLabelText('Trip Date Dari'), '2026-09-01');
    await user.type(screen.getByLabelText('Trip Date Sampai'), '2026-09-30');

    await waitFor(() => {
      expect(fetchFinanceOutstandingByCustomer).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, dateFrom: '2026-09-01', dateTo: '2026-09-30' }),
      );
    });
  });

  it('mengekspor daftar piutang per customer ke CSV', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('PT Mitra Kimia');
    await user.click(screen.getByRole('button', { name: /export csv/i }));

    const [, headers, rows] = downloadCsv.mock.calls[0];
    expect(headers).toEqual(['Customer', 'Total OTS', 'Current', 'Overdue', 'Oldest Overdue (Hari)', 'Jumlah Invoice']);
    expect(rows).toEqual([
      ['PT Mitra Kimia', 3500000, 1000000, 2500000, 45, 2],
      ['PT Global Makmur', 2500000, 0, 0, 0, 1],
    ]);
  });

  it('mengekspor seluruh customer sesuai filter tanpa mengubah pagination tabel atau menduplikasi baris', async () => {
    const user = userEvent.setup();
    const allRows = Array.from({ length: 25 }, (_, index) => ({
      customer: `Customer ${String(index + 1).padStart(2, '0')}`,
      invoiceCount: index + 1,
      totalOutstandingAmount: 25000000 - index,
      currentAmount: 1000,
      overdueAmount: 2000,
      oldestOverdueDays: index,
    }));
    fetchFinanceOutstandingByCustomer.mockResolvedValue({
      ...rollupResult,
      rows: allRows.slice(0, 20),
      total: 25,
      totalPages: 2,
    });
    exportFinanceOutstandingByCustomer.mockResolvedValue({ rows: [...allRows, allRows[4]] });

    render(<CustomerOutstandingPage />);

    expect(await screen.findByText('Customer 01')).toBeInTheDocument();
    expect(screen.getByText('Customer 20')).toBeInTheDocument();
    expect(screen.queryByText('Customer 21')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Nama customer'), 'Customer');
    await user.selectOptions(screen.getByLabelText('Umur Piutang'), 'overdue_all');
    await user.selectOptions(screen.getByLabelText('Urutkan'), 'customer_asc');
    await user.type(screen.getByLabelText('Trip Date Dari'), '2026-09-01');
    await user.type(screen.getByLabelText('Trip Date Sampai'), '2026-09-30');
    await user.click(screen.getByRole('button', { name: /export csv/i }));

    expect(exportFinanceOutstandingByCustomer).toHaveBeenCalledWith({
      query: 'Customer',
      salesName: '',
      agingBucket: 'overdue_all',
      sortBy: 'customer_asc',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });
    const [, , csvRows] = downloadCsv.mock.calls[0];
    expect(csvRows).toHaveLength(25);
    expect(csvRows.map((row) => row[0])).toEqual(allRows.map((row) => row.customer));
  });

  it('mengunci tombol selama export dan memulihkan state setelah request gagal', async () => {
    const user = userEvent.setup();
    let rejectExport;
    exportFinanceOutstandingByCustomer.mockImplementation(() => new Promise((resolve, reject) => {
      rejectExport = reject;
    }));

    render(<CustomerOutstandingPage />);
    await screen.findByText('PT Mitra Kimia');

    const exportButton = screen.getByRole('button', { name: /export csv/i });
    await user.dblClick(exportButton);

    expect(exportFinanceOutstandingByCustomer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /mengekspor/i })).toBeDisabled();

    rejectExport(new Error('Server export tidak tersedia'));

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        title: 'Export CSV gagal',
        message: 'Server export tidak tersedia',
      }));
      expect(screen.getByRole('button', { name: /export csv/i })).not.toBeDisabled();
    });
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it('membuka detail piutang customer lalu mencatat pembayaran cicilan salah satu invoice', async () => {
    const user = userEvent.setup();
    fetchFinanceInvoicePayments.mockResolvedValue([
      {
        id: 'payment-1',
        amount: 500000,
        paymentDate: '2026-09-10',
        referenceNumber: 'TRF-001',
        recordedByName: 'Fitri Finance',
        proofAttachment: { id: 'proof-1', path: 'proof-1', name: 'bukti-1.pdf', type: 'application/pdf' },
      },
      {
        id: 'payment-2',
        amount: 250000,
        paymentDate: '2026-09-12',
        referenceNumber: 'TRF-002',
        recordedByName: 'Fitri Finance',
        proofAttachment: null,
      },
    ]);
    render(<CustomerOutstandingPage />);

    await screen.findByText('PT Mitra Kimia');
    await user.click(screen.getAllByRole('button', { name: 'Detail' })[0]);

    const detailDialog = await screen.findByRole('dialog', { name: /PT Mitra Kimia/i });
    await waitFor(() => expect(fetchFinanceOutstanding).toHaveBeenCalledWith(expect.objectContaining({ query: 'PT Mitra Kimia' })));
    expect(within(detailDialog).getByText('SO-202608-001')).toBeInTheDocument();
    expect(within(detailDialog).getByText('SO-202608-002')).toBeInTheDocument();

    await user.click(within(detailDialog).getAllByRole('button', { name: /^catat pembayaran$/i })[0]);

    const paymentDialog = await screen.findByRole('dialog', { name: /SO-202608-001/i });
    expect(await within(paymentDialog).findAllByRole('button', { name: /lihat bukti/i })).toHaveLength(1);
    expect(within(paymentDialog).getByText(/bukti menyusul/i)).toBeInTheDocument();
    const amountInput = within(paymentDialog).getByLabelText(/nominal dibayar/i);
    expect(amountInput).toHaveValue(1000000);
    await user.clear(amountInput);
    await user.type(amountInput, '400000');
    const proofFile = new File(['bukti'], 'bukti-transfer.pdf', { type: 'application/pdf' });
    await user.upload(within(paymentDialog).getByLabelText(/pilih bukti/i), proofFile);
    await user.click(within(paymentDialog).getByRole('button', { name: /simpan pembayaran/i }));

    await waitFor(() => {
      expect(recordFinanceInvoicePayment).toHaveBeenCalledWith('so-1', expect.objectContaining({ amount: 400000 }), proofFile);
      expect(notify).toHaveBeenCalled();
    });
  });

  it('mencatat satu bukti transfer customer untuk beberapa invoice', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('PT Mitra Kimia');
    await user.click(screen.getAllByRole('button', { name: 'Detail' })[0]);

    const detailDialog = await screen.findByRole('dialog', { name: /PT Mitra Kimia/i });
    await user.click(within(detailDialog).getByRole('button', { name: /catat pembayaran customer/i }));

    const paymentDialog = await screen.findByRole('dialog', { name: /pembayaran customer/i });
    await user.type(within(paymentDialog).getByLabelText(/total transfer/i), '3500000');
    await user.type(within(paymentDialog).getAllByLabelText(/alokasi/i)[0], '1000000');
    await user.type(within(paymentDialog).getAllByLabelText(/alokasi/i)[1], '2500000');
    const proofFile = new File(['bukti'], 'bukti-gabungan.pdf', { type: 'application/pdf' });
    await user.upload(within(paymentDialog).getByLabelText(/pilih bukti/i), proofFile);
    await user.click(within(paymentDialog).getByRole('button', { name: /simpan alokasi/i }));

    await waitFor(() => {
      expect(recordFinanceCustomerPayment).toHaveBeenCalledWith(expect.objectContaining({
        totalAmount: 3500000,
        allocations: [
          { salesOrderId: 'so-1', amount: 1000000 },
          { salesOrderId: 'so-2', amount: 2500000 },
        ],
      }), proofFile);
    });
  });

  it('memfilter invoice di modal detail piutang customer', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('PT Mitra Kimia');
    await user.click(screen.getAllByRole('button', { name: 'Detail' })[0]);

    const detailDialog = await screen.findByRole('dialog', { name: /PT Mitra Kimia/i });
    expect(await within(detailDialog).findByText('SO-202608-001')).toBeInTheDocument();
    expect(within(detailDialog).getByText('SO-202608-002')).toBeInTheDocument();

    await user.type(within(detailDialog).getByLabelText('Cari invoice piutang'), 'INV-202608-002');

    expect(within(detailDialog).queryByText('SO-202608-001')).not.toBeInTheDocument();
    expect(within(detailDialog).getByText('SO-202608-002')).toBeInTheDocument();
  });
});
