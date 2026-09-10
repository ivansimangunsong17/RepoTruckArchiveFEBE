import { Fragment } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import MonthFilterControl from '../shared/MonthFilterControl';
import SearchBar from '../shared/SearchBar';
import StatusPill from '../shared/StatusPill';
import { ORDER_TABLE_PAGE_SIZE, isCancelledFinanceOrder, isVerifiedFinanceOrder } from './orderVerificationUtils';

function OrderVerificationTable({
  rows,
  query,
  summary,
  activeOrderTab,
  currentPage,
  total,
  totalPages,
  onQueryChange,
  onActiveOrderTabChange,
  onPageChange,
  onSelectOrder,
  onOpenSoModal,
  savingSoId,
  canUpdateSoNumber = false,
  orderFilterMonth,
  orderDateFrom,
  orderDateTo,
  onOrderFilterMonthChange,
  onOrderDateFromChange,
  onOrderDateToChange,
  onResetOrderDateFilter,
}) {
  const orderTabs = [
    { id: 'need-so', label: 'Belum Ada Nomor SO', icon: Clock3, match: (row) => !isCancelledFinanceOrder(row) && !isVerifiedFinanceOrder(row) },
    { id: 'running', label: 'SO Terisi', icon: CheckCircle2, match: isVerifiedFinanceOrder },
    { id: 'cancelled', label: 'SO Batal', icon: AlertTriangle, match: isCancelledFinanceOrder },
  ];
  const currentTab = orderTabs.find((tab) => tab.id === activeOrderTab) || orderTabs[0];
  const normalizedQuery = query.trim().toLowerCase();
  const searchedRows = rows.filter((row) => `${row.soNumber} ${row.internalSoNumber} ${row.accurateSoNumber} ${row.salesName} ${row.customer} ${row.destination} ${row.paymentTerms} ${row.status} ${row.cancelReason}`.toLowerCase().includes(normalizedQuery));
  const filteredRows = searchedRows.filter((row) => currentTab.match(row));
  const hasBackendSummary = Boolean(summary);
  const safeTotal = Math.max(0, Number(total ?? filteredRows.length ?? 0));
  const safeCurrentPage = Math.max(1, Number(currentPage || 1));
  const safeTotalPages = Math.max(1, Number(totalPages || Math.ceil(safeTotal / ORDER_TABLE_PAGE_SIZE) || 1));
  const showingFrom = safeTotal ? (safeCurrentPage - 1) * ORDER_TABLE_PAGE_SIZE + 1 : 0;
  const showingTo = safeTotal ? Math.min(safeCurrentPage * ORDER_TABLE_PAGE_SIZE, safeTotal) : 0;
  const tabCounts = {
    'need-so': hasBackendSummary ? Number(summary?.pendingSo || 0) : searchedRows.filter((row) => orderTabs[0].match(row)).length,
    running: hasBackendSummary ? Number(summary?.verified || 0) : searchedRows.filter((row) => orderTabs[1].match(row)).length,
    cancelled: hasBackendSummary ? Number(summary?.cancelled || 0) : searchedRows.filter((row) => orderTabs[2].match(row)).length,
  };
  const groupedRows = filteredRows.reduce((groups, row) => {
    const salesName = row.salesName || 'Tanpa Sales';
    if (!groups[salesName]) groups[salesName] = [];
    groups[salesName].push(row);
    return groups;
  }, {});

  return (
    <div className="finance-order-verification space-y-0">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] max-w-full flex-1">
          <SearchBar query={query} onChange={onQueryChange} />
          </div>
          <div className="flex max-w-full flex-wrap items-end gap-2">
            <MonthFilterControl
              label="Bulan dibuat"
              monthAriaLabel="Bulan order dibuat"
              onChange={onOrderFilterMonthChange}
              value={orderFilterMonth}
              yearAriaLabel="Tahun order dibuat"
            />
            <label className="grid min-w-[150px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
              Dari tanggal
              <input
                aria-label="Tanggal awal order dibuat"
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => onOrderDateFromChange(event.target.value)}
                type="date"
                value={orderDateFrom}
              />
            </label>
            <label className="grid min-w-[150px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
              Sampai tanggal
              <input
                aria-label="Tanggal akhir order dibuat"
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => onOrderDateToChange(event.target.value)}
                type="date"
                value={orderDateTo}
              />
            </label>
            <button
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!orderFilterMonth && !orderDateFrom && !orderDateTo}
              onClick={onResetOrderDateFilter}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-sm" role="tablist" aria-label="Filter verifikasi nomor SO">
          {orderTabs.map((tab) => {
            const count = tabCounts[tab.id] ?? searchedRows.filter((row) => tab.match(row)).length;
            const active = tab.id === activeOrderTab;
            const Icon = tab.icon;
            const tone = {
              'need-so': {
                active: 'border-red-200 bg-red-50 text-red-800 ring-red-100',
                icon: 'bg-white text-red-600 ring-1 ring-red-100',
                count: 'bg-red-100 text-red-700',
              },
              running: {
                active: 'border-sky-200 bg-sky-50 text-sky-800 ring-sky-100',
                icon: 'bg-white text-sky-600 ring-1 ring-sky-100',
                count: 'bg-sky-100 text-sky-700',
              },
              cancelled: {
                active: 'border-rose-200 bg-rose-50 text-rose-800 ring-rose-100',
                icon: 'bg-white text-rose-600 ring-1 ring-rose-100',
                count: 'bg-rose-100 text-rose-700',
              },
            }[tab.id];
            const inactiveTone = 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800';
            const iconTone = active ? tone.icon : 'bg-white text-slate-400';
            const countTone = active ? tone.count : 'bg-white text-slate-500';

            return (
              <button
                aria-selected={active}
                className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-bold transition ${active ? `${tone.active} shadow-sm ring-1` : inactiveTone}`}
                key={tab.id}
                onClick={() => onActiveOrderTabChange(tab.id)}
                role="tab"
                type="button"
              >
                <span className={`grid h-5 w-5 place-items-center rounded-full ${iconTone}`}>
                  <Icon size={12} />
                </span>
                <span className="whitespace-nowrap">{tab.label}</span>
                <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${countTone}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table master-table finance-master-table finance-order-table min-w-[1240px]">
          <thead>
            <tr>
              {['Order Dibuat', 'Tujuan', 'Jenis Order', 'Payment Terms', 'Tanggal Jalan', 'Customer', 'Alasan Batal', 'Nomor Order', 'Nomor SO Finance', 'Aksi'].map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedRows).map(([salesName, salesRows]) => (
              <Fragment key={salesName}>
                <tr className="finance-group-row">
                  <td colSpan={10}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sales</span>
                        <strong className="ml-2 text-[11px] font-black text-slate-900">{salesName}</strong>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{salesRows.length} order</span>
                    </div>
                  </td>
                </tr>
                <tr aria-hidden="true">
                  <td className="h-px bg-slate-200 p-0" colSpan={10} />
                </tr>
                {salesRows.map((row) => (
                  <Fragment key={row.id}>
                    {(() => {
                      const isCancelled = isCancelledFinanceOrder(row);
                      return (
                    <tr className={`align-middle ${isCancelled ? 'bg-rose-100/80 hover:bg-rose-200/70' : 'hover:bg-slate-50'}`}>
                      <td className="px-2 py-1 font-semibold text-slate-700" data-label="Order Dibuat">{row.orderDate}</td>
                      <td className="px-2 py-1 font-black text-slate-900" data-label="Tujuan">{row.destination}</td>
                      <td className="px-2 py-1 text-slate-700" data-label="Jenis Order">{row.orderType}</td>
                      <td className="px-2 py-1" data-label="Payment Terms">
                        <StatusPill value={row.paymentTerms} />
                      </td>
                      <td className="px-2 py-1 font-semibold text-slate-800" data-label="Tanggal Jalan">{row.runningDate}</td>
                      <td className="max-w-[220px] px-2 py-1 font-semibold text-slate-800" data-label="Customer">
                        <span className="block break-words leading-snug">{row.customer || '-'}</span>
                      </td>
                      <td className="max-w-[220px] px-2 py-1 text-[10px] font-semibold text-slate-600" data-label="Alasan Batal">
                        {isCancelled ? (
                          <span className="block max-h-8 overflow-hidden leading-4">{row.cancelReason || '-'}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1" data-label="Nomor Order">
                        <span className="block text-[11px] font-black text-slate-900">{row.internalSoNumber || '-'}</span>
                        <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">Referensi sistem</span>
                      </td>
                      <td className="px-2 py-1" data-label="Nomor SO Finance">
                        {activeOrderTab === 'need-so' && !isCancelled && canUpdateSoNumber ? (
                          <button
                            className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-[10px] font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                            disabled={savingSoId === row.id}
                            onClick={() => onOpenSoModal(row.id)}
                            type="button"
                          >
                            {savingSoId === row.id ? 'Menyimpan...' : 'Input Nomor SO'}
                          </button>
                        ) : activeOrderTab === 'need-so' && !isCancelled ? (
                          <div>
                            <span className="block text-[11px] font-black text-slate-400">-</span>
                            <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">Menunggu input Finance</span>
                          </div>
                        ) : isCancelled ? (
                          <div>
                            <span className="block text-[11px] font-black text-slate-900">{row.soNumber || '-'}</span>
                            <span className="mt-0.5 block text-[9px] font-semibold text-rose-600">SO sudah dibatalkan</span>
                          </div>
                        ) : (
                          <div>
                            <span className="block text-[11px] font-black text-slate-900">{row.soNumber}</span>
                            <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">Nomor SO Finance sudah terisi</span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1" data-label="Aksi">
                        <button className="rounded-md bg-slate-900 px-1.5 py-1 text-[10px] font-semibold text-white hover:bg-slate-800" onClick={() => onSelectOrder(row.id)} type="button">Detail</button>
                      </td>
                    </tr>
                      );
                    })()}
                    <tr aria-hidden="true">
                      <td className="h-px bg-slate-200 p-0" colSpan={10} />
                    </tr>
                  </Fragment>
                ))}
              </Fragment>
            ))}
            {!filteredRows.length ? (
              <tr>
                <td className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400" colSpan={10}>Tidak ada order pada klasifikasi ini.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="master-pagination border-t border-slate-200 bg-slate-50">
        <span>Menampilkan {showingFrom}-{showingTo} dari {safeTotal} data</span>
        <div className="master-pagination-controls">
          <button type="button" disabled={safeCurrentPage === 1} onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))} aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <strong>Halaman {safeCurrentPage} dari {safeTotalPages}</strong>
          <button type="button" disabled={safeCurrentPage === safeTotalPages} onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))} aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default OrderVerificationTable;
