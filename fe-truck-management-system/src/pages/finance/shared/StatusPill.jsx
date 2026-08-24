function statusClass(value) {
  if (String(value).includes('Lunas')) return 'border-slate-200 bg-slate-100 text-slate-700';
  if (String(value).includes('Menunggu')) return 'border-slate-200 bg-slate-50 text-slate-600';
  if (String(value).includes('Batal')) return 'border-red-200 bg-red-50 text-red-700';
  if (String(value).includes('Ditolak') || String(value).includes('Revisi') || String(value).includes('Belum') || String(value).includes('Butuh')) return 'border-slate-200 bg-white text-slate-600';
  if (String(value).includes('Terbit') || String(value).includes('Disetujui') || String(value).includes('Diupload') || String(value).includes('Siap')) return 'border-slate-200 bg-white text-slate-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function StatusPill({ value, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${statusClass(value)} ${className}`}>
      <span className="h-1 w-1 rounded-full bg-current opacity-45" aria-hidden="true" />
      {value || '-'}
    </span>
  );
}

export default StatusPill;
