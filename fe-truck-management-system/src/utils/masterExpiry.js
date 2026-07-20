const DAY_MS = 24 * 60 * 60 * 1000;

export const MASTER_EXPIRY_STATUS = {
  expired: { key: 'expired', label: 'Sudah Lewat', priority: 0 },
  critical: { key: 'critical', label: 'Segera Urus', priority: 1 },
  soon: { key: 'soon', label: 'Mau Habis', priority: 2 },
  monitor: { key: 'monitor', label: 'Pantau', priority: 3 },
  safe: { key: 'safe', label: 'Aman', priority: 4 },
  missing: { key: 'missing', label: 'Belum Diisi', priority: 5 },
};

export function parseMasterExpiryDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const parsed = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function toDayNumber(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

export function getMasterExpiryState(value, options = {}) {
  const target = parseMasterExpiryDate(value);
  if (!target) return { ...MASTER_EXPIRY_STATUS.missing, daysLeft: null };

  const today = parseMasterExpiryDate(options.today || new Date());
  const criticalDays = Number(options.criticalDays ?? 7);
  const soonDays = Number(options.soonDays ?? 30);
  const monitorDays = Number(options.monitorDays ?? 60);
  const daysLeft = Math.round(toDayNumber(target) - toDayNumber(today));

  if (daysLeft < 0) return { ...MASTER_EXPIRY_STATUS.expired, daysLeft };
  if (daysLeft <= criticalDays) return { ...MASTER_EXPIRY_STATUS.critical, daysLeft };
  if (daysLeft <= soonDays) return { ...MASTER_EXPIRY_STATUS.soon, daysLeft };
  if (daysLeft <= monitorDays) return { ...MASTER_EXPIRY_STATUS.monitor, daysLeft };
  return { ...MASTER_EXPIRY_STATUS.safe, daysLeft };
}

export function formatMasterExpiryDate(value) {
  const parsed = parseMasterExpiryDate(value);
  if (!parsed) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function formatMasterExpiryRemaining(state) {
  if (!state || state.daysLeft === null) return 'Tanggal belum dicatat';
  if (state.daysLeft < 0) return `Lewat ${Math.abs(state.daysLeft)} hari`;
  if (state.daysLeft === 0) return 'Berakhir hari ini';
  return `Sisa ${state.daysLeft} hari`;
}

function getDefaultIdentity(row, singular, index) {
  return row.name
    || row.unitCode
    || row.plateNumber
    || row.chassisCode
    || row.kirNumber
    || `${singular || 'Data'} ${index + 1}`;
}

export function buildMasterExpiryOverview({ rows = [], fields = [], getIdentity, singular, today } = {}) {
  const expiryFields = fields.filter((field) => Boolean(field.expiryAlert));
  const entries = rows.flatMap((row, rowIndex) => expiryFields.map((field) => {
    const config = typeof field.expiryAlert === 'object' ? field.expiryAlert : {};
    const state = getMasterExpiryState(row[field.key], { ...config, today });
    const identity = typeof getIdentity === 'function'
      ? getIdentity(row)
      : getDefaultIdentity(row, singular, rowIndex);

    return {
      id: `${row.id || rowIndex}-${field.key}`,
      row,
      fieldKey: field.key,
      documentLabel: config.label || field.label,
      identity: identity || getDefaultIdentity(row, singular, rowIndex),
      date: row[field.key],
      state,
    };
  }));

  const counts = Object.keys(MASTER_EXPIRY_STATUS).reduce((result, key) => ({ ...result, [key]: 0 }), {});
  entries.forEach((entry) => {
    counts[entry.state.key] += 1;
  });

  const alerts = entries
    .filter((entry) => !['safe', 'missing'].includes(entry.state.key))
    .sort((left, right) => left.state.priority - right.state.priority
      || (left.state.daysLeft ?? Number.MAX_SAFE_INTEGER) - (right.state.daysLeft ?? Number.MAX_SAFE_INTEGER));

  return {
    expiryFields,
    entries,
    alerts,
    counts,
  };
}
