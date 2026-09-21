import { describe, expect, it } from 'vitest';
import { normalizeFinanceInvoiceRow } from './invoiceUtils';

describe('normalizeFinanceInvoiceRow', () => {
  it('mempertahankan rincian container agar notice ritasi inap tampil di Finance', () => {
    const containerBreakdown = [{
      containerJobId: 'job-inap-1',
      containerNumber: 'INAPRUN001',
      hasInap: true,
      inapReason: 'DEPO TUTUP',
    }];

    expect(normalizeFinanceInvoiceRow({ id: 'so-1', containerBreakdown })).toEqual(
      expect.objectContaining({ containerBreakdown }),
    );
  });
});
