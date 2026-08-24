import StatusPill from './StatusPill';

function correctionStatusLabel(status) {
  const labels = {
    pending: 'Menunggu Admin',
    applied: 'Sudah Diterapkan',
    approved: 'Disetujui',
    rejected: 'Ditolak',
  };
  return labels[status] || status || '-';
}

function CorrectionHistoryList({ corrections = [], loading = false, error = '' }) {
  if (loading) return <p className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Memuat riwayat koreksi...</p>;
  if (error) return <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>;
  if (!corrections.length) return <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">Belum ada riwayat koreksi.</p>;

  return (
    <div className="grid gap-1.5">
      {corrections.map((item) => (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2" key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-xs text-slate-950">{item.currentValue || '-'} {'>'} {item.requestedValue || '-'}</strong>
            <StatusPill value={correctionStatusLabel(item.status)} />
          </div>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">{item.reason}</p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            {item.requestedByName} - {item.requestedAt}
            {item.reviewedByName ? ` | ${item.reviewedByName} - ${item.reviewedAt}` : ''}
          </p>
          {item.reviewNote ? <p className="mt-1 text-[10px] font-semibold text-slate-500">Catatan Admin: {item.reviewNote}</p> : null}
        </div>
      ))}
    </div>
  );
}

export default CorrectionHistoryList;
