import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  buildCustomerPerformanceRows,
  buildMonthlyComparisonRows,
  applyUtilizationChassisCorrectionsToRows,
  buildDriverPerformanceRows,
  buildLocationPerformanceRows,
  mergeDriverPerformanceTripCounts,
  buildSalesPerformanceRows,
  calculateCompletedJobRevenue,
  calculateDriverCommissionAmount,
  summarizeCustomerPerformanceRows,
  summarizeLocationPerformanceRows,
  summarizeSalesPerformanceRows,
  splitDriverCommissionPaymentAmount,
  DASHBOARD_SO_NUMBER_SQL,
} = await import('./reports.repository.js');

test('dashboard memakai nomor Accurate saat so_number kosong', () => {
  assert.equal(DASHBOARD_SO_NUMBER_SQL, 'coalesce(so.accurate_so_number, so.so_number)');
});

test('monthly revenue memakai harga per container agar cancelled job tidak menggandakan revenue', () => {
  assert.equal(calculateCompletedJobRevenue({
    price: 1500000,
    total_amount: 3000000,
    total_containers: 2,
  }), 1500000);
});

test('monthly revenue fallback membagi total amount dengan planned container awal', () => {
  assert.equal(calculateCompletedJobRevenue({
    price: 0,
    total_amount: 3000000,
    total_containers: 2,
  }), 1500000);
});

test('monthly revenue hanya menghitung jasa angkut dari line items', () => {
  assert.equal(calculateCompletedJobRevenue({
    price: 0,
    total_amount: 3500000,
    total_containers: 2,
    container_size: '20FT',
    line_items: [
      { serviceName: 'Jasa Angkut D20', qty: 2, price: 1500000 },
      { serviceName: 'Jasa Lainnya', qty: 1, price: 500000 },
    ],
  }), 1500000);
});

test('monthly revenue tidak menghitung SO yang hanya berisi reimbursement', () => {
  assert.equal(calculateCompletedJobRevenue({
    price: 0,
    total_amount: 500000,
    total_containers: 1,
    container_size: '20FT',
    line_items: [
      { serviceName: 'Jasa Lainnya', qty: 1, price: 500000 },
    ],
  }), 0);
});

test('monthly revenue memilih jasa angkut sesuai ukuran container', () => {
  assert.equal(calculateCompletedJobRevenue({
    price: 0,
    total_amount: 4000000,
    total_containers: 2,
    container_size: '40FT',
    line_items: JSON.stringify([
      { serviceName: 'Jasa Angkut D20', qty: 1, price: 1500000 },
      { serviceName: 'Jasa Angkut D40', qty: 1, price: 2500000 },
    ]),
  }), 2500000);
});

test('monthly comparison membandingkan revenue, sales/customer, utilisasi, dan container titip per bulan', () => {
  const rows = buildMonthlyComparisonRows([
    {
      id: 'so-1',
      so_number: 'SO-001',
      completed_date: '2026-01-03',
      customer_sales_name: 'Sales A',
      customer_name: 'Customer Alpha',
      price: 1500000,
      total_containers: 1,
      container_size: '20FT',
      vehicle_id: 'truck-1',
    },
    {
      id: 'so-2',
      so_number: 'SO-002',
      completed_date: '2026-01-03',
      customer_sales_name: 'Sales B',
      customer_name: 'Customer Beta',
      price: 2500000,
      total_containers: 1,
      container_size: '40FT',
      vehicle_id: 'truck-2',
    },
    {
      id: 'so-3',
      so_number: 'SO-003',
      completed_date: '2026-02-10',
      customer_sales_name: 'Sales A',
      customer_name: 'Customer Alpha',
      price: 2000000,
      total_containers: 1,
      container_size: '20FT',
      vehicle_id: 'truck-1',
    },
  ], [
    { repo_stored_date: '2026-01-04' },
    { repo_stored_date: '2026-02-11' },
    { repo_stored_date: '2026-02-12' },
  ], { year: 2026, activeTruckCount: 2 }, new Date('2026-03-15T00:00:00.000Z'));

  assert.equal(rows.length, 12);
  assert.equal(rows[0].label, 'Jan');
  assert.equal(rows[0].totalRevenue, 4000000);
  assert.equal(rows[0].totalTrips, 2);
  assert.equal(rows[0].totalCustomers, 2);
  assert.equal(rows[0].activeSales, 2);
  assert.equal(rows[0].repoStoredCount, 1);
  assert.equal(rows[0].utilizationPercent, (2 / (2 * 31)) * 100);
  assert.equal(rows[1].totalRevenue, 2000000);
  assert.equal(rows[1].repoStoredCount, 2);
});

