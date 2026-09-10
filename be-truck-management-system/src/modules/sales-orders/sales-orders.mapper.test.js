import assert from 'node:assert/strict';
import test from 'node:test';
import { mapContainerJob, mapSalesOrder, toSalesOrderDb } from './sales-orders.mapper.js';

test('sales order mapper membaca metadata workflow dokumen invoice', () => {
  const mapped = mapSalesOrder({
    id: 'order-1',
    so_number: 'SO-001',
    customer_name: 'PT Contoh',
    billing_status: 'belum_invoice',
    invoice_document_status: 'siap_dikirim',
    invoice_document_uploaded_at: '2026-08-02T02:00:00.000Z',
    invoice_document_uploaded_by_name: 'Finance User',
    tax_invoice_document_uploaded_at: '2026-08-02T02:05:00.000Z',
    tax_invoice_document_uploaded_by_name: 'Finance User',
    invoice_document_sent_at: '2026-08-02T03:00:00.000Z',
    invoice_document_sent_by_name: 'Sales User',
    invoice_document_delivery_method: 'email',
    invoice_document_delivery_notes: 'Dikirim ke PIC customer.',
    payment_type: 'cash',
    quantity: 1,
    price: 0,
    total_amount: 0,
  });

  assert.equal(mapped.invoiceDocumentStatus, 'siap_dikirim');
  assert.equal(mapped.invoiceDocumentUploadedBy, 'Finance User');
  assert.equal(mapped.taxInvoiceDocumentUploadedBy, 'Finance User');
  assert.equal(mapped.invoiceDocumentSentBy, 'Sales User');
  assert.equal(mapped.invoiceDocumentDeliveryMethod, 'email');
  assert.equal(mapped.invoiceDocumentDeliveryNotes, 'Dikirim ke PIC customer.');
});

test('container job di sales order membaca file dokumen operational yang sudah diupload', () => {
  const mapped = mapContainerJob({
    id: 'job-1',
    container_number: 'FBIU5640483',
    eir_number: 'EIR-2026-001',
    travel_document_number: 'FBIU5640483',
    container_size: '40FT',
    container_type: 'Dry',
    assignment_snapshot: {},
    rpuj_status: 'paid',
    status: 'completed',
  }, [
    {
      id: 'attachment-eir',
      category: 'eirDocument',
      fileName: 'eir.jpg',
      fileSize: 123,
      mimeType: 'image/jpeg',
      storagePath: 'container/eir.jpg',
    },
    {
      id: 'attachment-sj',
      category: 'travelDocumentFile',
      fileName: 'surat-jalan.jpg',
      fileSize: 456,
      mimeType: 'image/jpeg',
      storagePath: 'container/surat-jalan.jpg',
    },
  ]);

  assert.equal(mapped.eirNumber, 'EIR-2026-001');
  assert.equal(mapped.eirDocument.name, 'eir.jpg');
  assert.equal(mapped.eirDocument.path, 'attachment-eir');
  assert.equal(mapped.travelDocument, 'FBIU5640483');
  assert.equal(mapped.travelDocumentFile.name, 'surat-jalan.jpg');
  assert.equal(mapped.travelDocumentFile.path, 'attachment-sj');
});

test('container job di sales order membaca kategori lama untuk file Surat Jalan', () => {
  const mapped = mapContainerJob({
    id: 'job-1',
    container_number: 'FBIU5640483',
    travel_document_number: 'FBIU5640483',
    container_size: '40FT',
    container_type: 'Dry',
    assignment_snapshot: {},
    rpuj_status: 'paid',
    status: 'completed',
  }, [
    {
      id: 'attachment-sj-legacy',
      category: 'travelDocument',
      fileName: 'sj-legacy.jpg',
      fileSize: 456,
      mimeType: 'image/jpeg',
      storagePath: 'container/sj-legacy.jpg',
    },
  ]);

  assert.equal(mapped.travelDocumentFile.name, 'sj-legacy.jpg');
  assert.equal(mapped.travelDocumentFile.path, 'attachment-sj-legacy');
});

test('container job di sales order membaca lampiran dari row mentah pg (kolom snake_case)', () => {
  // pg mengembalikan row dengan nama kolom apa adanya (snake_case), bukan camelCase.
  // Regression test untuk bug: mapAttachmentFile sempat hanya membaca attachment.fileName /
  // attachment.mimeType / attachment.storagePath (camelCase) sehingga file yang sudah
  // ter-upload tetap tampil "Belum ada file" walau attachment-nya sudah ada di database.
  const mapped = mapContainerJob({
    id: 'job-1',
    container_number: 'TLLU3185959',
    eir_number: 'EIR-001',
    travel_document_number: 'TLLU3185959',
    container_size: '20FT',
    container_type: 'Dry',
    assignment_snapshot: {},
    rpuj_status: 'paid',
    status: 'completed',
  }, [
    {
      id: 'attachment-eir-raw',
      category: 'eirDocument',
      file_name: 'TLLU3185959.jpeg',
      file_size: '153600',
      mime_type: 'image/jpeg',
      storage_path: 'container_job/job-1/eirDocument/tllu3185959.jpeg',
    },
    {
      id: 'attachment-sj-raw',
      category: 'travelDocumentFile',
      file_name: 'WhatsApp-Image-2026-09-07-at-11.20.40.jpeg',
      file_size: '204800',
      mime_type: 'image/jpeg',
      storage_path: 'container_job/job-1/travelDocumentFile/whatsapp-image.jpeg',
    },
  ]);

  assert.equal(mapped.eirDocument.name, 'TLLU3185959.jpeg');
  assert.equal(mapped.eirDocument.storagePath, 'container_job/job-1/eirDocument/tllu3185959.jpeg');
  assert.equal(mapped.travelDocumentFile.name, 'WhatsApp-Image-2026-09-07-at-11.20.40.jpeg');
  assert.equal(mapped.travelDocumentFile.storagePath, 'container_job/job-1/travelDocumentFile/whatsapp-image.jpeg');
});

