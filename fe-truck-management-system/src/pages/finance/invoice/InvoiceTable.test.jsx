import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import InvoiceTable from './InvoiceTable';

function baseRow(overrides = {}) {
  return {
    id: 'order-1',
    soNumber: 'SO-001',
    customer: 'PT Contoh',
    destination: 'Cikarang',
    invoiceStatus: 'Menunggu Update Status',
    billingAmount: 1500000,
    ...overrides,
  };
}

function renderTable(rows, overrides = {}) {
  render(
    <InvoiceTable
      rows={rows}
      summary={{}}
      total={rows.length}
      totalPages={1}
      currentPage={1}
      query=""
      activeInvoiceTab="in-progress"
      activeInvoiceDocumentFilter="all"
      onActiveInvoiceTabChange={vi.fn()}
      onActiveInvoiceDocumentFilterChange={vi.fn()}
      onInvoicePageChange={vi.fn()}
      invoiceFilterMonth=""
      invoiceDateFrom=""
      invoiceDateTo=""
      onInvoiceFilterMonthChange={vi.fn()}
      onInvoiceDateFromChange={vi.fn()}
      onInvoiceDateToChange={vi.fn()}
      onResetInvoiceDateFilter={vi.fn()}
      onSelectInvoice={vi.fn()}
      {...overrides}
    />,
  );
}

describe('InvoiceTable destinations', () => {
  it('menampilkan badge Multi-tujuan saat SO punya lebih dari satu tujuan container', () => {
    renderTable([baseRow({ destinations: ['Cikarang', 'Karawang'] })]);
    expect(screen.getByText('Multi-tujuan')).toBeInTheDocument();
  });

  it('tidak menampilkan badge Multi-tujuan saat SO hanya punya satu tujuan', () => {
    renderTable([baseRow({ destinations: ['Cikarang'] })]);
    expect(screen.queryByText('Multi-tujuan')).not.toBeInTheDocument();
  });
});

describe('InvoiceTable input nomor invoice', () => {
  it('menampilkan input nomor invoice langsung di tabel untuk invoice yang belum punya nomor', async () => {
    const user = userEvent.setup();
    const onSaveInvoiceNumberInline = vi.fn().mockResolvedValue({});
    renderTable(
      [baseRow({ invoiceNumber: '', invoiceStatus: 'Butuh Nomor Invoice' })],
      { activeInvoiceTab: 'need-number', onSaveInvoiceNumberInline },
    );

    const input = screen.getByLabelText('Nomor Invoice SO-001');
    await user.type(input, 'inv-2026-001');
    await user.click(screen.getByLabelText('Simpan nomor invoice SO-001'));

    expect(input).toHaveValue('INV-2026-001');
    expect(onSaveInvoiceNumberInline).toHaveBeenCalledWith('order-1', 'INV-2026-001');
  });

  it('menampilkan nomor invoice read-only jika nomor sudah tersimpan', () => {
    renderTable([baseRow({ invoiceNumber: 'INV-001' })]);
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nomor Invoice SO-001')).not.toBeInTheDocument();
  });
});