test('monthly comparison memasukkan revenue vendor tetapi utilisasi hanya unit sendiri', () => {
  const rows = buildMonthlyComparisonRows([
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `internal-${index}`,
      completed_date: '2026-01-03',
      customer_name: 'Customer Campuran',
      price: 1000000,
      execution_source: 'internal',
      vehicle_id: `truck-${index}`,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `vendor-${index}`,
      completed_date: '2026-01-03',
      customer_name: 'Customer Campuran',
      price: 1000000,
      execution_source: 'vendor',
    })),
  ], [], { year: 2026, activeTruckCount: 5 }, new Date('2026-02-01T00:00:00.000Z'));

  assert.equal(rows[0].totalRevenue, 5000000);
  assert.equal(rows[0].totalVolume, 5);
  assert.equal(rows[0].totalTrips, 3);
  assert.equal(rows[0].usedTruckDays, 3);
  assert.equal(rows[0].utilizationPercent, (3 / (5 * 31)) * 100);
});

test('monthly comparison menghitung combo pickup 2x20 sebagai 1 trip internal tapi volume tetap 2 container', () => {
  const rows = buildMonthlyComparisonRows([
    {
      id: 'combo-job-1',
      completed_date: '2026-01-03',
      customer_name: 'Customer Combo',
      price: 1000000,
      execution_source: 'internal',
      vehicle_id: 'truck-40',
      pickup_type: 'combo_2x20',
      pickup_sequence_no: 1,
    },
    {
      id: 'combo-job-2',
      completed_date: '2026-01-03',
      customer_name: 'Customer Combo',
      price: 1000000,
      execution_source: 'internal',
      vehicle_id: 'truck-40',
      pickup_type: 'combo_2x20',
      pickup_sequence_no: 2,
    },
  ], [], { year: 2026, activeTruckCount: 1 }, new Date('2026-02-01T00:00:00.000Z'));

  assert.equal(rows[0].totalRevenue, 2000000);
  assert.equal(rows[0].totalVolume, 2);
  assert.equal(rows[0].totalTrips, 1);
  assert.equal(rows[0].usedTruckDays, 1);
  assert.equal(rows[0].utilizationPercent, (1 / 31) * 100);
});

test('monthly comparison counts only original legs; a combo Repo movement adds no trips', () => {
  const completed = [
    { completed_date: '2026-10-05', price: 1000000, container_size: '20FT', customer_name: 'A' },
    { completed_date: '2026-10-05', price: 1000000, container_size: '20FT', customer_name: 'A' },
  ];
  // The utilization source returns only the two original legs; the combo Repo truck C is absent.
  const utilizationTrips = [
    { id: 'job:a', completedDate: '2026-10-01', vehicleId: 'truck-a' },
    { id: 'job:b', completedDate: '2026-10-01', vehicleId: 'truck-b' },
  ];
  const rows = buildMonthlyComparisonRows(completed, [], {
    year: 2026, activeTruckCount: 3, utilizationTrips,
  }, new Date('2026-11-01'));
  assert.equal(rows[9].totalTrips, 2);
  assert.equal(rows[9].totalVolume, 2);
  assert.equal(rows[9].totalRevenue, 2000000);
  assert.equal(rows[9].usedTruckDays, 2);
});

