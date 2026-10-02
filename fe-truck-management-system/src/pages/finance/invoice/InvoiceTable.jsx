import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, FileText, Info, LayoutGrid, Save, Upload, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import DocumentLink from '../../../components/common/DocumentLink';
import { fetchFinanceInvoicePayments } from '../../../services/finance/financeService';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate } from '../../../utils/formatDate';
import MonthFilterControl from '../shared/MonthFilterControl';
import StatusPill from '../shared/StatusPill';
import { INVOICE_TABLE_PAGE_SIZE } from './invoiceUtils';

function paymentProofFile(payment = {}) {
  if (payment.proofAttachment) return payment.proofAttachment;
  if (!payment.proofAttachmentId) return null;
  return {
    id: payment.proofAttachmentId,
    name: 'Bukti Pembayaran',
    path: payment.proofAttachmentId,
  };
}

function PaymentProofModal({ row, payments, loading, error, onClose }) {
  if (!row) return null;
  return createPortal(
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="master-modal max-w-2xl" role="dialog" aria-modal="true" aria-label={`Bukti pembayaran ${row.soNumber}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="master-form">
          <div className="master-form-heading">
            <div className="min-w-0">
              <span>Bukti Pembayaran</span>
              <h2>{row.invoiceNumber || row.soNumber}</h2>
              <p>{row.customer}</p>
            </div>
            <button className="modal-close-button" type="button" aria-label="Tutup bukti pembayaran" onClick={onClose}>
              <X size={17} />
            </button>
          </div>
          <div className="master-form-sections">
            <fieldset className="master-fieldset">
              <legend>Riwayat Bukti Bayar</legend>
              {loading ? (
                <p className="text-xs font-semibold text-slate-500">Memuat bukti pembayaran...</p>
              ) : error ? (
                <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>
              ) : payments.length ? (
                <ul className="grid gap-2">
                  {payments.map((payment, index) => {
                    const proofFile = paymentProofFile(payment);
                    return (
                      <li className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs" key={payment.id || index}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className={payment.voidedAt ? 'opacity-60' : ''}>
                            <strong className={`block text-sm text-slate-900 ${payment.voidedAt ? 'line-through' : ''}`}>{formatCurrency(payment.amount)}</strong>
                            <span className="block text-slate-500">{formatDate(payment.paymentDate)}{payment.referenceNumber ? ` - ${payment.referenceNumber}` : ''}</span>
                            <span className="block text-slate-400">{payment.recordedByName || '-'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {payment.voidedAt ? (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700">Dibatalkan</span>
                            ) : null}
                            {proofFile ? (
                              <DocumentLink
                                className="rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase text-sky-700 hover:bg-sky-50"
                                file={proofFile}
                                label="Lihat Bukti"
                              />
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">Belum Ada Bukti</span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs font-semibold text-slate-500">Belum ada pembayaran tercatat.</p>
              )}
            </fieldset>
          </div>
          <div className="master-form-actions">
            <button className="secondary-button" type="button" onClick={onClose}>Tutup</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function InvoiceTable({
  rows,
  summary,
  total,
  totalPages,
  currentPage,
  activeInvoiceTab,
  activeInvoiceDocumentFilter,
  onActiveInvoiceTabChange,
  onActiveInvoiceDocumentFilterChange,
  onInvoicePageChange,
  invoiceFilterMonth,
  invoiceDateFrom,
  invoiceDateTo,
  onInvoiceFilterMonthChange,
  onInvoiceDateFromChange,
  onInvoiceDateToChange,
  onResetInvoiceDateFilter,
  onSelectInvoice,
  invoiceBusyId = '',
  onSaveInvoiceNumberInline,
  canUpdateInvoiceNumber = false,
  canUploadInvoiceDocument = false,
}) {
  const [invoiceDrafts, setInvoiceDrafts] = useState({});
  const [paymentProofRow, setPaymentProofRow] = useState(null);
  const [paymentProofs, setPaymentProofs] = useState([]);
  const [paymentProofLoading, setPaymentProofLoading] = useState(false);
  const [paymentProofError, setPaymentProofError] = useState('');
  const invoiceTabs = [
    {
      id: 'all',
      label: 'Semua',
      icon: LayoutGrid,
      tone: 'slate',
      match: () => true,
    },
    {
      id: 'need-number',
      label: 'Belum Lengkap',
      icon: FileText,
      tone: 'red',
      match: (row) => row.invoiceStatus === 'Butuh Nomor Invoice',
    },
    {
      id: 'in-progress',
      label: 'Menunggu Pembayaran',
      icon: Clock3,
      tone: 'sky',
      match: (row) => row.invoiceStatus === 'Menunggu Update Status',
    },
    {
      id: 'paid',
      label: 'Lunas',
      icon: CheckCircle2,
      tone: 'emerald',
      match: (row) => row.invoiceStatus === 'Lunas',
    },
  ];
  const invoiceDocumentFilters = [
    { id: 'all', label: 'Semua Dokumen', countKey: null },
    { id: 'complete', label: 'Belum Dikirim ke Customer', countKey: 'completeInvoiceDocuments' },
    { id: 'sent', label: 'Sudah Dikirim ke Customer', countKey: 'sentInvoiceDocuments' },
  ];
  // Dropdown lebih lengkap ini khusus tab "Semua" -- tab lain (Belum Lengkap/Menunggu Pembayaran/Lunas)
  // sengaja tidak diubah supaya perilakunya tetap seperti sebelumnya. countKey merujuk field di
  // invoiceSummary (lihat useFinanceInvoiceWorkflow) yang dihitung backend dengan kondisi yang sama
  // persis dengan klausa filter di buildInvoiceFilters, supaya badge jumlah tidak meleset dari hasil.
  const invoiceAllTabFilters = [
    { id: 'all', label: 'Semua dokumen', countKey: 'allInvoices' },
    { id: 'missing-invoice', label: 'Invoice belum upload', countKey: 'missingInvoiceDocument' },
    { id: 'sj-incomplete', label: 'SJ belum lengkap', countKey: 'sjIncomplete' },
    { id: 'sj-complete', label: 'SJ sudah lengkap', countKey: 'sjComplete' },
    { id: 'complete', label: 'Belum dikirim ke customer', countKey: 'notSentToCustomer' },
    { id: 'sent', label: 'Sudah dikirim ke customer', countKey: 'sentToCustomer' },
    { id: 'due-soon', label: 'Jatuh tempo dekat', countKey: 'dueSoon' },
    { id: 'overdue', label: 'Lewat jatuh tempo', countKey: 'overdue' },
  ];
  const canFilterDocuments = activeInvoiceTab === 'in-progress';
  const canFilterAllTabDocuments = activeInvoiceTab === 'all';
  const visibleInvoiceDocumentFilters = invoiceDocumentFilters.filter(() => canFilterDocuments);
  const serverRows = Array.isArray(rows) ? rows : [];
  const safeTotal = Number.isFinite(Number(total)) ? Number(total) : 0;
  const safeTotalPages = Math.max(1, Number(totalPages || Math.ceil(safeTotal / INVOICE_TABLE_PAGE_SIZE) || 1));
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage || 1)), safeTotalPages);
  const paginatedRows = serverRows;
  const showingFrom = safeTotal ? (safeCurrentPage - 1) * INVOICE_TABLE_PAGE_SIZE + 1 : 0;
  const showingTo = safeTotal ? Math.min(showingFrom + paginatedRows.length - 1, safeTotal) : 0;
  const tabCounts = {
    'need-number': Number(summary?.needNumber ?? serverRows.filter((row) => invoiceTabs[1].match(row)).length),
    'in-progress': Number(summary?.inProgress ?? serverRows.filter((row) => invoiceTabs[2].match(row)).length),
    paid: Number(summary?.paid ?? serverRows.filter((row) => invoiceTabs[3].match(row)).length),
  };
  const allInvoiceTotal = tabCounts['need-number'] + tabCounts['in-progress'] + tabCounts.paid;
  tabCounts.all = Number(summary?.allInvoices ?? allInvoiceTotal);

  function invoiceDraftValue(row) {
    return invoiceDrafts[row.id] ?? row.invoiceNumber ?? '';
  }

  async function openPaymentProofs(row) {
    setPaymentProofRow(row);
    setPaymentProofs([]);
    setPaymentProofError('');
    setPaymentProofLoading(true);
    try {
      const result = await fetchFinanceInvoicePayments(row.id);
      setPaymentProofs(Array.isArray(result) ? result : []);
    } catch (error) {
      setPaymentProofError(error.message || 'Bukti pembayaran gagal dimuat.');
    } finally {
      setPaymentProofLoading(false);
    }
  }

  function updateInvoiceDraft(id, value) {
    setInvoiceDrafts((current) => ({ ...current, [id]: value.toUpperCase() }));
  }

  function travelDocumentBadge(row) {
    const total = Math.max(Number(row.sjTotalCount || row.billedJobsCount || row.containerCount || 0), 0);
    const uploaded = Math.min(Math.max(Number(row.sjUploadedCount || 0), 0), total || Number(row.sjUploadedCount || 0));
    const complete = total > 0 && uploaded >= total;
    const empty = uploaded === 0;
    const tone = complete
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : empty
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
    const label = total > 1 ? `SJ ${uploaded}/${total}` : complete ? 'SJ OK' : 'SJ -';

    return (
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase leading-4 ${tone}`}
        title={total > 0 ? `${uploaded} dari ${total} Surat Jalan sudah diupload` : 'Belum ada data ritasi untuk cek Surat Jalan'}
      >
        {label}
      </span>
    );
  }

  async function saveInvoiceNumber(row) {
    if (!onSaveInvoiceNumberInline) return;
    try {
      await onSaveInvoiceNumberInline(row.id, invoiceDraftValue(row));
    } catch {
      // Error message is rendered by the parent invoice error banner.
    }
  }

  return (
    <div className="overflow-hidden rounded-b-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              <Info size={12} />
              <span>Keterangan</span>
            </div>
            <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-sm" role="tablist" aria-label="Filter invoice Finance">
          {invoiceTabs.map((tab) => {
          const count = tabCounts[tab.id] || 0;
          const active = tab.id === activeInvoiceTab;
          const toneClass = {
            slate: {
              active: 'border-slate-300 bg-slate-100 text-slate-800 ring-slate-200',
              icon: 'bg-white text-slate-600 ring-1 ring-slate-200',
              count: 'bg-slate-200 text-slate-700',
            },
            red: {
              active: 'border-red-200 bg-red-50 text-red-800 ring-red-100',
              icon: 'bg-white text-red-600 ring-1 ring-red-100',
              count: 'bg-red-100 text-red-700',
            },
            sky: {
              active: 'border-sky-200 bg-sky-50 text-sky-800 ring-sky-100',
              icon: 'bg-white text-sky-600 ring-1 ring-sky-100',
              count: 'bg-sky-100 text-sky-700',
            },
            emerald: {
              active: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-100',
              icon: 'bg-white text-emerald-600 ring-1 ring-emerald-100',
              count: 'bg-emerald-100 text-emerald-700',
            },
          }[tab.tone];

          return (
            <button
              aria-selected={active}
              className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-bold transition ${
                active
                  ? `${toneClass.active} shadow-sm ring-1`
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800'
              }`}
              key={tab.id}
              onClick={() => onActiveInvoiceTabChange(tab.id)}
              role="tab"
              type="button"
            >
              <span className={`grid h-5 w-5 place-items-center rounded-full ${active ? toneClass.icon : 'bg-white text-slate-400'}`}>
                <tab.icon size={12} />
              </span>
              <span className="whitespace-nowrap">{tab.label}</span>
              <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${active ? toneClass.count : 'bg-white text-slate-500'}`}>{count}</span>
            </button>
          );
            })}
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-end gap-2">
            <MonthFilterControl
              className="[&>div>*]:h-8"
              label="Bulan update"
              monthAriaLabel="Bulan update invoice"
              onChange={onInvoiceFilterMonthChange}
              value={invoiceFilterMonth}
              yearAriaLabel="Tahun update invoice"
            />
            <label className="grid min-w-[135px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
              Dari
              <input
                aria-label="Tanggal awal update invoice"
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => onInvoiceDateFromChange(event.target.value)}
                type="date"
                value={invoiceDateFrom}
              />
            </label>
            <label className="grid min-w-[135px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
              Sampai
              <input
                aria-label="Tanggal akhir update invoice"
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => onInvoiceDateToChange(event.target.value)}
                type="date"
                value={invoiceDateTo}
              />
            </label>
            <button
              className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!invoiceFilterMonth && !invoiceDateFrom && !invoiceDateTo}
              onClick={onResetInvoiceDateFilter}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>
        {canFilterDocuments ? (
        <div className="mt-2 flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {visibleInvoiceDocumentFilters.map((filter) => {
            const active = activeInvoiceDocumentFilter === filter.id;
            const allCount = Number(summary?.inProgress || 0);
            const count = filter.countKey ? Number(summary?.[filter.countKey] || 0) : allCount;
            return (
              <button
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10px] font-bold transition ${active ? 'border-sky-200 bg-white text-sky-700 shadow-sm' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800'}`}
                key={filter.id}
                onClick={() => onActiveInvoiceDocumentFilterChange(filter.id)}
                type="button"
              >
                <span>{filter.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? 'bg-sky-50 text-sky-700' : 'bg-white text-slate-500'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        ) : null}
        {canFilterAllTabDocuments ? (
        <div className="mt-2 flex items-center gap-2">
          <label className="grid gap-1 text-[10px] font-black uppercase text-slate-500" htmlFor="invoice-all-tab-document-filter">
            Filter Dokumen &amp; Piutang
            <select
              className="h-8 min-w-[220px] rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              id="invoice-all-tab-document-filter"
              onChange={(event) => onActiveInvoiceDocumentFilterChange(event.target.value)}
              value={activeInvoiceDocumentFilter}
            >
              {invoiceAllTabFilters.map((filter) => {
                const count = filter.countKey ? Number(summary?.[filter.countKey] || 0) : Number(summary?.allInvoices || 0);
                return (
                  <option key={filter.id} value={filter.id}>{filter.label} ({count})</option>
                );
              })}
            </select>
          </label>
        </div>
        ) : null}
      </div>

      <div className="finance-invoice-table-wrap">
        <table className="data-table master-table finance-master-table finance-invoice-table table-fixed">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[6%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[7%]" />
          </colgroup>
          <thead>
            <tr>
              {[
                { label: 'No', align: 'text-left' },
                { label: 'Nomor SO', align: 'text-left' },
                { label: 'Nomor Invoice', align: 'text-left' },
                { label: 'Customer', align: 'text-left' },
                { label: 'Selesai', align: 'text-left' },
                { label: 'Jatuh Tempo', align: 'text-left' },
                { label: 'SJ', align: 'text-center' },
                { label: 'Total Invoice', align: 'text-right' },
                { label: 'Total Debit Note', align: 'text-right' },
                { label: 'Status Pelunasan', align: 'text-center' },
                { label: 'Detail', align: 'text-right' },
              ].map((column) => (
                <th className={column.align} key={column.label}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, index) => {
              const needsInvoiceDocuments = Boolean(row.invoiceNumber && !row.invoiceDocumentUploadedAt);
              const documentActionLabel = needsInvoiceDocuments && canUploadInvoiceDocument ? 'Upload Dokumen' : 'Detail Dokumen';
              const isLunas = row.billingStatus === 'lunas';
              const inapJobsCount = Math.max(Number(row.inapJobsCount || 0), 0);

              return (
                <tr className={`border-t align-middle hover:bg-slate-50 ${inapJobsCount ? 'border-amber-100 bg-amber-50/35' : 'border-slate-100'}`} key={row.id}>
                  <td className="font-black text-slate-800" data-label="No">{showingFrom + index}</td>
                  <td className="finance-invoice-so font-semibold text-slate-700" data-label="Nomor SO">{row.soNumber}</td>
                  <td className="finance-invoice-number-cell" data-label="Nomor Invoice">
                    {row.invoiceNumber ? (
                      <span className="block truncate font-black text-slate-900" title={row.invoiceNumber}>{row.invoiceNumber}</span>
                    ) : canUpdateInvoiceNumber ? (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <input
                          aria-label={`Nomor Invoice ${row.soNumber}`}
                          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold uppercase text-slate-900 outline-none transition placeholder:normal-case placeholder:text-slate-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
                          disabled={invoiceBusyId === row.id}
                          onChange={(event) => updateInvoiceDraft(row.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              saveInvoiceNumber(row);
                            }
                          }}
                          placeholder="No. invoice"
                          value={invoiceDraftValue(row)}
                        />
                        <button
                          aria-label={`Simpan nomor invoice ${row.soNumber}`}
                          className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-md border border-red-200 bg-red-600 text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400"
                          disabled={invoiceBusyId === row.id || !invoiceDraftValue(row).trim()}
                          onClick={() => saveInvoiceNumber(row)}
                          title={invoiceBusyId === row.id ? 'Menyimpan nomor invoice' : 'Simpan nomor invoice'}
                          type="button"
                        >
                          <Save size={13} />
                        </button>
                      </div>
                    ) : (
                      <span className="block truncate font-black text-slate-400">-</span>
                    )}
                  </td>
                  <td className="finance-invoice-customer" data-label="Customer">
                    <span className="block truncate font-semibold text-slate-900">{row.customer}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      <span className="truncate">{row.destination}</span>
                      {row.destinations?.length > 1 ? (
                        <span
                          className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700"
                          title={row.destinations.join(', ')}
                        >
                          Multi-tujuan
                        </span>
                      ) : null}
                      {inapJobsCount ? (
                        <span
                          className="inline-flex shrink-0 items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-orange-700"
                          title={`${inapJobsCount} ritasi pada SO ini tercatat Inap`}
                        >
                          {inapJobsCount} Inap
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="finance-invoice-date text-slate-700" data-label="Selesai">{row.completedAt}</td>
                  <td className="finance-invoice-date text-slate-700" data-label="Jatuh Tempo">{row.dueDate}</td>
                  <td className="text-center" data-label="SJ">{travelDocumentBadge(row)}</td>
                  <td className="finance-invoice-total font-semibold text-slate-900" data-label="Total Invoice">{formatCurrency(row.billingAmount)}</td>
                  <td className="text-right font-semibold text-slate-700" data-label="Total Debit Note">
                    {row.debitNoteAmount ? (
                      <div className="grid justify-items-end gap-0.5">
                        <span>{formatCurrency(row.debitNoteAmount)}</span>
                        {!row.debitNoteNumber ? (
                          <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700">Perlu Nomor</span>
                        ) : row.debitNoteOutstandingAmount > 0 ? (
                          <span className="inline-flex w-fit items-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-700">Belum Lunas</span>
                        ) : null}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="finance-invoice-status text-center" data-label="Status Pelunasan">
                    <div className="grid justify-items-center gap-1">
                      <StatusPill className="max-w-full overflow-hidden text-ellipsis" value={isLunas ? 'Lunas' : 'Belum Lunas'} />
                      {isLunas ? (
                        <button
                          className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[10px] font-black uppercase text-sky-700 hover:bg-sky-50"
                          onClick={() => openPaymentProofs(row)}
                          type="button"
                        >
                          Lihat Bukti
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="finance-invoice-actions" data-label="Detail">
                    <div className="finance-invoice-action-row">
                      <button
                        aria-label={`${documentActionLabel} ${row.soNumber}`}
                        className="finance-table-action-button"
                        onClick={() => onSelectInvoice(row.id)}
                        title={documentActionLabel}
                        type="button"
                      >
                        {needsInvoiceDocuments && canUploadInvoiceDocument ? <Upload size={13} /> : <Eye size={13} />}
                        <span>{needsInvoiceDocuments && canUploadInvoiceDocument ? 'Upload' : 'Detail'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!paginatedRows.length ? (
              <tr>
                <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400" colSpan={11}>Tidak ada data pada klasifikasi ini.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="master-pagination border-t border-slate-200 bg-slate-50">
        <span>
          Menampilkan {showingFrom}-{showingTo} dari {safeTotal} data filter ini
          {allInvoiceTotal && allInvoiceTotal !== safeTotal ? ` (${allInvoiceTotal} semua data)` : ''}
        </span>
        <div className="master-pagination-controls">
          <button type="button" disabled={safeCurrentPage === 1} onClick={() => onInvoicePageChange(Math.max(1, safeCurrentPage - 1))} aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <strong>Halaman {safeCurrentPage} dari {safeTotalPages}</strong>
          <button type="button" disabled={safeCurrentPage === safeTotalPages} onClick={() => onInvoicePageChange(Math.min(safeTotalPages, safeCurrentPage + 1))} aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <PaymentProofModal
        error={paymentProofError}
        loading={paymentProofLoading}
        onClose={() => {
          setPaymentProofRow(null);
          setPaymentProofs([]);
          setPaymentProofError('');
        }}
        payments={paymentProofs}
        row={paymentProofRow}
      />
    </div>
  );
}

export default InvoiceTable;
