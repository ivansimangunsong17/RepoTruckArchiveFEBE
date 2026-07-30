const HOLIDAY_API_BASE_URL = 'https://date.nager.at/api/v3/PublicHolidays';
const HOLIDAY_COUNTRY_CODE = 'ID';
const HOLIDAY_CACHE_PREFIX = 'tms-public-holidays-id';

function normalizeHoliday(row = {}) {
  const date = String(row.date || '').trim();
  if (!date) return null;
  return {
    date,
    localName: String(row.localName || row.name || 'Libur Nasional').trim(),
    name: String(row.name || row.localName || 'Public Holiday').trim(),
  };
}

function readCachedHolidays(year) {
  try {
    const cached = JSON.parse(localStorage.getItem(`${HOLIDAY_CACHE_PREFIX}-${year}`));
    return Array.isArray(cached) ? cached.map(normalizeHoliday).filter(Boolean) : null;
  } catch {
    return null;
  }
}

function cacheHolidays(year, holidays) {
  try {
    localStorage.setItem(`${HOLIDAY_CACHE_PREFIX}-${year}`, JSON.stringify(holidays));
  } catch {
    // Cache is optional; the fetched holiday data can still be used in-memory.
  }
}

export async function fetchIndonesiaPublicHolidays(year) {
  const normalizedYear = Number(year);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 2100) return [];

  const cached = readCachedHolidays(normalizedYear);
  if (cached) return cached;

  const response = await fetch(`${HOLIDAY_API_BASE_URL}/${normalizedYear}/${HOLIDAY_COUNTRY_CODE}`);
  if (!response.ok) {
    throw new Error('Data libur nasional gagal dimuat.');
  }

  const data = await response.json();
  const holidays = Array.isArray(data) ? data.map(normalizeHoliday).filter(Boolean) : [];
  cacheHolidays(normalizedYear, holidays);
  return holidays;
}

export function buildHolidayMap(holidays = []) {
  return holidays.reduce((map, holiday) => {
    const normalized = normalizeHoliday(holiday);
    if (!normalized) return map;
    map[normalized.date] = map[normalized.date] || [];
    map[normalized.date].push(normalized);
    return map;
  }, {});
}