test('driver performance trip counts follow original legs only; Repo driver gets no trip, totals unchanged', () => {
  // Trip rows come from the utilization source, which no longer emits Repo pickup legs.
  const rows = mergeDriverPerformanceTripCounts([
    { driverId: 'driver-c', driver: 'Repo Driver', totalTrips: 2,
      totalRevenue: 2000000, totalDriverCommission: 100000 },
  ], [
    { id: 'job:a', driverId: 'driver-a', driver: 'Original A' },
    { id: 'job:b', driverId: 'driver-b', driver: 'Original B' },
  ]);
  assert.deepEqual(rows.map((row) => [row.driverId, row.totalTrips]).sort(), [
    ['driver-a', 1], ['driver-b', 1], ['driver-c', 0],
  ]);
  assert.equal(rows.reduce((total, row) => total + row.totalRevenue, 0), 2000000);
  assert.equal(rows.reduce((total, row) => total + row.totalDriverCommission, 0), 100000);
});

test('koreksi chassis utilisasi tidak mengubah baris jika tidak ada mapping', () => {
  const rows = [
    { id: 'job-1', vehicleId: 'truck-9211', plateNumber: 'B 9211 BEL', completedDate: '2026-08-10' },
  ];

  assert.equal(applyUtilizationChassisCorrectionsToRows(rows, []), rows);
});

test('koreksi chassis full-month memindahkan ukuran chassis tampilan tanpa mengubah plat report', () => {
  const rows = applyUtilizationChassisCorrectionsToRows([
    { id: 'job-1', vehicleId: 'truck-9211', plateNumber: 'B 9211 BEL', unitCode: '11', chassisSize: '40FT', completedDate: '2026-08-03' },
    { id: 'job-2', vehicleId: 'truck-9211', plateNumber: 'B 9211 BEL', unitCode: '11', chassisSize: '40FT', completedDate: '2026-08-20' },
  ], [
    {
      id: 'correction-1',
      sourceVehicleId: 'truck-9211',
      sourcePlateNumber: 'B 9211 BEL',
      sourceUnitCode: '11',
      sourceChassisSize: '40FT',
      targetVehicleId: 'truck-9130',
      targetPlateNumber: 'B 9130 BEL',
      targetUnitCode: '30',
      targetChassisSize: '20FT',
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-31',
      reason: 'Tukar chassis Agustus',
    },
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.plateNumber), ['B 9211 BEL', 'B 9211 BEL']);
  assert.deepEqual(rows.map((row) => row.chassisSize), ['20FT', '20FT']);
  assert.deepEqual(rows.map((row) => row.originalPlateNumber), ['B 9211 BEL', 'B 9211 BEL']);
  assert.deepEqual(rows.map((row) => row.originalChassisSize), ['40FT', '40FT']);
  assert.equal(rows[0].utilizationChassisCorrection.reason, 'Tukar chassis Agustus');
});

test('koreksi chassis mid-month hanya memindahkan ritase dalam periode efektif', () => {
  const rows = applyUtilizationChassisCorrectionsToRows([
    { id: 'job-before', vehicleId: 'truck-9211', plateNumber: 'B 9211 BEL', completedDate: '2026-08-14' },
    { id: 'job-start', vehicleId: 'truck-9211', plateNumber: 'B 9211 BEL', completedDate: '2026-08-15' },
    { id: 'job-after', vehicleId: 'truck-9211', plateNumber: 'B 9211 BEL', completedDate: '2026-09-01' },
  ], [
    {
      sourceVehicleId: 'truck-9211',
      sourcePlateNumber: 'B 9211 BEL',
      sourceChassisSize: '40FT',
      targetVehicleId: 'truck-9130',
      targetPlateNumber: 'B 9130 BEL',
      targetChassisSize: '20FT',
      effectiveFrom: '2026-08-15',
      effectiveTo: '2026-08-31',
    },
  ]);

  assert.equal(rows[0].plateNumber, 'B 9211 BEL');
  assert.equal(rows[1].plateNumber, 'B 9211 BEL');
  assert.equal(rows[1].chassisSize, '20FT');
  assert.equal(rows[2].plateNumber, 'B 9211 BEL');
});

