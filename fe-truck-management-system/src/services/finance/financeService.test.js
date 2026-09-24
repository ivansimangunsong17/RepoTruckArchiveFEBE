import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../api/httpClient';
import {
  addExpenseTransferProof,
  approveOperationalFundRequest,
  approveFinanceCorrection,
  closeOperationalFundBatch,
  createOperationalFundRequest,
  depositOperationalFund,
  deleteExpenseTransferProof,
  fetchFinanceCorrections,
  fetchFinanceInvoiceCorrections,
  fetchFinanceContainerJobExpenses,
  fetchExpenseTransferProofs,
  fetchFinanceOrderCorrections,
  exportFinanceOutstandingByCustomer,
  fetchOperationalFundBatches,
  fetchOperationalFundRequests,
  fetchOperationalFundTransactions,
  reconcileFinanceContainerJobExpense,
  recordFinanceCustomerPayment,
  recordFinanceInvoicePayment,
  rejectOperationalFundRequest,
  rejectFinanceCorrection,
  requestFinanceInvoiceCorrection,
  requestFinanceOrderSoCorrection,
  updateExpenseTransferProof,
} from './financeService';

vi.mock('../api/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  httpClient.get.mockResolvedValue({ rows: [] });
  httpClient.post.mockResolvedValue({});
  httpClient.patch.mockResolvedValue({});
  httpClient.delete.mockResolvedValue({});
});

