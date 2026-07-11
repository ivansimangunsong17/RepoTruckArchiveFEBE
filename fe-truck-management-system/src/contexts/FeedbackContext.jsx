/* eslint-disable react-refresh/only-export-components */
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const FeedbackContext = createContext(null);

const toastIcons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.type] || Info;
        return (
          <article className={`toast-message ${toast.type}`} key={toast.id}>
            <span className="toast-icon"><Icon size={18} /></span>
            <div>
              <strong>{toast.title}</strong>
              {toast.message ? <p>{toast.message}</p> : null}
            </div>
            <button type="button" aria-label="Tutup notifikasi" onClick={() => onDismiss(toast.id)}>
              <X size={16} />
            </button>
          </article>
        );
      })}
    </div>
  );
}

function ConfirmationDialog({ dialog, onResolve }) {
  useEffect(() => {
    if (!dialog) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onResolve(false);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dialog, onResolve]);

  if (!dialog) return null;

  return (
    <div className="feedback-dialog-backdrop" role="presentation" onMouseDown={() => onResolve(false)}>
      <section
        className="feedback-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        aria-describedby="feedback-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span><AlertTriangle size={21} /></span>
          <div>
            <h2 id="feedback-dialog-title">{dialog.title}</h2>
            <p id="feedback-dialog-description">{dialog.message}</p>
          </div>
        </header>
        <footer>
          <button className="secondary-button" type="button" autoFocus onClick={() => onResolve(false)}>
            {dialog.cancelLabel}
          </button>
          <button className={dialog.tone === 'danger' ? 'danger-confirm-button' : 'primary-button'} type="button" onClick={() => onResolve(true)}>
            {dialog.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(({ type = 'success', title, message = '', duration = 4000 }) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current.slice(-2), { id, type, title, message }]);
    window.setTimeout(() => dismissToast(id), duration);
    return id;
  }, [dismissToast]);

  const confirmAction = useCallback((options) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setDialog({
      title: 'Konfirmasi tindakan',
      message: 'Pastikan tindakan ini memang diperlukan.',
      confirmLabel: 'Lanjutkan',
      cancelLabel: 'Batal',
      tone: 'danger',
      ...options,
    });
  }), []);

  const resolveDialog = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  return (
    <FeedbackContext.Provider value={{ notify, confirmAction }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <ConfirmationDialog dialog={dialog} onResolve={resolveDialog} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback harus digunakan di dalam FeedbackProvider.');
  return context;
}
