import { describe, expect, it } from 'vitest';
import { buildDriverPerformanceRows, buildMonthlyUtilizationPivot } from './ReportsPage';

describe('buildDriverPerformanceRows', () => {
  it('menggunakan monthlyTrips 0 tanpa jatuh ke totalTrips lama', () => {
    const rows = buildDriverPerformanceRows(
      [{ id: 'driver-1', name: 'Budi' }],
      [{ driver: 'Budi', monthlyTrips: 0, totalTrips: 12 }],
    );

    expect(rows).toEqual([
      {
        driver: 'Budi',
        totalTrips: 0,
      },
    ]);
  });

  it('tetap memakai monthlyTrips saat bernilai positif', () => {
    const rows = buildDriverPerformanceRows(
      [{ id: 'driver-1', name: 'Budi' }],
      [{ driver: 'Budi', monthlyTrips: 4, totalTrips: 12 }],
    );

    expect(rows).toEqual([
      {
        driver: 'Budi',
        totalTrips: 4,
      },
    ]);
  });
});

describe('buildMonthlyUtilizationPivot', () => {
  it('membuat kolom tanggal, total per truck, total harian, dan grand total', () => {
    const pivot = buildMonthlyUtilizationPivot(
      [
        { plateNumber: 'B 9102 BEL', defaultDriver: 'Asep' },
        { plateNumber: 'B 9103 BEL', defaultDriver: 'Budi' },
      ],
      [
        {
          plateNumber: 'B 9102 BEL',
          driver: 'Asep',
          completedAt: '2026-07-01T10:00:00.000Z',
          destination: 'Jakarta',
        },
        {
          plateNumber: 'B 9102 BEL',
          driver: 'Asep',
          completedAt: '2026-07-01T17:00:00.000Z',
          destination: 'Jakarta',
        },
        {
          plateNumber: 'B 9103 BEL',
          driver: 'Budi',
          completedAt: '2026-07-02',
          destination: 'Cilegon',
        },
      ],
      7,
      2026,
    );

    expect(pivot.days).toHaveLength(31);
    expect(pivot.rows.map((row) => row.plateNumber)).toEqual(['B 9102 BEL', 'B 9103 BEL']);
    expect(pivot.rows[0].cells['2026-07-01'].count).toBe(2);
    expect(pivot.rows[1].cells['2026-07-02'].labels).toEqual(['CILEGON']);
    expect(pivot.totalsByDay['2026-07-01']).toBe(2);
    expect(pivot.totalsByDay['2026-07-02']).toBe(1);
    expect(pivot.grandTotal).toBe(3);
  });
});
