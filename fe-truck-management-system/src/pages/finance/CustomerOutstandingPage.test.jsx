import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerOutstandingPage from './CustomerOutstandingPage';
import {
  fetchFinanceInvoicePayments,
  fetchFinanceOutstanding,
  fetchFinanceOutstandingByCustomer,
  recordFinanceInvoicePayment,
} from '../../services/finance/financeService';
import { downloadCsv } from '../../utils/csvExport';

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
  fetchFinanceInvoicePayments: vi.fn(),
  recordFinanceInvoicePayment: vi.fn(),
}));

vi.mock('../../utils/csvExport', () => ({
  downloadCsv: vi.fn(),
}));

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
    vi.clearAllMocks();
    fetchFinanceOutstandingByCustomer.mockResolvedValue(rollupResult);
    fetchFinanceOutstanding.mockResolvedValue(customerInvoiceRows);
    fetchFinanceInvoicePayments.mockResolvedValue([]);
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

  it('membuka detail piutang customer lalu mencatat pembayaran salah satu invoice', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('PT Mitra Kimia');
    await user.click(screen.getAllByRole('button', { name: 'Detail' })[0]);

    const detailDialog = await screen.findByRole('dialog', { name: /PT Mitra Kimia/i });
    await waitFor(() => expect(fetchFinanceOutstanding).toHaveBeenCalledWith(expect.objectContaining({ query: 'PT Mitra Kimia' })));
    expect(within(detailDialog).getByText('SO-202608-001')).toBeInTheDocument();
    expect(within(detailDialog).getByText('SO-202608-002')).toBeInTheDocument();

    await user.click(within(detailDialog).getAllByRole('button', { name: /catat pembayaran/i })[0]);

    const paymentDialog = await screen.findByRole('dialog', { name: /SO-202608-001/i });
    const proofFile = new File(['bukti'], 'bukti-transfer.pdf', { type: 'application/pdf' });
    await user.upload(within(paymentDialog).getByLabelText(/pilih bukti/i), proofFile);
    await user.click(within(paymentDialog).getByRole('button', { name: /tandai lunas/i }));

    await waitFor(() => {
      expect(recordFinanceInvoicePayment).toHaveBeenCalledWith('so-1', expect.objectContaining({ amount: 1000000 }), proofFile);
      expect(notify).toHaveBeenCalled();
    });
  });
});
