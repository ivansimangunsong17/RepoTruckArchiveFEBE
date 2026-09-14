import AmountField from '../shared/AmountField';
import DetailField from '../shared/DetailField';
import AttachmentUploadField from '../../../components/common/AttachmentUploadField';
import DocumentLink from '../../../components/common/DocumentLink';
import FinanceActionModal from '../shared/FinanceActionModal';
import { expenseCategoryLabels, expensePaymentStatusLabels, readableLabel } from './operationalFundUtils';

function ExpenseCheckConfirmModal({
  row,
  error,
  busy,
  proofFile,
  proofError,
  adminFeeAmount,
  adminFeeNote,
  onProofSelect,
  onProofClear,
  onAdminFeeAmountChange,
  onAdminFeeNoteChange,
  onClose,
  onConfirm,
}) {
  if (!row) return null;
  const proofRequired = row.paymentStatus === 'sudah_dibayar' && !row.proofAttachment;
  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Validasi Transaksi"
      description="Pastikan nominal, kategori, dan bukti pembayaran sudah sesuai. Bukti pembayaran diupload oleh Finance sekaligus saat validasi."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Validasi Cek Biaya Lapangan"
      tone="approve"
      widthClassName="max-w-5xl"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Nomor SO" value={row.soNumber} />
            <DetailField label="Container" value={row.containerNumber} />
            <DetailField label="Driver" value={row.driverName} />
            <DetailField label="Status Pembayaran" value={readableLabel(expensePaymentStatusLabels, row.paymentStatus)} />
            <DetailField label="Kategori" value={readableLabel(expenseCategoryLabels, row.category)} />
            <AmountField highlight label="Nominal Biaya" value={row.amount} />
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Bukti Pembayaran</span>
                {row.proofAttachment ? (
                  <DocumentLink
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
                    file={row.proofAttachment}
                    label="Lihat Bukti"
                  />
                ) : proofRequired ? (
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">Wajib upload</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">Belum ada bukti</span>
                )}
              </div>
              {proofRequired ? (
                <div className="mt-3">
                  <AttachmentUploadField
                    compact
                    id="finance-expense-proof-upload"
                    label="Bukti Pembayaran"
                    onClear={onProofClear}
                    onSelect={onProofSelect}
                    title={proofFile?.name ? 'Ganti Bukti' : 'Upload Bukti Pembayaran'}
                    value={proofFile}
                  />
                  <p className="mt-2 text-[11px] font-semibold leading-relaxed text-amber-700">
                    Bukti pembayaran wajib diupload Finance sebelum transaksi bisa divalidasi.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="mb-3">
                <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Biaya Tambahan</span>
                <p className="mt-1 text-xs font-semibold text-slate-500">Isi jika ada biaya admin transfer.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Biaya Admin Transfer</span>
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                    min="0"
                    placeholder="Contoh: 2500"
                    type="number"
                    value={adminFeeAmount}
                    onWheel={(event) => event.currentTarget.blur()}
                    onChange={(event) => onAdminFeeAmountChange(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Catatan Admin</span>
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                    placeholder="Opsional"
                    value={adminFeeNote}
                    onChange={(event) => onAdminFeeNoteChange(event.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>

          {proofError ? <p className="lg:col-span-2 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{proofError}</p> : null}
          <div className="lg:col-span-2">
            <DetailField label="Keterangan" value={row.description} />
          </div>
        </div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
    </FinanceActionModal>
  );
}

export default ExpenseCheckConfirmModal;
