export const DOCUMENT_MONITORING_WARNING_DAYS = 30;

export const DOCUMENT_MONITORING_RESOURCES = [
  {
    resource: 'trucks',
    category: 'Truck',
    getName: (row) => String(row.plateNumber || row.unitCode || row.name || '-').trim() || '-',
    documents: [
      { key: 'kirDocument', label: 'KIR' },
      { key: 'stnkDocument', label: 'STNK' },
      { key: 'stidDocument', label: 'STID' },
      { key: 'insuranceDocument', label: 'Asuransi' },
    ],
    dates: [
      { key: 'kirExpiryDate', label: 'KIR OFF' },
      { key: 'stnkExpiryDate', label: 'STNK OFF' },
      { key: 'stidExpiryDate', label: 'STID OFF' },
      { key: 'insuranceExpiryDate', label: 'Asuransi OFF' },
      { key: 'taxPaymentDate', label: 'Bayar Pajak', alert: false },
    ],
  },
  {
    resource: 'drivers',
    category: 'Sopir',
    getName: (row) => String(row.nickname || row.name || '-').trim() || '-',
    documents: [
      { key: 'driverPhoto', label: 'Foto Sopir' },
      { key: 'identityDocument', label: 'KTP' },
      { key: 'licenseDocument', label: 'SIM' },
      { key: 'partnershipLetter', label: 'Kemitraan' },
    ],
    dates: [
      { key: 'licenseExpiry', label: 'SIM OFF' },
    ],
  },
  {
    resource: 'customers',
    category: 'Customer',
    getName: (row) => String(row.name || row.pic || '-').trim() || '-',
    documents: [
      { key: 'npwpDocument', label: 'NPWP' },
      { key: 'contractDocument', label: 'Umbrella Contract' },
    ],
    dates: [
      { key: 'contractEnd', label: 'Contract OFF' },
    ],
  },
  {
    resource: 'kir-chassis',
    category: 'Chassis',
    getName: (row) => String(row.chassisCode || row.kirNumber || row.plateNumber || '-').trim() || '-',
    documents: [
      { key: 'kirDocument', label: 'Dokumen KIR Chassis' },
      { key: 'photoDocument', label: 'Foto Unit Chassis' },
    ],
    dates: [
      { key: 'kirExpiryDate', label: 'KIR Chassis OFF' },
    ],
  },
];

function startOfLocalDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseMonitoringDate(value) {
  if (!value) return null;
  if (value instanceof Date) return startOfLocalDay(value);

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  return startOfLocalDay(raw);
}

export function daysUntilDate(value, baseDate = new Date()) {
  const target = parseMonitoringDate(value);
  const base = startOfLocalDay(baseDate);
  if (!target || !base) return null;
  return Math.ceil((target.getTime() - base.getTime()) / 86400000);
}

export function hasMonitoringDocument(value) {
  if (!value) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof File !== 'undefined' && value instanceof File) return true;
  if (typeof value === 'object') {
    return Boolean(
      value.path
      || value.storagePath
      || value.url
      || value.name
      || value.fileName
      || value.fileNameOriginal
      || value.id
      || value.rawFile
    );
  }
  return Boolean(value);
}

function toDateItem(row, definition, baseDate) {
  const date = parseMonitoringDate(row?.[definition.key]);
  const daysUntil = date ? daysUntilDate(date, baseDate) : null;
  const alert = definition.alert !== false;
  let status = 'missing';
  if (date && !alert) status = 'info';
  if (date && alert && daysUntil < 0) status = 'expired';
  if (date && alert && daysUntil >= 0 && daysUntil <= DOCUMENT_MONITORING_WARNING_DAYS) status = 'warning';
  if (date && alert && daysUntil > DOCUMENT_MONITORING_WARNING_DAYS) status = 'ok';

  return {
    key: definition.key,
    label: definition.label,
    value: row?.[definition.key] || '',
    date,
    daysUntil,
    alert,
    status,
  };
}

function statusRank(status) {
  return {
    expired: 0,
    warning: 1,
    incomplete: 2,
    complete: 3,
  }[status] ?? 4;
}

function buildRow(resourceDefinition, row, index, baseDate) {
  const documentItems = resourceDefinition.documents.map((document) => ({
    ...document,
    complete: hasMonitoringDocument(row?.[document.key]),
  }));
  const dateItems = resourceDefinition.dates.map((date) => toDateItem(row, date, baseDate));
  const alertDateItems = dateItems.filter((item) => item.alert);
  const missingDocuments = documentItems.filter((document) => !document.complete);
  const missingDates = alertDateItems.filter((item) => item.status === 'missing');
  const expiredDates = alertDateItems.filter((item) => item.status === 'expired');
  const warningDates = alertDateItems.filter((item) => item.status === 'warning');
  const upcomingDates = alertDateItems
    .filter((item) => item.date)
    .sort((left, right) => left.daysUntil - right.daysUntil);
  const documentComplete = documentItems.length - missingDocuments.length;
  let status = 'complete';

  if (expiredDates.length) status = 'expired';
  else if (warningDates.length) status = 'warning';
  else if (missingDocuments.length || missingDates.length) status = 'incomplete';

  return {
    id: `${resourceDefinition.resource}-${row?.id || index}`,
    resource: resourceDefinition.resource,
    category: resourceDefinition.category,
    name: resourceDefinition.getName(row),
    raw: row,
    status,
    documentItems,
    documentTotal: documentItems.length,
    documentComplete,
    documentPercent: documentItems.length ? Math.round((documentComplete / documentItems.length) * 100) : 100,
    missingDocuments,
    missingDates,
    dateItems,
    expiredDates,
    warningDates,
    nearestDate: upcomingDates[0] || null,
  };
}

export function buildDocumentMonitoringRows(masters = {}, baseDate = new Date()) {
  return DOCUMENT_MONITORING_RESOURCES.flatMap((resourceDefinition) => (
    (masters?.[resourceDefinition.resource] || []).map((row, index) => buildRow(resourceDefinition, row, index, baseDate))
  )).sort((left, right) => (
    statusRank(left.status) - statusRank(right.status)
    || left.category.localeCompare(right.category, 'id')
    || left.name.localeCompare(right.name, 'id')
  ));
}

export function summarizeDocumentMonitoring(rows = []) {
  return rows.reduce((summary, row) => ({
    total: summary.total + 1,
    complete: summary.complete + (row.status === 'complete' ? 1 : 0),
    incomplete: summary.incomplete + (row.missingDocuments.length || row.missingDates.length ? 1 : 0),
    warning: summary.warning + (row.warningDates.length ? 1 : 0),
    expired: summary.expired + (row.expiredDates.length ? 1 : 0),
  }), {
    total: 0,
    complete: 0,
    incomplete: 0,
    warning: 0,
    expired: 0,
  });
}
