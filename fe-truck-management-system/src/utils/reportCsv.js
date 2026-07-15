import { parseOtherCost } from './otherCost';

const STATUS_LABELS = {
  waiting_operational: 'Belum Jalan',
  received: 'Belum Jalan',
  running: 'Sedang Jalan',
  completed: 'Selesai',
  cancelled: 'Batal',
  pending: 'Belum Diproses',
  submitted: 'Diajukan',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

function cleanValue(value) {
  return String(value ?? '').replace(/\r?\n|\r/g, ' ').trim();
}

function escapeHtml(value) {
  return cleanValue(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeCsvCell(value) {
  return `"${cleanValue(value).replaceAll('"', '""')}"`;
}

export function formatCsvDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export function formatCsvDateTime(value) {
  if (!value) return '';
  return String(value).slice(0, 16).replace('T', ' ');
}

export function formatCsvNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

export function formatCsvStatus(value) {
  return STATUS_LABELS[value] || value || '';
}

export function buildReportCsv({
  title,
  generatedAt = new Date(),
  filters = [],
  headers,
  rows,
}) {
  const metadataRows = [
    ['Laporan', title],
    ['Tanggal Export', formatCsvDateTime(generatedAt.toISOString())],
    ...filters.filter(([, value]) => value !== undefined && value !== null && value !== ''),
    [],
  ];

  return [
    'sep=,',
    ...metadataRows.map((row) => row.map(escapeCsvCell).join(',')),
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ].join('\r\n');
}

function getExcelColumnWidth(header, rows, index) {
  const label = String(header || '').toLowerCase();
  if (label === 'no') return 46;
  if (label.includes('tanggal') || label.includes('diterima') || label.includes('mulai') || label.includes('selesai') || label.includes('update')) return 142;
  if (label.includes('nomor') || label.includes('status')) return 126;
  if (label.includes('customer') || label.includes('pekerjaan') || label.includes('catatan') || label.includes('alasan')) return 190;
  if (label.includes('asal') || label.includes('tujuan')) return 150;
  if (label.includes('harga') || label.includes('total') || label.includes('nilai') || label.includes('quantity')) return 118;

  const longest = Math.max(
    String(header || '').length,
    ...rows.slice(0, 50).map((row) => cleanValue(row[index]).length),
  );
  return Math.min(Math.max(longest * 8.5 + 28, 92), 220);
}

export function buildReportExcelHtml({
  title,
  generatedAt = new Date(),
  filters = [],
  headers,
  rows,
}) {
  const visibleFilters = filters.filter(([, value]) => value !== undefined && value !== null && value !== '');
  const columnCount = Math.max(headers.length, 2);
  const colgroup = headers
    .map((header, index) => `<col style="width:${getExcelColumnWidth(header, rows, index)}px" />`)
    .join('');
  const metadataRows = [
    ['Tanggal Export', formatCsvDateTime(generatedAt.toISOString())],
    ...visibleFilters,
    ['Jumlah Kolom', headers.length],
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111827; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #d9dde4; padding: 7px 9px; font-size: 11pt; vertical-align: top; mso-number-format:"\\@"; }
    .title { background: #9f141a; color: #ffffff; font-size: 16pt; font-weight: 700; }
    .subtitle { background: #f7f7f8; color: #4b5563; font-weight: 700; }
    .label { background: #f7f7f8; color: #4b5563; font-weight: 700; width: 180px; }
    .value { color: #111827; font-weight: 600; }
    .spacer td { height: 14px; border: 0; padding: 0; }
    .header th { background: #111827; color: #ffffff; font-weight: 700; text-align: left; white-space: nowrap; }
    .number { text-align: right; }
    .data td { white-space: normal; }
  </style>
</head>
<body>
  <table>
    <colgroup>${colgroup}</colgroup>
    <tr><td class="title" colspan="${columnCount}">${escapeHtml(title)}</td></tr>
    <tr><td class="subtitle" colspan="${columnCount}">Armada Truck Management System</td></tr>
    ${metadataRows.map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td class="value" colspan="${columnCount - 1}">${escapeHtml(value)}</td></tr>`).join('')}
    <tr class="spacer"><td colspan="${columnCount}"></td></tr>
    <tr class="header">${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
    ${rows.map((row) => `<tr class="data">${row.map((cell) => {
      const value = cleanValue(cell);
      const isNumber = typeof cell === 'number';
      return `<td${isNumber ? ' class="number"' : ''}>${escapeHtml(value)}</td>`;
    }).join('')}</tr>`).join('')}
  </table>
</body>
</html>`;
}

export function getSalesReportHeaders(includeCommercial = false) {
  const baseHeaders = [
    'No',
    'Nomor SO',
    'Nomor DO',
    'Tanggal SO',
    'Order Masuk',
    'Customer',
    'PIC Customer',
    'Kontak Customer',
    'Asal',
    'Tujuan',
    'Shipment',
    'Jenis Pekerjaan',
    'Jumlah Container',
    'Quantity',
    'Unit',
  ];

  if (includeCommercial) baseHeaders.push('Harga Satuan', 'Total Nilai');

  return [
    ...baseHeaders,
    'Status',
    'Sales',
    'Catatan',
  ];
}

export function mapSalesReportRow(order, index, includeCommercial = false) {
  const baseRow = [
    index + 1,
    order.soNumber,
    order.doNumber,
    formatCsvDate(order.soDate),
    formatCsvDateTime(order.receivedAt),
    order.customer,
    order.customerPic,
    order.customerPhone,
    order.origin,
    order.destination,
    order.shipment,
    order.jobType,
    order.containers?.length || 0,
    formatCsvNumber(order.quantity),
    order.unit,
  ];

  if (includeCommercial) {
    baseRow.push(formatCsvNumber(order.price), formatCsvNumber(order.totalAmount));
  }

  return [
    ...baseRow,
    formatCsvStatus(order.status),
    order.salesName || order.createdBy,
    order.jobDescription || order.notes,
  ];
}

export function getOperationalReportHeaders() {
  return [
    'No',
    'Nomor SO',
    'Nomor DO',
    'Nomor Container',
    'Ukuran',
    'Tipe',
    'Customer',
    'Asal',
    'Tujuan',
    'Driver',
    'Truck',
    'Biaya Lainnya',
    'No SPK',
    'Bon Muat',
    'TILA / Delivery Card / Gatepass / SP2',
    'Surat Jalan',
    'Job Masuk',
    'Mulai',
    'Selesai',
    'Status',
    'Update Terakhir',
  ];
}

export function mapOperationalReportRow(job, index) {
  const otherCost = parseOtherCost(job.rpujNotes);
  return [
    index + 1,
    job.soNumber,
    job.doNumber,
    job.containerNumber,
    job.size,
    job.type,
    job.customer,
    job.origin,
    job.destination,
    job.driver || 'Belum ditentukan',
    job.plateNumber || 'Belum ditentukan',
    formatCsvNumber(otherCost.amount),
    job.spkNumber,
    job.loadingVoucher,
    job.tilaGatepassDocument || job.unloadingVoucher || job.weighingDocument,
    job.travelDocument,
    formatCsvDateTime(job.receivedAt),
    formatCsvDateTime(job.runningAt),
    formatCsvDateTime(job.completedAt),
    formatCsvStatus(job.status),
    formatCsvDateTime(job.updatedAt || job.receivedAt),
  ];
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename, html) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
