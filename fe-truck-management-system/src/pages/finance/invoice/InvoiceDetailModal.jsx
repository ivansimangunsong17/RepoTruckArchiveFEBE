import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Upload } from 'lucide-react';
import DocumentLink from '../../../components/common/DocumentLink';
import { formatCurrency } from '../../../utils/formatCurrency';
import CorrectionHistoryList from '../shared/CorrectionHistoryList';
import StatusPill from '../shared/StatusPill';
import {
  financeInvoiceUploadSlots,
  findInvoiceFinanceDocument,
  formatAgingDays,
  validateInvoicePdfFile,
} from './invoiceUtils';

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
  onClose,
  onOpenCorrection,
  onUploadInvoiceDocument,
}) {
  const [dragUploadKey, setDragUploadKey] = useState('');
  const [pendingInvoiceFiles, setPendingInvoiceFiles] = useState({});
  const [uploadResultModal, setUploadResultModal] = useState(null);

  useEffect(() => {
    setDragUploadKey('');
    setPendingInvoiceFiles({});
    setUploadResultModal(null);
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

            <section className="finance-invoice-support-grid">
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

            <section className="finance-invoice-detail-card">
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

            <section className="finance-invoice-detail-card">
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

            <section className="finance-invoice-detail-card">
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
    </div>
  );
}

export default InvoiceDetailModal;
