import { describe, expect, it } from 'vitest';
import { buildDriverPerformanceRows } from './ReportsPage';

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