test('sales order db mapper menyimpan metadata workflow dokumen invoice', () => {
  const row = toSalesOrderDb({
    customer: 'PT Contoh',
    origin: 'Jakarta',
    destination: 'Bekasi',
    invoiceDocumentStatus: 'terkirim',
    invoiceDocumentUploadedAt: '2026-08-02T02:00:00.000Z',
    invoiceDocumentUploadedBy: 'Finance User',
    taxInvoiceDocumentUploadedAt: '2026-08-02T02:05:00.000Z',
    taxInvoiceDocumentUploadedBy: 'Finance User',
    invoiceDocumentSentAt: '2026-08-02T03:00:00.000Z',
    invoiceDocumentSentBy: 'Sales User',
    invoiceDocumentDeliveryMethod: 'whatsapp',
    invoiceDocumentDeliveryNotes: 'Dikirim via WA.',
  });

  assert.equal(row.invoice_document_status, 'terkirim');
  assert.equal(row.invoice_document_uploaded_by_name, 'Finance User');
  assert.equal(row.tax_invoice_document_uploaded_by_name, 'Finance User');
  assert.equal(row.invoice_document_sent_by_name, 'Sales User');
  assert.equal(row.invoice_document_delivery_method, 'whatsapp');
  assert.equal(row.invoice_document_delivery_notes, 'Dikirim via WA.');
});

test('sales order mapper membaca dan menyimpan metadata input historis', () => {
  const mapped = mapSalesOrder({
    id: 'order-1',
    so_number: 'SO-HIST-001',
    customer_name: 'PT Arsip',
    entry_source: 'historical',
    historical_period: '2026-07',
    historical_notes: 'Input dari arsip Juli.',
    payment_type: 'cash',
    quantity: 1,
    price: 0,
    total_amount: 0,
  });

  assert.equal(mapped.entrySource, 'historical');
  assert.equal(mapped.historicalPeriod, '2026-07');
  assert.equal(mapped.historicalNotes, 'Input dari arsip Juli.');

  const row = toSalesOrderDb({
    customer: 'PT Arsip',
    origin: 'Jakarta',
    destination: 'Bekasi',
    tripDate: '2026-07-15',
    entrySource: 'historical',
    historicalPeriod: '2026-07',
    historicalNotes: 'Input dari arsip Juli.',
  });

  assert.equal(row.entry_source, 'historical');
  assert.equal(row.historical_period, '2026-07');
  assert.equal(row.historical_notes, 'Input dari arsip Juli.');
});

test('sales order mapper memisahkan nomor order sistem dan nomor SO Finance', () => {
  const pending = mapSalesOrder({
    id: 'order-auto-1',
    so_number: 'SO-ARM-202608-0001',
    accurate_so_number: null,
    customer_name: 'PT Auto',
    finance_verification_status: 'pending_so',
    payment_type: 'cash',
    quantity: 1,
    price: 0,
    total_amount: 0,
  });

  assert.equal(pending.soNumber, '');
  assert.equal(pending.internalSoNumber, 'ORD-ORDERAUT');
  assert.equal(pending.accurateSoNumber, '');
  assert.equal(pending.financeVerificationStatus, 'pending_so');

  const historical = toSalesOrderDb({
    soNumber: '26/080/ARM/00054',
    financeVerificationStatus: 'verified',
    customer: 'PT Arsip',
    origin: 'Jakarta',
    destination: 'Bekasi',
  });

  assert.equal(historical.so_number, '26/080/ARM/00054');
  assert.equal(historical.accurate_so_number, '26/080/ARM/00054');
  assert.equal(historical.finance_verification_status, 'verified');
});

test('sales order historis memakai periode dari tanggal jalan', () => {
  const row = toSalesOrderDb({
    customer: 'PT Arsip',
    origin: 'Jakarta',
    destination: 'Bekasi',
    tripDate: '2026-05-07',
    entrySource: 'historical',
    historicalPeriod: '2026-08',
  });

  assert.equal(row.trip_date, '2026-05-07');
  assert.equal(row.historical_period, '2026-05');
});
