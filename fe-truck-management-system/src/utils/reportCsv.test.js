import { describe, expect, it } from 'vitest';
import {
  buildReportExcelHtml,
  buildReportCsv,
  escapeCsvCell,
  getOperationalReportHeaders,
  getSalesReportHeaders,
  mapOperationalReportRow,
  mapSalesReportRow,
} from './reportCsv';

describe('reportCsv', () => {
  it('escape cell dengan koma, kutip, dan baris baru', () => {
    expect(escapeCsvCell('PT "Maju", Jaya\nBaru')).toBe('"PT ""Maju"", Jaya Baru"');
  });

  it('membuat CSV dengan metadata laporan dan header', () => {
    const csv = buildReportCsv({
      title: 'Sales Report',
      generatedAt: new Date('2026-06-24T02:00:00.000Z'),
      filters: [['Customer', 'PT Test']],
      headers: ['No', 'Customer'],
      rows: [[1, 'PT Test']],
    });

    expect(csv.split('\r\n')).toEqual([
      'sep=,',
      '"Laporan","Sales Report"',
      '"Tanggal Export","2026-06-24 02:00"',
      '"Customer","PT Test"',
      '',
      '"No","Customer"',
      '"1","PT Test"',
    ]);
  });

  it('membuat Excel HTML dengan title, styling, dan lebar kolom', () => {
    const html = buildReportExcelHtml({
      title: 'Sales Report',
      generatedAt: new Date('2026-06-24T02:00:00.000Z'),
      filters: [['Customer', 'PT Test']],
      headers: ['No', 'Tanggal SO', 'Customer'],
      rows: [[1, '2026-06-24', 'PT Test']],
    });

    expect(html).toContain('Sales Report');
    expect(html).toContain('Tanggal SO');
    expect(html).toContain('<col style="width:142px" />');
    expect(html).toContain('mso-number-format');
  });

  it('menyembunyikan kolom komersial Sales Report saat role tidak berhak', () => {
    expect(getSalesReportHeaders(false)).not.toContain('Total Nilai');
    expect(getSalesReportHeaders(true)).toContain('Total Nilai');

    const order = {
      soNumber: 'SO-001',
      doNumber: 'DO-001',
      soDate: '2026-06-24',
      receivedAt: '2026-06-24T09:30:00+07:00',
      customer: 'PT Test',
      origin: 'Jakarta',
      destination: 'Bandung',
      shipment: 'domestic',
      jobType: 'Trucking',
      containers: [{ id: 'job-1' }],
      quantity: 1,
      unit: 'Container',
      price: 1000,
      totalAmount: 1000,
      status: 'running',
      salesName: 'Sales',
    };

    expect(mapSalesReportRow(order, 0, false)).not.toContain(1000);
    expect(mapSalesReportRow(order, 0, true)).toContain(1000);
  });

  it('membuat baris Operational Report dengan status dan tanggal rapi', () => {
    const row = mapOperationalReportRow({
      soNumber: 'SO-001',
      containerNumber: 'CONT001',
      size: '20ft',
      type: 'Dry',
      customer: 'PT Test',
      origin: 'Jakarta',
      destination: 'Bandung',
      rpujStatus: 'approved',
      receivedAt: '2026-06-24T09:30:00+07:00',
      status: 'completed',
    }, 0);

    expect(getOperationalReportHeaders()).toContain('Nomor Container');
    expect(row).toContain('CONT001');
    expect(row).toContain('2026-06-24 09:30');
    expect(row).toContain('Selesai');
  });
});
