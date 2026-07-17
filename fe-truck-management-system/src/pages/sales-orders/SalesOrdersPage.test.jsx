import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SalesOrdersPage from './SalesOrdersPage';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { useArchiveData } from '../../hooks/useArchiveData';
import { fetchSalesOrdersPage, updateSalesOrderInvoiceDeliveryStatus } from '../../services/archive/salesOrderService';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useFeedback', () => ({
  useFeedback: vi.fn(),
}));

vi.mock('../../hooks/useArchiveData', () => ({
  useArchiveData: vi.fn(),
}));

vi.mock('../../services/archive/salesOrderService', () => ({
  fetchSalesOrdersPage: vi.fn(),
  updateSalesOrderInvoiceDeliveryStatus: vi.fn(),
}));

describe('SalesOrdersPage billing status flow', () => {
  const notify = vi.fn();
  const confirmAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    confirmAction.mockResolvedValue(true);
    useAuth.mockReturnValue({
      user: { id: 'user-1', role: 'admin', fullName: 'Admin User' },
    });
    useFeedback.mockReturnValue({ notify, confirmAction });
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      orders: [],
    });
    fetchSalesOrdersPage.mockResolvedValue({
      rows: [{
        id: 'order-1',
        soNumber: 'SO-001',
        customer: 'PT Contoh',
        shipment: 'import',
        status: 'completed',
        invoiceNumber: 'INV-001',
        billingStatus: 'menunggu_pembayaran',
        paymentType: 'tempo',
        paymentTermDays: 14,
        salesName: 'Sales A',
        quantity: 3,
        containers: [
          { id: 'job-1', size: '20FT', type: 'Dry', status: 'completed', completedAt: '2026-07-11T10:00:00.000Z' },
          { id: 'job-2', size: '20FT', type: 'Dry', status: 'completed', completedAt: '2026-07-11T11:00:00.000Z' },
          { id: 'job-3', size: '20FT', type: 'Dry', status: 'cancelled', cancelReason: 'Customer hanya menjalankan sebagian container' },
        ],
      }],
      total: 1,
      summary: {
        orders: 1,
        waitingOrders: 0,
        runningOrders: 0,
        completedOrders: 1,
        invoicedOrders: 1,
        cancelledOrders: 0,
        activeContainers: 2,
        completedContainers: 2,
        cancelledContainers: 1,
      },
    });
    updateSalesOrderInvoiceDeliveryStatus.mockResolvedValue({
      id: 'order-1',
      soNumber: 'SO-001',
      customer: 'PT Contoh',
      shipment: 'import',
      status: 'completed',
      invoiceNumber: 'INV-001',
      billingStatus: 'menunggu_pembayaran',
      salesName: 'Sales A',
    });
  });

  it('mengirim status billing yang sedang dipilih saat tombol simpan diklik', async () => {
    const user = userEvent.setup();
    render(<SalesOrdersPage />);

    expect(await screen.findByText('2/3 Aktif')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    expect(await screen.findByText('Pembayaran: Tempo 14 hari')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Simpan Status' }));

    await waitFor(() => expect(updateSalesOrderInvoiceDeliveryStatus).toHaveBeenCalledWith(
      'order-1',
      'menunggu_pembayaran',
    ));
  });
});
