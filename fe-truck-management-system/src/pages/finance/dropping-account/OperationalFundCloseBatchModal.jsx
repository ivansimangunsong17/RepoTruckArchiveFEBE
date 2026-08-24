import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatCurrency';
import AmountField from '../shared/AmountField';
import DetailField from '../shared/DetailField';
import FinanceActionModal from '../shared/FinanceActionModal';
import { defaultOperationalFundBatch, formatDisplayDate, nextDateValue } from './operationalFundUtils';

function OperationalFundCloseBatchModal({ batch, summary, busy, onClose, onConfirm }) {
  if (!batch?.id) return null;
  const normalizedBatch = { ...defaultOperationalFundBatch, ...batch };
  const normalizedSummary = {
    totalCredit: Number(summary?.totalCredit || normalizedBatch.totalCredit || 0),
    totalDebit: Number(summary?.totalDebit || normalizedBatch.totalDebit || 0),
    balance: Number(summary?.balance || normalizedBatch.balance || 0),
  };
  const topUpAmount = normalizedBatch.topUpAmount || Math.max(0, normalizedSummary.totalCredit - Number(normalizedBatch.openingBalance || 0));
  const unresolvedBatchExpenses = Number(normalizedBatch.uncheckedCount || 0) + Number(normalizedBatch.needClarificationCount || 0);
  const nextDate = nextDateValue(normalizedBatch.batchDate);

  return (
    <FinanceActionModal
      busy={busy}
      confirmDisabled={unresolvedBatchExpenses > 0}
      confirmLabel="Ya, Close Batch"
      description="Validasi akhir sebelum batch rekening dropping dikunci untuk pembukuan harian."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Validasi Close Batch"
      tone="approve"
      widthClassName="max-w-2xl"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailField label="Tanggal Batch" value={formatDisplayDate(normalizedBatch.batchDate)} />
          <DetailField label="Status Validasi" value={unresolvedBatchExpenses ? `${unresolvedBatchExpenses} transaksi belum valid` : 'Semua uang keluar valid'} />
          <AmountField label="Saldo Awal" value={normalizedBatch.openingBalance || 0} />
          <AmountField label="Top Up Finance" value={topUpAmount} />
          <AmountField label="Uang Keluar" value={normalizedSummary.totalDebit} />
          <AmountField highlight label="Sisa Saldo" value={normalizedSummary.balance} />
        </div>
      </div>
      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
        <p className="text-xs font-semibold leading-relaxed text-amber-900">
          Setelah batch ditutup, transaksi tanggal ini terkunci. Sisa saldo {formatCurrency(normalizedSummary.balance)} akan menjadi Saldo Awal batch {formatDisplayDate(nextDate)}.
        </p>
      </div>
      {unresolvedBatchExpenses ? (
        <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          Batch belum bisa ditutup karena masih ada transaksi uang keluar yang belum valid atau perlu klarifikasi.
        </p>
      ) : null}
    </FinanceActionModal>
  );
}

export default OperationalFundCloseBatchModal;
