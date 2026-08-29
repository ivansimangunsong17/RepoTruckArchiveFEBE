import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, FileText, Info, Upload } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatCurrency';
import MonthFilterControl from '../shared/MonthFilterControl';
import StatusPill from '../shared/StatusPill';
import { INVOICE_TABLE_PAGE_SIZE } from './invoiceUtils';

function InvoiceTable({
  rows,
  summary,
  total,
  totalPages,
  currentPage,
  query,
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
}) {
  const invoiceTabs = [
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
  const currentTab = invoiceTabs.find((tab) => tab.id === activeInvoiceTab) || invoiceTabs[0];
  const canFilterDocuments = activeInvoiceTab === 'in-progress';
  const visibleInvoiceDocumentFilters = invoiceDocumentFilters.filter(() => canFilterDocuments);
  const searchedRows = rows.filter((row) => `${row.soNumber} ${row.customer} ${row.destination} ${(row.destinations || []).join(' ')} ${row.invoiceNumber} ${row.invoiceStatus} ${row.debitNoteNumber || ''} ${(row.containerNumbers || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRows = searchedRows.filter((row) => {
    if (!currentTab.match(row)) return false;
    if (!canFilterDocuments) return true;
    if (activeInvoiceDocumentFilter === 'complete') {
      return row.invoiceNumber && row.invoiceDocumentUploadedAt && row.taxInvoiceDocumentUploadedAt && row.invoiceDocumentStatus !== 'terkirim';
    }
    if (activeInvoiceDocumentFilter === 'sent') return row.invoiceDocumentStatus === 'terkirim';
    return true;
  });
  const safeTotal = Number.isFinite(Number(total)) ? Number(total) : 0;
  const safeTotalPages = Math.max(1, Number(totalPages || Math.ceil(safeTotal / INVOICE_TABLE_PAGE_SIZE) || 1));
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage || 1)), safeTotalPages);
  const paginatedRows = filteredRows;
  const showingFrom = safeTotal ? (safeCurrentPage - 1) * INVOICE_TABLE_PAGE_SIZE + 1 : 0;
  const showingTo = safeTotal ? Math.min(showingFrom + paginatedRows.length - 1, safeTotal) : 0;
  const tabCounts = {
    'need-number': Number(summary?.needNumber ?? searchedRows.filter((row) => invoiceTabs[0].match(row)).length),
    'in-progress': Number(summary?.inProgress ?? searchedRows.filter((row) => invoiceTabs[1].match(row)).length),
    paid: Number(summary?.paid ?? searchedRows.filter((row) => invoiceTabs[2].match(row)).length),
  };
  const allInvoiceTotal = tabCounts['need-number'] + tabCounts['in-progress'] + tabCounts.paid;

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
      </div>

      <div className="finance-invoice-table-wrap">
        <table className="data-table master-table finance-master-table finance-invoice-table table-fixed">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr>
              {[
                { label: 'No', align: 'text-left' },
                { label: 'Nomor SO', align: 'text-left' },
                { label: 'Customer', align: 'text-left' },
                { label: 'Selesai', align: 'text-left' },
                { label: 'Jatuh Tempo', align: 'text-left' },
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
              const needsInvoiceDocuments = Boolean(row.invoiceNumber && (!row.invoiceDocumentUploadedAt || !row.taxInvoiceDocumentUploadedAt));
              const documentActionLabel = needsInvoiceDocuments ? 'Upload Dokumen' : 'Detail Dokumen';
              const isLunas = row.billingStatus === 'lunas';

              return (
                <tr className="border-t border-slate-100 align-middle hover:bg-slate-50" key={row.id}>
                  <td className="font-black text-slate-800" data-label="No">{showingFrom + index}</td>
                  <td className="finance-invoice-so font-semibold text-slate-700" data-label="Nomor SO">{row.soNumber}</td>
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
                    </span>
                  </td>
                  <td className="finance-invoice-date text-slate-700" data-label="Selesai">{row.completedAt}</td>
                  <td className="finance-invoice-date text-slate-700" data-label="Jatuh Tempo">{row.dueDate}</td>
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
                    <StatusPill className="max-w-full overflow-hidden text-ellipsis" value={isLunas ? 'Lunas' : 'Belum Lunas'} />
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
                        {needsInvoiceDocuments ? <Upload size={13} /> : <Eye size={13} />}
                        <span>{needsInvoiceDocuments ? 'Upload' : 'Detail'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredRows.length ? (
              <tr>
                <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400" colSpan={9}>Tidak ada data pada klasifikasi ini.</td>
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
    </div>
  );
}

export default InvoiceTable;
