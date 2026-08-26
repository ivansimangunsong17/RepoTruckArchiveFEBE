import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  buildSalesPerformanceRows,
  calculateCompletedJobRevenue,
  calculateDriverCommissionAmount,
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
