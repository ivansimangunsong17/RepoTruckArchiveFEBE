import { CalendarDays } from 'lucide-react';
import { financeMonthOptions, getFinanceYearOptions } from '../../utils/financePeriod';

function FinancePeriodFilter({ month, year, onMonthChange, onYearChange }) {
  return (
    <div className="flex flex-wrap items-end gap-1.5 rounded-lg border border-sky-200 bg-sky-50 p-1.5">
      <span className="mb-1 inline-flex items-center gap-1 px-1 text-[10px] font-black uppercase tracking-wide text-sky-700">
        <CalendarDays size={13} /> Periode
      </span>
      <label className="grid gap-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
        Bulan
        <select
          aria-label="Bulan pencatatan Finance"
          className="h-7 min-w-28 rounded-md border border-sky-200 bg-white px-2 text-[11px] font-bold normal-case tracking-normal text-slate-700 outline-none focus:border-sky-400"
          onChange={(event) => onMonthChange(event.target.value)}
          value={month}
        >
          {financeMonthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid gap-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
        Tahun
        <select
          aria-label="Tahun pencatatan Finance"
          className="h-7 min-w-20 rounded-md border border-sky-200 bg-white px-2 text-[11px] font-bold normal-case tracking-normal text-slate-700 outline-none focus:border-sky-400"
          onChange={(event) => onYearChange(event.target.value)}
          value={year}
        >
          {getFinanceYearOptions().map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    </div>
  );
}

export default FinancePeriodFilter;
