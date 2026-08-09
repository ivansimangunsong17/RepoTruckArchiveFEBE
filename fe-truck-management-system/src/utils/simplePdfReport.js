const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 32;
const HEADER_HEIGHT = 116;
const FOOTER_HEIGHT = 24;
const ROW_HEIGHT = 22;
const COLORS = {
  ink: '0.05 0.06 0.08',
  muted: '0.35 0.38 0.45',
  soft: '0.96 0.97 0.99',
  line: '0.86 0.88 0.91',
  red: '0.64 0.04 0.07',
  redDark: '0.47 0.02 0.04',
  redSoft: '1 0.94 0.94',
  white: '1 1 1',
};

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

function approximateTextWidth(text, size = 8) {
  return String(text ?? '').length * size * 0.48;
}

function drawTextAligned(text, x, y, width, { align = 'left', bold = false, size = 8, color = '0 0 0' } = {}) {
  const safeText = fitText(text, Math.max(8, Math.floor(width / (size * 0.48))));
  const textWidth = approximateTextWidth(safeText, size);
  const nextX = align === 'right'
    ? x + width - textWidth
    : align === 'center'
      ? x + (width - textWidth) / 2
      : x;
  return drawText(safeText, Math.max(x, nextX), y, { bold, size, color });
}

function drawLine(x1, y1, x2, y2, color = '0.82 0.82 0.82') {
  return `${color} RG ${x1} ${y1} m ${x2} ${y2} l S`;
}

function drawRect(x, y, width, height, color) {
  return `q ${color} rg ${x} ${y} ${width} ${height} re f Q`;
}

function drawStrokeRect(x, y, width, height, color = COLORS.line) {
  return `${color} RG ${x} ${y} ${width} ${height} re S`;
}

function formatGeneratedAt(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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
  reportLabel = 'Operational Report',
  generatedAt,
}) {
  const tableX = MARGIN;
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const topY = PAGE_HEIGHT - MARGIN;
  const cardY = PAGE_HEIGHT - 92;
  const metaItems = meta.slice(0, 4);
  const cardGap = 8;
  const cardWidth = metaItems.length
    ? (tableWidth - cardGap * (metaItems.length - 1)) / metaItems.length
    : 0;

  const commands = [
    drawRect(0, PAGE_HEIGHT - 8, PAGE_WIDTH, 8, COLORS.red),
    drawText(reportLabel, MARGIN, topY, { bold: true, size: 7.2, color: COLORS.red }),
    drawText(title, MARGIN, topY - 19, { bold: true, size: 17, color: COLORS.ink }),
    drawText(subtitle, MARGIN, topY - 35, { size: 8.5, color: COLORS.muted }),
    drawText(`Dicetak ${generatedAt || formatGeneratedAt()}`, PAGE_WIDTH - MARGIN - 138, topY - 3, { size: 7.2, color: COLORS.muted }),
    drawLine(MARGIN, topY - 47, PAGE_WIDTH - MARGIN, topY - 47, COLORS.line),
  ];

  metaItems.forEach((item, index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    commands.push(drawRect(x, cardY, cardWidth, 32, index === 0 ? COLORS.redSoft : COLORS.soft));
    commands.push(drawStrokeRect(x, cardY, cardWidth, 32, index === 0 ? '0.96 0.73 0.74' : COLORS.line));
    commands.push(drawText(item.label, x + 8, cardY + 20, { bold: true, size: 6.5, color: COLORS.muted }));
    commands.push(drawText(String(item.value ?? '-'), x + 8, cardY + 7, { bold: true, size: 12, color: index === 0 ? COLORS.redDark : COLORS.ink }));
  });

  let y = PAGE_HEIGHT - HEADER_HEIGHT - 14;
  commands.push(drawRect(tableX, y, tableWidth, ROW_HEIGHT, '0.62 0.06 0.08'));

  let x = tableX;
  columns.forEach((column) => {
    commands.push(drawTextAligned(column.label, x + 7, y + 7, column.pdfWidth - 14, {
      align: column.align || 'left',
      bold: true,
      size: 7,
      color: COLORS.white,
    }));
    x += column.pdfWidth;
  });

  y -= ROW_HEIGHT;
  const visibleRows = rows.length ? rows : [{ __empty: true }];
  visibleRows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 1) commands.push(drawRect(tableX, y, tableWidth, ROW_HEIGHT, COLORS.soft));
    commands.push(drawLine(tableX, y, tableX + tableWidth, y, COLORS.line));
    x = tableX;
    columns.forEach((column) => {
      const value = row.__empty
        ? (column === columns[0] ? 'Tidak ada data' : '')
        : typeof column.value === 'function'
          ? column.value(row, rowIndex)
          : row[column.key];
      commands.push(drawTextAligned(value, x + 7, y + 7, column.pdfWidth - 14, {
        align: column.align || 'left',
        bold: column.bold || row.__empty,
        size: 6.8,
        color: '0.12 0.14 0.18',
      }));
      x += column.pdfWidth;
    });
    y -= ROW_HEIGHT;
  });

  commands.push(drawLine(MARGIN, FOOTER_HEIGHT + 10, PAGE_WIDTH - MARGIN, FOOTER_HEIGHT + 10, COLORS.line));
  commands.push(drawText(`Halaman ${pageIndex + 1} dari ${pageTotal}`, PAGE_WIDTH - MARGIN - 75, FOOTER_HEIGHT, { size: 7, color: '0.45 0.48 0.54' }));
  commands.push(drawText('Armada Transportation Management System', MARGIN, FOOTER_HEIGHT, { size: 7, color: '0.45 0.48 0.54' }));

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
  reportLabel = 'Operational Report',
  generatedAt = '',
}) {
  const normalizedColumns = normalizeColumns(columns);
  const rowsPerPage = Math.max(1, Math.floor((PAGE_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT - ROW_HEIGHT - 26) / ROW_HEIGHT));
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
    reportLabel,
    generatedAt,
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
