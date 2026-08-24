import assert from 'node:assert/strict';
import test from 'node:test';
import { mapContainerJob, mapContainerJobExpense } from './container-jobs.mapper.js';

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

test('container job expense mapper membaca bukti pembayaran ledger', () => {
  const mapped = mapContainerJobExpense({
    id: 'expense-1',
    sales_order_id: 'order-1',
    container_job_id: 'job-1',
    driver_id: 'driver-1',
    category: 'uj_awal',
    amount: '600000',
    description: 'Migrasi legacy RPUJ',
    recipient_type: 'driver',
    recipient_name: 'Sopir Test',
    payment_status: 'sudah_dibayar',
    paid_at: '2026-08-20T04:00:00.000Z',
    paid_by_name: 'Finance Test',
    proof_attachment_id: 'proof-1',
    proof_file_name: 'transfer.pdf',
    proof_file_size: '321',
    proof_mime_type: 'application/pdf',
    proof_storage_path: 'finance/transfer.pdf',
    finance_check_status: 'belum_dicek',
    source: 'legacy_rpuj',
    source_ref_id: 'job-1',
  });

  assert.equal(mapped.category, 'uj_awal');
  assert.equal(mapped.amount, 600000);
  assert.equal(mapped.paymentStatus, 'sudah_dibayar');
  assert.equal(mapped.proofAttachment.name, 'transfer.pdf');
  assert.equal(mapped.proofAttachment.path, 'proof-1');
  assert.equal(mapped.financeCheckStatus, 'belum_dicek');
  assert.equal(mapped.source, 'legacy_rpuj');
});

test('container job mapper menyertakan daftar transaksi biaya', () => {
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
    rpuj_status: 'paid',
    status: 'completed',
  }, [], [
    {
      id: 'expense-1',
      container_job_id: 'job-1',
      category: 'lainnya',
      amount: '150000',
      payment_status: 'sudah_dibayar',
    },
  ]);

  assert.equal(mapped.expenses.length, 1);
  assert.equal(mapped.expenses[0].category, 'lainnya');
  assert.equal(mapped.expenses[0].amount, 150000);
});
