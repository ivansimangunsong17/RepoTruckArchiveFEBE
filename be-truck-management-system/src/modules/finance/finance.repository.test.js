import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  buildInvoiceFilters,
  buildOrderVerificationFilters,
  buildOutstandingFilters,
  buildCustomerOutstandingFilters,
  getCustomerOutstandingRollupExport,
  invoiceOrdersCte,
  outstandingOrdersCte,
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

test('customer outstanding CTE tidak lagi membatasi trip_date ke Juni-Agustus 2026', () => {
  const sql = outstandingOrdersCte();

  assert.doesNotMatch(sql, /2026-06-01/);
  assert.doesNotMatch(sql, /2026-09-01/);
  assert.match(sql, /where\s+outstanding_amount\s*>\s*0/i);
});

test('outstanding CTE mengecualikan data historis sebelum Agustus tanpa nomor invoice', () => {
  const sql = outstandingOrdersCte();

  assert.match(sql, /so_date\s*>=\s*date\s*'2026-08-01'/i);
  assert.match(sql, /nullif\(btrim\(invoice_number\),\s*''\)\s+is\s+not\s+null/i);
});

test('filter outstanding SO menerapkan rentang trip_date dari dateFrom/dateTo', () => {
  const noRange = buildOutstandingFilters({});
  const withRange = buildOutstandingFilters({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });

  assert.doesNotMatch(noRange.whereSql, /trip_date/i);
  assert.match(withRange.whereSql, /trip_date\s*>=\s*\$1/i);
  assert.match(withRange.whereSql, /trip_date\s*<=\s*\$2/i);
  assert.deepEqual(withRange.params, ['2026-09-01', '2026-09-30']);
});

test('filter customer outstanding rollup menerapkan rentang trip_date dari dateFrom/dateTo', () => {
  const withRange = buildCustomerOutstandingFilters({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });

  assert.match(withRange.whereSql, /trip_date\s*>=\s*\$1/i);
  assert.match(withRange.whereSql, /trip_date\s*<=\s*\$2/i);
  assert.deepEqual(withRange.params, ['2026-09-01', '2026-09-30']);
});

test('export customer outstanding memakai satu query terfilter tanpa pagination atau summary', async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };

  await getCustomerOutstandingRollupExport({
    query: 'Kimia',
    agingBucket: 'overdue_all',
    sortBy: 'customer_asc',
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
  }, db);

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /group by customer_name/i);
  assert.match(calls[0].sql, /order by customer_name asc/i);
  assert.doesNotMatch(calls[0].sql, /\blimit\b/i);
  assert.doesNotMatch(calls[0].sql, /\boffset\b/i);
  assert.deepEqual(calls[0].params, ['2026-09-01', '2026-09-30', '%Kimia%']);
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

test('status kosong atau "all" pada filter invoice tidak menambah klausa status, sehingga tab Semua menampilkan seluruh data', () => {
  const noStatus = buildInvoiceFilters({});
  const allStatus = buildInvoiceFilters({ status: 'all' });

  assert.equal(noStatus.whereSql, '');
  assert.equal(allStatus.whereSql, '');
});

test('filter dropdown SJ belum lengkap/sudah lengkap pada tab Semua memakai has_travel_document', () => {
  const incomplete = buildInvoiceFilters({ invoiceDocumentFilter: 'sj-incomplete' }).whereSql;
  const complete = buildInvoiceFilters({ invoiceDocumentFilter: 'sj-complete' }).whereSql;

  assert.match(incomplete, /coalesce\(has_travel_document,\s*false\)\s*=\s*false/i);
  assert.match(complete, /coalesce\(has_travel_document,\s*false\)\s*=\s*true/i);
});

test('filter dropdown jatuh tempo dekat/lewat jatuh tempo hanya menyertakan invoice belum lunas', () => {
  const dueSoon = buildInvoiceFilters({ invoiceDocumentFilter: 'due-soon' }).whereSql;
  const overdue = buildInvoiceFilters({ invoiceDocumentFilter: 'overdue' }).whereSql;

  assert.match(dueSoon, /billing_status\s*<>\s*'lunas'/i);
  assert.match(dueSoon, />=\s*\(now\(\) at time zone 'Asia\/Jakarta'\)::date/i);
  assert.match(dueSoon, /<=\s*\(now\(\) at time zone 'Asia\/Jakarta'\)::date\s*\+\s*7/i);

  assert.match(overdue, /billing_status\s*<>\s*'lunas'/i);
  assert.match(overdue, /<\s*\(now\(\) at time zone 'Asia\/Jakarta'\)::date/i);
  assert.doesNotMatch(overdue, /\+\s*7/i);
});
