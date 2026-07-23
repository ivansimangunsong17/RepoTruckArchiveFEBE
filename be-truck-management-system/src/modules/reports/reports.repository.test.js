import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const { calculateCompletedJobRevenue } = await import('./reports.repository.js');

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
