import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeInvoiceDocumentDeliveryMethod,
  normalizeInvoiceDocumentStatus,
} from './sales-orders.invoice-documents.js';

test('normalisasi status dokumen invoice memakai nilai workflow phase 1', () => {
  assert.equal(normalizeInvoiceDocumentStatus(''), 'belum_upload');
  assert.equal(normalizeInvoiceDocumentStatus('dokumen_siap_dikirim'), 'siap_dikirim');
  assert.equal(normalizeInvoiceDocumentStatus('Dokumen_Terkirim'), 'terkirim');
  assert.equal(normalizeInvoiceDocumentStatus('nilai_asing'), 'belum_upload');
});

test('normalisasi metode pengiriman dokumen invoice hanya menerima nilai valid', () => {
  assert.equal(normalizeInvoiceDocumentDeliveryMethod('Email'), 'email');
  assert.equal(normalizeInvoiceDocumentDeliveryMethod('whatsapp'), 'whatsapp');
  assert.equal(normalizeInvoiceDocumentDeliveryMethod('lainnya'), 'lainnya');
  assert.equal(normalizeInvoiceDocumentDeliveryMethod('fax'), null);
});
