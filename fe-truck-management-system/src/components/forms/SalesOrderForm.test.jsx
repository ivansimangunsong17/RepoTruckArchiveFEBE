import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SalesOrderForm from './SalesOrderForm';

const customers = [{
  id: 'customer-1',
  name: 'PT Armada Test',
  address: 'Jakarta',
  pic: 'Budi',
  phone: '021-123456',
  contract: 'Aktif',
}];

async function fillBaseFields(user, overrides = {}) {
  await user.selectOptions(screen.getByLabelText('Customer'), 'PT Armada Test');
  fireEvent.change(screen.getByLabelText('No. Sales Order'), {
    target: { value: overrides.soNumber || 'SO-2026-TEST' },
  });
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

describe('SalesOrderForm', () => {
  it('tidak memakai customer dummy ketika master customer API kosong', () => {
    render(
      <SalesOrderForm
        customers={[]}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('option', { name: /PT Nusantara/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Customer')).toHaveValue('');
  });

  it('menolak nomor Sales Order yang sudah digunakan', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
        existingOrders={[{ id: 'so-1', soNumber: 'SO-2026-TEST', containers: [] }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await fillBaseFields(user);
    await fillFirstLineItem(user, { serviceName: 'Bon Muat/Bongkar', quantity: '1', price: '50000' });
    await user.click(screen.getByRole('button', { name: 'Simpan Sales Order' }));

    expect(screen.getByText('Nomor Sales Order sudah digunakan.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('menolak rincian dengan qty nol', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
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
    await user.click(screen.getByRole('button', { name: 'Simpan Sales Order' }));

    expect(screen.getByText('Setiap rincian wajib memiliki layanan, qty minimal 1, dan price tidak boleh negatif.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mengirim payload rincian campuran saat form valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SalesOrderForm
        customers={customers}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await fillBaseFields(user, { soNumber: 'SO-VALID-001' });
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

    await user.click(screen.getByRole('button', { name: 'Simpan Sales Order' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      soNumber: 'SO-VALID-001',
      customer: 'PT Armada Test',
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
    const user = userEvent.setup();
    render(
      <SalesOrderForm
        customers={customers}
        existingOrders={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Customer'), 'PT Armada Test');

    expect(screen.getByLabelText('PIC Customer')).toHaveValue('Budi');
    expect(screen.getByLabelText('Kontak PIC')).toHaveValue('021-123456');
    expect(screen.getByLabelText('Alamat Customer')).toHaveValue('Jakarta');
  });
});
