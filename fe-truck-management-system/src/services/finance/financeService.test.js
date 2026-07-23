import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../api/httpClient';
import {
  approveFinanceCorrection,
  fetchFinanceCorrections,
  fetchFinanceInvoiceCorrections,
  fetchFinanceOrderCorrections,
  rejectFinanceCorrection,
  requestFinanceInvoiceCorrection,
  requestFinanceOrderSoCorrection,
} from './financeService';

vi.mock('../api/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  httpClient.get.mockResolvedValue({ rows: [] });
  httpClient.post.mockResolvedValue({});
  httpClient.patch.mockResolvedValue({});
});

describe('financeService correction endpoints', () => {
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
