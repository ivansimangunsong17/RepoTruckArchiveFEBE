import assert from 'node:assert/strict';
import test from 'node:test';

const { summarizeDriverCommissionPeriodRows } = await import('./driver-commissions.repository.js');

test('report komisi periode digrup per sopir dengan detail container', () => {
  const result = summarizeDriverCommissionPeriodRows([
    {
      containerJobId: 'job-1',
      salesOrderId: 'order-1',
      soNumber: 'SO-001',
      containerNumber: 'CONT-001',
      containerSize: '20FT',
      customerName: 'PT A',
      destination: 'Cikarang',
      truckPlateNumber: 'B 1000 AA',
      completedDate: '2026-08-13',
      completedAt: '2026-08-13T03:00:00.000Z',
      driverId: 'driver-1',
      driverName: 'Rahmat',
      amount: 50000,
      commissionNote: 'Komisi Cikarang',
      paymentStatus: 'unsubmitted',
      source: 'eligible',
    },
    {
      id: 'item-2',
      containerJobId: 'job-2',
      salesOrderId: 'order-2',
      soNumber: 'SO-002',
      containerNumber: 'CONT-002',
      containerSize: '20FT',
      customerName: 'PT B',
      destination: 'Bekasi',
      truckPlateNumber: 'B 2000 BB',
      completedDate: '2026-08-14',
      completedAt: '2026-08-14T04:00:00.000Z',
      driverId: 'driver-1',
      driverName: 'Rahmat',
      amount: 75000,
      commissionNote: 'Komisi Bekasi',
      batchId: 'batch-1',
      batchStatus: 'submitted',
      paymentId: 'payment-1',
      paymentStatus: 'pending',
      source: 'batch',
    },
    {
      id: 'item-3',
      containerJobId: 'job-3',
      salesOrderId: 'order-3',
      soNumber: 'SO-003',
      containerNumber: 'CONT-003',
      containerSize: '40FT',
      customerName: 'PT C',
      destination: 'Karawang',
      truckPlateNumber: 'B 3000 CC',
      completedDate: '2026-08-15',
      completedAt: '2026-08-15T05:00:00.000Z',
      driverId: 'driver-2',
      driverName: 'Jajam',
      amount: 100000,
      commissionNote: 'Komisi Karawang',
      batchId: 'batch-1',
      batchStatus: 'paid',
      paymentId: 'payment-2',
      paymentStatus: 'paid',
      paidAt: '2026-08-21T03:00:00.000Z',
      paidByName: 'Finance',
      paymentProofAttachmentId: 'proof-1',
      paymentNote: 'Transfer BCA',
      source: 'batch',
    },
  ]);

  assert.equal(result.summary.totalDrivers, 2);
  assert.equal(result.summary.totalItems, 3);
  assert.equal(result.summary.totalAmount, 225000);
  assert.equal(result.summary.unsubmittedItems, 1);
  assert.equal(result.summary.submittedItems, 1);
  assert.equal(result.summary.paidItems, 1);
  assert.equal(result.summary.paidAmount, 100000);
  assert.equal(result.summary.unpaidAmount, 125000);

  const rahmat = result.drivers.find((driver) => driver.driverName === 'Rahmat');
  assert.equal(rahmat.driverKey, 'driver-1');
  assert.equal(rahmat.totalItems, 2);
  assert.equal(rahmat.totalAmount, 125000);
  assert.equal(rahmat.unpaidItems, 2);
  assert.equal(rahmat.items[0].containerNumber, 'CONT-001');
  assert.equal(rahmat.items[1].containerNumber, 'CONT-002');
  assert.equal(rahmat.items[1].batchStatus, 'submitted');

  const jajam = result.drivers.find((driver) => driver.driverName === 'Jajam');
  assert.equal(jajam.driverKey, 'driver-2');
  assert.equal(jajam.paidItems, 1);
  assert.equal(jajam.paidAmount, 100000);
  assert.equal(jajam.batchStatus, 'paid');
  assert.equal(jajam.paymentId, 'payment-2');
  assert.equal(jajam.paymentStatus, 'paid');
  assert.equal(jajam.paymentProofAttachmentId, 'proof-1');
  assert.equal(jajam.paymentNote, 'Transfer BCA');
  assert.equal(jajam.items[0].paymentStatus, 'paid');
  assert.equal(jajam.items[0].paymentProofAttachmentId, 'proof-1');
});

test('report komisi periode memberi driverKey untuk sopir tanpa master id', () => {
  const result = summarizeDriverCommissionPeriodRows([
    {
      containerJobId: 'job-1',
      soNumber: 'SO-001',
      containerNumber: 'CONT-001',
      completedDate: '2026-08-13',
      driverId: null,
      driverName: 'Adit',
      amount: 50000,
      paymentStatus: 'unsubmitted',
      source: 'eligible',
    },
    {
      containerJobId: 'job-2',
      soNumber: 'SO-002',
      containerNumber: 'CONT-002',
      completedDate: '2026-08-13',
      driverId: null,
      driverName: 'Rendi',
      amount: 60000,
      paymentStatus: 'unsubmitted',
      source: 'eligible',
    },
  ]);

  assert.deepEqual(
    result.drivers.map((driver) => driver.driverKey),
    ['name:adit', 'name:rendi'],
  );
});
