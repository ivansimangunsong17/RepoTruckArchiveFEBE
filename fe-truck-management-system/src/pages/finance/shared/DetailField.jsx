function DetailField({ label, value, className = '' }) {
  return (
    <div className={`rounded-md border border-slate-200 bg-white px-2.5 py-2 ${className}`}>
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="mt-0.5 block text-sm font-semibold text-slate-900">{value || '-'}</strong>
    </div>
  );
}

export default DetailField;
