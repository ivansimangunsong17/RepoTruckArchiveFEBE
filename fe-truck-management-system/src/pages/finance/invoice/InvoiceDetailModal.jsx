import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Upload, X } from 'lucide-react';
import DocumentLink from '../../../components/common/DocumentLink';
import AttachmentUploadField from '../../../components/common/AttachmentUploadField';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate } from '../../../utils/formatDate';
import CorrectionHistoryList from '../shared/CorrectionHistoryList';
import StatusPill from '../shared/StatusPill';
import { expenseCategoryLabels, expensePaymentStatusLabels, readableLabel } from '../dropping-account/operationalFundUtils';
import {
  financeInvoiceUploadSlots,
  findInvoiceFinanceDocument,
  formatAgingDays,
  validateInvoicePdfFile,
} from './invoiceUtils';

const DEBIT_NOTE_AGING_LABELS = {
  current: 'Belum Jatuh Tempo',
  overdue_1_30: 'Terlambat 1-30 Hari',
  overdue_31_60: 'Terlambat 31-60 Hari',
  overdue_61_90: 'Terlambat 61-90 Hari',
  overdue_90_plus: 'Terlambat >90 Hari',
  unknown: 'Tanggal Jatuh Tempo Belum Ada',
};

const DEBIT_NOTE_AGING_TONE = {
  current: 'bg-emerald-50 text-emerald-700',
  overdue_1_30: 'bg-amber-50 text-amber-700',
  overdue_31_60: 'bg-orange-50 text-orange-700',
  overdue_61_90: 'bg-rose-50 text-rose-700',
  overdue_90_plus: 'bg-rose-100 text-rose-800',
  unknown: 'bg-slate-50 text-slate-500',
};

function groupDebitNoteItemsByContainer(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.containerNumber || item.containerJobId || 'tanpa-container';
    const group = groups.get(key) || { key, containerNumber: item.containerNumber || '', items: [] };
    group.items.push(item);
    groups.set(key, group);
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    total: group.items.reduce((sum, item) => sum + item.amount, 0),
  }));
}

