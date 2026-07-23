import '../src/config/env.js';
import { pathToFileURL } from 'node:url';
import { closePool, query } from '../src/db/client.js';
import {
  splitFinancialLineItems,
  sumLineItems,
} from '../src/modules/reports/revenue-line-items.js';

export function readArgs(argv = process.argv.slice(2)) {
  const options = { json: false, limit: 25 };
  argv.forEach((arg, index) => {
    if (arg === '--json') options.json = true;
    if (arg === '--all') options.limit = 0;
    if (arg === '--limit') options.limit = Math.max(0, Number(argv[index + 1] || 25));
    if (arg.startsWith('--limit=')) options.limit = Math.max(0, Number(arg.split('=')[1] || 25));
  });
  return options;
}

function money(value) {
  return Number(value || 0);
}

function diff(left, right) {
  return Math.abs(money(left) - money(right));
}

function createIssue(code, message, severity = 'warning') {
  return { code, message, severity };
}

export function analyzeOrder(row, hasLineItemsColumn) {
  const rawLineItems = hasLineItemsColumn ? row.line_items : [];
  const financial = splitFinancialLineItems(rawLineItems);
  const lineItemsTotal = sumLineItems(financial.items);
  const transportTotal = sumLineItems(financial.transportItems);
  const reimbursementTotal = sumLineItems(financial.reimbursementItems);
  const unknownTotal = sumLineItems(financial.unknownItems);
  const totalAmount = money(row.total_amount);
  const issues = [];

  if (!hasLineItemsColumn) {
    issues.push(createIssue(
      'LINE_ITEMS_COLUMN_MISSING',
      'Kolom line_items belum tersedia di database ini. Jalankan migrasi schema sebelum audit rincian jasa.',
      'critical',
    ));
  } else if (!financial.items.length && totalAmount > 0) {
    issues.push(createIssue(
      'LINE_ITEMS_EMPTY',
      'SO punya total amount, tetapi rincian line_items kosong.',
      'critical',
    ));
  }

  if (financial.items.length && diff(lineItemsTotal, totalAmount) > 1) {
    issues.push(createIssue(
      'TOTAL_AMOUNT_MISMATCH',
      `Total SO (${totalAmount}) tidak sama dengan total line_items (${lineItemsTotal}).`,
      'critical',
    ));
  }

  if (financial.items.length && !financial.transportItems.length && Number(row.completed_jobs || 0) > 0) {
    issues.push(createIssue(
      'TRANSPORT_REVENUE_MISSING',
      'SO punya job selesai, tetapi tidak punya item Jasa Angkut D20/D40.',
      'critical',
    ));
  }

  if (financial.unknownItems.length) {
    issues.push(createIssue(
      'UNKNOWN_SERVICE',
      'Ada service di line_items yang belum masuk mapping revenue/reimbursement.',
    ));
  }

  if (!financial.items.length && totalAmount > 0 && Number(row.completed_jobs || 0) > 0) {
    issues.push(createIssue(
      'LEGACY_REVENUE_FALLBACK',
      'Revenue masih akan memakai fallback legacy dari price/total_amount karena line_items tidak tersedia.',
    ));
  }

  if (Number(row.cancelled_jobs || 0) > 0 && !financial.items.length && totalAmount > 0) {
    issues.push(createIssue(
      'CANCELLED_JOB_WITH_LEGACY_AMOUNT',
      'Ada container batal dan SO belum punya line_items; data ini rawan menggandakan revenue lama.',
      'critical',
    ));
  }

  return {
    id: row.id,
    soNumber: row.so_number || '-',
    status: row.status || '',
    customer: row.customer_name || '',
    totalAmount,
    lineItemsTotal,
    transportTotal,
    reimbursementTotal,
    unknownTotal,
    lineItemsCount: financial.items.length,
    transportItemsCount: financial.transportItems.length,
    reimbursementItemsCount: financial.reimbursementItems.length,
    unknownItemsCount: financial.unknownItems.length,
    plannedJobs: Number(row.total_jobs || 0),
    completedJobs: Number(row.completed_jobs || 0),
    cancelledJobs: Number(row.cancelled_jobs || 0),
    issues,
  };
}

