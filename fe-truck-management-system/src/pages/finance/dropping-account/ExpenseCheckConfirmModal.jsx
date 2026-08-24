import AmountField from '../shared/AmountField';
import DetailField from '../shared/DetailField';
import DocumentLink from '../../../components/common/DocumentLink';
import FinanceActionModal from '../shared/FinanceActionModal';
import { expenseCategoryLabels, expensePaymentStatusLabels, readableLabel } from './operationalFundUtils';

function ExpenseCheckConfirmModal({ row, error, busy, onClose, onConfirm }) {
  if (!row) return null;
  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Ya, Sudah Dicek"
      description="Pastikan nominal, kategori, dan bukti pembayaran sudah sesuai sebelum ditandai sudah dicek."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Validasi Cek Biaya Lapangan"
      tone="approve"
      widthClassName="max-w-2xl"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailField label="Nomor SO" value={row.soNumber} />
          <DetailField label="Container" value={row.containerNumber} />
          <DetailField label="Driver" value={row.driverName} />
          <DetailField label="Kategori" value={readableLabel(expenseCategoryLabels, row.category)} />
          <AmountField highlight label="Nominal Biaya" value={row.amount} />
          <DetailField label="Status Pembayaran" value={readableLabel(expensePaymentStatusLabels, row.paymentStatus)} />
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Bukti Pembayaran</span>
            {row.proofAttachment ? (
              <DocumentLink
                className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
                file={row.proofAttachment}
                label="Lihat Bukti"
              />
            ) : (
              <span className="mt-1 block text-xs font-semibold text-slate-400">Belum ada bukti</span>
            )}
          </div>
          <div className="sm:col-span-2">
            <DetailField label="Keterangan" value={row.description} />
          </div>
        </div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
    </FinanceActionModal>
  );
}

export default ExpenseCheckConfirmModal;
