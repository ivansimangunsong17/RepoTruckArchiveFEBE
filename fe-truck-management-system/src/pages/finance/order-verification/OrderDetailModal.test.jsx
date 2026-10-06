import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrderDetailModal from './OrderDetailModal';
import { buildContainerQuantityComparison, normalizeFinanceOrderRow } from './orderVerificationUtils';

const MISMATCH_LABEL = 'Selisih dengan order';

function lineItem(serviceName, qty, price = 2800000) {
  return { serviceName, containerType: 'Dry', qty, price, total: qty * price };
}

function buildOrder(overrides = {}) {
  return normalizeFinanceOrderRow({
    id: 'so-1',
    customer: 'PT Contoh',
    destination: 'PURWAKARTA',
    salesName: 'Ibu Veronika',
    orderDate: '2026-10-05',
    container: '2 x 40FT',
    lineItems: [lineItem('Jasa Angkut D40', 2)],
    activeContainer20Qty: 0,
    activeContainer40Qty: 2,
    ...overrides,
  });
}

function renderModal(order) {
  render(<OrderDetailModal order={order} onClose={vi.fn()} onOpenCorrection={vi.fn()} />);
  return screen.getByRole('dialog');
}

function fieldValue(dialog, label) {
  const labelNode = within(dialog).getByText(label, { selector: 'span' });
  return labelNode.parentElement.querySelector('strong').textContent;
}

describe('OrderDetailModal qty order vs container aktif', () => {
  it('memakai label Qty Order dan Container Aktif', () => {
    const dialog = renderModal(buildOrder());
    expect(within(dialog).getByText('Qty Order', { selector: 'span' })).toBeInTheDocument();
    expect(within(dialog).getByText('Container Aktif', { selector: 'span' })).toBeInTheDocument();
    expect(within(dialog).getByRole('columnheader', { name: 'Qty Order' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Container', { selector: 'span', exact: true })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('columnheader', { name: 'Qty' })).not.toBeInTheDocument();
  });

  it('order dan container aktif sama -> tanpa peringatan', () => {
    const dialog = renderModal(buildOrder());
    expect(fieldValue(dialog, 'Qty Order')).toBe('2 x 40FT');
    expect(fieldValue(dialog, 'Container Aktif')).toBe('2 x 40FT');
    expect(within(dialog).queryByText(MISMATCH_LABEL)).not.toBeInTheDocument();
  });

  it('order 2 x 40FT, aktif 1 x 40FT -> peringatan selisih', () => {
    const dialog = renderModal(buildOrder({ container: '1 x 40FT', activeContainer40Qty: 1 }));
    expect(fieldValue(dialog, 'Qty Order')).toBe('2 x 40FT');
    expect(within(dialog).getByText('1 x 40FT')).toBeInTheDocument();
    expect(within(dialog).getByText(MISMATCH_LABEL)).toBeInTheDocument();
  });

  it('container aktif lebih banyak dari order -> peringatan selisih', () => {
    const dialog = renderModal(buildOrder({
      lineItems: [lineItem('Jasa Angkut D20', 1)],
      container: '3 x 20FT',
      activeContainer20Qty: 3,
      activeContainer40Qty: 0,
    }));
    expect(fieldValue(dialog, 'Qty Order')).toBe('1 x 20FT');
    expect(within(dialog).getByText(MISMATCH_LABEL)).toBeInTheDocument();
  });

  it('20FT sama tetapi 40FT berbeda -> tetap ada peringatan (ukuran dibandingkan terpisah)', () => {
    const dialog = renderModal(buildOrder({
      lineItems: [lineItem('Jasa Angkut D20', 1), lineItem('Jasa Angkut D40', 2)],
      container: '1 x 20FT, 1 x 40FT',
      activeContainer20Qty: 1,
      activeContainer40Qty: 1,
    }));
    expect(fieldValue(dialog, 'Qty Order')).toBe('1 x 20FT, 2 x 40FT');
    expect(within(dialog).getByText(MISMATCH_LABEL)).toBeInTheDocument();
  });

  it('total sama tapi komposisi ukuran berbeda -> peringatan (tidak digabung jadi satu total)', () => {
    const comparison = buildContainerQuantityComparison(buildOrder({
      lineItems: [lineItem('Jasa Angkut D20', 1), lineItem('Jasa Angkut D40', 1)],
      activeContainer20Qty: 2,
      activeContainer40Qty: 0,
    }));
    expect(comparison.isMismatch).toBe(true);
  });

  it('semua container batal -> Container Aktif "Tidak ada container aktif" dengan peringatan', () => {
    const dialog = renderModal(buildOrder({ container: 'Jasa Angkut D40 - Dry x2', activeContainer40Qty: 0 }));
    expect(within(dialog).getByText('Tidak ada container aktif')).toBeInTheDocument();
    expect(within(dialog).getByText(MISMATCH_LABEL)).toBeInTheDocument();
  });

  it('SO lama tanpa line item D20/D40 -> tanpa Qty Order dan tanpa peringatan palsu', () => {
    const dialog = renderModal(buildOrder({
      lineItems: [lineItem('Jasa Lainnya', 1, 500000)],
      container: '2 x 20FT',
      activeContainer20Qty: 2,
      activeContainer40Qty: 0,
    }));
    expect(within(dialog).queryByText('Qty Order', { selector: 'span' })).not.toBeInTheDocument();
    expect(fieldValue(dialog, 'Container Aktif')).toBe('2 x 20FT');
    expect(within(dialog).queryByText(MISMATCH_LABEL)).not.toBeInTheDocument();
  });

  it('SO lama tanpa rincian harga tetap menampilkan empty state lama tanpa peringatan', () => {
    const dialog = renderModal(buildOrder({ lineItems: [], container: '1 x 20FT', activeContainer20Qty: 1, activeContainer40Qty: 0 }));
    expect(within(dialog).getByText('Rincian harga belum tersedia.')).toBeInTheDocument();
    expect(within(dialog).queryByText(MISMATCH_LABEL)).not.toBeInTheDocument();
  });

  it('data tanpa hitungan job aktif memakai ringkasan container lama tanpa peringatan', () => {
    const dialog = renderModal(buildOrder({ container: 'Jasa Angkut D40 - Dry x2', activeContainer20Qty: undefined, activeContainer40Qty: undefined }));
    expect(fieldValue(dialog, 'Container Aktif')).toBe('Jasa Angkut D40 - Dry x2');
    expect(within(dialog).queryByText(MISMATCH_LABEL)).not.toBeInTheDocument();
  });

  it('SO yang sudah batal tidak diberi peringatan selisih', () => {
    const dialog = renderModal(buildOrder({ status: 'SO Batal', verificationStatus: 'cancelled', activeContainer40Qty: 0 }));
    expect(within(dialog).queryByText(MISMATCH_LABEL)).not.toBeInTheDocument();
  });
});