export function summarize(results, hasLineItemsColumn) {
  const issueCounts = new Map();
  results.forEach((result) => {
    result.issues.forEach((issue) => {
      issueCounts.set(issue.code, (issueCounts.get(issue.code) || 0) + 1);
    });
  });

  return {
    hasLineItemsColumn,
    totalOrders: results.length,
    cleanOrders: results.filter((result) => result.issues.length === 0).length,
    ordersWithIssues: results.filter((result) => result.issues.length > 0).length,
    criticalOrders: results.filter((result) => result.issues.some((issue) => issue.severity === 'critical')).length,
    totalTransportRevenue: results.reduce((total, result) => total + result.transportTotal, 0),
    totalReimbursement: results.reduce((total, result) => total + result.reimbursementTotal, 0),
    issueCounts: Object.fromEntries([...issueCounts.entries()].sort()),
  };
}

function printTextReport(report, limit) {
  console.log('Audit Revenue Line Items');
  console.log('========================');
  console.log(`Kolom line_items       : ${report.summary.hasLineItemsColumn ? 'ada' : 'belum ada'}`);
  console.log(`Total SO diaudit      : ${report.summary.totalOrders}`);
  console.log(`SO bersih             : ${report.summary.cleanOrders}`);
  console.log(`SO perlu dicek        : ${report.summary.ordersWithIssues}`);
  console.log(`SO critical           : ${report.summary.criticalOrders}`);
  console.log(`Transport revenue     : ${report.summary.totalTransportRevenue}`);
  console.log(`Reimbursement         : ${report.summary.totalReimbursement}`);
  console.log('');

  if (Object.keys(report.summary.issueCounts).length) {
    console.log('Issue counts:');
    Object.entries(report.summary.issueCounts).forEach(([code, count]) => {
      console.log(`- ${code}: ${count}`);
    });
    console.log('');
  }

  const rows = limit ? report.ordersWithIssues.slice(0, limit) : report.ordersWithIssues;
  if (!rows.length) {
    console.log('Tidak ada issue pada data yang diaudit.');
    return;
  }

  console.log(`Contoh SO bermasalah${limit ? ` (maks ${limit})` : ''}:`);
  rows.forEach((row) => {
    console.log(`- ${row.soNumber} | ${row.customer} | total ${row.totalAmount} | line_items ${row.lineItemsCount}`);
    row.issues.forEach((issue) => {
      console.log(`  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
    });
  });
}

async function hasColumn(tableName, columnName) {
  const result = await query(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
          and column_name = $2
      ) as exists
    `,
    [tableName, columnName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function loadOrders(hasLineItemsColumn) {
  const lineItemsSelect = hasLineItemsColumn ? 'so.line_items' : "'[]'::jsonb as line_items";
  const result = await query(
    `
      select
        so.id,
        so.so_number,
        so.status,
        so.customer_name,
        so.total_amount,
        so.price,
        so.quantity,
        ${lineItemsSelect},
        count(cj.id)::int as total_jobs,
        count(cj.id) filter (where cj.status = 'completed')::int as completed_jobs,
        count(cj.id) filter (where cj.status = 'cancelled')::int as cancelled_jobs
      from sales_orders so
      left join container_jobs cj on cj.sales_order_id = so.id
      where so.status <> 'cancelled'
      group by so.id
      order by so.created_at desc
    `,
  );
  return result.rows;
}

async function main() {
  const options = readArgs();
  const hasLineItemsColumn = await hasColumn('sales_orders', 'line_items');
  const rows = await loadOrders(hasLineItemsColumn);
  const results = rows.map((row) => analyzeOrder(row, hasLineItemsColumn));
  const report = {
    generatedAt: new Date().toISOString(),
    summary: summarize(results, hasLineItemsColumn),
    ordersWithIssues: results.filter((result) => result.issues.length > 0),
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report, options.limit);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePool();
    });
}
