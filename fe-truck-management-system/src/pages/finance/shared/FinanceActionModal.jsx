import { X } from 'lucide-react';

function FinanceActionModal({
  children,
  title,
  description,
  tone = 'neutral',
  busy,
  confirmDisabled = false,
  confirmLabel,
  footerError = '',
  footerErrorId = '',
  onClose,
  onConfirm,
  widthClassName = 'max-w-md',
}) {
  const toneClasses = tone === 'approve'
    ? 'bg-emerald-600 hover:bg-emerald-700'
    : tone === 'reject'
      ? 'bg-rose-600 hover:bg-rose-700'
      : tone === 'upload'
        ? 'bg-amber-600 hover:bg-amber-700'
        : 'bg-slate-900 hover:bg-slate-800';

  return (
    <div className="master-modal-backdrop" role="presentation" onMouseDown={busy ? undefined : onClose}>
      <section className={`master-modal flex w-full ${widthClassName} max-h-[90vh] flex-col`} role="dialog" aria-modal="true" aria-labelledby="finance-action-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onConfirm}>
          <div className="master-form-heading">
            <div>
              <h2 id="finance-action-modal-title">{title}</h2>
              <p>{description}</p>
            </div>
            <button aria-label="Tutup modal" className="modal-close-button" disabled={busy} onClick={onClose} type="button">
              <X size={17} />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4">{children}</div>
          <div className="master-form-actions">
            {footerError ? (
              <div
                className="mr-auto rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                id={footerErrorId || undefined}
                role="alert"
                tabIndex={-1}
              >
                {footerError}
              </div>
            ) : null}
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">Batal</button>
            <button className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[7px] px-4 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses}`} disabled={busy || confirmDisabled} type="submit">
              {busy ? 'Memproses...' : confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default FinanceActionModal;
