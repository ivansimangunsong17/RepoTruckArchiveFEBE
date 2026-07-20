const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 28;
const HEADER_HEIGHT = 58;
const FOOTER_HEIGHT = 24;
const ROW_HEIGHT = 18;

function escapePdfText(value) {
  return String(value ?? '-')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');
}

function fitText(value, maxLength = 28) {
  const text = String(value ?? '-').trim() || '-';
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}...` : text;
}

function drawText(text, x, y, { bold = false, size = 8, color = '0 0 0' } = {}) {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function drawLine(x1, y1, x2, y2, color = '0.82 0.82 0.82') {
  return `${color} RG ${x1} ${y1} m ${x2} ${y2} l S`;
}

function drawRect(x, y, width, height, color) {
  return `q ${color} rg ${x} ${y} ${width} ${height} re f Q`;
}

function normalizeColumns(columns) {
  const totalWidth = PAGE_WIDTH - MARGIN * 2;
  const widthSum = columns.reduce((sum, column) => sum + Number(column.width || 1), 0);
  return columns.map((column) => ({
    ...column,
    pdfWidth: (Number(column.width || 1) / widthSum) * totalWidth,
  }));
}

function buildPageContent({
  title,
  subtitle,
  meta = [],
  columns,
  rows,
  pageIndex,
  pageTotal,
}) {
  const commands = [
    drawText(title, MARGIN, PAGE_HEIGHT - 30, { bold: true, size: 16, color: '0.05 0.06 0.08' }),
    drawText(subtitle, MARGIN, PAGE_HEIGHT - 46, { size: 8, color: '0.35 0.38 0.45' }),
    drawLine(MARGIN, PAGE_HEIGHT - HEADER_HEIGHT, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - HEADER_HEIGHT, '0.63 0.06 0.08'),
  ];

  meta.slice(0, 4).forEach((item, index) => {
    const text = `${item.label}: ${item.value}`;
    commands.push(drawText(text, PAGE_WIDTH - MARGIN - 190, PAGE_HEIGHT - 30 - index * 11, { size: 7, color: '0.28 0.31 0.36' }));
  });

  let y = PAGE_HEIGHT - HEADER_HEIGHT - 22;
  const tableX = MARGIN;
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  commands.push(drawRect(tableX, y, tableWidth, ROW_HEIGHT, '0.62 0.06 0.08'));

  let x = tableX;
  columns.forEach((column) => {
    commands.push(drawText(column.label, x + 4, y + 6, { bold: true, size: 6.8, color: '1 1 1' }));
    x += column.pdfWidth;
  });

  y -= ROW_HEIGHT;
  rows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 1) commands.push(drawRect(tableX, y, tableWidth, ROW_HEIGHT, '0.97 0.98 0.99'));
    commands.push(drawLine(tableX, y, tableX + tableWidth, y, '0.86 0.88 0.91'));
    x = tableX;
    columns.forEach((column) => {
      const value = typeof column.value === 'function' ? column.value(row, rowIndex) : row[column.key];
      commands.push(drawText(fitText(value, column.maxLength || 28), x + 4, y + 6, { bold: column.bold, size: 6.6, color: '0.12 0.14 0.18' }));
      x += column.pdfWidth;
    });
    y -= ROW_HEIGHT;
  });

  commands.push(drawLine(MARGIN, FOOTER_HEIGHT + 10, PAGE_WIDTH - MARGIN, FOOTER_HEIGHT + 10, '0.86 0.88 0.91'));
  commands.push(drawText(`Halaman ${pageIndex + 1} dari ${pageTotal}`, PAGE_WIDTH - MARGIN - 75, FOOTER_HEIGHT, { size: 7, color: '0.45 0.48 0.54' }));
  commands.push(drawText('Armada Truck Management System', MARGIN, FOOTER_HEIGHT, { size: 7, color: '0.45 0.48 0.54' }));

  return commands.join('\n');
}

function buildPdfFile(pageStreams) {
  const encoder = new TextEncoder();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageStreams.map((_, index) => `${3 + index} 0 R`).join(' ')}] /Count ${pageStreams.length} >>`,
  ];
  const fontObjectStart = 3 + pageStreams.length * 2;
  const contentObjectStart = 3 + pageStreams.length;

  pageStreams.forEach((_, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectStart} 0 R /F2 ${fontObjectStart + 1} 0 R >> >> /Contents ${contentObjectStart + index} 0 R >>`);
  });

  pageStreams.forEach((stream) => {
    const bytes = encoder.encode(stream);
    objects.push({
      dictionary: `<< /Length ${bytes.length} >>`,
      stream: bytes,
    });
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const chunks = [];
  const offsets = [];
  let byteLength = 0;

  function append(value) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes);
    byteLength += bytes.length;
  }

  append('%PDF-1.4\n');
  objects.forEach((object, index) => {
    offsets[index + 1] = byteLength;
    append(`${index + 1} 0 obj\n`);
    if (typeof object === 'string') {
      append(object);
    } else {
      append(`${object.dictionary}\nstream\n`);
      append(object.stream);
      append('\nendstream');
    }
    append('\nendobj\n');
  });

  const xrefStart = byteLength;
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index <= objects.length; index += 1) {
    append(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  append(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
}

export function downloadPdfReport({
  title,
  subtitle = '',
  meta = [],
  columns = [],
  rows = [],
  filename = 'report.pdf',
}) {
  const normalizedColumns = normalizeColumns(columns);
  const rowsPerPage = Math.max(1, Math.floor((PAGE_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT - ROW_HEIGHT - 38) / ROW_HEIGHT));
  const pages = [];
  for (let index = 0; index < Math.max(rows.length, 1); index += rowsPerPage) {
    pages.push(rows.slice(index, index + rowsPerPage));
  }

  const pageStreams = pages.map((pageRows, pageIndex) => buildPageContent({
    title,
    subtitle,
    meta,
    columns: normalizedColumns,
    rows: pageRows,
    pageIndex,
    pageTotal: pages.length,
  }));
  const blob = buildPdfFile(pageStreams);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
