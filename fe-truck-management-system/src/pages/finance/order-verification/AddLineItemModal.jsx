import { formatCurrency } from '../../../utils/formatCurrency';
import FinanceActionModal from '../shared/FinanceActionModal';

const REVENUE_SERVICE_OPTIONS = ['Jasa Angkut D20', 'Jasa Angkut D40', 'Handling', 'Jasa Lainnya'];

function isContainerService(serviceName) {
  return serviceName === 'Jasa Angkut D20' || serviceName === 'Jasa Angkut D40';
}

function isOtherService(serviceName) {
  return serviceName === 'Jasa Lainnya';
}

function AddLineItemModal({ order, form, error, busy, onFieldChange, onClose, onConfirm }) {
  if (!order || !form) return null;

  const qty = Math.max(1, Number(form.qty || 0));
  const price = Math.max(0, Number(form.price || 0));

  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Tambah Rincian"
      description="Rincian revenue akan langsung ditambahkan ke Sales Order ini. Hanya layanan yang masuk revenue (bukan reimbursement) yang bisa dipilih."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Tambah Rincian Revenue"
    >
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Customer</span><strong className="mt-0.5 block text-xs text-slate-900">{order.customer || '-'}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Tujuan</span><strong className="mt-0.5 block text-xs text-slate-900">{order.destination || '-'}</strong></div>
      </div>

      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Layanan
        <select
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
          onChange={(event) => onFieldChange('serviceName', event.target.value)}
          value={form.serviceName}
        >
          {REVENUE_SERVICE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>

      {isContainerService(form.serviceName) ? (
        <label className="grid gap-1.5 text-xs font-bold text-slate-700">
          Tipe Container (opsional)
          <input
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
            onChange={(event) => onFieldChange('containerType', event.target.value)}
            placeholder="Contoh: Dry Container"
            value={form.containerType}
          />
        </label>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-xs font-bold text-slate-700">
          Qty
          <input
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
            min={1}
            onChange={(event) => onFieldChange('qty', event.target.value)}
            onWheel={(event) => event.currentTarget.blur()}
            type="number"
            value={form.qty}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-slate-700">
          <span className="flex items-baseline justify-between gap-2">
            <span>Harga per Unit</span>
            <span className="text-[11px] font-semibold text-slate-500">Total: {formatCurrency(qty * price)}</span>
          </span>
          <input
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
            min={0}
            onChange={(event) => onFieldChange('price', event.target.value)}
            onWheel={(event) => event.currentTarget.blur()}
            type="number"
            value={form.price}
          />
        </label>
      </div>

      {isOtherService(form.serviceName) ? (
        <label className="grid gap-1.5 text-xs font-bold text-slate-700">
          Catatan Jasa Lainnya
          <textarea
            className="min-h-[72px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
            onChange={(event) => onFieldChange('notes', event.target.value)}
            placeholder="Jelaskan rincian Jasa Lainnya ini"
            value={form.notes}
          />
        </label>
      ) : null}

      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

export default AddLineItemModal;
