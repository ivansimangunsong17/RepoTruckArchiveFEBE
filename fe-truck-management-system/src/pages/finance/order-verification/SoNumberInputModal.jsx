import FinanceActionModal from '../shared/FinanceActionModal';

function SoNumberInputModal({ order, value, error, busy, onChange, onClose, onConfirm }) {
  if (!order) return null;
  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Simpan Nomor SO"
      description="Masukkan nomor Sales Order resmi yang sudah dibuat di Accurate."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Input Nomor SO Accurate"
    >
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Customer</span><strong className="mt-0.5 block text-xs text-slate-900">{order.customer || '-'}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Tujuan</span><strong className="mt-0.5 block text-xs text-slate-900">{order.destination || '-'}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Sales</span><strong className="mt-0.5 block text-xs text-slate-900">{order.salesName || '-'}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Tanggal Jalan</span><strong className="mt-0.5 block text-xs text-slate-900">{order.runningDate || '-'}</strong></div>
      </div>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Nomor SO Accurate
        <input
          autoFocus
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold uppercase text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
          maxLength={80}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Contoh: SO-202607-019"
          value={value}
        />
      </label>
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

export default SoNumberInputModal;
