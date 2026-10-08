import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrderVerificationTable from './OrderVerificationTable';

const baseRow = {
  salesName: 'Eliyani',
  customer: 'PT Contoh',
  destination: 'Cikande',
  orderType: 'import',
  paymentTerms: 'Cash',
  orderDate: '08 Oktober 2026',
  runningDate: '08 Oktober 2026',
  internalSoNumber: 'ORD-0001',
};

const rows = [
  { ...baseRow, id: 'pending', verificationStatus: 'pending_so', soNumber: '', accurateSoNumber: '', lineItems: [{ serviceName: 'Jasa Angkut D20', qty: 2 }] },
  { ...baseRow, id: 'verified', verificationStatus: 'verified', soNumber: '2610/08-00331', accurateSoNumber: '2610/08-00331', lineItems: [{ serviceName: 'Jasa Angkut D20', qty: 1 }, { serviceName: 'Jasa Angkut D40', qty: 1 }] },
  { ...baseRow, id: 'cancelled', verificationStatus: 'cancelled', status: 'SO Batal', soNumber: '', accurateSoNumber: '', lineItems: [], container: '3 x 40FT' },
];

function renderTable(activeOrderTab) {
  return render(
    <OrderVerificationTable
      activeOrderTab={activeOrderTab}
      currentPage={1}
      onActiveOrderTabChange={vi.fn()}
      onOpenSoModal={vi.fn()}
      onOrderDateFromChange={vi.fn()}
      onOrderDateToChange={vi.fn()}
      onOrderFilterMonthChange={vi.fn()}
      onPageChange={vi.fn()}
      onQueryChange={vi.fn()}
      onResetOrderDateFilter={vi.fn()}
      onSelectOrder={vi.fn()}
      orderDateFrom=""
      orderDateTo=""
      orderFilterMonth=""
      query=""
      rows={rows}
      totalPages={1}
    />,
  );
}

describe('OrderVerificationTable - kolom Party', () => {
  it.each([
    ['need-so', '2 x 20FT'],
    ['running', '1 x 20FT, 1 x 40FT'],
    ['cancelled', '3 x 40FT'],
  ])('tab %s menampilkan Party sebagai kolom pertama', (tab, expected) => {
    renderTable(tab);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('Party');
    expect(headers[1]).toHaveTextContent('Order Dibuat');
    const partyCell = document.querySelector('td[data-label="Party"]');
    expect(within(partyCell).getByText(expected)).toBeInTheDocument();
  });
});
