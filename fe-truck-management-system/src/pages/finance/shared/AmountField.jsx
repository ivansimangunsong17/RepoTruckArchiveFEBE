import { formatCurrency } from '../../../utils/formatCurrency';

function AmountField({ label, value, helper, highlight = false, className = '' }) {
  return (
    <div className={`rounded-md border px-2.5 py-2 ${highlight ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-slate-200 bg-white text-slate-950'} ${className}`}>
      <span className={`block text-[10px] font-bold uppercase tracking-wide ${highlight ? 'text-emerald-700' : 'text-slate-500'}`}>{label}</span>
      <strong className="mt-0.5 block text-sm font-black">{formatCurrency(value)}</strong>
      {helper ? <span className="mt-1 block text-[10px] font-semibold text-amber-700">{helper}</span> : null}
    </div>
  );
}

export default AmountField;
