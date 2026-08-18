import assert from 'node:assert/strict';
import test from 'node:test';
import { mapContainerJob } from './container-jobs.mapper.js';

test('container job mapper membaca snapshot komisi sopir', () => {
  const mapped = mapContainerJob({
    id: 'job-1',
    sales_order_id: 'order-1',
    so_number: 'SO-ARM-202608-0001',
    customer_name: 'PT Contoh',
    shipment_type: 'import',
    job_type: 'dry',
    origin: 'Tanjung Priok',
    destination: 'Cikarang',
    trip_date: '2026-08-14',
    container_number: 'TCLU1234567',
    container_size: '20FT',
    container_type: 'Dry',
    assignment_snapshot: { driver: 'Sopir Test' },
    rpuj_status: 'submitted',
    has_driver_commission: true,
    driver_commission_amount: '50000',
    driver_commission_source_destination_id: 'destination-1',
    driver_commission_note: 'Komisi sesuai master tujuan',
    status: 'received',
  });

  assert.equal(mapped.hasDriverCommission, true);
  assert.equal(mapped.driverCommissionAmount, 50000);
  assert.equal(mapped.driverCommissionSourceDestinationId, 'destination-1');
  assert.equal(mapped.driverCommissionNote, 'Komisi sesuai master tujuan');
});

test('container job mapper membaca lampiran biaya lainnya terpisah dari SPK', () => {
  const mapped = mapContainerJob({
    id: 'job-1',
    sales_order_id: 'order-1',
    so_number: 'SO-ARM-202608-0001',
    customer_name: 'PT Contoh',
    shipment_type: 'import',
    job_type: 'dry',
    origin: 'Tanjung Priok',
    destination: 'Cikarang',
    trip_date: '2026-08-14',
    container_size: '20FT',
    container_type: 'Dry',
    assignment_snapshot: {},
    rpuj_status: 'pending',
    status: 'received',
  }, [
    {
      id: 'file-cost-1',
      category: 'additionalCostDocument',
      fileName: 'biaya.pdf',
      fileSize: 123,
      mimeType: 'application/pdf',
      storagePath: 'container/biaya.pdf',
    },
  ]);

  assert.equal(mapped.additionalCostDocument.name, 'biaya.pdf');
  assert.equal(mapped.additionalCostDocument.path, 'file-cost-1');
  assert.equal(mapped.spkDocument, null);
});
