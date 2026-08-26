import { AlertTriangle } from 'lucide-react';
import DetailField from '../shared/DetailField';
import FinanceActionModal from '../shared/FinanceActionModal';
import { defaultOperationalFundBatch, formatDisplayDate } from './operationalFundUtils';

function OperationalFundReopenBatchModal({ batch, busy, error, reason, onClose, onConfirm, onReasonChange }) {
  if (!batch?.id) return null;
  const normalizedBatch = { ...defaultOperationalFundBatch, ...batch };
  const trimmedReason = String(reason || '').trim();

  return (
    <FinanceActionModal
      busy={busy}
      confirmDisabled={!trimmedReason}
      confirmLabel="Ya, Buka Kembali Batch"
      description="Batch akan dibuka lagi supaya Operational bisa mencatat transaksi tanggal ini."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Buka Kembali Batch Rekening Dropping"
      tone="reject"
      widthClassName="max-w-2xl"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailField label="Tanggal Batch" value={formatDisplayDate(normalizedBatch.batchDate)} />
          <DetailField label="Ditutup Oleh" value={normalizedBatch.closedByName || '-'} />
        </div>
      </div>
      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
        <p className="text-xs font-semibold leading-relaxed text-amber-900">
          Kalau sisa saldo batch ini sudah mengalir ke batch besok (carry-forward), transaksi carry-forward-nya akan otomatis dibatalkan supaya saldo tidak dobel terhitung. Aksi ini tercatat di activity log.
        </p>
      </div>
      <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
        Alasan Buka Kembali
        <textarea
          className="min-h-20 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium normal-case text-slate-900 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          disabled={busy}
          onChange={onReasonChange}
          placeholder="Contoh: Batch ditutup terlalu cepat, Operational masih punya biaya tunai yang belum dicatat"
          value={reason || ''}
        />
      </label>
      {error ? <p className="text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

export default OperationalFundReopenBatchModal;
