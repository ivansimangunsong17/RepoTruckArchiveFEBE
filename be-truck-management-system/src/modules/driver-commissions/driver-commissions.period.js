const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function fromDateKey(dateKey) {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || toDateKey(date) !== dateKey ? null : date;
}

function currentJakartaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isDateKey(value) {
  return Boolean(fromDateKey(String(value || '').trim()));
}

export function buildCommissionPeriod(dateKey = currentJakartaDateKey()) {
  const date = fromDateKey(String(dateKey || '').trim());
  if (!date) {
    const error = new Error('Tanggal periode komisi harus format YYYY-MM-DD.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const day = date.getUTCDay();
  const daysSinceThursday = (day - 4 + 7) % 7;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - daysSinceThursday);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    periodStart: toDateKey(start),
    periodEnd: toDateKey(end),
  };
}

export function normalizeCommissionPeriod(input = {}) {
  const periodStart = String(input.periodStart || input.period_start || '').trim();
  const periodEnd = String(input.periodEnd || input.period_end || '').trim();

  if (!periodStart && !periodEnd) return buildCommissionPeriod(input.date || input.referenceDate);
  if (!isDateKey(periodStart) || !isDateKey(periodEnd)) {
    const error = new Error('Periode komisi wajib memakai format tanggal YYYY-MM-DD.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (periodEnd < periodStart) {
    const error = new Error('Tanggal akhir periode komisi tidak boleh sebelum tanggal awal.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return { periodStart, periodEnd };
}

export function isCommissionWeekPeriod(period = {}) {
  if (!isDateKey(period.periodStart) || !isDateKey(period.periodEnd)) return false;
  const normalized = buildCommissionPeriod(period.periodStart);
  return normalized.periodStart === period.periodStart && normalized.periodEnd === period.periodEnd;
}