describe('financeService correction endpoints', () => {
  it('mengirim semua filter ke endpoint export Customer Outstanding', async () => {
    await exportFinanceOutstandingByCustomer({
      query: 'Kimia',
      agingBucket: 'overdue_all',
      sortBy: 'customer_asc',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });

    expect(httpClient.get).toHaveBeenCalledWith('/finance/outstanding/by-customer/export?query=Kimia&agingBucket=overdue_all&sortBy=customer_asc&dateFrom=2026-09-01&dateTo=2026-09-30');
  });

  it('mencatat pembayaran invoice tanpa bukti transfer', async () => {
    const invoicePayload = { amount: 400000, referenceNumber: 'TRF-MENYUSUL' };
    const customerPayload = {
      totalAmount: 400000,
      allocations: [{ salesOrderId: 'so-1', amount: 400000 }],
    };

    await recordFinanceInvoicePayment('so-1', invoicePayload);
    await recordFinanceCustomerPayment(customerPayload);

    expect(httpClient.post).toHaveBeenCalledWith('/finance/invoices/so-1/payments', invoicePayload);
    expect(httpClient.post).toHaveBeenCalledWith('/finance/customer-payments', customerPayload);
  });

  it('memanggil endpoint saldo operasional harian', async () => {
    const payload = { requestDate: '2026-08-20', amount: 20000000, purpose: 'Dropping operasional harian' };
    await fetchOperationalFundBatches({ dateFrom: '2026-08-20', dateTo: '2026-08-20' });
    await fetchOperationalFundRequests({ status: 'submitted', dateFrom: '2026-08-20' });
    await fetchOperationalFundTransactions({ transactionType: 'debit', dateFrom: '2026-08-20' });
    await createOperationalFundRequest(payload);
    await depositOperationalFund(payload);
    await approveOperationalFundRequest('fund-1');
    await rejectOperationalFundRequest('fund-2', 'Nominal perlu disesuaikan.');
    await closeOperationalFundBatch('batch-1', { closeNote: 'Valid' });

    expect(httpClient.get).toHaveBeenCalledWith('/finance/operational-fund-batches?dateFrom=2026-08-20&dateTo=2026-08-20');
    expect(httpClient.get).toHaveBeenCalledWith('/finance/operational-fund-requests?status=submitted&dateFrom=2026-08-20');
    expect(httpClient.get).toHaveBeenCalledWith('/finance/operational-fund-transactions?transactionType=debit&dateFrom=2026-08-20');
    expect(httpClient.post).toHaveBeenCalledWith('/finance/operational-fund-requests', payload);
    expect(httpClient.post).toHaveBeenCalledWith('/finance/operational-fund-deposits', payload);
    expect(httpClient.patch).toHaveBeenCalledWith('/finance/operational-fund-requests/fund-1/approve', {});
    expect(httpClient.patch).toHaveBeenCalledWith('/finance/operational-fund-requests/fund-2/reject', { rejectionNote: 'Nominal perlu disesuaikan.' });
    expect(httpClient.patch).toHaveBeenCalledWith('/finance/operational-fund-batches/batch-1/close', { closeNote: 'Valid' });
  });

  it('memanggil endpoint rekonsiliasi biaya container job', async () => {
    await fetchFinanceContainerJobExpenses({ financeCheckStatus: 'belum_dicek', paymentStatus: 'sudah_dibayar' });
    await reconcileFinanceContainerJobExpense('expense-1', {
      financeCheckStatus: 'perlu_klarifikasi',
      financeNote: 'Bukti bayar belum jelas.',
    });

    expect(httpClient.get).toHaveBeenCalledWith('/finance/container-job-expenses?financeCheckStatus=belum_dicek&paymentStatus=sudah_dibayar');
    expect(httpClient.patch).toHaveBeenCalledWith('/finance/container-job-expenses/expense-1/reconcile', {
      financeCheckStatus: 'perlu_klarifikasi',
      financeNote: 'Bukti bayar belum jelas.',
    });
  });

  it('mengirim bukti pembayaran saat rekonsiliasi biaya container job', async () => {
    const proofFile = new File(['proof'], 'bukti-transfer.pdf', { type: 'application/pdf' });

    await reconcileFinanceContainerJobExpense('expense-1', {
      financeCheckStatus: 'sudah_dicek',
      financeNote: '',
      proofFile,
    });

    expect(httpClient.patch).toHaveBeenCalledWith('/finance/container-job-expenses/expense-1/reconcile', expect.objectContaining({
      financeCheckStatus: 'sudah_dicek',
      financeNote: '',
      proofFile: undefined,
      fileName: 'bukti-transfer.pdf',
      mimeType: 'application/pdf',
      fileSize: proofFile.size,
      fileBase64: expect.stringContaining('data:application/pdf;base64,'),
    }));
  });

  it('mengelola beberapa bukti transfer biaya container job', async () => {
    const proofFile = new File(['proof'], 'bukti-susulan.pdf', { type: 'application/pdf' });
    await fetchExpenseTransferProofs('expense-1');
    await addExpenseTransferProof('expense-1', { amount: 100000, transferDate: '2026-09-24', note: 'Transfer awal', proofFile });
    await updateExpenseTransferProof('expense-1', 'proof-1', { amount: 125000, transferDate: '2026-09-24', note: 'Nominal diperbaiki' });
    await deleteExpenseTransferProof('expense-1', 'proof-1');

    expect(httpClient.get).toHaveBeenCalledWith('/finance/container-job-expenses/expense-1/transfer-proofs');
    expect(httpClient.post).toHaveBeenCalledWith('/finance/container-job-expenses/expense-1/transfer-proofs', expect.objectContaining({
      amount: 100000, fileName: 'bukti-susulan.pdf', fileBase64: expect.stringContaining('data:application/pdf;base64,'),
    }));
    expect(httpClient.patch).toHaveBeenCalledWith('/finance/container-job-expenses/expense-1/transfer-proofs/proof-1', {
      amount: 125000, transferDate: '2026-09-24', note: 'Nominal diperbaiki',
    });
    expect(httpClient.delete).toHaveBeenCalledWith('/finance/container-job-expenses/expense-1/transfer-proofs/proof-1');
  });

  it('memanggil endpoint history koreksi SO dan invoice', async () => {
    await fetchFinanceOrderCorrections('order-1');
    await fetchFinanceInvoiceCorrections('invoice-1');

    expect(httpClient.get).toHaveBeenCalledWith('/finance/order-verifications/order-1/corrections');
    expect(httpClient.get).toHaveBeenCalledWith('/finance/invoices/invoice-1/corrections');
  });

  it('mengirim request koreksi SO dan invoice', async () => {
    const payload = { requestedValue: 'SO-NEW', reason: 'Salah input' };
    await requestFinanceOrderSoCorrection('order-1', payload);
    await requestFinanceInvoiceCorrection('invoice-1', payload);

    expect(httpClient.post).toHaveBeenCalledWith('/finance/order-verifications/order-1/corrections', payload);
    expect(httpClient.post).toHaveBeenCalledWith('/finance/invoices/invoice-1/corrections', payload);
  });

  it('memanggil endpoint approval Admin koreksi Finance', async () => {
    await fetchFinanceCorrections({ status: 'pending', query: 'SO' });
    await approveFinanceCorrection('correction-1', 'ok');
    await rejectFinanceCorrection('correction-1', 'salah');

    expect(httpClient.get).toHaveBeenCalledWith('/finance/corrections?status=pending&query=SO');
    expect(httpClient.patch).toHaveBeenCalledWith('/finance/corrections/correction-1/approve', { reviewNote: 'ok' });
    expect(httpClient.patch).toHaveBeenCalledWith('/finance/corrections/correction-1/reject', { reviewNote: 'salah' });
  });
});
