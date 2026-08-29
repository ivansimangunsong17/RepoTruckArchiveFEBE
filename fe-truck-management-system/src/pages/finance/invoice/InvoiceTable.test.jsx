import { render, screen } from '@testing-library/react';
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

function renderTable(rows) {
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
