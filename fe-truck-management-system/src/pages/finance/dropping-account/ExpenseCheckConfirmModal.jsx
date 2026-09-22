import { useEffect, useRef } from 'react';
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
  adminFeeError,
  adminFeeAmount,
  adminFeeNote,
  onProofSelect,
  onProofClear,
  onAdminFeeAmountChange,
  onAdminFeeNoteChange,
  onClose,
  onConfirm,
}) {
  const proofFieldRef = useRef(null);
  const adminFeeInputRef = useRef(null);
  const proofRequired = Boolean(row && row.paymentStatus === 'sudah_dibayar' && !row.proofAttachment);
  const proofReady = Boolean(row?.proofAttachment || proofFile);

  useEffect(() => {
    if (proofError) {
      proofFieldRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      proofFieldRef.current?.querySelector('input[type="file"]')?.focus();
      return;
    }
    if (adminFeeError) {
      adminFeeInputRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      adminFeeInputRef.current?.focus();
      return;
    }
    if (error) document.getElementById('expense-check-general-error')?.focus();
  }, [adminFeeError, error, proofError]);

  if (!row) return null;

  return (
    <FinanceActionModal
      busy={busy}
      confirmDisabled={proofRequired && !proofReady}
      confirmLabel="Validasi Transaksi"
      description="Pastikan nominal, kategori, dan bukti pembayaran sudah sesuai. Bukti pembayaran diupload oleh Finance sekaligus saat validasi."
      onClose={onClose}
      onConfirm={onConfirm}
      footerError={error}
      footerErrorId="expense-check-general-error"
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
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">Sudah diupload</span>
                ) : proofFile ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">Siap diupload</span>
                ) : proofRequired ? (
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">Wajib upload</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">Belum ada bukti</span>
                )}
              </div>
              {row.proofAttachment ? (
                <DocumentLink
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
                  file={row.proofAttachment}
                  label="Lihat Bukti"
                />
              ) : null}
              {proofRequired ? (
                <div className="mt-3" ref={proofFieldRef}>
                  <AttachmentUploadField
                    compact
                    id="finance-expense-proof-upload"
                    label="Bukti Pembayaran"
                    onClear={onProofClear}
                    onSelect={onProofSelect}
                    title={proofFile?.name ? 'Ganti Bukti' : 'Upload Bukti Pembayaran'}
                    value={proofFile}
                  />
                  {proofFile ? (
                    <p className="mt-2 text-[11px] font-semibold leading-relaxed text-emerald-700">
                      {proofFile.name}. Bukti akan disimpan saat transaksi divalidasi.
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] font-semibold leading-relaxed text-amber-700">
                      Bukti pembayaran wajib diupload Finance sebelum transaksi bisa divalidasi.
                    </p>
                  )}
                  {proofError ? <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">{proofError}</p> : null}
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
                    aria-describedby={adminFeeError ? 'expense-check-admin-fee-error' : undefined}
                    aria-invalid={Boolean(adminFeeError)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                    min="0"
                    placeholder="Contoh: 2500"
                    ref={adminFeeInputRef}
                    type="number"
                    value={adminFeeAmount}
                    onWheel={(event) => event.currentTarget.blur()}
                    onChange={(event) => onAdminFeeAmountChange(event.target.value)}
                  />
                  {adminFeeError ? <span className="mt-1 block text-xs font-semibold text-rose-700" id="expense-check-admin-fee-error" role="alert">{adminFeeError}</span> : null}
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

          <div className="lg:col-span-2">
            <DetailField label="Keterangan" value={row.description} />
          </div>
        </div>
      </div>
    </FinanceActionModal>
  );
}

export default ExpenseCheckConfirmModal;
