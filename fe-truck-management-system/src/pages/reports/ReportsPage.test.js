import { describe, expect, it } from 'vitest';
import {
  buildCommissionWeekOptions,
  buildDriverPerformanceRows,
  buildMonthlyCustomerTruckPivot,
  buildMonthlyDriverUtilizationPivot,
  buildMonthlyUtilizationPivot,
  buildRepoMonitoringRows,
  buildTruckDayUtilizationSummary,
} from './ReportsPage';

describe('buildCommissionWeekOptions', () => {
  it('membuat periode komisi Kamis sampai Rabu yang beririsan dengan bulan', () => {
    const options = buildCommissionWeekOptions(8, 2026);

    expect(options[0]).toMatchObject({ value: 'all' });
    expect(options[1]).toMatchObject({
      from: '2026-07-30',
      to: '2026-08-05',
    });
    expect(options[2]).toMatchObject({
      from: '2026-08-06',
      to: '2026-08-12',
    });
  });
});

describe('buildDriverPerformanceRows', () => {
  it('menggunakan monthlyTrips 0 tanpa jatuh ke totalTrips lama', () => {
    const rows = buildDriverPerformanceRows(
      [{ id: 'driver-1', name: 'Budi' }],
      [{ driverId: 'driver-1', driver: 'Budi', monthlyTrips: 0, totalTrips: 12 }],
    );

    // 0 trip di periode ini -> baris disembunyikan, bukan tampil dengan 12 trip lama.
    expect(rows).toEqual([]);
  });

  it('tetap memakai monthlyTrips saat bernilai positif', () => {
    const rows = buildDriverPerformanceRows(
      [{ id: 'driver-1', name: 'Budi' }],
      [{ driverId: 'driver-1', driver: 'Budi', monthlyTrips: 4, totalTrips: 12 }],
    );

    expect(rows).toEqual([
      {
        driverId: 'driver-1',
        driver: 'Budi',
        totalTrips: 4,
        totalRevenue: 0,
        totalDriverCommission: 0,
        paidDriverCommission: 0,
        unpaidDriverCommission: 0,
        averageRevenuePerTrip: 0,
        averageCommissionPerTrip: 0,
      },
    ]);
  });

  it('menyertakan total revenue, komisi, dan rata-rata per trip', () => {
    const rows = buildDriverPerformanceRows(
      [{ id: 'driver-1', name: 'Budi' }, { id: 'driver-2', name: 'Agus' }],
      [
        { driverId: 'driver-1', driver: 'Budi', monthlyTrips: 2, totalRevenue: 6000000, totalDriverCommission: 100000, averageRevenuePerTrip: 3000000, averageCommissionPerTrip: 50000 },
        { driverId: 'driver-2', driver: 'Agus', monthlyTrips: 3, totalRevenue: 4500000, totalDriverCommission: 120000, averageRevenuePerTrip: 1500000 },
      ],
    );

    expect(rows).toEqual([
      {
        driverId: 'driver-1',
        driver: 'Budi',
        totalTrips: 2,
        totalRevenue: 6000000,
        totalDriverCommission: 100000,
        paidDriverCommission: 0,
        unpaidDriverCommission: 0,
        averageRevenuePerTrip: 3000000,
        averageCommissionPerTrip: 50000,
      },
      {
        driverId: 'driver-2',
        driver: 'Agus',
        totalTrips: 3,
        totalRevenue: 4500000,
        totalDriverCommission: 120000,
        paidDriverCommission: 0,
        unpaidDriverCommission: 0,
        averageRevenuePerTrip: 1500000,
        averageCommissionPerTrip: 40000,
      },
    ]);
  });
});