test('koreksi chassis two-way swap menjaga grand total dan menukar ukuran chassis tampilan', () => {
  const rows = applyUtilizationChassisCorrectionsToRows([
    { id: 'job-9211', vehicleId: 'truck-9211', plateNumber: 'B 9211 BEL', chassisSize: '40FT', completedDate: '2026-08-18' },
    { id: 'job-9130', vehicleId: 'truck-9130', plateNumber: 'B 9130 BEL', chassisSize: '20FT', completedDate: '2026-08-19' },
    { id: 'job-outside', vehicleId: 'truck-9211', plateNumber: 'B 9211 BEL', chassisSize: '40FT', completedDate: '2026-08-10' },
  ], [
    {
      sourceVehicleId: 'truck-9211',
      sourcePlateNumber: 'B 9211 BEL',
      sourceChassisSize: '40FT',
      targetVehicleId: 'truck-9130',
      targetPlateNumber: 'B 9130 BEL',
      targetChassisSize: '20FT',
      effectiveFrom: '2026-08-15',
      effectiveTo: '2026-08-31',
    },
    {
      sourceVehicleId: 'truck-9130',
      sourcePlateNumber: 'B 9130 BEL',
      sourceChassisSize: '20FT',
      targetVehicleId: 'truck-9211',
      targetPlateNumber: 'B 9211 BEL',
      targetChassisSize: '40FT',
      effectiveFrom: '2026-08-15',
      effectiveTo: '2026-08-31',
    },
  ]);

  const countsByPlateAndSize = rows.reduce((counts, row) => ({
    ...counts,
    [`${row.plateNumber}|${row.chassisSize}`]: Number(counts[`${row.plateNumber}|${row.chassisSize}`] || 0) + 1,
  }), {});

  assert.equal(rows.length, 3);
  assert.equal(countsByPlateAndSize['B 9211 BEL|20FT'], 1);
  assert.equal(countsByPlateAndSize['B 9211 BEL|40FT'], 1);
  assert.equal(countsByPlateAndSize['B 9130 BEL|40FT'], 1);
  assert.equal(rows.filter((row) => row.utilizationChassisCorrection).length, 2);
});

test('driver commission hanya dihitung ketika flag komisi aktif', () => {
  assert.equal(calculateDriverCommissionAmount({
    has_driver_commission: true,
    driver_commission_amount: '50000',
  }), 50000);
  assert.equal(calculateDriverCommissionAmount({
    has_driver_commission: false,
    driver_commission_amount: '50000',
  }), 0);
});

test('driver commission payment dipisah paid dan unpaid', () => {
  assert.deepEqual(splitDriverCommissionPaymentAmount({
    has_driver_commission: true,
    driver_commission_amount: '50000',
    commission_payment_status: 'paid',
  }), { paid: 50000, unpaid: 0 });

  assert.deepEqual(splitDriverCommissionPaymentAmount({
    has_driver_commission: true,
    driver_commission_amount: '75000',
    commission_payment_status: 'pending',
  }), { paid: 0, unpaid: 75000 });
});