function DebitNoteAgingBadge({ bucket }) {
  if (!bucket) return null;
  const tone = DEBIT_NOTE_AGING_TONE[bucket] || DEBIT_NOTE_AGING_TONE.unknown;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase leading-none ${tone}`}>
      {DEBIT_NOTE_AGING_LABELS[bucket] || bucket}
    </span>
  );
}

function DebitNotePaymentModal({ invoice, busy, error, payments, paymentsLoading, form, onChange, onClose, onConfirm, canVoidPayment, voidBusyId, voidError, onVoidPayment }) {
  const [voidingId, setVoidingId] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    setVoidingId(null);
    setVoidReason('');
  }, [invoice?.id]);

  if (!invoice) return null;
  const outstandingAmount = Number(invoice.debitNoteOutstandingAmount || 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={onClose}>
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="debit-note-payment-title" onMouseDown={(event) => event.stopPropagation()}>
        <form onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
          <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Catat Pembayaran Debit Note</p>
              <h3 className="mt-0.5 text-sm font-black text-slate-950" id="debit-note-payment-title">{invoice.soNumber}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{invoice.debitNoteNumber} - {invoice.customer}</p>
            </div>
            <button className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50" onClick={onClose} type="button" aria-label="Tutup catat pembayaran Debit Note">
              <X size={15} />
            </button>
          </header>

          <div className="grid gap-3 px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Total Debit Note</span>
                <strong className="mt-1 block text-sm font-black text-slate-950">{formatCurrency(invoice.debitNoteAmount)}</strong>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Sudah Dibayar</span>
                <strong className="mt-1 block text-sm font-black text-slate-950">{formatCurrency(invoice.debitNoteTotalPaid)}</strong>
              </div>
              <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-amber-700">Sisa Outstanding</span>
                <strong className="mt-1 block text-lg font-black text-amber-800">{formatCurrency(outstandingAmount)}</strong>
              </div>
            </div>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-semibold leading-relaxed text-amber-800">
              Pembayaran ini akan mencatat pelunasan penuh sebesar {formatCurrency(outstandingAmount)} (sisa outstanding saat ini). Nominal tidak diinput manual supaya tidak ada risiko salah ketik.
            </p>

            <label className="grid gap-1 text-xs font-bold text-slate-700">
              Tanggal Pembayaran
              <input
                className="h-9 rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-slate-500"
                onChange={(event) => onChange({ ...form, paymentDate: event.target.value })}
                type="date"
                value={form.paymentDate}
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-700">
              Nomor Referensi Transfer
              <input
                className="h-9 rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-slate-500"
                maxLength={80}
                onChange={(event) => onChange({ ...form, referenceNumber: event.target.value })}
                placeholder="Contoh: TRF-20260821-001"
                value={form.referenceNumber}
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-700">
              Catatan
              <textarea
                className="min-h-16 resize-y rounded-md border border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-slate-500"
                maxLength={500}
                onChange={(event) => onChange({ ...form, note: event.target.value })}
                rows={3}
                value={form.note}
              />
            </label>
            <AttachmentUploadField
              compact
              helper="Wajib. Format PDF, JPG, PNG."
              id="debit-note-payment-proof"
              label="Bukti Transfer"
              onClear={() => onChange({ ...form, proofFile: null })}
              onSelect={(file, validationError) => {
                if (validationError) return;
                onChange({ ...form, proofFile: file });
              }}
              title={form.proofFile?.name ? 'Ganti Bukti' : 'Pilih Bukti'}
              value={form.proofFile}
            />

            {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}

            <div>
              <h4 className="mb-1.5 text-xs font-black text-slate-950">Riwayat Pembayaran</h4>
              {paymentsLoading ? (
                <p className="text-xs font-semibold text-slate-500">Memuat riwayat...</p>
              ) : payments.length ? (
                <ul className="grid gap-1.5">
                  {payments.map((payment) => (
                    <li className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs" key={payment.id}>
                      <div className="flex items-center justify-between gap-2">
                        <div className={payment.voidedAt ? 'opacity-60' : ''}>
                          <strong className={`block text-slate-800 ${payment.voidedAt ? 'line-through' : ''}`}>{formatCurrency(payment.amount)}</strong>
                          <span className="block text-slate-500">{formatDate(payment.paymentDate)}{payment.referenceNumber ? ` - ${payment.referenceNumber}` : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {payment.voidedAt ? (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700">Dibatalkan</span>
                          ) : (
                            <span className="text-slate-400">{payment.recordedByName || '-'}</span>
                          )}
                          {canVoidPayment && !payment.voidedAt ? (
                            <button
                              className="rounded-md border border-rose-200 px-2 py-1 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={voidBusyId === payment.id}
                              onClick={() => { setVoidingId(voidingId === payment.id ? null : payment.id); setVoidReason(''); }}
                              type="button"
                            >
                              Batalkan
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {payment.voidedAt ? (
                        <p className="mt-1 text-[10px] font-semibold text-rose-600">Alasan: {payment.voidReason} &middot; oleh {payment.voidedByName}</p>
                      ) : null}
                      {voidingId === payment.id ? (
                        <div className="mt-2 grid gap-1.5 rounded-md border border-rose-200 bg-rose-100/40 p-2">
                          <textarea
                            className="w-full rounded-md border border-rose-200 px-2 py-1.5 text-xs"
                            onChange={(event) => setVoidReason(event.target.value)}
                            placeholder="Alasan pembatalan (wajib)"
                            rows={2}
                            value={voidReason}
                          />
                          {voidError ? <p className="text-[10px] font-semibold text-rose-700">{voidError}</p> : null}
                          <div className="flex justify-end gap-2">
                            <button className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => setVoidingId(null)} type="button">Batal</button>
                            <button
                              className="rounded-md border border-rose-300 bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={!voidReason.trim() || voidBusyId === payment.id}
                              onClick={() => onVoidPayment(payment.id, voidReason)}
                              type="button"
                            >
                              {voidBusyId === payment.id ? 'Membatalkan...' : 'Konfirmasi Batalkan'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs font-semibold text-slate-500">Belum ada pembayaran tercatat.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
            <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" disabled={busy} onClick={onClose} type="button">
              Batal
            </button>
            <button
              className="rounded-md border border-red-200 bg-red-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              disabled={busy || outstandingAmount <= 0 || !form.proofFile}
              type="submit"
            >
              {busy ? 'Menyimpan...' : 'Catat Pembayaran'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function formatDisplayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function CompactList({ items }) {
  return (
    <div className="grid gap-1">
      {items.map((item) => (
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5" key={item.label || item}>
          <span className="text-xs font-semibold text-slate-700">{item.label || item}</span>
          {typeof item.ready === 'boolean' ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {item.ready ? 'Ada' : 'Belum'}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ActivityLogList({ logs }) {
  return (
    <div className="grid gap-1">
      {logs.map((log) => (
        <div className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600" key={log}>{log}</div>
      ))}
    </div>
  );
}

function InvoiceDetailModal({
  invoice,
  loading = false,
  error = '',
  invoiceDocumentBusyKey = '',
  invoiceDocumentUploadError = '',
  corrections = [],
  correctionsLoading = false,
  correctionsError = '',
  debitNoteNumberSaving = false,
  debitNoteNumberError = '',
  debitNotePayments = [],
  debitNotePaymentsLoading = false,
  debitNotePaymentSaving = false,
  debitNotePaymentError = '',
  canVoidDebitNotePayment = false,
  debitNotePaymentVoidBusyId = '',
  debitNotePaymentVoidError = '',
  onClose,
  onOpenCorrection,
  onUploadInvoiceDocument,
  onSaveDebitNoteNumber,
  onLoadDebitNotePayments,
  onConfirmDebitNotePayment,
  onVoidDebitNotePayment,
}) {
  const [dragUploadKey, setDragUploadKey] = useState('');
  const [pendingInvoiceFiles, setPendingInvoiceFiles] = useState({});
  const [uploadResultModal, setUploadResultModal] = useState(null);
  const [debitNoteNumberDraft, setDebitNoteNumberDraft] = useState('');
  const [debitNotePaymentOpen, setDebitNotePaymentOpen] = useState(false);
  const [debitNotePaymentForm, setDebitNotePaymentForm] = useState({ paymentDate: '', referenceNumber: '', note: '', proofFile: null, idempotencyKey: '' });
  const [activeSection, setActiveSection] = useState('ringkasan');

  useEffect(() => {
    setDragUploadKey('');
    setPendingInvoiceFiles({});
    setUploadResultModal(null);
    setDebitNoteNumberDraft('');
    setDebitNotePaymentOpen(false);
    setActiveSection('ringkasan');
  }, [invoice?.id]);

  if (!invoice) return null;
  const documents = Array.isArray(invoice.documents) ? invoice.documents : [];
  const supportDocuments = documents.filter((document) => document.source !== 'Finance');
  const availableDocumentCount = supportDocuments.filter((document) => document.ready !== false && document.file?.path).length;
  const pendingUploadSlots = financeInvoiceUploadSlots.filter((slot) => pendingInvoiceFiles[slot.type]);
  const hasPendingInvoiceFiles = pendingUploadSlots.length > 0;
  const isSavingInvoiceDocuments = uploadResultModal?.status === 'loading';
  const documentGroups = Array.from(supportDocuments.reduce((groups, document) => {
    const isSalesDocument = document.source === 'Sales';
    const groupId = isSalesDocument
      ? 'sales-order'
      : `container-${document.jobId || document.containerNumber || document.jobReference || 'unknown'}`;
    const currentGroup = groups.get(groupId) || {
      id: groupId,
      eyebrow: isSalesDocument ? 'Dokumen Sales / SO' : 'Nomor Container',
      title: isSalesDocument
        ? invoice.soNumber
        : document.containerNumber || document.jobReference || 'Nomor belum diisi',
      documents: [],
    };

    currentGroup.documents.push(document);
    groups.set(groupId, currentGroup);
    return groups;
  }, new Map()).values()).map((group) => ({
    ...group,
    readyCount: group.documents.filter((document) => document.ready !== false && document.file?.path).length,
  }));

  function setPendingInvoiceFile(slotType, file) {
    if (!file || isSavingInvoiceDocuments) return;
    setPendingInvoiceFiles((current) => ({ ...current, [slotType]: file }));
  }

  async function savePendingInvoiceDocuments() {
    if (!hasPendingInvoiceFiles || isSavingInvoiceDocuments) return;

    const validationErrors = pendingUploadSlots
      .map((slot) => {
        const message = validateInvoicePdfFile(pendingInvoiceFiles[slot.type], slot.label);
        return message ? `${slot.label}: ${message}` : '';
      })
      .filter(Boolean);

    if (validationErrors.length) {
      setUploadResultModal({
        status: 'error',
        title: 'Dokumen belum bisa disimpan',
        message: 'Periksa kembali file yang dipilih.',
        items: validationErrors,
      });
      return;
    }

    setUploadResultModal({
      status: 'loading',
      title: 'Mengirim dokumen',
      message: 'Invoice dan Faktur Pajak sedang disimpan ke sistem.',
      items: pendingUploadSlots.map((slot) => `${slot.label}: ${pendingInvoiceFiles[slot.type]?.name || 'File dipilih'}`),
    });

    const failedUploads = [];
    const successSlotTypes = [];
    for (const slot of pendingUploadSlots) {
      try {
        await onUploadInvoiceDocument?.(invoice.id, slot.type, pendingInvoiceFiles[slot.type]);
        successSlotTypes.push(slot.type);
      } catch (uploadError) {
        failedUploads.push(`${slot.label}: ${uploadError.message || 'Gagal dikirim.'}`);
      }
    }

    if (failedUploads.length) {
      setPendingInvoiceFiles((current) => {
        const next = { ...current };
        successSlotTypes.forEach((slotType) => {
          delete next[slotType];
        });
        return next;
      });
      setUploadResultModal({
        status: 'error',
        title: 'Sebagian dokumen gagal disimpan',
        message: 'Dokumen yang gagal masih siap dikirim ulang.',
        items: failedUploads,
      });
      return;
    }

    setPendingInvoiceFiles({});
    setUploadResultModal({
      status: 'success',
      title: 'Dokumen berhasil disimpan',
      message: `${pendingUploadSlots.length} dokumen Accurate berhasil tersimpan dan bisa dilihat oleh Sales.`,
      items: pendingUploadSlots.map((slot) => `${slot.label}: ${pendingInvoiceFiles[slot.type]?.name || 'File tersimpan'}`),
    });
  }

  async function saveDebitNoteNumber() {
    try {
      await onSaveDebitNoteNumber?.(invoice.id, debitNoteNumberDraft);
      setDebitNoteNumberDraft('');
    } catch (saveError) {
      // Error sudah ditampilkan lewat prop debitNoteNumberError.
    }
  }

  function openDebitNotePaymentModal() {
    setDebitNotePaymentForm({
      paymentDate: new Date().toISOString().slice(0, 10),
      referenceNumber: '',
      note: '',
      proofFile: null,
      idempotencyKey: crypto.randomUUID(),
    });
    setDebitNotePaymentOpen(true);
    onLoadDebitNotePayments?.(invoice.id);
  }

  function closeDebitNotePaymentModal() {
    if (debitNotePaymentSaving) return;
    setDebitNotePaymentOpen(false);
  }

  async function confirmDebitNotePaymentClick() {
    const amount = Number(invoice.debitNoteOutstandingAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !debitNotePaymentForm.proofFile) return;
    try {
      await onConfirmDebitNotePayment?.(invoice.id, {
        amount,
        paymentDate: debitNotePaymentForm.paymentDate || undefined,
        referenceNumber: debitNotePaymentForm.referenceNumber || undefined,
        note: debitNotePaymentForm.note || undefined,
        idempotencyKey: debitNotePaymentForm.idempotencyKey,
      }, debitNotePaymentForm.proofFile);
      setDebitNotePaymentOpen(false);
    } catch (paymentError) {
      // Error sudah ditampilkan lewat prop debitNotePaymentError.
    }
  }

  const debitNoteNeedsAttention = Boolean(
    invoice.debitNoteAmount > 0
    && (!invoice.debitNoteNumber || Number(invoice.debitNoteOutstandingAmount) > 0),
  );
  const detailSections = [
    { id: 'ringkasan', label: 'Ringkasan' },
    { id: 'debit-note', label: 'Debit Note', needsAttention: debitNoteNeedsAttention },
    { id: 'dokumen', label: 'Dokumen' },
    { id: 'container', label: 'Per Container' },
    { id: 'file-operational', label: 'File Operational' },
    { id: 'koreksi', label: 'Koreksi' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={onClose}>
      <section className="finance-invoice-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="finance-invoice-detail-header">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Detail Dasar Invoice</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-slate-950">{invoice.soNumber}</h3>
              <StatusPill value={invoice.invoiceStatus} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{invoice.destination} - {invoice.customer}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            Tutup
          </button>
        </header>

        <div className="finance-invoice-detail-body">
          {loading ? (
            <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
              Memuat dokumen Sales dan Operational...
            </div>
          ) : null}
          {error ? (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </div>
          ) : null}
          <div className="finance-invoice-detail-layout">
            <section className="finance-invoice-summary-strip">
              <div className="finance-invoice-summary-primary">
                <span>Nilai Tagih</span>
                <strong>{formatCurrency(invoice.billingAmount)}</strong>
              </div>
              {[
                ['Terms', invoice.paymentTerms],
                ['Jatuh Tempo', invoice.dueDate],
                ['Tgl Selesai', invoice.completedAt],
                ['Tgl Invoice', invoice.invoiceDate],
                ['No. Invoice', invoice.invoiceNumber || 'Belum ada'],
                ['Dokumen', invoice.documentStatus],
                ['Lama Pelunasan', `${formatAgingDays(invoice.invoiceAging?.currentDays)} - ${invoice.invoiceAging?.currentStage || '-'}`],
              ].map(([label, value]) => (
                <div className="finance-invoice-summary-item" key={label}>
                  <span>{label}</span>
                  <strong>{value || '-'}</strong>
                </div>
              ))}
            </section>

            <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1.5" role="tablist" aria-label="Bagian detail invoice">
              {detailSections.map((section) => {
                const active = section.id === activeSection;
                return (
                  <button
                    aria-selected={active}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-black uppercase tracking-wide transition ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950'
                    }`}
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    role="tab"
                    type="button"
                  >
                    <span>{section.label}</span>
                    {section.needsAttention ? <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-amber-400' : 'bg-amber-500'}`} aria-label="Perlu tindakan" /> : null}
                  </button>
                );
              })}
            </div>

            <section className={`finance-invoice-support-grid ${activeSection === 'ringkasan' ? '' : 'hidden'}`}>
              <div className="finance-invoice-detail-card">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-black text-slate-950">Dokumen Dasar Tagih</h4>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">Siap Invoice</span>
                </div>
                <CompactList items={invoice.documentChecklist} />
              </div>
              <div className="finance-invoice-support-stack">
                <div className="finance-invoice-detail-card">
                  <h4 className="mb-1.5 text-xs font-black text-slate-950">Rincian Tagihan</h4>
                  <CompactList items={invoice.billingItems} />
                  {invoice.cancellationNote ? (
                    <div className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold leading-relaxed text-amber-800">
                      <Info className="mt-0.5 shrink-0" size={14} />
                      <span>{invoice.cancellationNote}</span>
                    </div>
                  ) : null}
                  {invoice.repoStoredNote ? (
                    <div className="mt-2 flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-semibold leading-relaxed text-blue-800">
                      <Info className="mt-0.5 shrink-0" size={14} />
                      <span>{invoice.repoStoredNote}</span>
                    </div>
                  ) : null}
                </div>
                <div className="finance-invoice-detail-card">
                  <h4 className="mb-1.5 text-xs font-black text-slate-950">Riwayat Finance</h4>
                  <ActivityLogList logs={invoice.activityLogs} />
                </div>
              </div>
            </section>

            <section className={`finance-invoice-detail-card ${activeSection === 'debit-note' ? '' : 'hidden'}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-slate-950">Debit Note (Reimbursement)</h4>
                    <strong className="text-xs font-black text-slate-950">{formatCurrency(invoice.debitNoteAmount)}</strong>
                  </div>

                  {invoice.debitNoteAmount > 0 ? (
                    <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                      {invoice.debitNoteNumber ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block text-[10px] font-bold uppercase text-slate-500">No. Debit Note</span>
                            <strong className="block text-sm font-black text-slate-950">{invoice.debitNoteNumber}</strong>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <DebitNoteAgingBadge bucket={invoice.debitNoteAgingBucket} />
                              <span className="text-[10px] font-semibold text-slate-500">
                                Outstanding: {formatCurrency(invoice.debitNoteOutstandingAmount)}
                              </span>
                            </div>
                          </div>
                          <button
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-[10px] font-black text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={Number(invoice.debitNoteOutstandingAmount) <= 0}
                            onClick={openDebitNotePaymentModal}
                            type="button"
                          >
                            Catat Pembayaran
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="grid min-w-[180px] flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
                            Input Nomor Debit Note
                            <input
                              className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold uppercase text-slate-900 outline-none focus:border-slate-500"
                              disabled={debitNoteNumberSaving}
                              onChange={(event) => setDebitNoteNumberDraft(event.target.value)}
                              placeholder="Contoh: DN-202608-001"
                              value={debitNoteNumberDraft}
                            />
                          </label>
                          <button
                            className="h-8 shrink-0 rounded-md border border-red-200 bg-red-600 px-3 text-[10px] font-black text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                            disabled={!debitNoteNumberDraft.trim() || debitNoteNumberSaving}
                            onClick={saveDebitNoteNumber}
                            type="button"
                          >
                            {debitNoteNumberSaving ? 'Menyimpan...' : 'Simpan'}
                          </button>
                        </div>
                      )}
                      {debitNoteNumberError ? (
                        <p className="mt-1.5 text-[10px] font-semibold text-rose-700">{debitNoteNumberError}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {invoice.debitNoteItems?.length ? (
                    <div className="grid gap-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Rincian Reimbursement per Container
                      </p>
                      {groupDebitNoteItemsByContainer(invoice.debitNoteItems).map((group) => (
                        <div className="rounded-md border border-slate-200 bg-white p-2" key={group.key}>
                          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-1.5">
                            <span className="text-[11px] font-black uppercase text-slate-800">
                              {group.containerNumber || 'Tanpa Nomor Container'}
                            </span>
                            <strong className="text-xs font-black text-slate-900">{formatCurrency(group.total)}</strong>
                          </div>
                          <div className="grid gap-1">
                            {group.items.map((item) => (
                              <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5" key={item.id}>
                                <div className="min-w-0">
                                  <span className="block text-xs font-semibold text-slate-700">{readableLabel(expenseCategoryLabels, item.category)}</span>
                                  <span className="block truncate text-[10px] font-medium text-slate-500">{item.description || item.recipientName || '-'} - {readableLabel(expensePaymentStatusLabels, item.paymentStatus)}</span>
                                </div>
                                <strong className="shrink-0 text-xs font-black text-slate-900">{formatCurrency(item.amount)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-slate-500">Belum ada biaya reimbursement pada SO ini.</p>
                  )}
            </section>

            <section className={`finance-invoice-detail-card ${activeSection === 'dokumen' ? '' : 'hidden'}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black text-slate-950">Dokumen Accurate</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Upload PDF Invoice dan Faktur Pajak dari Accurate.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={invoice.invoiceDocumentStatusLabel} />
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-600 px-3 text-[10px] font-black text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                    disabled={!hasPendingInvoiceFiles || isSavingInvoiceDocuments}
                    onClick={savePendingInvoiceDocuments}
                    type="button"
                  >
                    <CheckCircle2 size={13} />
                    {isSavingInvoiceDocuments ? 'Menyimpan...' : 'Simpan Dokumen'}
                  </button>
                </div>
              </div>
              {invoiceDocumentUploadError ? (
                <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {invoiceDocumentUploadError}
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                {financeInvoiceUploadSlots.map((slot) => {
                  const document = findInvoiceFinanceDocument(documents, slot.category);
                  const busyKey = `${invoice.id}:${slot.type}`;
                  const isBusy = invoiceDocumentBusyKey === busyKey;
                  const pendingFile = pendingInvoiceFiles[slot.type];
                  const uploadedAtValue = invoice[slot.uploadedAtKey];
                  const uploadedAt = uploadedAtValue ? formatDisplayDate(uploadedAtValue) : '';
                  const uploadedBy = invoice[slot.uploadedByKey];
                  const isDragActive = dragUploadKey === busyKey;

                  return (
                    <div
                      className={`rounded-md border bg-white p-2.5 transition ${
                        isDragActive
                          ? 'border-sky-300 bg-sky-50 ring-2 ring-sky-100'
                          : 'border-slate-200'
                      }`}
                      key={slot.type}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        if (!isBusy) setDragUploadKey(busyKey);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        if (event.currentTarget.contains(event.relatedTarget)) return;
                        setDragUploadKey((current) => (current === busyKey ? '' : current));
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (event.dataTransfer) event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy';
                      }}
                      onDrop={async (event) => {
                        event.preventDefault();
                        setDragUploadKey('');
                        if (isBusy) return;
                        const file = event.dataTransfer?.files?.[0];
                        if (file) setPendingInvoiceFile(slot.type, file);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <strong className="block text-xs font-black text-slate-950">{slot.label}</strong>
                          <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
                            {isDragActive ? 'Lepas PDF di sini' : pendingFile?.name || document?.file?.name || 'Belum ada file PDF'}
                          </span>
                        </div>
                        <label className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold ${isBusy ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}>
                          <Upload size={13} />
                          {isBusy ? 'Upload...' : pendingFile || document ? 'Ganti' : 'Pilih'}
                          <input
                            accept="application/pdf,.pdf"
                            aria-label={`Upload ${slot.label} PDF`}
                            className="sr-only"
                            disabled={isBusy}
                            onChange={async (event) => {
                              const input = event.currentTarget;
                              const file = input.files?.[0];
                              try {
                                if (file) setPendingInvoiceFile(slot.type, file);
                              } finally {
                                input.value = '';
                              }
                            }}
                            type="file"
                          />
                        </label>
                      </div>
                      <div className={`mt-2 rounded-md border border-dashed px-2.5 py-2 text-[10px] font-semibold ${
                        isDragActive
                          ? 'border-sky-300 bg-white text-sky-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Upload size={13} className={isDragActive ? 'text-sky-600' : 'text-slate-400'} />
                          <span>{isDragActive ? 'Lepaskan file PDF di sini.' : 'Drag & drop PDF ke area ini, lalu klik Simpan Dokumen.'}</span>
                        </div>
                      </div>
                      {pendingFile ? (
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800">
                          <span className="min-w-0 truncate">Siap disimpan: {pendingFile.name}</span>
                          <button
                            className="shrink-0 font-black text-amber-900 hover:text-red-700"
                            onClick={() => setPendingInvoiceFiles((current) => {
                              const next = { ...current };
                              delete next[slot.type];
                              return next;
                            })}
                            type="button"
                          >
                            Batal
                          </button>
                        </div>
                      ) : null}
                      {document ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <DocumentLink
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                            file={document.file}
                            label="View"
                          />
                          <DocumentLink
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-bold text-sky-700 hover:bg-sky-100"
                            download
                            file={document.file}
                            label="Download"
                          />
                        </div>
                      ) : null}
                      {(uploadedAt || uploadedBy) ? (
                        <p className="mt-2 text-[10px] font-semibold text-slate-500">
                          {uploadedAt ? `Upload ${uploadedAt}` : 'Sudah upload'}{uploadedBy ? ` oleh ${uploadedBy}` : ''}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={`finance-invoice-detail-card ${activeSection === 'container' ? '' : 'hidden'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-slate-950">Rincian per Container</h4>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{invoice.containerBreakdown?.length || 0} container</span>
              </div>
              {invoice.containerBreakdown?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2.5 py-2">No. Container</th>
                        <th className="px-2.5 py-2">No. Invoice</th>
                        <th className="px-2.5 py-2 text-right">Nilai Invoice</th>
                        <th className="px-2.5 py-2">No. Debit Note</th>
                        <th className="px-2.5 py-2 text-right">Nilai Debit Note</th>
                        <th className="px-2.5 py-2 text-center">Dokumen</th>
                        <th className="px-2.5 py-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoice.containerBreakdown.map((container) => (
                        <tr key={container.containerJobId}>
                          <td className="px-2.5 py-2 font-black text-slate-900">{container.containerNumber || '-'}</td>
                          <td className="px-2.5 py-2 font-semibold text-slate-700">{invoice.invoiceNumber || 'Belum ada'}</td>
                          <td className="px-2.5 py-2 text-right font-bold text-slate-900">{formatCurrency(container.invoiceAmount)}</td>
                          <td className="px-2.5 py-2 font-semibold text-slate-700">{container.debitNoteAmount > 0 ? (invoice.debitNoteNumber || 'Belum ada') : '-'}</td>
                          <td className="px-2.5 py-2 text-right font-bold text-slate-900">{container.debitNoteAmount > 0 ? formatCurrency(container.debitNoteAmount) : '-'}</td>
                          <td className="px-2.5 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${invoice.invoiceDocumentUploadedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`} title="Dokumen Invoice">INV</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${invoice.taxInvoiceDocumentUploadedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`} title="Faktur Pajak">FP</span>
                              {container.debitNoteAmount > 0 ? (
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${invoice.debitNoteDocumentUploadedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`} title="Dokumen Debit Note">DN</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-2.5 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              {findInvoiceFinanceDocument(documents, 'invoicePdf') ? (
                                <DocumentLink
                                  className="inline-flex h-6 items-center justify-center rounded-md border border-slate-300 bg-white px-1.5 text-[9px] font-bold text-slate-700 hover:bg-slate-50"
                                  file={findInvoiceFinanceDocument(documents, 'invoicePdf').file}
                                  label="Invoice"
                                />
                              ) : null}
                              {container.debitNoteAmount > 0 && findInvoiceFinanceDocument(documents, 'debitNotePdf') ? (
                                <DocumentLink
                                  className="inline-flex h-6 items-center justify-center rounded-md border border-sky-200 bg-sky-50 px-1.5 text-[9px] font-bold text-sky-700 hover:bg-sky-100"
                                  file={findInvoiceFinanceDocument(documents, 'debitNotePdf').file}
                                  label="Debit Note"
                                />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-xs font-medium text-slate-500">
                  Belum ada data container pada SO ini.
                </p>
              )}
            </section>

            <section className={`finance-invoice-detail-card ${activeSection === 'file-operational' ? '' : 'hidden'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-slate-950">File Sales & Operational</h4>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{availableDocumentCount} file tersedia</span>
              </div>
              {documents.length ? (
                <div className="finance-invoice-container-grid">
                  {documentGroups.map((group) => (
                    <section className="finance-invoice-container-card" key={group.id}>
                      <header className="finance-invoice-container-header">
                        <div className="min-w-0">
                          <span>{group.eyebrow}</span>
                          <strong className="truncate" title={group.title}>{group.title}</strong>
                        </div>
                        <span className="finance-invoice-container-count">
                          {group.id === 'sales-order' ? `${group.readyCount} file` : `${group.readyCount}/${group.documents.length} lengkap`}
                        </span>
                      </header>
                      <div className="finance-invoice-container-files">
                        {group.documents.map((document) => {
                          const isReady = document.ready !== false && Boolean(document.file?.path);
                          return (
                            <div className={`finance-invoice-document-row ${isReady ? '' : 'is-missing'}`} key={document.id}>
                              <div className="min-w-0 flex-1">
                                <strong className="block truncate text-[11px] text-slate-900" title={document.label}>
                                  {document.label}
                                </strong>
                                <p className="mt-0.5 truncate text-[9px] font-medium text-slate-500">
                                  {isReady
                                    ? document.referenceNumber || 'File tersedia untuk view atau download.'
                                    : 'Belum dilengkapi oleh Operational.'}
                                </p>
                              </div>
                              {isReady ? (
                                <div className="grid shrink-0 grid-cols-2 gap-1">
                                  <DocumentLink
                                    className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[9px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                    file={document.file}
                                    label="View"
                                  />
                                  <DocumentLink
                                    className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 text-[9px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-40"
                                    download
                                    file={document.file}
                                    label="Download"
                                  />
                                </div>
                              ) : (
                                <span className="finance-invoice-document-missing">Belum dilengkapi</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-xs font-medium text-slate-500">
                  Belum ada file Sales atau Operational yang dapat didownload.
                </p>
              )}
            </section>

            <section className={`finance-invoice-detail-card ${activeSection === 'koreksi' ? '' : 'hidden'}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black text-slate-950">Koreksi Nomor Invoice</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Koreksi nomor invoice masuk approval Admin.</p>
                </div>
                <button
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                  disabled={!invoice.invoiceNumber}
                  onClick={() => onOpenCorrection(invoice, 'invoice_number')}
                  type="button"
                >
                  Ajukan Koreksi
                </button>
              </div>
              <CorrectionHistoryList corrections={corrections} error={correctionsError} loading={correctionsLoading} />
            </section>
          </div>
        </div>
      </section>
      {uploadResultModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => event.stopPropagation()}>
          <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-2xl" role="alertdialog" aria-modal="true">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                uploadResultModal.status === 'success'
                  ? 'bg-emerald-50 text-emerald-600'
                  : uploadResultModal.status === 'error'
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-sky-50 text-sky-600'
              }`}>
                {uploadResultModal.status === 'success' ? <CheckCircle2 size={20} /> : uploadResultModal.status === 'error' ? <AlertTriangle size={20} /> : <Upload size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-black text-slate-950">{uploadResultModal.title}</h4>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{uploadResultModal.message}</p>
                {uploadResultModal.items?.length ? (
                  <div className="mt-3 grid gap-1.5">
                    {uploadResultModal.items.map((item) => (
                      <div className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700" key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
                {uploadResultModal.status === 'loading' ? (
                  <p className="mt-3 text-[11px] font-bold text-sky-700">Mohon tunggu, jangan tutup halaman ini.</p>
                ) : (
                  <div className="mt-4 flex justify-end">
                    <button
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      onClick={() => setUploadResultModal(null)}
                      type="button"
                    >
                      Tutup
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {debitNotePaymentOpen ? (
        <DebitNotePaymentModal
          busy={debitNotePaymentSaving}
          error={debitNotePaymentError}
          form={debitNotePaymentForm}
          invoice={invoice}
          onChange={setDebitNotePaymentForm}
          onClose={closeDebitNotePaymentModal}
          onConfirm={confirmDebitNotePaymentClick}
          canVoidPayment={canVoidDebitNotePayment}
          voidBusyId={debitNotePaymentVoidBusyId}
          voidError={debitNotePaymentVoidError}
          onVoidPayment={(paymentId, reason) => onVoidDebitNotePayment?.(invoice.id, paymentId, reason)}
          payments={debitNotePayments}
          paymentsLoading={debitNotePaymentsLoading}
        />
      ) : null}
    </div>
  );
}

export default InvoiceDetailModal;
