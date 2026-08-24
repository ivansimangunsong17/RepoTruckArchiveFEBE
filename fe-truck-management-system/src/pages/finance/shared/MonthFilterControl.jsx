import { useEffect, useState } from 'react';
import {
  DEFAULT_MONTH_FILTER_YEAR,
  MONTH_FILTER_MAX_YEAR,
  MONTH_FILTER_MIN_YEAR,
  MONTH_FILTER_OPTIONS,
  getMonthFilterParts,
  normalizeMonthFilterYear,
} from './monthFilterUtils';

function MonthFilterControl({
  className = '',
  label,
  monthAriaLabel,
  onChange,
  value,
  yearAriaLabel,
}) {
  const { month, year } = getMonthFilterParts(value);
  const [draftYear, setDraftYear] = useState(year || DEFAULT_MONTH_FILTER_YEAR);
  const visibleYear = year || draftYear || DEFAULT_MONTH_FILTER_YEAR;

  useEffect(() => {
    if (year) setDraftYear(year);
  }, [year]);

  const handleMonthChange = (event) => {
    const nextMonth = event.target.value;
    if (!nextMonth) {
      onChange('');
      return;
    }

    const normalizedYear = normalizeMonthFilterYear(visibleYear) || DEFAULT_MONTH_FILTER_YEAR;
    onChange(`${normalizedYear}-${nextMonth}`);
  };

  const handleYearChange = (event) => {
    const nextYear = event.target.value;
    const normalizedYear = normalizeMonthFilterYear(nextYear);
    setDraftYear(normalizedYear || DEFAULT_MONTH_FILTER_YEAR);

    if (!month) return;
    if (!normalizedYear) {
      onChange('');
      return;
    }

    onChange(`${normalizedYear}-${month}`);
  };

  return (
    <label className={`grid min-w-[230px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500 ${className}`}>
      {label}
      <div className="grid grid-cols-[minmax(128px,1fr)_82px] gap-1">
        <select
          aria-label={monthAriaLabel}
          className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          onChange={handleMonthChange}
          value={month}
        >
          <option value="">Semua bulan</option>
          {MONTH_FILTER_OPTIONS.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>{optionLabel}</option>
          ))}
        </select>
        <input
          aria-label={yearAriaLabel}
          className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          max={MONTH_FILTER_MAX_YEAR}
          min={MONTH_FILTER_MIN_YEAR}
          onChange={handleYearChange}
          onWheel={(event) => event.currentTarget.blur()}
          type="number"
          value={visibleYear}
        />
      </div>
    </label>
  );
}

export default MonthFilterControl;
