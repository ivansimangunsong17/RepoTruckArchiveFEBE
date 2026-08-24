import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SalesOrderForm from './SalesOrderForm';
import { fetchCustomerOutstandingSummary } from '../../services/archive/salesOrderService';

vi.mock('../../services/archive/salesOrderService', () => ({
  fetchCustomerOutstandingSummary: vi.fn(),
}));

fetchCustomerOutstandingSummary.mockResolvedValue({
  customer: '',
  openInvoiceCount: 0,
  totalOutstandingAmount: 0,
  worstDaysOverdue: 0,
  overdueCount: 0,
  needsReview: 0,
});

const customers = [{
  id: 'customer-1',
  name: 'PT Armada Test',
  address: 'Jakarta',
  pic: 'Budi',
  phone: '021-123456',
  salesName: 'Sales Manual Admin',
  contract: 'Aktif',
}];
const locationMasters = {
  depots: [{ id: 'depot-1', name: 'Jakarta', status: 'Aktif' }],
  terminals: [{ id: 'terminal-1', name: 'Terminal 3 / NPCT1', status: 'Aktif' }],
  destinations: [{ id: 'destination-1', name: 'Bandung', status: 'Aktif' }],
};

async function fillBaseFields(user, overrides = {}) {
  fireEvent.change(screen.getByLabelText('Customer'), {
    target: { value: 'PT Armada Test' },
  });
  const soInput = screen.queryByLabelText('No. Sales Order');
  if (soInput) {
    fireEvent.change(soInput, {
      target: { value: overrides.soNumber || 'SO-2026-TEST' },
    });
  }
  fireEvent.change(screen.getByLabelText('Depo'), {
    target: { value: overrides.origin || 'Jakarta' },
  });
  fireEvent.change(screen.getByLabelText('Lokasi Tujuan'), {
    target: { value: overrides.destination || 'Bandung' },
  });
}

async function fillFirstLineItem(user, overrides = {}) {
  const serviceSelect = screen.getAllByLabelText('Jenis Rincian')[0];
  const qtyInput = screen.getAllByLabelText('Qty')[0];
  const priceInput = screen.getAllByLabelText('Price')[0];

  if (overrides.serviceName) {
    await user.selectOptions(serviceSelect, overrides.serviceName);
  }
  if (overrides.containerType) {
    await user.selectOptions(screen.getAllByLabelText('Jenis Container')[0], overrides.containerType);
  }

  fireEvent.change(qtyInput, {
    target: { value: overrides.quantity || '1' },
  });
  fireEvent.change(priceInput, {
    target: { value: overrides.price || '0' },
  });
}

async function openReview(user, editing = false) {
  await user.click(screen.getByRole('button', { name: editing ? 'Cek Perubahan' : 'Cek Sales Order' }));
}

async function confirmReview(user, editing = false) {
  await user.click(screen.getByRole('button', { name: editing ? 'Simpan Update' : 'Simpan Sales Order' }));
}

