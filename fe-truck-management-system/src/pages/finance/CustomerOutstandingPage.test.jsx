import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerOutstandingPage from './CustomerOutstandingPage';
import {
  fetchFinanceInvoicePayments,
  fetchFinanceOutstanding,
  recordFinanceInvoicePayment,
} from '../../services/finance/financeService';

const notify = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'finance', permissions: ['finance.invoice.read', 'finance.invoice.payment.record'] } }),
}));

vi.mock('../../contexts/FeedbackContext', () => ({
  useFeedback: () => ({ notify }),
}));

vi.mock('../../services/finance/financeService', () => ({
  fetchFinanceOutstanding: vi.fn(),
  fetchFinanceInvoicePayments: vi.fn(),
  recordFinanceInvoicePayment: vi.fn(),
}));

const outstandingResult = {
  rows: [
    {
      id: 'so-1',
      soNumber: 'SO-202608-001',
      invoiceNumber: 'INV-202608-001',
      customer: 'PT Mitra Kimia',
      destination: 'Tangerang',
      billingStatus: 'menunggu_pembayaran',
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
      soNumber: 'SO-HIST-002',
      invoiceNumber: '',
      customer: 'PT Global Makmur',
      destination: 'Bandung',
      billingStatus: 'belum_invoice',
      billingAmount: 2500000,
      totalPaid: 0,
      outstandingAmount: 2500000,
      dueDate: null,
      agingBucket: 'unknown',
      daysOverdue: 0,
      dataReviewStatus: 'perlu_dicek',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  summary: {
    totalOutstandingAmount: 3500000,
    totalOrders: 2,
    current: 1,
    overdue1To30: 0,
    overdue31To60: 0,
    overdue61To90: 0,
    overdue90Plus: 0,
    unknownDueDate: 1,
    needsReview: 1,
  },
};

describe('CustomerOutstandingPage finance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchFinanceOutstanding.mockResolvedValue(outstandingResult);
    fetchFinanceInvoicePayments.mockResolvedValue([]);
    recordFinanceInvoicePayment.mockResolvedValue({});
  });

  it('menampilkan ringkasan dan daftar piutang customer', async () => {
    render(<CustomerOutstandingPage />);

    expect(await screen.findByText('SO-202608-001')).toBeInTheDocument();
    expect(screen.getByText('SO-HIST-002')).toBeInTheDocument();
    expect(screen.getAllByText(/perlu ditinjau/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp\s*3\.500\.000/i).length).toBeGreaterThan(0);
  });

  it('mencatat pembayaran lewat modal dan reload data', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('SO-202608-001');
    await user.click(screen.getAllByRole('button', { name: /catat pembayaran/i })[0]);

    expect(await screen.findByRole('dialog', { name: /SO-202608-001/i })).toBeInTheDocument();
    await waitFor(() => expect(fetchFinanceInvoicePayments).toHaveBeenCalledWith('so-1'));

    const proofFile = new File(['bukti'], 'bukti-transfer.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/bukti transfer/i), proofFile);
    await user.click(screen.getByRole('button', { name: /tandai lunas/i }));

    await waitFor(() => {
      expect(recordFinanceInvoicePayment).toHaveBeenCalledWith('so-1', expect.objectContaining({ amount: 1000000 }), proofFile);
      expect(notify).toHaveBeenCalled();
    });
    expect(fetchFinanceOutstanding).toHaveBeenCalledTimes(2);
  });

  it('menampilkan pesan error dari server saat pembayaran ditolak', async () => {
    const user = userEvent.setup();
    recordFinanceInvoicePayment.mockRejectedValue(new Error('Nominal pembayaran melebihi sisa outstanding.'));
    render(<CustomerOutstandingPage />);

    await screen.findByText('SO-202608-001');
    await user.click(screen.getAllByRole('button', { name: /catat pembayaran/i })[0]);
    await screen.findByRole('dialog', { name: /SO-202608-001/i });

    const proofFile = new File(['bukti'], 'bukti-transfer.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/bukti transfer/i), proofFile);
    await user.click(screen.getByRole('button', { name: /tandai lunas/i }));

    expect(await screen.findByText('Nominal pembayaran melebihi sisa outstanding.')).toBeInTheDocument();
  });

  it('menonaktifkan tombol simpan sebelum bukti transfer dilampirkan', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('SO-202608-001');
    await user.click(screen.getAllByRole('button', { name: /catat pembayaran/i })[0]);
    await screen.findByRole('dialog', { name: /SO-202608-001/i });

    expect(screen.getByRole('button', { name: /tandai lunas/i })).toBeDisabled();
  });

  it('mengambil nominal pelunasan dari sisa outstanding, bukan input manual', async () => {
    const user = userEvent.setup();
    render(<CustomerOutstandingPage />);

    await screen.findByText('SO-202608-001');
    await user.click(screen.getAllByRole('button', { name: /catat pembayaran/i })[0]);
    await screen.findByRole('dialog', { name: /SO-202608-001/i });

    expect(screen.queryByLabelText(/nominal pembayaran/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*1\.000\.000/i).length).toBeGreaterThan(0);
  });
});
