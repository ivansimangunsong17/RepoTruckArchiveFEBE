import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  buildCustomerPerformanceRows,
  buildSalesPerformanceRows,
  calculateCompletedJobRevenue,
  calculateDriverCommissionAmount,
  summarizeCustomerPerformanceRows,
  summarizeSalesPerformanceRows,
  splitDriverCommissionPaymentAmount,
} = await import('./reports.repository.js');

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