describe('buildDriverPerformanceRows identitas sopir', () => {
  it('memakai nama master terkini untuk driver_id yang sama walau API membawa nama lama', () => {
    const rows = buildDriverPerformanceRows(
      [{ id: 'drv-1', name: 'DRIVER ABCD' }],
      [{ driverId: 'drv-1', driver: 'DRIVER ABC', monthlyTrips: 5, totalRevenue: 5000000 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ driverId: 'drv-1', driver: 'DRIVER ABCD', totalTrips: 5, totalRevenue: 5000000 });
  });

  it('dua sopir berbeda dengan nama sama tetap dua baris', () => {
    const rows = buildDriverPerformanceRows(
      [{ id: 'drv-1', name: 'BUDI' }, { id: 'drv-2', name: 'BUDI' }],
      [
        { driverId: 'drv-1', driver: 'BUDI', monthlyTrips: 1 },
        { driverId: 'drv-2', driver: 'BUDI', monthlyTrips: 2 },
      ],
    );
    expect(rows.map((row) => [row.driverId, row.totalTrips]).sort()).toEqual([['drv-1', 1], ['drv-2', 2]]);
  });
});

describe('buildDriverPerformanceRows hanya sopir dengan trip', () => {
  const masters = [
    { id: 'drv-1', name: 'BUDI' },
    { id: 'drv-2', name: 'AGUS' },
    { id: 'drv-3', name: 'SITI' },
  ];
  const performance = [
    { driverId: 'drv-1', driver: 'BUDI', monthlyTrips: 3, totalRevenue: 3000000, totalDriverCommission: 150000, paidDriverCommission: 50000, unpaidDriverCommission: 100000 },
    { driverId: 'drv-2', driver: 'AGUS', monthlyTrips: 1, totalRevenue: 1000000, totalDriverCommission: 50000, unpaidDriverCommission: 50000 },
    { driverId: null, driver: 'SOPIR LAMA', monthlyTrips: 2, totalRevenue: 2000000, totalDriverCommission: 80000, paidDriverCommission: 80000 },
  ];
  const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);

  it('menampilkan sopir dengan trip dan menyembunyikan sopir master tanpa trip', () => {
    const rows = buildDriverPerformanceRows(masters, performance);
    expect(rows.map((row) => row.driver).sort()).toEqual(['AGUS', 'BUDI', 'SOPIR LAMA']);
    expect(rows.some((row) => row.driverId === 'drv-3')).toBe(false);
    expect(rows.every((row) => row.totalTrips > 0)).toBe(true);
  });

  it('total trip, revenue, dan komisi tidak berubah setelah filter', () => {
    const rows = buildDriverPerformanceRows(masters, performance);
    expect(sum(rows, 'totalTrips')).toBe(6);
    expect(sum(rows, 'totalRevenue')).toBe(sum(performance, 'totalRevenue'));
    expect(sum(rows, 'totalDriverCommission')).toBe(sum(performance, 'totalDriverCommission'));
    expect(sum(rows, 'paidDriverCommission')).toBe(sum(performance, 'paidDriverCommission'));
    expect(sum(rows, 'unpaidDriverCommission')).toBe(sum(performance, 'unpaidDriverCommission'));
  });

  it('baris lama tanpa driver_id yang punya trip tetap tampil', () => {
    const rows = buildDriverPerformanceRows(masters, performance);
    expect(rows.find((row) => row.driver === 'SOPIR LAMA')).toMatchObject({ driverId: null, totalTrips: 2, totalRevenue: 2000000 });
  });

  it('sopir yang namanya diganti tetap satu baris setelah filter', () => {
    const rows = buildDriverPerformanceRows(
      [{ id: 'drv-1', name: 'DRIVER ABCD' }, { id: 'drv-2', name: 'TANPA TRIP' }],
      [{ driverId: 'drv-1', driver: 'DRIVER ABC', monthlyTrips: 3, totalRevenue: 3000000 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ driverId: 'drv-1', driver: 'DRIVER ABCD', totalTrips: 3 });
  });
});

describe('buildMonthlyUtilizationPivot', () => {
  it('membuat kolom tanggal, total per truck, total harian, dan grand total', () => {
    const pivot = buildMonthlyUtilizationPivot(
      [
        { plateNumber: 'B 9102 BEL', unitCode: 'TRK-102', capacity: '40FT', defaultDriver: 'Asep' },
        { plateNumber: 'B 9103 BEL', unitCode: 'TRK-103', capacity: '20FT', defaultDriver: 'Budi' },
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
          completedAt: '2026-07-01T10:00:00.000Z',
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
    expect(pivot.rows.map((row) => row.plateNumber)).toEqual(['B 9103 BEL', 'B 9102 BEL']);
    expect(pivot.rows.map((row) => row.unitCode)).toEqual(['TRK-103', 'TRK-102']);
    expect(pivot.rows.map((row) => row.size)).toEqual(['20FT', '40FT']);
    expect(pivot.rows[1].cells['2026-07-01'].count).toBe(2);
    expect(pivot.rows[0].cells['2026-07-02'].labels).toEqual(['CILEGON']);
    expect(pivot.totalsByDay['2026-07-01']).toBe(2);
    expect(pivot.totalsByDay['2026-07-02']).toBe(1);
    expect(pivot.grandTotal).toBe(3);
  });

  it('menempatkan timestamp UTC ke tanggal selesai WIB pada pivot utilisasi', () => {
    const pivot = buildMonthlyUtilizationPivot(
      [{ id: 'truck-1', plateNumber: 'B 9102 BEL', unitCode: 'TRK-102', capacity: '40FT' }],
      [
        {
          vehicleId: 'truck-1',
          plateNumber: 'B 9102 BEL',
          completedAt: '2026-08-02T17:00:00.000Z',
          destination: 'Jakarta',
          status: 'completed',
        },
      ],
      8,
      2026,
    );

    expect(pivot.rows[0].cells['2026-08-02'].count).toBe(0);
    expect(pivot.rows[0].cells['2026-08-03'].count).toBe(1);
    expect(pivot.totalsByDay['2026-08-03']).toBe(1);
  });

  it('tidak menandai INAP hanya karena durasi ritasi lebih dari 24 jam', () => {
    const pivot = buildMonthlyUtilizationPivot(
      [{ id: 'truck-1', plateNumber: 'B 9102 BEL', unitCode: 'TRK-102', capacity: '40FT' }],
      [
        {
          vehicleId: 'truck-1',
          plateNumber: 'B 9102 BEL',
          runningAt: '2026-07-11T07:00:00',
          completedAt: '2026-07-12T08:30:00',
          destination: 'Cilegon',
          status: 'completed',
        },
      ],
      7,
      2026,
    );

    expect(pivot.rows[0].cells['2026-07-11'].count).toBe(0);
    expect(pivot.rows[0].cells['2026-07-11'].autoNote).toBeNull();
    expect(pivot.rows[0].cells['2026-07-12'].count).toBe(1);
    expect(pivot.rows[0].totalTrips).toBe(1);
    expect(pivot.grandTotal).toBe(1);
  });

  it('menandai INAP pada pivot jika ritasi punya histori inap dari Operational', () => {
    const pivot = buildMonthlyUtilizationPivot(
      [{ id: 'truck-1', plateNumber: 'B 9102 BEL', unitCode: 'TRK-102', capacity: '40FT' }],
      [
        {
          vehicleId: 'truck-1',
          plateNumber: 'B 9102 BEL',
          runningAt: '2026-07-11T07:00:00',
          completedAt: '2026-07-12T08:30:00',
          inapStartedAt: '2026-07-11T20:00:00',
          inapEndedAt: '2026-07-12T06:00:00',
          inapReason: 'Curfew malam, truk tidak boleh jalan sampai subuh',
          destination: 'Cilegon',
          status: 'completed',
        },
      ],
      7,
      2026,
    );

    expect(pivot.rows[0].cells['2026-07-11'].autoNote).toMatchObject({ reasonLabel: 'INAP' });
    expect(pivot.rows[0].cells['2026-07-12'].count).toBe(1);
  });

  it('menampilkan unit yang pindah chassis sebagai dua baris sesuai periode aktif', () => {
    const pivot = buildMonthlyUtilizationPivot(
      [
        { id: 'truck-9211', plateNumber: 'B 9211 BEL', unitCode: '11', capacity: '40FT' },
        { id: 'truck-9130', plateNumber: 'B 9130 BEL', unitCode: '30', capacity: '20FT' },
      ],
      [
        {
          id: 'job-1',
          vehicleId: 'truck-9211',
          plateNumber: 'B 9211 BEL',
          chassisSize: '40FT',
          completedDate: '2026-08-06',
          destination: 'Cikarang',
          status: 'completed',
        },
        {
          id: 'job-2',
          vehicleId: 'truck-9211',
          plateNumber: 'B 9211 BEL',
          originalChassisSize: '40FT',
          chassisSize: '20FT',
          completedDate: '2026-08-20',
          destination: 'Cikarang',
          status: 'completed',
          utilizationChassisCorrection: {
            sourcePlateNumber: 'B 9211 BEL',
            sourceChassisSize: '40FT',
            targetPlateNumber: 'B 9103 BEL',
            targetChassisSize: '20FT',
            effectiveFrom: '2026-08-08',
            effectiveTo: '2026-08-31',
            reason: 'Tukar chassis tengah bulan',
          },
        },
      ],
      8,
      2026,
    );

    const before = pivot.rows.find((row) => row.plateNumber === 'B 9211 BEL' && row.size === '40FT');
    const after = pivot.rows.find((row) => row.plateNumber === 'B 9211 BEL' && row.size === '20FT');

    expect(before.segmentBadge).toBe('s.d. 7 Agu');
    expect(after.segmentBadge).toBe('Mulai 8 Agu');
    expect(before.cells['2026-08-06'].count).toBe(1);
    expect(before.cells['2026-08-20'].inactive).toBe(true);
    expect(after.cells['2026-08-06'].inactive).toBe(true);
    expect(after.cells['2026-08-20'].count).toBe(1);
    expect(after.cells['2026-08-20'].correctedCount).toBe(1);
    expect(after.cells['2026-08-20'].corrections[0]).toMatchObject({
      sourcePlateNumber: 'B 9211 BEL',
      targetChassisSize: '20FT',
      reason: 'Tukar chassis tengah bulan',
    });
    expect(pivot.transitions[0]).toMatchObject({
      plateNumber: 'B 9211 BEL',
      sourceSize: '40FT',
      targetSize: '20FT',
      effectiveFrom: '2026-08-08',
    });
    expect(pivot.grandTotal).toBe(2);
  });
});

describe('buildMonthlyCustomerTruckPivot', () => {
  it('membuat pivot truck per customer pada bulan terpilih', () => {
    const pivot = buildMonthlyCustomerTruckPivot(
      [
        {
          customerName: 'PT A',
          vehicleId: 'truck-1',
          plateNumber: 'B 9102 BEL',
          unitCode: 'TRK-102',
          chassisSize: '40FT',
          completedAt: '2026-07-01T10:00:00.000Z',
          destination: 'Cikarang',
          status: 'completed',
        },
        {
          customerName: 'PT A',
          vehicleId: 'truck-2',
          plateNumber: 'B 9103 BEL',
          unitCode: 'TRK-103',
          chassisSize: '20FT',
          completedAt: '2026-07-02',
          destination: 'Cilegon',
          status: 'completed',
        },
        {
          customerName: 'PT B',
          vehicleId: 'truck-1',
          plateNumber: 'B 9102 BEL',
          unitCode: 'TRK-102',
          chassisSize: '40FT',
          completedAt: '2026-07-01T11:00:00.000Z',
          destination: 'Bekasi',
          status: 'completed',
        },
      ],
      7,
      2026,
      {},
      [
        { id: 'truck-1', plateNumber: 'B 9102 BEL', unitCode: 'TRK-102', capacity: '40FT' },
        { id: 'truck-2', plateNumber: 'B 9103 BEL', unitCode: 'TRK-103', capacity: '20FT' },
        { id: 'truck-3', plateNumber: 'B 9104 BEL', unitCode: 'TRK-104', capacity: '40FT' },
      ],
    );

    expect(pivot.customers.map((customer) => customer.customerName)).toEqual(['PT A', 'PT B']);
    expect(pivot.customers[0].grandTotal).toBe(2);
    expect(pivot.customers[0].rows.map((truck) => truck.plateNumber)).toEqual(['B 9103 BEL', 'B 9102 BEL', 'B 9104 BEL']);
    expect(pivot.customers[0].rows[1].cells['2026-07-01'].count).toBe(1);
    expect(pivot.customers[0].rows[0].cells['2026-07-02'].labels).toEqual(['CILEGON']);
    expect(pivot.customers[0].rows[2].totalTrips).toBe(0);
    expect(pivot.customers[1].rows).toHaveLength(3);
    expect(pivot.customers[0].totalsByDay['2026-07-01']).toBe(1);
    expect(pivot.customers[0].totalsByDay['2026-07-02']).toBe(1);
    expect(pivot.grandTotal).toBe(3);
  });
});

describe('buildMonthlyDriverUtilizationPivot', () => {
  it('membuat pivot utilisasi sopir per tanggal', () => {
    const pivot = buildMonthlyDriverUtilizationPivot(
      [
        { id: 'driver-1', name: 'Budi' },
        { id: 'driver-2', name: 'Agus' },
      ],
      [
        { driverId: 'driver-1', driver: 'Budi', completedAt: '2026-07-01T10:00:00.000Z', destination: 'Jakarta', status: 'completed' },
        { driverId: 'driver-1', driver: 'Budi', completedAt: '2026-07-01T16:00:00.000Z', destination: 'Bekasi', status: 'completed' },
        { driverId: 'driver-2', driver: 'Agus', completedDate: '2026-07-02', destination: 'Cilegon', status: 'completed' },
        { driverId: 'driver-2', driver: 'Agus', completedDate: '2026-07-02', destination: 'Cilegon', status: 'cancelled' },
      ],
      7,
      2026,
      {
        '2026-07-17': [{ localName: 'Hari Contoh Nasional', name: 'Sample National Holiday' }],
      },
    );

    expect(pivot.days).toHaveLength(31);
    expect(pivot.days[16]).toMatchObject({
      isRedDate: true,
      holidayLabel: 'Hari Contoh Nasional',
    });
    expect(pivot.rows.map((row) => row.driver)).toEqual(['Budi', 'Agus']);
    expect(pivot.rows[0].cells['2026-07-01'].count).toBe(2);
    expect(pivot.rows[1].cells['2026-07-02'].count).toBe(1);
    expect(pivot.totalsByDay['2026-07-01']).toBe(2);
    expect(pivot.totalsByDay['2026-07-02']).toBe(1);
    expect(pivot.grandTotal).toBe(3);
  });
});

describe('buildMonthlyDriverUtilizationPivot identitas sopir', () => {
  const masters = [{ id: 'drv-1', name: 'DRIVER ABCD' }, { id: 'drv-2', name: 'SITI' }];

  it('nama sopir diganti di tengah bulan tetap satu baris dengan nama master terkini', () => {
    const pivot = buildMonthlyDriverUtilizationPivot(masters, [
      { driverId: 'drv-1', driver: 'DRIVER ABC', completedDate: '2026-09-03', status: 'completed' },
      { driverId: 'drv-1', driver: 'DRIVER ABC', completedDate: '2026-09-12', status: 'completed' },
      { driverId: 'drv-1', driver: 'DRIVER ABCD', completedDate: '2026-09-20', status: 'completed' },
      { driverId: 'drv-2', driver: 'SITI', completedDate: '2026-09-20', status: 'completed' },
    ], 9, 2026);

    const abcd = pivot.rows.filter((row) => row.driverId === 'drv-1');
    expect(abcd).toHaveLength(1);
    expect(abcd[0].driver).toBe('DRIVER ABCD');
    expect(abcd[0].totalTrips).toBe(3);
    expect(abcd[0].cells['2026-09-03'].count).toBe(1);
    expect(abcd[0].cells['2026-09-20'].count).toBe(1);
    expect(pivot.rows.some((row) => row.driver === 'DRIVER ABC')).toBe(false);
    expect(pivot.grandTotal).toBe(4);
    expect(pivot.totalsByDay['2026-09-20']).toBe(2);
  });

  it('dua driver_id berbeda dengan nama snapshot sama tidak digabung', () => {
    const pivot = buildMonthlyDriverUtilizationPivot([], [
      { driverId: 'drv-7', driver: 'BUDI', completedDate: '2026-09-05', status: 'completed' },
      { driverId: 'drv-8', driver: 'BUDI', completedDate: '2026-09-05', status: 'completed' },
    ], 9, 2026);
    expect(pivot.rows).toHaveLength(2);
    expect(pivot.grandTotal).toBe(2);
  });

  it('sopir yang tidak ada di master memakai nama snapshot terbaru', () => {
    const pivot = buildMonthlyDriverUtilizationPivot([], [
      { driverId: 'drv-9', driver: 'NAMA BARU', completedDate: '2026-09-25', status: 'completed' },
      { driverId: 'drv-9', driver: 'NAMA LAMA', completedDate: '2026-09-02', status: 'completed' },
    ], 9, 2026);
    expect(pivot.rows).toHaveLength(1);
    expect(pivot.rows[0]).toMatchObject({ driver: 'NAMA BARU', totalTrips: 2 });
  });
});

describe('buildMonthlyDriverUtilizationPivot hanya sopir dengan ritasi', () => {
  const masters = [
    { id: 'drv-1', name: 'DRIVER ABCD' },
    { id: 'drv-2', name: 'SITI' },
    { id: 'drv-3', name: 'TANPA RITASI' },
    { id: 'drv-4', name: 'HANYA BATAL' },
  ];
  const jobs = [
    { driverId: 'drv-1', driver: 'DRIVER ABC', completedDate: '2026-09-03', status: 'completed' },
    { driverId: 'drv-1', driver: 'DRIVER ABCD', completedDate: '2026-09-20', status: 'completed' },
    { driverId: 'drv-2', driver: 'SITI', completedDate: '2026-09-20', status: 'completed' },
    { driverId: 'drv-4', driver: 'HANYA BATAL', completedDate: '2026-09-21', status: 'cancelled' },
    { driverId: 'drv-2', driver: 'SITI', completedDate: '2026-08-31', status: 'completed' },
    { driver: 'SOPIR LAMA', completedDate: '2026-09-20', status: 'completed' },
  ];

  it('menyembunyikan sopir dengan total ritasi 0 di bulan terpilih', () => {
    const pivot = buildMonthlyDriverUtilizationPivot(masters, jobs, 9, 2026);
    expect(pivot.rows.map((row) => row.driver)).toEqual(['DRIVER ABCD', 'SITI', 'SOPIR LAMA']);
    expect(pivot.rows.every((row) => row.totalTrips > 0)).toBe(true);
  });

  it('grand total dan total harian tidak berubah setelah filter', () => {
    const pivot = buildMonthlyDriverUtilizationPivot(masters, jobs, 9, 2026);
    expect(pivot.grandTotal).toBe(4);
    expect(pivot.totalsByDay['2026-09-03']).toBe(1);
    expect(pivot.totalsByDay['2026-09-20']).toBe(3);
    expect(pivot.totalsByDay['2026-09-21']).toBe(0);
    expect(pivot.days).toHaveLength(30);
  });

  it('baris lama tanpa driver_id yang punya ritasi tetap tampil', () => {
    const pivot = buildMonthlyDriverUtilizationPivot(masters, jobs, 9, 2026);
    expect(pivot.rows.find((row) => row.driver === 'SOPIR LAMA')).toMatchObject({ driverId: null, totalTrips: 1 });
  });

  it('tanpa ritasi sama sekali menghasilkan pivot kosong dengan total 0', () => {
    const pivot = buildMonthlyDriverUtilizationPivot(masters, [], 9, 2026);
    expect(pivot.rows).toEqual([]);
    expect(pivot.grandTotal).toBe(0);
  });
});

describe('buildTruckDayUtilizationSummary', () => {
  it('memisahkan utilisasi unit aktif dan seluruh armada', () => {
    const trucks = [
      { id: 'active-1', plateNumber: 'B 9101 ACT', status: 'Aktif' },
      { id: 'maintenance-1', plateNumber: 'B 9102 MTN', status: 'Maintenance' },
      { id: 'inactive-1', plateNumber: 'B 9103 OFF', status: 'Tidak Aktif' },
      { id: 'archived-1', plateNumber: 'B 9104 ARC', status: 'Arsip' },
    ];
    const rows = [{
      vehicleId: 'active-1',
      plateNumber: 'B 9101 ACT',
      completedAt: '2026-07-01T10:00:00.000Z',
      status: 'completed',
    }];
    const baseDate = new Date('2026-07-02T08:00:00.000Z');

    const active = buildTruckDayUtilizationSummary(trucks, rows, 7, 2026, baseDate);
    const fleet = buildTruckDayUtilizationSummary(trucks, rows, 7, 2026, baseDate, { includeUnavailable: true });

    expect(active.activeTruckCount).toBe(1);
    expect(active.utilizationPercent).toBe(100);
    expect(fleet.activeTruckCount).toBe(3);
    expect(fleet.utilizationPercent).toBeCloseTo(33.333, 2);
    expect(fleet.rows.map((truck) => truck.id)).toEqual(expect.arrayContaining(['active-1', 'maintenance-1', 'inactive-1']));
    expect(fleet.rows.find((truck) => truck.id === 'archived-1')).toBeUndefined();
  });

  it('menghitung utilisasi dari jumlah trip terhadap target 1 trip per truck per hari', () => {
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
    expect(summary.utilizationPercent).toBe(95);
    expect(summary.rows[0].totalTrips).toBe(3);
    expect(summary.rows[0].activeTruckDays).toBe(2);
    expect(summary.rows[0].utilizationPercent).toBe(150);
    expect(summary.rows.find((truck) => truck.id === 'truck-9').activeTruckDays).toBe(1);
  });

  it('menghitung active truck day memakai tanggal selesai WIB dari timestamp UTC', () => {
    const summary = buildTruckDayUtilizationSummary(
      [{ id: 'truck-1', plateNumber: 'B 9101 BEL', unitCode: 'TRK-001', status: 'Aktif' }],
      [
        {
          vehicleId: 'truck-1',
          plateNumber: 'B 9101 BEL',
          completedAt: '2026-08-02T17:00:00.000Z',
          status: 'completed',
        },
      ],
      8,
      2026,
      new Date('2026-08-04T08:00:00.000Z'),
    );

    expect(summary.period.days).toBe(3);
    expect(summary.realizedTruckDays).toBe(1);
    expect(summary.rows[0].totalTrips).toBe(1);
    expect(summary.rows[0].activeTruckDays).toBe(1);
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

  it('bisa menghasilkan lebih dari 100 persen saat trip melebihi jumlah hari periode', () => {
    const summary = buildTruckDayUtilizationSummary(
      [{ id: 'truck-1', plateNumber: 'B 9101 BEL', unitCode: 'TRK-001', status: 'Aktif' }],
      [
        { vehicleId: 'truck-1', plateNumber: 'B 9101 BEL', completedAt: '2026-07-01T10:00:00.000Z', status: 'completed' },
        { vehicleId: 'truck-1', plateNumber: 'B 9101 BEL', completedAt: '2026-07-01T15:00:00.000Z', status: 'completed' },
        { vehicleId: 'truck-1', plateNumber: 'B 9101 BEL', completedAt: '2026-07-02T10:00:00.000Z', status: 'completed' },
      ],
      7,
      2026,
      new Date('2026-07-03T08:00:00.000Z'),
    );

    expect(summary.period.days).toBe(2);
    expect(summary.realizedTruckDays).toBe(2);
    expect(summary.potentialTruckDays).toBe(2);
    expect(summary.utilizationPercent).toBe(150);
    expect(summary.rows[0]).toMatchObject({
      totalTrips: 3,
      activeTruckDays: 2,
      targetTruckDays: 2,
      utilizationPercent: 150,
    });
  });
});

describe('buildMonthlyUtilizationPivot historical chassis', () => {
  const trips = [
    { id: 'j21', vehicleId: 't1', plateNumber: 'B 9103 BEL', chassisSize: '20FT', completedAt: '2026-09-21T16:59:59Z', status: 'completed', customer: 'PT A' },
    { id: 'j22', vehicleId: 't1', plateNumber: 'B 9103 BEL', chassisSize: '40FT', completedAt: '2026-09-21T17:00:00Z', status: 'completed', customer: 'PT A' },
  ];
  const truck = { id: 't1', plateNumber: 'B 9103 BEL', capacity: '40FT', status: 'Aktif' };
  it.each([{ masters: [] }, { masters: [truck] }, { masters: [{ ...truck, capacity: '' }] }])('groups from historical size with masters $masters', ({ masters }) => {
    const pivot = buildMonthlyUtilizationPivot(masters, trips, 9, 2026);
    expect(pivot.rows.map(row => [row.size, row.totalTrips])).toEqual([['20FT', 1], ['40FT', 1]]);
    expect(pivot.totalsByDay['2026-09-21']).toBe(1);
    expect(pivot.totalsByDay['2026-09-22']).toBe(1);
    expect(pivot.grandTotal).toBe(2);
  });

  it('keeps one unit and unchanged target/percentage across split configurations and duplicate jobs', () => {
    const summary = buildTruckDayUtilizationSummary([truck, truck], [...trips, trips[0]], 9, 2026, new Date('2026-10-01T08:00:00Z'));
    expect(summary).toMatchObject({ totalTrips: 2, activeTruckCount: 1, potentialTruckDays: 30, realizedTruckDays: 2 });
    const unsplit = buildTruckDayUtilizationSummary([truck], trips.map(row => ({ ...row, chassisSize: '40FT' })), 9, 2026, new Date('2026-10-01T08:00:00Z'));
    expect(summary.utilizationPercent).toBe(unsplit.utilizationPercent);
    expect(buildMonthlyUtilizationPivot([truck], [...trips, trips[0]], 9, 2026).grandTotal).toBe(2);
  });

  it('customer pivot shows two configurations but one unit', () => {
    const pivot = buildMonthlyCustomerTruckPivot([...trips, trips[0]], 9, 2026, {}, [truck]);
    expect(pivot.customers[0].unitCount).toBe(1);
    expect(pivot.customers[0].rows.map(row => [row.size, row.totalTrips])).toEqual([['20FT', 1], ['40FT', 1]]);
    expect(pivot.grandTotal).toBe(2);
  });

  it('does not infer chassis from container or current master after a detach', () => {
    const rows = [{ ...trips[0], chassisSize: '', chassisSource: 'history_before', size: '20FT' }];
    const pivot = buildMonthlyUtilizationPivot([truck], rows, 9, 2026);
    expect(pivot.rows).toHaveLength(1);
    expect(pivot.rows[0].size).toBe('');
    expect(buildMonthlyCustomerTruckPivot(rows, 9, 2026).customers[0].rows[0].size).toBe('');
  });

  it('manual correction does not reclassify trips outside its effective period', () => {
    const correction = { sourceChassisSize: '20FT', targetChassisSize: '40FT', effectiveFrom: '2026-09-22', effectiveTo: '2026-09-23' };
    const rows = [trips[0], { ...trips[1], utilizationChassisCorrection: correction },
      { ...trips[0], id: 'j24', completedAt: '2026-09-24T08:00:00+07:00' }];
    const pivot = buildMonthlyUtilizationPivot([truck], rows, 9, 2026);
    expect(pivot.rows.map(row => [row.size, row.totalTrips])).toEqual([['20FT', 2], ['40FT', 1]]);
    expect(pivot.rows[0].cells['2026-09-24'].count).toBe(1);
    expect(pivot.rows[0].cells['2026-09-25'].inactive).toBe(false);
    expect(pivot.rows[1].cells['2026-09-24'].count).toBe(0);
  });

  it('memisahkan ukuran chassis historis tanpa menggandakan unit', () => {
    const pivot = buildMonthlyUtilizationPivot(
      [{ id: 'truck-1', plateNumber: 'B 9103 BEL', unitCode: 'TRK-001', capacity: '40FT' }],
      [
        { id: 'job-before', vehicleId: 'truck-1', plateNumber: 'B 9103 BEL', chassisSize: '20FT', completedAt: '2026-09-21T04:00:00.000Z', status: 'completed' },
        { id: 'job-after', vehicleId: 'truck-1', plateNumber: 'B 9103 BEL', chassisSize: '40FT', completedAt: '2026-09-22T04:00:00.000Z', status: 'completed' },
      ],
      9,
      2026,
      {},
    );

    expect(pivot.grandTotal).toBe(2);
    expect(pivot.rows.map((row) => row.size)).toEqual(expect.arrayContaining(['20FT', '40FT']));
    expect(pivot.rows.filter((row) => row.plateNumber === 'B 9103 BEL')).toHaveLength(2);
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
