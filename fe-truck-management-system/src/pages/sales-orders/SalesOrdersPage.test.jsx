import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SalesOrdersPage from './SalesOrdersPage';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { useArchiveData } from '../../hooks/useArchiveData';
import { fetchSalesOrdersPage } from '../../services/archive/salesOrderService';

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
      masters: { trucks: [], drivers: [], destinations: [], customers: [], depots: [], terminals: [] },
      updateJob: vi.fn(),
      refresh: vi.fn(),
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
        invoiceIssuedAt: '2026-07-21T08:00:00.000Z',
        dueDate: '2026-08-04T00:00:00.000Z',
        outstandingAmount: 4500000,
        billingStatus: 'menunggu_pembayaran',
        invoiceDocumentStatus: 'siap_dikirim',
        invoiceDocumentUploadedAt: '2026-07-21T09:00:00.000Z',
        invoiceDocumentUploadedBy: 'Finance User',
        taxInvoiceDocumentUploadedAt: '2026-07-21T09:15:00.000Z',
        taxInvoiceDocumentUploadedBy: 'Finance User',
        referenceDocuments: [
          {
            documentType: 'invoicePdf',
            file: { name: 'invoice-001.pdf', path: 'attachment-invoice-1', type: 'application/pdf', size: 120 },
          },
          {
            documentType: 'taxInvoicePdf',
            file: { name: 'faktur-001.pdf', path: 'attachment-tax-1', type: 'application/pdf', size: 120 },
          },
        ],
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
        readyInvoiceDocuments: 1,
        sentInvoiceDocuments: 0,
        cancelledOrders: 0,
        activeContainers: 2,
        completedContainers: 2,
        cancelledContainers: 1,
      },
    });
  });

  it('menampilkan status invoice dan pembayaran secara read-only, tanpa kontrol edit -- status pengiriman invoice sudah menjadi wewenang Finance', async () => {
    const user = userEvent.setup();
    render(<SalesOrdersPage />);

    expect(await screen.findByText('2/3 Aktif')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Siap Dikirim/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dokumen Terkirim/i })).not.toBeInTheDocument();
    expect(fetchSalesOrdersPage).toHaveBeenCalledWith(expect.objectContaining({
      status: 'waiting_operational',
    }));
    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    expect(await screen.findByText('Pembayaran: Tempo 14 hari')).toBeInTheDocument();
    expect(screen.getByText('Waktu Input Sistem')).toBeInTheDocument();
    expect(screen.getByText('Tanggal SO: 19 Juli 2026')).toBeInTheDocument();
    expect(screen.getByText('Lama Pelunasan')).toBeInTheDocument();
    expect(screen.getByText(/Belum dikirim customer/i)).toBeInTheDocument();
    expect(screen.getByText('Riwayat Dokumen')).toBeInTheDocument();
    expect(screen.getByText('Invoice diupload Finance')).toBeInTheDocument();
    expect(screen.getByText('Faktur Pajak diupload Finance')).toBeInTheDocument();
    expect(screen.getAllByText('invoice-001.pdf').length).toBeGreaterThan(0);
    expect(screen.getAllByText('faktur-001.pdf').length).toBeGreaterThan(0);

    expect(screen.getByText('Jatuh Tempo')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText(/Rp\s*4\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText('Status pengiriman invoice dan pembayaran dikelola oleh Finance.')).toBeInTheDocument();

    expect(screen.queryByLabelText('Status Pengiriman Invoice')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simpan Status' })).not.toBeInTheDocument();
  });

  it('membuka form update container job langsung dari detail Sales Order', async () => {
    const user = userEvent.setup();
    render(<SalesOrdersPage />);

    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    expect(await screen.findByText('Pembayaran: Tempo 14 hari')).toBeInTheDocument();

    const updateButtons = screen.getAllByRole('button', { name: /update/i });
    expect(updateButtons.length).toBeGreaterThan(0);
    await user.click(updateButtons[0]);

    expect(await screen.findByLabelText('Truck')).toBeInTheDocument();
  });

  it('menampilkan badge Multi-tujuan di detail Sales Order saat container punya tujuan berbeda-beda', async () => {
    fetchSalesOrdersPage.mockResolvedValue({
      rows: [{
        id: 'order-multi-dest',
        soNumber: 'SO-MULTI-DEST',
        customer: 'PT Multi Tujuan',
        shipment: 'import',
        status: 'completed',
        origin: 'Tanjung Priok',
        destination: 'Cikarang',
        soDate: '2026-07-19',
        receivedAt: '2026-07-20T10:21:00.000Z',
        quantity: 2,
        containers: [
          { id: 'job-multi-1', size: '20FT', type: 'Dry', status: 'received', destination: 'Cikarang' },
          { id: 'job-multi-2', size: '20FT', type: 'Dry', status: 'received', destination: 'Karawang' },
        ],
      }],
      total: 1,
      summary: {
        orders: 1, waitingOrders: 1, runningOrders: 0, completedOrders: 0, invoicedOrders: 0,
        readyInvoiceDocuments: 0, sentInvoiceDocuments: 0, cancelledOrders: 0,
        activeContainers: 2, completedContainers: 0, cancelledContainers: 0,
      },
    });

    const user = userEvent.setup();
    render(<SalesOrdersPage />);

    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    expect(await screen.findByText('Multi-tujuan (2)')).toBeInTheDocument();
  });

  it('tidak menampilkan badge Multi-tujuan saat semua container satu tujuan yang sama', async () => {
    const user = userEvent.setup();
    render(<SalesOrdersPage />);

    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    await screen.findByText('Pembayaran: Tempo 14 hari');
    expect(screen.queryByText(/Multi-tujuan/)).not.toBeInTheDocument();
  });

  it('memfilter Sales Order yang dokumen Accurate-nya siap dikirim', async () => {
    const user = userEvent.setup();
    render(<SalesOrdersPage customerDocumentsOnly />);

    await user.click(await screen.findByRole('button', { name: /Siap Dikirim/i }));

    await waitFor(() => expect(fetchSalesOrdersPage).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'completed',
      invoiced: true,
      invoiceDocumentStatus: 'siap_dikirim',
    })));
  });

  it('tidak menampilkan kontrol edit status invoice untuk Sales meski invoice sudah lunas', async () => {
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

    expect(screen.getByText('Status pengiriman invoice dan pembayaran dikelola oleh Finance.')).toBeInTheDocument();
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

  it('tetap mengizinkan Sales mengedit order meski nomor SO internal sudah otomatis dibuat sistem', async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      user: { id: 'user-1', role: 'sales', fullName: 'Sales A' },
    });
    fetchSalesOrdersPage.mockResolvedValue({
      rows: [{
        id: 'order-auto-numbered',
        soNumber: 'SO-260829-001',
        financeVerificationStatus: 'pending_so',
        customer: 'PT Baru Dibuat',
        shipment: 'import',
        status: 'waiting_operational',
        createdByUserId: 'user-1',
        createdBy: 'Sales A',
        salesName: 'Sales A',
        quantity: 1,
        containers: [{
          id: 'job-auto-numbered',
          size: '20FT',
          type: 'Dry',
          status: 'waiting',
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

    expect(screen.queryByText(/SO terkunci karena Finance sudah menerbitkan nomor SO/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SO terkunci karena RPUJ sudah dikirim/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit Sales Order/i })).toBeInTheDocument();
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