test('sales performance menggabungkan customer unik, volume, dan revenue per sales', () => {
  const rows = buildSalesPerformanceRows([
    {
      id: 'so-1',
      so_number: 'SO-001',
      sales_name: 'Sales A',
      customer_name: 'Customer Alpha',
      price: 1500000,
      total_containers: 2,
      container_size: '20FT',
    },
    {
      id: 'so-1',
      so_number: 'SO-001',
      sales_name: 'Sales A',
      customer_name: 'Customer Alpha',
      price: 1500000,
      total_containers: 2,
      container_size: '20FT',
    },
    {
      id: 'so-2',
      so_number: 'SO-002',
      sales_name: 'Sales B',
      customer_name: 'Customer Beta',
      price: 2500000,
      total_containers: 1,
      container_size: '40FT',
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].salesName, 'Sales A');
  assert.equal(rows[0].customerCount, 1);
  assert.equal(rows[0].completedOrders, 1);
  assert.equal(rows[0].totalVolume, 2);
  assert.equal(rows[0].totalRevenue, 3000000);
  assert.equal(rows[0].averageRevenuePerVolume, 1500000);

  assert.deepEqual(summarizeSalesPerformanceRows(rows), {
    totalSales: 2,
    activeSales: 2,
    totalCustomers: 2,
    totalOrders: 2,
    totalVolume: 3,
    totalContainers: 3,
    totalRevenue: 5500000,
    averageRevenuePerSales: 2750000,
    averageRevenuePerVolume: 1833333.3333333333,
  });
});

test('sales performance memakai sales dari master customer sebagai prioritas', () => {
  const rows = buildSalesPerformanceRows([
    {
      id: 'so-1',
      so_number: 'SO-001',
      customer_sales_name: 'Sales Master Customer',
      sales_name: 'Sales Pembuat SO',
      created_by_name: 'Admin Input',
      customer_name: 'Customer Alpha',
      price: 1500000,
      total_containers: 1,
      container_size: '20FT',
    },
    {
      id: 'so-2',
      so_number: 'SO-002',
      sales_name: 'Sales Pembuat SO',
      created_by_name: 'Admin Input',
      customer_name: 'Customer Beta',
      price: 2500000,
      total_containers: 1,
      container_size: '40FT',
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].salesName, 'Sales Pembuat SO');
  assert.equal(rows[1].salesName, 'Sales Master Customer');
  assert.equal(rows[1].totalRevenue, 1500000);
});

test('location performance menampilkan nama tujuan saat satu lokasi hanya memiliki satu tujuan', () => {
  const rows = buildLocationPerformanceRows([
    {
      id: 'so-1', location_id: 'loc-1', location_name: 'Gudang Alpha', destination_name: 'Cikarang',
      operational_status: 'Aktif', customer_name: 'Customer A', price: 1500000, container_size: '20FT',
    },
    {
      id: 'so-2', location_id: 'loc-1', location_name: 'Gudang Alpha', destination_name: 'Cikarang',
      operational_status: 'Aktif', customer_name: 'Customer B', price: 2500000, container_size: '40FT',
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].destinationName, 'Cikarang');
  assert.equal(rows[0].destinationCount, 1);
  assert.equal(rows[0].mappingStatus, 'mapped');
  assert.equal(rows[0].contributionBasis, 'trip');
  assert.deepEqual(rows[0].destinations, [{
    destinationId: null,
    destinationName: 'Cikarang',
    totalTrips: 2,
    totalRevenue: 4000000,
    container20ft: 1,
    container40ft: 1,
    averageRevenuePerTrip: 2000000,
  }]);
});

test('location performance menampilkan Beragam dan rincian tujuan tanpa mengubah total utama', () => {
  const rows = buildLocationPerformanceRows([
    {
      id: 'so-1', location_id: 'loc-1', location_name: 'Gudang Alpha', destination_id: 'dest-a',
      destination_name: 'Cikarang', customer_name: 'Customer A', price: 1500000, container_size: '20FT',
    },
    {
      id: 'so-1', location_id: 'loc-1', location_name: 'Gudang Alpha', destination_id: 'dest-a',
      destination_name: 'Cikarang', customer_name: 'Customer A', price: 1500000, container_size: '20FT',
    },
    {
      id: 'so-2', location_id: 'loc-1', location_name: 'Gudang Alpha', destination_id: 'dest-b',
      destination_name: 'Brebes', customer_name: 'Customer A', price: 2500000, container_size: '40FT',
    },
  ]);

  const [location] = rows;
  assert.equal(location.destinationName, 'Beragam (2 tujuan)');
  assert.equal(location.destinationCount, 2);
  assert.equal(location.totalTrips, 3);
  assert.equal(location.completedOrders, 2);
  assert.equal(location.customerCount, 1);
  assert.equal(location.container20ft, 2);
  assert.equal(location.container40ft, 1);
  assert.equal(location.totalRevenue, 5500000);
  assert.equal(location.destinations.reduce((total, row) => total + row.totalTrips, 0), location.totalTrips);
  assert.equal(location.destinations.reduce((total, row) => total + row.container20ft, 0), location.container20ft);
  assert.equal(location.destinations.reduce((total, row) => total + row.container40ft, 0), location.container40ft);
  assert.equal(location.destinations.reduce((total, row) => total + row.totalRevenue, 0), location.totalRevenue);
  assert.deepEqual(location.destinations.map((row) => [row.destinationName, row.totalTrips]), [
    ['Cikarang', 2],
    ['Brebes', 1],
  ]);
});

test('location performance menyatukan transaksi tanpa lokasi dan menandainya sebagai data belum terpetakan', () => {
  const rows = buildLocationPerformanceRows([
    {
      id: 'so-1', location_id: null, location_name: 'Snapshot Lama A', destination_name: 'Cikarang',
      customer_name: 'Customer A', price: 1500000, container_size: '20FT',
    },
    {
      id: 'so-2', location_id: null, location_name: 'Snapshot Lama B', destination_name: 'Brebes',
      customer_name: 'Customer B', price: 2500000, container_size: '40FT',
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].locationId, null);
  assert.equal(rows[0].locationName, 'Tanpa Lokasi');
  assert.equal(rows[0].mappingStatus, 'unmapped');
  assert.equal(rows[0].mappingLabel, 'Data belum terpetakan');
  assert.equal(rows[0].destinationName, 'Beragam (2 tujuan)');
  assert.equal(rows[0].totalTrips, 2);
  assert.deepEqual(summarizeLocationPerformanceRows(rows), {
    totalLocations: 0,
    locationsWithTrips: 0,
    unmappedTrips: 2,
    unmappedOrders: 2,
    unmappedCustomers: 2,
    unmappedDestinations: 2,
    totalTrips: 2,
    totalVolume: 2,
    totalRevenue: 4000000,
    averageRevenuePerLocation: 0,
    topLocation: '',
    topLocationTrips: 0,
  });
});

test('customer performance menggabungkan revenue periode dan outstanding aktif', () => {
  const rows = buildCustomerPerformanceRows([
    {
      id: 'so-1',
      so_number: 'SO-001',
      customer_sales_name: 'Sales Master Alpha',
      sales_name: 'Sales A',
      customer_name: 'Customer Alpha',
      price: 1500000,
      total_containers: 2,
      container_size: '20FT',
      completed_date: '2026-08-05',
    },
    {
      id: 'so-1',
      so_number: 'SO-001',
      customer_sales_name: 'Sales Master Alpha',
      sales_name: 'Sales A',
      customer_name: 'Customer Alpha',
      price: 1500000,
      total_containers: 2,
      container_size: '20FT',
      completed_date: '2026-08-06',
    },
    {
      id: 'so-2',
      so_number: 'SO-002',
      sales_name: 'Sales B',
      customer_name: 'Customer Beta',
      price: 2500000,
      total_containers: 1,
      container_size: '40FT',
      completed_date: '2026-08-07',
    },
  ], [
    {
      customer: 'Customer Alpha',
      invoiceCount: 1,
      totalOutstandingAmount: 1000000,
      currentAmount: 1000000,
      overdueAmount: 0,
      oldestOverdueDays: 0,
    },
    {
      customer: 'Customer Lama',
      invoiceCount: 2,
      totalOutstandingAmount: 3000000,
      currentAmount: 0,
      overdueAmount: 3000000,
      oldestOverdueDays: 45,
    },
  ]);

  assert.equal(rows.length, 3);
  assert.equal(rows[0].customer, 'Customer Lama');
  assert.equal(rows[0].totalVolume, 0);
  assert.equal(rows[0].totalOutstandingAmount, 3000000);
  assert.equal(rows[0].status, 'Perlu Ditagih');

  const alpha = rows.find((row) => row.customer === 'Customer Alpha');
  assert.equal(alpha.completedOrders, 1);
  assert.deepEqual(alpha.salesNames, ['Sales Master Alpha']);
  assert.equal(alpha.totalVolume, 2);
  assert.equal(alpha.totalRevenue, 3000000);
  assert.equal(alpha.totalOutstandingAmount, 1000000);
  assert.equal(alpha.status, 'Piutang Berjalan');

  assert.deepEqual(summarizeCustomerPerformanceRows(rows), {
    totalCustomers: 3,
    activeCustomers: 2,
    outstandingCustomers: 2,
    overdueCustomers: 1,
    healthyCustomers: 1,
    totalOrders: 2,
    totalVolume: 3,
    totalContainers: 3,
    totalRevenue: 5500000,
    totalOutstandingAmount: 4000000,
    overdueAmount: 3000000,
    averageRevenuePerCustomer: 2750000,
    averageRevenuePerVolume: 1833333.3333333333,
    collectionRate: 0.2727272727272727,
  });
});

test('customer performance memecah outstanding jadi klasifikasi bucket umur piutang (current/1-15/16-30/31-60/60+)', () => {
  const rows = buildCustomerPerformanceRows([], [
    {
      customer: 'Customer Bucket',
      invoiceCount: 4,
      totalOutstandingAmount: 10000000,
      currentAmount: 1000000,
      overdueAmount: 9000000,
      overdue1To15Amount: 2000000,
      overdue16To30Amount: 1000000,
      overdue1To30Amount: 3000000,
      overdue31To60Amount: 3000000,
      overdue60PlusAmount: 3000000,
      oldestOverdueDays: 75,
    },
  ]);

  assert.equal(rows.length, 1);
  const customer = rows[0];
  assert.equal(customer.currentAmount, 1000000);
  assert.equal(customer.overdue1To15Amount, 2000000);
  assert.equal(customer.overdue16To30Amount, 1000000);
  assert.equal(customer.overdue1To30Amount, 3000000);
  assert.equal(customer.overdue31To60Amount, 3000000);
  assert.equal(customer.overdue60PlusAmount, 3000000);
  // Total tiap bucket harus konsisten dengan totalOutstandingAmount (tidak ada yang hilang/dobel).
  assert.equal(
    customer.currentAmount + customer.overdue1To15Amount + customer.overdue16To30Amount + customer.overdue31To60Amount + customer.overdue60PlusAmount,
    customer.totalOutstandingAmount,
  );
});

function driverJobRow(overrides = {}) {
  return {
    driver_id: 'drv-1',
    driver_master_name: 'DRIVER ABCD',
    driver: 'DRIVER ABCD',
    price: 1000000,
    total_amount: 1000000,
    total_containers: 1,
    has_driver_commission: true,
    driver_commission_amount: 50000,
    commission_payment_status: null,
    ...overrides,
  };
}

test('performa sopir: nama sopir diganti di tengah bulan tetap satu baris per driver_id', () => {
  const rows = buildDriverPerformanceRows([
    // 1-15 Sep: job di-assign saat nama masih DRIVER ABC (snapshot lama)
    driverJobRow({ driver: 'DRIVER ABC', completed_date: '2026-09-03' }),
    driverJobRow({ driver: 'DRIVER ABC', completed_date: '2026-09-12' }),
    // 16-30 Sep: setelah nama master diganti jadi DRIVER ABCD
    driverJobRow({ driver: 'DRIVER ABCD', completed_date: '2026-09-20' }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].driverId, 'drv-1');
  assert.equal(rows[0].driver, 'DRIVER ABCD');
  assert.equal(rows[0].totalTrips, 3);
  assert.equal(rows[0].monthlyTrips, 3);
  assert.equal(rows[0].totalRevenue, 3000000);
  assert.equal(rows[0].totalDriverCommission, 150000);
});

test('performa sopir: label memakai nama master terkini walau semua snapshot masih nama lama', () => {
  const rows = buildDriverPerformanceRows([
    driverJobRow({ driver: 'DRIVER ABC' }),
    driverJobRow({ driver: 'DRIVER ABC' }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].driver, 'DRIVER ABCD');
});

test('performa sopir: dua driver_id berbeda dengan nama sama tidak digabung', () => {
  const rows = buildDriverPerformanceRows([
    driverJobRow({ driver_id: 'drv-1', driver_master_name: 'BUDI', driver: 'BUDI' }),
    driverJobRow({ driver_id: 'drv-2', driver_master_name: 'BUDI', driver: 'BUDI' }),
    driverJobRow({ driver_id: 'drv-2', driver_master_name: 'BUDI', driver: 'BUDI' }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.driverId, row.totalTrips]).sort(), [['drv-1', 1], ['drv-2', 2]]);
});

test('performa sopir: job yang di-reassign dihitung ke driver_id terkini, bukan ke sopir lama', () => {
  const rows = buildDriverPerformanceRows([
    // job awalnya milik sopir A lalu di-reassign ke sopir B: driver_id & snapshot sudah milik B
    driverJobRow({ driver_id: 'drv-b', driver_master_name: 'SOPIR B', driver: 'SOPIR B' }),
    driverJobRow({ driver_id: 'drv-a', driver_master_name: 'SOPIR A', driver: 'SOPIR A' }),
  ]);
  assert.deepEqual(rows.map((row) => [row.driver, row.totalTrips]).sort(), [['SOPIR A', 1], ['SOPIR B', 1]]);
});

test('performa sopir: job lama tanpa driver_id tetap per nama snapshot dan tidak digabung ke sopir master bernama sama', () => {
  const rows = buildDriverPerformanceRows([
    driverJobRow({ driver_id: 'drv-1', driver_master_name: 'DRIVER ABCD', driver: 'DRIVER ABCD' }),
    driverJobRow({ driver_id: null, driver_master_name: null, driver: 'DRIVER ABCD' }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.driverId).sort(), ['drv-1', null].sort());
});

test('performa sopir: total bulanan tetap sama setelah pengelompokan per driver_id', () => {
  const input = [
    driverJobRow({ driver: 'DRIVER ABC' }),
    driverJobRow({ driver: 'DRIVER ABCD', commission_payment_status: 'paid' }),
    driverJobRow({ driver_id: 'drv-2', driver_master_name: 'SITI', driver: 'SITI', price: 2000000, total_amount: 2000000 }),
  ];
  const rows = buildDriverPerformanceRows(input);
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  assert.equal(sum('totalTrips'), input.length);
  assert.equal(sum('totalRevenue'), 4000000);
  assert.equal(sum('totalDriverCommission'), 150000);
  assert.equal(sum('paidDriverCommission') + sum('unpaidDriverCommission'), 150000);
});

test('monthly comparison memisahkan revenue Repo per bulan (tanggal pickup) dari revenue transport', () => {
  const completed = [
    { completed_date: '2026-10-03', line_items: [{ serviceName: 'Jasa Angkut D20', qty: 1, price: 2000000 }], container_size: '20FT' },
  ];
  const repoRevenueRows = [
    { id: 'repo-1', amount: 300000, revenueDate: '2026-10-05' },
    { id: 'repo-2', amount: 300000, revenueDate: '2026-10-05' },
    { id: 'repo-3', amount: 300000, revenueDate: '2026-09-30' },
  ];
  const rows = buildMonthlyComparisonRows(completed, [], {
    year: 2026, activeTruckCount: 1, utilizationTrips: [], repoRevenueRows,
  }, new Date('2026-12-31T00:00:00.000Z'));

  // Transport tidak tercampur Repo.
  assert.equal(rows[9].totalRevenue, 2000000);
  assert.equal(rows[9].repoRevenue, 600000);
  assert.equal(rows[9].operationalRevenue, 2600000);
  assert.equal(rows[8].totalRevenue, 0);
  assert.equal(rows[8].repoRevenue, 300000);
  // Tanpa input Repo (pemanggil lama) revenue Repo 0.
  const legacy = buildMonthlyComparisonRows(completed, [], { year: 2026, activeTruckCount: 1, utilizationTrips: [] });
  assert.equal(legacy[9].repoRevenue, 0);
  assert.equal(legacy[9].operationalRevenue, 2000000);
});
