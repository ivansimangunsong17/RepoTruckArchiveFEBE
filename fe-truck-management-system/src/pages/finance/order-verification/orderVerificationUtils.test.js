import { describe, expect, it } from 'vitest';
import { getOrderPartyLabel } from './orderVerificationUtils';

describe('getOrderPartyLabel', () => {
  it('20FT saja', () => {
    expect(getOrderPartyLabel({ lineItems: [{ serviceName: 'Jasa Angkut D20', qty: 2 }] })).toBe('2 x 20FT');
  });

  it('40FT saja', () => {
    expect(getOrderPartyLabel({ lineItems: [{ serviceName: 'Jasa Angkut D40', qty: 1 }] })).toBe('1 x 40FT');
  });

  it('qty order Sales diutamakan di atas jumlah container aktif', () => {
    expect(getOrderPartyLabel({
      lineItems: [{ serviceName: 'Jasa Angkut D20', qty: 2 }],
      activeContainer20Qty: 1,
      activeContainer40Qty: 0,
      container: '1 x 20FT',
    })).toBe('2 x 20FT');
  });

  it('memakai qty order Sales dari line item D20/D40 (campuran)', () => {
    expect(getOrderPartyLabel({
      lineItems: [
        { serviceName: 'Jasa Angkut D20', qty: 2 },
        { serviceName: 'Jasa Angkut D40', qty: 1 },
        { serviceName: 'Biaya Lain', qty: 5 },
      ],
      container: '1 x 20FT',
    })).toBe('2 x 20FT, 1 x 40FT');
  });

  it('fallback ke ringkasan container jika SO lama tanpa line item', () => {
    expect(getOrderPartyLabel({ lineItems: [], container: '3 x 20FT' })).toBe('3 x 20FT');
  });

  it('menampilkan - jika tidak ada data party', () => {
    expect(getOrderPartyLabel({ lineItems: [], container: '-' })).toBe('-');
  });
});
