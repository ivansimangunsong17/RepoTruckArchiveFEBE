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

test('container job mapper membaca kategori lama untuk file Surat Jalan', () => {
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
    travel_document_number: 'SJ-001',
    rpuj_status: 'pending',
    status: 'completed',
  }, [
    {
      id: 'file-sj-legacy',
      category: 'travelDocument',
      fileName: 'sj-legacy.jpg',
      fileSize: 123,
      mimeType: 'image/jpeg',
      storagePath: 'container/sj-legacy.jpg',
    },
  ]);

  assert.equal(mapped.travelDocument, 'SJ-001');
  assert.equal(mapped.travelDocumentFile.name, 'sj-legacy.jpg');
  assert.equal(mapped.travelDocumentFile.path, 'file-sj-legacy');
});

test('container job mapper membaca lampiran travelDocumentFile dan eirDocument dari row mentah pg (kolom snake_case)', () => {
  // pg mengembalikan row dengan nama kolom apa adanya (snake_case), bukan camelCase.
  // Regression test untuk bug: mapAttachmentFile sempat hanya membaca attachment.fileName /
  // attachment.mimeType / attachment.storagePath (camelCase) sehingga file yang sudah
  // ter-upload tetap tampil "Belum ada file" karena name/storagePath jadi string kosong,
  // walau attachment-nya sudah benar ada & ter-relasi di database.
  const mapped = mapContainerJob({
    id: 'job-1',
    sales_order_id: 'order-1',
    so_number: '2609/02-00155',
    customer_name: 'MANTAP JAYA',
    shipment_type: 'import',
    job_type: 'dry',
    origin: 'Tanjung Priok',
    destination: 'Cikarang',
    trip_date: '2026-09-07',
    container_number: 'TLLU3185959',
    container_size: '20FT',
    container_type: 'Dry',
    assignment_snapshot: {},
    travel_document_number: 'TLLU3185959',
    eir_number: 'EIR-001',
    rpuj_status: 'pending',
    status: 'running',
  }, [
    {
      id: 'attachment-travel-1',
      entity_id: 'job-1',
      category: 'travelDocumentFile',
      reference_number: null,
      document_date: null,
      file_name: 'WhatsApp-Image-2026-09-07-at-11.20.40.jpeg',
      storage_path: 'container_job/job-1/travelDocumentFile/whatsapp-image.jpeg',
      mime_type: 'image/jpeg',
      file_size: '204800',
      notes: null,
      uploaded_by_name: 'Operational Test',
      created_at: '2026-09-07T04:00:00.000Z',
    },
    {
      id: 'attachment-eir-1',
      entity_id: 'job-1',
      category: 'eirDocument',
      reference_number: null,
      document_date: null,
      file_name: 'TLLU3185959.jpeg',
      storage_path: 'container_job/job-1/eirDocument/tllu3185959.jpeg',
      mime_type: 'image/jpeg',
      file_size: '153600',
      notes: null,
      uploaded_by_name: 'Operational Test',
      created_at: '2026-09-07T05:00:00.000Z',
    },
  ]);

  assert.equal(mapped.travelDocumentFile.name, 'WhatsApp-Image-2026-09-07-at-11.20.40.jpeg');
  assert.equal(mapped.travelDocumentFile.path, 'attachment-travel-1');
  assert.equal(mapped.travelDocumentFile.storagePath, 'container_job/job-1/travelDocumentFile/whatsapp-image.jpeg');
  assert.equal(mapped.travelDocumentFile.type, 'image/jpeg');
  assert.equal(mapped.travelDocumentFile.size, 204800);

  assert.equal(mapped.eirDocument.name, 'TLLU3185959.jpeg');
  assert.equal(mapped.eirDocument.path, 'attachment-eir-1');
  assert.equal(mapped.eirDocument.storagePath, 'container_job/job-1/eirDocument/tllu3185959.jpeg');
});

test('container job mapper membaca lampiran legacy travelDocument dari row mentah pg (kolom snake_case)', () => {
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
    travel_document_number: 'SJ-001',
    rpuj_status: 'pending',
    status: 'completed',
  }, [
    {
      id: 'file-sj-legacy-raw',
      entity_id: 'job-1',
      category: 'travelDocument',
      file_name: 'sj-legacy.jpg',
      storage_path: 'container/sj-legacy.jpg',
      mime_type: 'image/jpeg',
      file_size: '123',
    },
  ]);

  assert.equal(mapped.travelDocument, 'SJ-001');
  assert.equal(mapped.travelDocumentFile.name, 'sj-legacy.jpg');
  assert.equal(mapped.travelDocumentFile.path, 'file-sj-legacy-raw');
  assert.equal(mapped.travelDocumentFile.storagePath, 'container/sj-legacy.jpg');
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
