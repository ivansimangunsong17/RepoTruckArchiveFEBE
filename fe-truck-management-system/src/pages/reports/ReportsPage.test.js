import { describe, expect, it } from 'vitest';
import {
  buildDriverPerformanceRows,
  buildMonthlyUtilizationPivot,
  buildRepoMonitoringRows,
  buildTruckDayUtilizationSummary,
} from './ReportsPage';

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
        { plateNumber: 'B 9102 BEL', unitCode: 'TRK-102', defaultDriver: 'Asep' },
        { plateNumber: 'B 9103 BEL', unitCode: 'TRK-103', defaultDriver: 'Budi' },
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
      {
        '2026-07-17': [{ localName: 'Hari Contoh Nasional', name: 'Sample National Holiday' }],
      },
    );

    expect(pivot.days).toHaveLength(31);
    expect(pivot.days[0]).toMatchObject({
      weekdayLabel: 'Rabu',
      weekdayShort: 'Rab',
      isRedDate: false,
      fullLabel: 'Rabu, 01/07/2026',
    });
    expect(pivot.days[4]).toMatchObject({
      weekdayLabel: 'Minggu',
      weekdayShort: 'Min',
      isSunday: true,
      isRedDate: true,
      fullLabel: 'Minggu, 05/07/2026',
    });
    expect(pivot.days[16]).toMatchObject({
      weekdayLabel: 'Jumat',
      weekdayShort: 'Jum',
      isSunday: false,
      isRedDate: true,
      holidayLabel: 'Hari Contoh Nasional',
      fullLabel: 'Jumat, 17/07/2026 - Hari Contoh Nasional',
    });
    expect(pivot.rows.map((row) => row.plateNumber)).toEqual(['B 9102 BEL', 'B 9103 BEL']);
    expect(pivot.rows.map((row) => row.unitCode)).toEqual(['TRK-102', 'TRK-103']);
    expect(pivot.rows[0].cells['2026-07-01'].count).toBe(2);
    expect(pivot.rows[1].cells['2026-07-02'].labels).toEqual(['CILEGON']);
    expect(pivot.totalsByDay['2026-07-01']).toBe(2);
    expect(pivot.totalsByDay['2026-07-02']).toBe(1);
    expect(pivot.grandTotal).toBe(3);
  });
});

describe('buildTruckDayUtilizationSummary', () => {
  it('menghitung utilisasi truck-hari dari tanggal 1 sampai H-1', () => {
    const trucks = Array.from({ length: 10 }, (_, index) => ({
      id: `truck-${index + 1}`,
      plateNumber: `B 91${String(index + 1).padStart(2, '0')} BEL`,
      unitCode: `TRK-${String(index + 1).padStart(3, '0')}`,
      status: 'Aktif',
    }));
    const rows = [
      ...trucks.map((truck) => ({
        vehicleId: truck.id,
        plateNumber: truck.plateNumber,
        completedAt: '2026-07-01T10:00:00.000Z',
        status: 'completed',
      })),
      ...trucks.slice(0, 8).map((truck) => ({
        vehicleId: truck.id,
        plateNumber: truck.plateNumber,
        completedAt: '2026-07-02T10:00:00.000Z',
        status: 'completed',
      })),
      {
        vehicleId: 'truck-1',
        plateNumber: trucks[0].plateNumber,
        completedAt: '2026-07-01T15:00:00.000Z',
        status: 'completed',
      },
      {
        vehicleId: 'truck-9',
        plateNumber: trucks[8].plateNumber,
        completedAt: '2026-07-02T15:00:00.000Z',
        status: 'cancelled',
      },
      {
        vehicleId: 'truck-maintenance',
        plateNumber: 'B 9999 MTN',
        completedAt: '2026-07-01T15:00:00.000Z',
        status: 'completed',
      },
    ];

    const summary = buildTruckDayUtilizationSummary(
      [...trucks, { id: 'truck-maintenance', plateNumber: 'B 9999 MTN', unitCode: 'TRK-999', status: 'Maintenance' }],
      rows,
      7,
      2026,
      new Date('2026-07-03T08:00:00.000Z'),
    );

    expect(summary.period).toMatchObject({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-02',
      days: 2,
    });
    expect(summary.activeTruckCount).toBe(10);
    expect(summary.realizedTruckDays).toBe(18);
    expect(summary.potentialTruckDays).toBe(20);
    expect(summary.utilizationPercent).toBe(90);
    expect(summary.rows[0].activeTruckDays).toBe(2);
    expect(summary.rows.find((truck) => truck.id === 'truck-9').activeTruckDays).toBe(1);
  });

  it('menghasilkan 0 persen saat hari ini tanggal 1', () => {
    const summary = buildTruckDayUtilizationSummary(
      [{ id: 'truck-1', plateNumber: 'B 9101 BEL', unitCode: 'TRK-001', status: 'Aktif' }],
      [{ vehicleId: 'truck-1', plateNumber: 'B 9101 BEL', completedAt: '2026-07-01T10:00:00.000Z', status: 'completed' }],
      7,
      2026,
      new Date('2026-07-01T08:00:00.000Z'),
    );

    expect(summary.period.days).toBe(0);
    expect(summary.realizedTruckDays).toBe(0);
    expect(summary.potentialTruckDays).toBe(0);
    expect(summary.utilizationPercent).toBe(0);
  });

  it('menghasilkan 100 persen untuk truck yang jalan minimal sekali setiap hari periode', () => {
    const summary = buildTruckDayUtilizationSummary(
      [{ id: 'truck-1', plateNumber: 'B 9101 BEL', unitCode: 'TRK-001', status: 'Aktif' }],
      [
        { vehicleId: 'truck-1', plateNumber: 'B 9101 BEL', completedAt: '2026-07-01T10:00:00.000Z', status: 'completed' },
        { vehicleId: 'truck-1', plateNumber: 'B 9101 BEL', completedAt: '2026-07-02T10:00:00.000Z', status: 'completed' },
        { vehicleId: 'truck-1', plateNumber: 'B 9101 BEL', completedAt: '2026-07-03T10:00:00.000Z', status: 'completed' },
      ],
      7,
      2026,
      new Date('2026-07-04T08:00:00.000Z'),
    );

    expect(summary.period.days).toBe(3);
    expect(summary.realizedTruckDays).toBe(3);
    expect(summary.potentialTruckDays).toBe(3);
    expect(summary.utilizationPercent).toBe(100);
    expect(summary.rows[0]).toMatchObject({
      activeTruckDays: 3,
      targetTruckDays: 3,
      utilizationPercent: 100,
    });
  });
});

describe('buildRepoMonitoringRows', () => {
  it('hanya menampilkan repo_stored dan mengurutkan titipan paling lama', () => {
    const rows = buildRepoMonitoringRows([
      { id: 'new', status: 'repo_stored', containerNumber: 'CONT-NEW', repoStoredAt: '2026-07-22T10:00:00.000Z' },
      { id: 'done', status: 'completed', containerNumber: 'CONT-DONE', repoStoredAt: '2026-07-18T10:00:00.000Z' },
      { id: 'old', status: 'repo_stored', containerNumber: 'CONT-OLD', repoStoredAt: '2026-07-19T10:00:00.000Z' },
    ], new Date('2026-07-23T08:00:00.000Z'));

    expect(rows.map((row) => row.id)).toEqual(['old', 'new']);
    expect(rows[0].ageDays).toBe(4);
    expect(rows[1].ageDays).toBe(1);
  });
});
