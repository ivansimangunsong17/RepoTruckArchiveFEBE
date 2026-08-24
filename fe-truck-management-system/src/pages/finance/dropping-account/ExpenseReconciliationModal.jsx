import AmountField from '../shared/AmountField';
import DetailField from '../shared/DetailField';
import FinanceActionModal from '../shared/FinanceActionModal';

function ExpenseReconciliationModal({ row, note, error, busy, onNoteChange, onClose, onConfirm }) {
  if (!row) return null;
  return (
    <FinanceActionModal
      busy={busy}
      confirmDisabled={!note.trim()}
      confirmLabel="Kirim Klarifikasi"
      description="Transaksi akan ditandai perlu klarifikasi agar Operational bisa menindaklanjuti catatan Finance."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Klarifikasi Biaya Lapangan"
      tone="reject"
      widthClassName="max-w-3xl"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailField label="Nomor SO" value={row.soNumber} />
          <DetailField label="Container" value={row.containerNumber} />
          <DetailField label="Driver" value={row.driverName} />
          <AmountField highlight label="Nominal Biaya" value={row.amount} />
        </div>
      </div>
      <div className="master-form-grid">
        <label className="master-field span-full">
          <span>Catatan Klarifikasi <em>Wajib diisi</em></span>
          <textarea
            autoFocus
            className="min-h-24 resize-y"
            maxLength={500}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Contoh: Nominal tidak sesuai bukti bayar, mohon cek ulang."
            value={note}
          />
          <small className="justify-self-end font-medium text-slate-400">{note.length}/500</small>
        </label>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
    </FinanceActionModal>
  );
}

export default ExpenseReconciliationModal;
