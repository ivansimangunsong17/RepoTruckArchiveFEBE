import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  buildCustomerPerformanceRows,
  buildMonthlyComparisonRows,
  applyUtilizationChassisCorrectionsToRows,
  buildSalesPerformanceRows,
  calculateCompletedJobRevenue,
  calculateDriverCommissionAmount,
  summarizeCustomerPerformanceRows,
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
