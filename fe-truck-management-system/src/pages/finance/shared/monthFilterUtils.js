const MONTH_FILTER_MIN_YEAR = 2000;
const MONTH_FILTER_MAX_YEAR = 2100;
const DEFAULT_MONTH_FILTER_YEAR = String(new Date().getFullYear());
const MONTH_FILTER_OPTIONS = [
  ['01', 'Januari'],
  ['02', 'Februari'],
  ['03', 'Maret'],
  ['04', 'April'],
  ['05', 'Mei'],
  ['06', 'Juni'],
  ['07', 'Juli'],
  ['08', 'Agustus'],
  ['09', 'September'],
  ['10', 'Oktober'],
  ['11', 'November'],
  ['12', 'Desember'],
];

function getMonthDateRange(value) {
  const normalizedValue = normalizeMonthFilterValue(value);
  const match = normalizedValue.match(/^(\d{4})-(\d{2})$/);
  if (!match) return { dateFrom: '', dateTo: '' };

  const [, yearText, monthText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = new Date(year, month, 0).getDate();

  return {
    dateFrom: `${yearText}-${monthText}-01`,
    dateTo: `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  };
}

function normalizeMonthFilterValue(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';

  const [, yearText, monthText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  if (year < MONTH_FILTER_MIN_YEAR || year > MONTH_FILTER_MAX_YEAR || month < 1 || month > 12) return '';
  return `${yearText}-${monthText}`;
}

function normalizeMonthFilterYear(value) {
  const yearText = String(value || '').trim();
  if (!/^\d{4}$/.test(yearText)) return '';

  const year = Number(yearText);
  if (year < MONTH_FILTER_MIN_YEAR || year > MONTH_FILTER_MAX_YEAR) return '';
  return yearText;
}

function getMonthFilterParts(value) {
  const normalizedValue = normalizeMonthFilterValue(value);
  if (!normalizedValue) return { month: '', year: '' };

  const [year, month] = normalizedValue.split('-');
  return { month, year };
}

export {
  DEFAULT_MONTH_FILTER_YEAR,
  MONTH_FILTER_MAX_YEAR,
  MONTH_FILTER_MIN_YEAR,
  MONTH_FILTER_OPTIONS,
  getMonthDateRange,
  getMonthFilterParts,
  normalizeMonthFilterValue,
  normalizeMonthFilterYear,
};
