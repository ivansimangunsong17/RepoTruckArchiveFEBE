import { describe, expect, it } from 'vitest';
import { INVOICE_DOCUMENT_UPLOAD_HINT, normalizeFinanceInvoiceRow, validateInvoicePdfFile } from './invoiceUtils';

describe('normalizeFinanceInvoiceRow', () => {
  it('mempertahankan rincian container agar notice ritasi inap tampil di Finance', () => {
    const containerBreakdown = [{
      containerJobId: 'job-inap-1',
      containerNumber: 'INAPRUN001',
      hasInap: true,
      inapReason: 'DEPO TUTUP',
    }];

    expect(normalizeFinanceInvoiceRow({ id: 'so-1', containerBreakdown, inapJobsCount: 1 })).toEqual(
      expect.objectContaining({ containerBreakdown, inapJobsCount: 1 }),
    );
  });
});

describe('validateInvoicePdfFile', () => {
  const MB = 1024 * 1024;
  function file(name, type, size) {
    const value = new File(['x'], name, { type });
    Object.defineProperty(value, 'size', { value: size });
    return value;
  }

  it('menerima PDF dokumen billing sampai 20 MB', () => {
    for (const size of [4 * MB, 12 * MB, 19 * MB, 20 * MB]) {
      expect(validateInvoicePdfFile(file('invoice.pdf', 'application/pdf', size), 'Invoice')).toBe('');
    }
    expect(INVOICE_DOCUMENT_UPLOAD_HINT).toBe('PDF, maksimal 20 MB');
  });

  it('menolak PDF di atas 20 MB dan file selain PDF', () => {
    expect(validateInvoicePdfFile(file('invoice.pdf', 'application/pdf', 20 * MB + 1), 'Invoice')).toBe('Invoice melebihi batas maksimal 20 MB.');
    expect(validateInvoicePdfFile(file('faktur.png', 'image/png', 1 * MB), 'Faktur Pajak')).toBe('Faktur Pajak hanya boleh berupa PDF.');
    expect(validateInvoicePdfFile(file('dn.exe', 'application/x-msdownload', 1 * MB), 'Dokumen Debit Note')).toBe('Dokumen Debit Note hanya boleh berupa PDF.');
  });
});
