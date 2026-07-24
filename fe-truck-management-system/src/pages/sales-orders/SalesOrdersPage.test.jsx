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
        soDate: '2026-07-19',
        receivedAt: '2026-07-20T10:21:00.000Z',
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
    expect(fetchSalesOrdersPage).toHaveBeenCalledWith(expect.objectContaining({
      status: 'waiting_operational',
    }));
    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    expect(await screen.findByText('Pembayaran: Tempo 14 hari')).toBeInTheDocument();
    expect(screen.getByText('Waktu Input Sistem')).toBeInTheDocument();
    expect(screen.getByText('Tanggal SO: 19 Jul 2026')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Simpan Status' }));

    await waitFor(() => expect(updateSalesOrderInvoiceDeliveryStatus).toHaveBeenCalledWith(
      'order-1',
      'menunggu_pembayaran',
    ));
  });

  it('mengunci status invoice lunas untuk Sales', async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      user: { id: 'user-1', role: 'sales', fullName: 'Sales A' },
    });
    fetchSalesOrdersPage.mockResolvedValue({
      rows: [{
        id: 'order-paid',
        soNumber: 'SO-PAID-001',
        customer: 'PT Lunas',
        shipment: 'import',
        status: 'completed',
        invoiceNumber: 'INV-PAID-001',
        billingStatus: 'lunas',
        createdByUserId: 'user-1',
        createdBy: 'Sales A',
        salesName: 'Sales A',
        quantity: 1,
        containers: [{ id: 'job-paid', size: '20FT', type: 'Dry', status: 'completed' }],
      }],
      total: 1,
      summary: {
        orders: 1,
        waitingOrders: 0,
        runningOrders: 0,
        completedOrders: 1,
        invoicedOrders: 1,
        cancelledOrders: 0,
      },
    });

    render(<SalesOrdersPage />);
    await user.click(await screen.findByRole('button', { name: 'Detail' }));

    expect(screen.getByText(/Invoice sudah lunas.*hanya dapat dilakukan oleh Admin/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Status Pengiriman Invoice')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simpan Status' })).not.toBeInTheDocument();
  });

  it('mengunci edit dan pembatalan Sales setelah RPUJ dikirim', async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      user: { id: 'user-1', role: 'sales', fullName: 'Sales A' },
    });
    fetchSalesOrdersPage.mockResolvedValue({
      rows: [{
        id: 'order-rpuj-locked',
        soNumber: '',
        financeVerificationStatus: 'pending_so',
        customer: 'PT Terkunci',
        shipment: 'import',
        status: 'waiting_operational',
        createdByUserId: 'user-1',
        createdBy: 'Sales A',
        salesName: 'Sales A',
        quantity: 1,
        containers: [{
          id: 'job-rpuj-locked',
          size: '20FT',
          type: 'Dry',
          status: 'received',
          rpujStatus: 'submitted',
          rpujRequestedAt: '2026-07-20T08:00:00.000Z',
        }],
      }],
      total: 1,
      summary: {
        orders: 1,
        waitingOrders: 1,
        runningOrders: 0,
        completedOrders: 0,
        invoicedOrders: 0,
        cancelledOrders: 0,
      },
    });

    render(<SalesOrdersPage />);
    await user.click(await screen.findByRole('button', { name: 'Detail' }));

    expect(screen.getByText(/SO terkunci karena RPUJ sudah dikirim/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Sales Order/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hapus Sales Order/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajukan Batal/i })).not.toBeInTheDocument();
  });

  it('mengunci edit dan pembatalan Sales setelah nomor SO Finance terbit', async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      user: { id: 'user-1', role: 'sales', fullName: 'Sales A' },
    });
    fetchSalesOrdersPage.mockResolvedValue({
      rows: [{
        id: 'order-finance-locked',
        soNumber: 'SO-FIN-001',
        financeVerificationStatus: 'verified',
        customer: 'PT Bernomor',
        shipment: 'import',
        status: 'waiting_operational',
        createdByUserId: 'user-1',
        createdBy: 'Sales A',
        salesName: 'Sales A',
        quantity: 1,
        containers: [{
          id: 'job-finance-locked',
          size: '20FT',
          type: 'Dry',
          status: 'received',
          rpujStatus: 'pending',
        }],
      }],
      total: 1,
      summary: {
        orders: 1,
        waitingOrders: 1,
        runningOrders: 0,
        completedOrders: 0,
        invoicedOrders: 0,
        cancelledOrders: 0,
      },
    });

    render(<SalesOrdersPage />);
    await user.click(await screen.findByRole('button', { name: 'Detail' }));

    expect(screen.getByText(/SO terkunci karena Finance sudah menerbitkan nomor SO/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Sales Order/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hapus Sales Order/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajukan Batal/i })).not.toBeInTheDocument();
  });

  it('tetap memberikan akses revisi dan pembatalan kepada Admin setelah RPUJ dikirim', async () => {
    const user = userEvent.setup();
    fetchSalesOrdersPage.mockResolvedValue({
      rows: [{
        id: 'order-rpuj-admin',
        soNumber: 'SO-ADMIN-001',
        customer: 'PT Revisi Admin',
        shipment: 'import',
        status: 'waiting_operational',
        salesName: 'Sales A',
        quantity: 1,
        containers: [{
          id: 'job-rpuj-admin',
          size: '20FT',
          type: 'Dry',
          status: 'received',
          rpujStatus: 'submitted',
          rpujRequestedAt: '2026-07-20T08:00:00.000Z',
        }],
      }],
      total: 1,
      summary: {
        orders: 1,
        waitingOrders: 1,
        runningOrders: 0,
        completedOrders: 0,
        invoicedOrders: 0,
        cancelledOrders: 0,
      },
    });

    render(<SalesOrdersPage />);
    await user.click(await screen.findByRole('button', { name: 'Detail' }));

    expect(screen.getByRole('button', { name: /Edit Sales Order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hapus Sales Order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajukan Batal/i })).toBeInTheDocument();
  });
});
