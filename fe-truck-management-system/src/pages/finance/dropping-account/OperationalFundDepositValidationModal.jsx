import { AlertTriangle } from 'lucide-react';
import AmountField from '../shared/AmountField';
import DetailField from '../shared/DetailField';
import FinanceActionModal from '../shared/FinanceActionModal';
import { formatDisplayDate } from './operationalFundUtils';

function OperationalFundDepositValidationModal({ value, busy, onClose, onConfirm }) {
  const amount = Number(value.amount || 0);
  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Ya, Deposit Saldo"
      description="Validasi akhir sebelum top up baru masuk ke buku kas Rekening Dropping."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Validasi Deposit Saldo"
      tone="approve"
      widthClassName="max-w-2xl"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <DetailField label="Tanggal Deposit" value={formatDisplayDate(value.requestDate)} />
          <AmountField highlight label="Nominal Deposit" value={amount} />
        </div>
        <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Keterangan</span>
          <strong className="mt-1 block text-sm font-semibold leading-relaxed text-slate-950">{value.purpose || '-'}</strong>
        </div>
        <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Bukti Transfer</span>
          <strong className="mt-1 block text-sm font-semibold leading-relaxed text-slate-950">{value.proofFile?.name || '-'}</strong>
        </div>
      </div>
      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
        <p className="text-xs font-semibold leading-relaxed text-amber-900">Setelah dikonfirmasi, transaksi top up baru akan langsung menambah saldo Operational dan masuk ke Catatan Saldo.</p>
      </div>
    </FinanceActionModal>
  );
}

export default OperationalFundDepositValidationModal;
