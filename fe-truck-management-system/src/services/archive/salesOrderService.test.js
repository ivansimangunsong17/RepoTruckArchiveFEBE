import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelSalesOrder, fetchSalesOrdersPage, saveSalesOrder } from './salesOrderService';
import { httpClient } from '../api/httpClient';

vi.mock('../api/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('salesOrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengambil halaman Sales Order dari backend API', async () => {
    httpClient.get.mockResolvedValue({ rows: [], total: 0 });

    const result = await fetchSalesOrdersPage({
      page: 2,
      pageSize: 8,
      query: 'SO',
      status: 'running',
    });

    expect(httpClient.get).toHaveBeenCalledWith('/sales-orders?page=2&pageSize=8&query=SO&status=running');
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('menyimpan Sales Order baru ke backend API', async () => {
    httpClient.post.mockResolvedValue({ id: 'order-1', soNumber: 'SO-001' });

    const result = await saveSalesOrder({
      soNumber: 'SO-001',
      lineItems: [
        { serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 2, price: 1500000 },
        { serviceName: 'Bon Muat/Bongkar', qty: 1, price: 250000 },
      ],
      referenceDocuments: [{ documentType: 'Delivery Order', file: { name: 'DO.pdf', size: 10 } }],
    }, { fullName: 'Sinta' });

    expect(httpClient.post).toHaveBeenCalledWith('/sales-orders', expect.objectContaining({
      soNumber: 'SO-001',
      createdBy: 'Sinta',
      updatedBy: 'Sinta',
      serviceName: 'Campuran',
      price: 0,
      quantity: 3,
      totalAmount: 3250000,
      lineItems: [
        expect.objectContaining({
          serviceName: 'Jasa Angkut D20',
          containerType: 'Dry',
          qty: 2,
          price: 1500000,
          total: 3000000,
        }),
        expect.objectContaining({
          serviceName: 'Bon Muat/Bongkar',
          containerType: '',
          qty: 1,
          price: 250000,
          total: 250000,
        }),
      ],
      containers: [
        expect.objectContaining({
          containerNumber: '',
          size: '20FT',
          type: 'Dry',
          notes: 'Jasa Angkut D20',
          rpujStatus: 'pending',
          status: 'received',
        }),
        expect.objectContaining({
          containerNumber: '',
          size: '20FT',
          type: 'Dry',
        }),
      ],
      referenceDocuments: [
        expect.objectContaining({
          documentType: 'Delivery Order',
          referenceNumber: '',
          documentDate: '',
          file: expect.objectContaining({ name: 'DO.pdf', size: 10, type: '' }),
          notes: '',
        }),
      ],
    }));
    expect(result.soNumber).toBe('SO-001');
  });

  it('mengupdate Sales Order existing ke backend API', async () => {
    httpClient.patch.mockResolvedValue({ id: 'order-1', soNumber: 'SO-001' });

    await saveSalesOrder({
      soNumber: 'SO-001',
      lineItems: [{ serviceName: 'Tila/Gatepass', qty: 1, price: 100000 }],
    }, { fullName: 'Sinta' }, { id: 'order-1', createdBy: 'Rangga' });

    expect(httpClient.patch).toHaveBeenCalledWith('/sales-orders/order-1', expect.objectContaining({
      soNumber: 'SO-001',
      createdBy: 'Rangga',
      updatedBy: 'Sinta',
      serviceName: 'Tila/Gatepass',
      lineItems: expect.any(Array),
      referenceDocuments: [],
    }));
  });

  it('mengirim tanggal kalender tanpa mundur saat nilai berasal dari Date DB', async () => {
    httpClient.patch.mockResolvedValue({ id: 'order-1', soNumber: 'SO-001' });

    await saveSalesOrder({
      soNumber: 'SO-001',
      soDate: new Date('2026-07-16T17:00:00.000Z'),
      tripDate: new Date('2026-07-16T17:00:00.000Z'),
      lineItems: [{ serviceName: 'Tila/Gatepass', qty: 1, price: 100000 }],
    }, { fullName: 'Sinta' }, { id: 'order-1' });

    expect(httpClient.patch).toHaveBeenCalledWith('/sales-orders/order-1', expect.objectContaining({
      soDate: '2026-07-17',
      tripDate: '2026-07-17',
    }));
  });

  it('membatalkan Sales Order lewat backend API', async () => {
    httpClient.patch.mockResolvedValue({ id: 'order-1' });

    await cancelSalesOrder('order-1');

    expect(httpClient.patch).toHaveBeenCalledWith('/sales-orders/order-1/cancel', {});
  });
});
