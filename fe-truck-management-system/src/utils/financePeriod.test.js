import { describe, expect, it } from 'vitest';
import { getFinancePeriodRange, getFinanceYearOptions } from './financePeriod';

describe('financePeriod', () => {
  it('membentuk rentang satu bulan penuh', () => {
    expect(getFinancePeriodRange('7', '2026')).toEqual({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    });
  });

  it('menghitung akhir Februari pada tahun kabisat', () => {
    expect(getFinancePeriodRange('2', '2028')).toEqual({
      dateFrom: '2028-02-01',
      dateTo: '2028-02-29',
    });
  });

  it('menyediakan tahun berikutnya dan histori sebelas tahun', () => {
    const years = getFinanceYearOptions(2026);
    expect(years).toHaveLength(12);
    expect(years.at(0)).toBe('2027');
    expect(years.at(-1)).toBe('2016');
  });
});
