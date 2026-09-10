import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  buildInvoiceFilters,
  buildOrderVerificationFilters,
  invoiceOrdersCte,
} = await import('./finance.repository.js');

test('invoice CTE hanya mengambil completed job yang punya completed_at valid', () => {
  const sql = invoiceOrdersCte();

  assert.match(sql, /where\s+cj\.status\s*=\s*'completed'/i);
  assert.match(sql, /and\s+cj\.completed_at\s+is\s+not\s+null/i);
});

test('invoice CTE menghitung dokumen Surat Jalan yang sudah diupload per SO', () => {
  const sql = invoiceOrdersCte();

  assert.match(sql, /count\(fr\.id\)\s+filter\s+\(where\s+fr\.has_travel_document\)::int\s+as\s+travel_document_uploaded_count/i);
});

test('filter SO Terisi tetap memuat SO batal yang sudah punya nomor SO Finance', () => {
  const { whereSql } = buildOrderVerificationFilters({ status: 'verified' });

  assert.match(whereSql, /so\.finance_verification_status\s*=\s*'verified'/i);
  assert.match(whereSql, /nullif\(btrim\(so\.accurate_so_number\), ''\)\s+is\s+not\s+null/i);
  assert.doesNotMatch(whereSql, /so\.status\s*<>\s*'cancelled'/i);
});

test('filter invoice hanya mewajibkan PDF Invoice untuk kelengkapan dokumen', () => {
  const needNumber = buildInvoiceFilters({ status: 'need-number' }).whereSql;
  const inProgress = buildInvoiceFilters({ status: 'in-progress' }).whereSql;
  const missingDocuments = buildInvoiceFilters({ invoiceDocumentFilter: 'missing-documents' }).whereSql;
  const complete = buildInvoiceFilters({ invoiceDocumentFilter: 'complete' }).whereSql;

  assert.match(needNumber, /invoice_document_uploaded_at\s+is\s+null/i);
  assert.doesNotMatch(needNumber, /tax_invoice_document_uploaded_at\s+is\s+null/i);
  assert.match(inProgress, /invoice_document_uploaded_at\s+is\s+not\s+null/i);
  assert.doesNotMatch(inProgress, /tax_invoice_document_uploaded_at\s+is\s+not\s+null/i);
  assert.match(missingDocuments, /invoice_document_uploaded_at\s+is\s+null/i);
  assert.doesNotMatch(missingDocuments, /tax_invoice_document_uploaded_at/i);
  assert.match(complete, /invoice_document_uploaded_at\s+is\s+not\s+null/i);
  assert.doesNotMatch(complete, /tax_invoice_document_uploaded_at/i);
});
