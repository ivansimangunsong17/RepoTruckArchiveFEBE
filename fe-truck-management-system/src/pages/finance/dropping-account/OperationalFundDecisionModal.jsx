import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatCurrency';
import FinanceActionModal from '../shared/FinanceActionModal';

function OperationalFundDecisionModal({ decision, row, note, error, busy, onNoteChange, onClose, onConfirm }) {
  if (!decision || !row) return null;
  const isReject = decision === 'reject';
  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel={isReject ? 'Ya, Tolak Saldo' : 'Ya, Setujui Saldo'}
      description={isReject ? 'Pengajuan saldo akan dikembalikan ke Operational.' : 'Setelah disetujui, Finance dapat upload bukti transfer saldo.'}
      onClose={onClose}
      onConfirm={onConfirm}
      title={isReject ? 'Validasi Tolak Saldo' : 'Validasi Approval Saldo'}
      tone={isReject ? 'reject' : 'approve'}
    >
      <div className={`flex gap-3 rounded-lg border p-3 ${isReject ? 'border-rose-100 bg-rose-50' : 'border-emerald-100 bg-emerald-50'}`}>
        {isReject ? <AlertTriangle className="mt-0.5 shrink-0 text-rose-600" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />}
        <div className="min-w-0">
          <strong className="block text-sm text-slate-950">{formatCurrency(row.amount)}</strong>
          <span className="mt-0.5 block text-xs font-medium text-slate-600">{row.requestDate} - {row.purpose}</span>
        </div>
      </div>
      {isReject ? (
        <label className="grid gap-1.5 text-xs font-bold text-slate-700">
          Catatan Reject <span className="font-semibold text-rose-600">Wajib diisi</span>
          <textarea
            autoFocus
            className="min-h-24 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            maxLength={500}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Jelaskan penyesuaian yang dibutuhkan..."
            value={note}
          />
          <small className="justify-self-end font-medium text-slate-400">{note.length}/500</small>
        </label>
      ) : null}
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

export default OperationalFundDecisionModal;