describe('SalesOrderForm', () => {
  it('tidak memakai customer dummy ketika master customer API kosong', () => {
    render(
      <SalesOrderForm
        customers={[]}
        {...locationMasters}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('option', { name: /PT Nusantara/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Customer')).toHaveValue('');
  });

  it('tidak meminta nomor Sales Order saat order baru dibuat Sales', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
        {...locationMasters}
        existingOrders={[{ id: 'so-1', soNumber: 'SO-2026-TEST', containers: [] }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await fillBaseFields(user);
    await fillFirstLineItem(user, { serviceName: 'Bon Muat/Bongkar', quantity: '1', price: '50000' });
    await openReview(user);

    expect(screen.queryByLabelText('No. Sales Order')).not.toBeInTheDocument();
    expect(screen.getByText('Cek data sebelum disimpan')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await confirmReview(user);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ soNumber: '' }));
  });

  it('menolak rincian dengan qty nol', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
        {...locationMasters}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await fillBaseFields(user);
    await fillFirstLineItem(user, {
      serviceName: 'Bon Muat/Bongkar',
      quantity: '0',
      price: '50000',
    });
    await openReview(user);

    expect(screen.getByText('Setiap rincian wajib memiliki layanan, qty minimal 1, dan price tidak boleh negatif.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('menolak harga container kosong atau nol untuk D20/D40', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
        {...locationMasters}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await fillBaseFields(user);
    await fillFirstLineItem(user, {
      serviceName: 'Jasa Angkut D20',
      containerType: 'Dry',
      quantity: '1',
      price: '0',
    });
    await openReview(user);

    expect(screen.getByText('Harga container D20/D40 wajib diisi lebih dari 0.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mengirim catatan untuk rincian Jasa Lainnya', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
        {...locationMasters}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await fillBaseFields(user, { soNumber: 'SO-OTHER-001' });
    await fillFirstLineItem(user, {
      serviceName: 'Jasa Lainnya',
      quantity: '1',
      price: '25000',
    });

    await openReview(user);
    expect(screen.getByText('Isi catatan untuk rincian Jasa Lainnya.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Catatan Jasa Lainnya'), 'Biaya seal');
    await openReview(user);
    expect(screen.getByText('Cek data sebelum disimpan')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await confirmReview(user);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      serviceName: 'Jasa Lainnya',
      lineItems: [
        expect.objectContaining({
          serviceName: 'Jasa Lainnya',
          notes: 'Biaya seal',
          qty: 1,
          price: 25000,
        }),
      ],
    }));
  });

  it('mengirim payload rincian campuran saat form valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
        {...locationMasters}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await fillBaseFields(user, { soNumber: 'SO-VALID-001' });
    await user.selectOptions(screen.getByLabelText('Jenis Pembayaran'), 'Tempo');
    fireEvent.change(screen.getByLabelText('Termin Pembayaran (Hari)'), {
      target: { value: '14' },
    });
    await fillFirstLineItem(user, {
      serviceName: 'Jasa Angkut D20',
      containerType: 'Dry',
      quantity: '2',
      price: '150000',
    });

    await user.click(screen.getByRole('button', { name: 'Tambah Rincian' }));
    const lineItems = screen.getAllByLabelText('Jenis Rincian');
    const qtyInputs = screen.getAllByLabelText('Qty');
    const priceInputs = screen.getAllByLabelText('Price');

    await user.selectOptions(lineItems[1], 'Bon Muat/Bongkar');
    fireEvent.change(qtyInputs[1], { target: { value: '1' } });
    fireEvent.change(priceInputs[1], { target: { value: '50000' } });

    await openReview(user);
    expect(screen.getByText('Cek data sebelum disimpan')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await confirmReview(user);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      soNumber: '',
      customer: 'PT Armada Test',
      salesName: 'Sales Manual Admin',
      paymentType: 'tempo',
      paymentTermDays: 14,
      serviceName: 'Campuran',
      quantity: 3,
      totalAmount: 350000,
      container20Qty: 2,
      container40Qty: 0,
      lineItems: [
        expect.objectContaining({
          serviceName: 'Jasa Angkut D20',
          containerType: 'Dry',
          qty: 2,
          price: 150000,
        }),
        expect.objectContaining({
          serviceName: 'Bon Muat/Bongkar',
          containerType: '',
          qty: 1,
          price: 50000,
        }),
      ],
      containers: [
        expect.objectContaining({
          size: '20FT',
          type: 'Dry',
        }),
        expect.objectContaining({
          size: '20FT',
          type: 'Dry',
        }),
      ],
    }));
  });

  it('mengisi PIC, kontak, dan alamat dari Master Customer', async () => {
    render(
      <SalesOrderForm
        customers={customers}
        {...locationMasters}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Customer'), {
      target: { value: 'PT Armada Test' },
    });

    expect(screen.getByLabelText('PIC Customer')).toHaveValue('Budi');
    expect(screen.getByLabelText('Kontak PIC')).toHaveValue('021-123456');
    expect(screen.getByLabelText('Alamat Customer')).toHaveValue('Jakarta');
  });

  it('mode data lama tidak otomatis tersimpan saat Enter dan tanggal wajib dipilih manual', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
        {...locationMasters}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        historicalMode
      />,
    );

    expect(screen.getByLabelText('Tanggal Sales Order')).toHaveValue('');
    expect(screen.getByLabelText('Tanggal Jalan')).toHaveValue('');

    await fillBaseFields(user, { soNumber: 'SO-HIST-001' });
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();

    await openReview(user);
    expect(screen.getByText('Tanggal Sales Order wajib diisi.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('menampilkan tanggal edit sesuai tanggal kalender dari DB', () => {
    render(
      <SalesOrderForm
        order={{
          id: 'so-date',
          soNumber: 'SO-DATE-001',
          customer: 'PT Armada Test',
          origin: 'Jakarta',
          destination: 'Bandung',
          soDate: new Date('2026-07-16T17:00:00.000Z'),
          tripDate: new Date('2026-07-16T17:00:00.000Z'),
          lineItems: [{ serviceName: 'Bon Muat/Bongkar', qty: 1, price: 0 }],
        }}
        customers={customers}
        {...locationMasters}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Tanggal Sales Order')).toHaveValue('2026-07-17');
    expect(screen.getByLabelText('Tanggal Jalan')).toHaveValue('2026-07-17');
  });

  it('mempertahankan waktu input sistem saat edit disimpan tanpa perubahan', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const receivedAt = '2026-07-23T03:35:00.000Z';
    const order = {
      id: 'so-time',
      soNumber: 'SO-TIME-001',
      customer: 'PT Armada Test',
      origin: 'Jakarta',
      destination: 'Bandung',
      receivedAt,
      lineItems: [{ serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price: 150000 }],
      containers: [{ id: 'job-1', size: '20FT', type: 'Dry', status: 'received', rpujStatus: 'pending', receivedAt }],
    };

    render(
      <SalesOrderForm
        order={order}
        customers={customers}
        {...locationMasters}
        existingOrders={[order]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await openReview(user, true);
    await confirmReview(user, true);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      receivedAt,
      containers: [
        expect.objectContaining({
          id: 'job-1',
          receivedAt,
        }),
      ],
    }));
  });

  it('mempertahankan job cancelled saat SO disimpan ulang tanpa perubahan qty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const order = {
      id: 'so-1',
      soNumber: 'SO-EDIT-001',
      customer: 'PT Armada Test',
      origin: 'Jakarta',
      destination: 'Bandung',
      lineItems: [{
        serviceName: 'Jasa Angkut D20',
        containerType: 'Dry',
        qty: 2,
        price: 150000,
      }],
      containers: [
        { id: 'job-active', size: '20FT', type: 'Dry', status: 'received', rpujStatus: 'pending' },
        { id: 'job-cancelled', size: '20FT', type: 'Dry', status: 'cancelled', rpujStatus: 'pending' },
      ],
    };

    render(
      <SalesOrderForm
        order={order}
        customers={customers}
        {...locationMasters}
        existingOrders={[order]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await openReview(user, true);
    await confirmReview(user, true);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      containers: [
        expect.objectContaining({ id: 'job-active', status: 'received' }),
        expect.objectContaining({ id: 'job-cancelled', status: 'cancelled' }),
      ],
    }));
  });

  it('menampilkan status outstanding customer saat customer yang punya piutang dipilih', async () => {
    fetchCustomerOutstandingSummary.mockResolvedValueOnce({
      customer: 'PT Armada Test',
      openInvoiceCount: 2,
      totalOutstandingAmount: 5000000,
      worstDaysOverdue: 12,
      overdueCount: 1,
      needsReview: 0,
    });

    const order = {
      id: 'so-1',
      soNumber: 'SO-EDIT-002',
      customer: 'PT Armada Test',
      origin: 'Jakarta',
      destination: 'Bandung',
      lineItems: [{ serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price: 100000 }],
      containers: [{ id: 'job-1', size: '20FT', type: 'Dry', status: 'received', rpujStatus: 'pending' }],
    };

    render(
      <SalesOrderForm
        order={order}
        customers={customers}
        {...locationMasters}
        existingOrders={[order]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(fetchCustomerOutstandingSummary).toHaveBeenCalledWith('PT Armada Test');
    expect(await screen.findByText(/Rp\s*5\.000\.000/i)).toBeInTheDocument();
    expect(screen.getByText(/2 invoice belum lunas/i)).toBeInTheDocument();
    expect(screen.getByText(/1 di antaranya sudah lewat jatuh tempo \(maks 12 hari\)/i)).toBeInTheDocument();
  });

  it('tidak menampilkan status outstanding ketika customer belum punya piutang', async () => {
    const order = {
      id: 'so-1',
      soNumber: 'SO-EDIT-003',
      customer: 'PT Armada Test',
      origin: 'Jakarta',
      destination: 'Bandung',
      lineItems: [{ serviceName: 'Jasa Angkut D20', containerType: 'Dry', qty: 1, price: 100000 }],
      containers: [{ id: 'job-1', size: '20FT', type: 'Dry', status: 'received', rpujStatus: 'pending' }],
    };

    render(
      <SalesOrderForm
        order={order}
        customers={customers}
        {...locationMasters}
        existingOrders={[order]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await screen.findByLabelText('Customer');
    expect(screen.queryByText(/outstanding customer ini/i)).not.toBeInTheDocument();
  });
});
