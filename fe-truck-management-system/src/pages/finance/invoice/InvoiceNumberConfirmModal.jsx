import { AlertTriangle } from 'lucide-react';
import DetailField from '../shared/DetailField';
import FinanceActionModal from '../shared/FinanceActionModal';

function InvoiceNumberConfirmModal({ row, error, busy, onClose, onConfirm }) {
  if (!row) return null;
  const invoiceNumber = String(row.invoiceNumber || '').trim().toUpperCase();

  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Ya, Kirim Nomor Invoice"
      description="Cek lagi nomor invoice sebelum dikirim. Setelah dikonfirmasi, status akan lanjut menunggu update dari Sales."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Validasi Nomor Invoice"
      tone="upload"
    >
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="flex gap-2.5">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
          <div>
            <strong className="block text-xs text-amber-900">Pastikan nomor invoice sudah sama dengan dokumen invoice.</strong>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">Jika nomor salah, Sales akan menerima informasi invoice yang keliru.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DetailField label="Nomor SO" value={row.soNumber} />
        <DetailField label="Customer" value={row.customer} />
        <DetailField label="Tujuan" value={row.destination} />
        <DetailField label="Nomor Invoice" value={invoiceNumber} />
      </div>
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

export default InvoiceNumberConfirmModal;
