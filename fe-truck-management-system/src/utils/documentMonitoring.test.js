import { describe, expect, it } from 'vitest';
import {
  buildDocumentMonitoringRows,
  daysUntilDate,
  hasMonitoringDocument,
  summarizeDocumentMonitoring,
} from './documentMonitoring';

describe('documentMonitoring', () => {
  it('menghitung dokumen yang kosong sebagai belum lengkap', () => {
    const rows = buildDocumentMonitoringRows({
      drivers: [{
        id: 'driver-1',
        nickname: 'Safei',
        driverPhoto: { path: 'photo-id' },
        identityDocument: '',
        licenseDocument: { id: 'sim-id' },
        partnershipLetter: null,
        licenseExpiry: '2026-09-15',
      }],
    }, new Date(2026, 6, 31));

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('incomplete');
    expect(rows[0].documentComplete).toBe(2);
    expect(rows[0].missingDocuments.map((item) => item.label)).toEqual(['KTP', 'Kemitraan']);
  });

  it('memprioritaskan tanggal OFF yang sudah lewat', () => {
    const rows = buildDocumentMonitoringRows({
      trucks: [{
        id: 'truck-1',
        plateNumber: 'B 1234 XYZ',
        kirDocument: { path: 'kir-id' },
        stnkDocument: { path: 'stnk-id' },
        stidDocument: { path: 'stid-id' },
        insuranceDocument: { path: 'insurance-id' },
        kirExpiryDate: '2026-07-30',
        stnkExpiryDate: '2026-08-20',
        stidExpiryDate: '2026-12-01',
        insuranceExpiryDate: '2027-01-01',
      }],
    }, new Date(2026, 6, 31));

    expect(rows[0].status).toBe('expired');
    expect(rows[0].expiredDates.map((item) => item.label)).toEqual(['KIR OFF']);
  });

  it('tidak menjadikan tanggal bayar pajak sebagai alarm OFF', () => {
    const rows = buildDocumentMonitoringRows({
      trucks: [{
        id: 'truck-1',
        plateNumber: 'B 1234 XYZ',
        kirDocument: { path: 'kir-id' },
        stnkDocument: { path: 'stnk-id' },
        stidDocument: { path: 'stid-id' },
        insuranceDocument: { path: 'insurance-id' },
        kirExpiryDate: '2027-07-30',
        stnkExpiryDate: '2027-08-20',
        stidExpiryDate: '2027-12-01',
        insuranceExpiryDate: '2028-01-01',
        taxPaymentDate: '2026-07-01',
      }],
    }, new Date(2026, 6, 31));

    expect(rows[0].status).toBe('complete');
    expect(rows[0].expiredDates).toHaveLength(0);
  });

  it('meringkas status monitoring', () => {
    const rows = buildDocumentMonitoringRows({
      customers: [
        {
          id: 'customer-1',
          name: 'PT A',
          npwpDocument: { path: 'npwp-id' },
          contractDocument: { path: 'contract-id' },
          contractEnd: '2026-08-10',
        },
        {
          id: 'customer-2',
          name: 'PT B',
          npwpDocument: '',
          contractDocument: '',
          contractEnd: '',
        },
      ],
    }, new Date(2026, 6, 31));

    expect(summarizeDocumentMonitoring(rows)).toEqual({
      total: 2,
      complete: 0,
      incomplete: 1,
      warning: 1,
      expired: 0,
    });
  });

  it('membaca dokumen object dan menghitung jarak hari', () => {
    expect(hasMonitoringDocument({ storagePath: 'Master/Data/file.pdf' })).toBe(true);
    expect(hasMonitoringDocument({})).toBe(false);
    expect(daysUntilDate('2026-08-02', new Date(2026, 6, 31))).toBe(2);
  });
});
