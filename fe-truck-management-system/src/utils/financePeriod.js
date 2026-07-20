export const financeMonthOptions = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
].map((label, index) => ({ label, value: String(index + 1) }));

export function getCurrentFinancePeriod(date = new Date()) {
  return {
    month: String(date.getMonth() + 1),
    year: String(date.getFullYear()),
  };
}

export function getFinancePeriodRange(month, year) {
  const parsedMonth = Number(month);
  const parsedYear = Number(year);
  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12 || !Number.isInteger(parsedYear)) {
    return { dateFrom: '', dateTo: '' };
  }

  const paddedMonth = String(parsedMonth).padStart(2, '0');
  const lastDay = new Date(parsedYear, parsedMonth, 0).getDate();
  return {
    dateFrom: `${parsedYear}-${paddedMonth}-01`,
    dateTo: `${parsedYear}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getFinanceYearOptions(currentYear = new Date().getFullYear()) {
  return Array.from({ length: 12 }, (_, index) => String(currentYear + 1 - index));
}
