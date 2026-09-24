import { AlertTriangle, BadgeCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Download, FileText, RefreshCw, Send, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../contexts/FeedbackContext';
import { hasPermission } from '../../constants/roles';
import {
  fetchDriverCommissionBatches,
  fetchDriverCommissionPeriodReport,
  submitDriverCommissionBatch,
} from '../../services/finance/driverCommissionService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import { downloadPdfReport } from '../../utils/simplePdfReport';
import { downloadCsv } from '../../utils/csvExport';
import { buildDriverCommissionCsvRows, DRIVER_COMMISSION_CSV_HEADERS, summarizeDriverCommissions } from '../../utils/driverCommissionCsv';
import MonthFilterControl from '../finance/shared/MonthFilterControl';
import { getMonthDateRange } from '../finance/shared/monthFilterUtils';

const emptyReport = {
  periodStart: '',
  periodEnd: '',
  status: 'empty',
  activeBatch: null,
  summary: {
    totalDrivers: 0,
    totalItems: 0,
    totalAmount: 0,
    unsubmittedItems: 0,
    submittedItems: 0,
    paidItems: 0,
    reviewItems: 0,
    noCommissionItems: 0,
    paidAmount: 0,
    unpaidAmount: 0,
  },
  drivers: [],
  reviewRows: [],
  noCommissionCount: 0,
};

const statusLabels = {
  empty: 'Kosong',
  draft: 'Draft',
  unsubmitted: 'Belum Diajukan',
  submitted: 'Diajukan',
  approved: 'Disetujui',
  paid: 'Dibayar',
  pending: 'Belum Dibayar',
  rejected: 'Ditolak',
};

const COMMISSION_PERIOD_LOOKBACK = 9;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKeyUtc(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDateKeyDays(value, days) {
  const date = parseDateKeyUtc(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function isWeeklyCommissionPeriod(periodStart, periodEnd) {
  const start = parseDateKeyUtc(periodStart);
  return Boolean(start && start.getUTCDay() === 0 && addDateKeyDays(periodStart, 6) === periodEnd);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function defaultCompletedCommissionPeriod() {
  const today = new Date();
  const day = today.getDay();
  const daysSinceSunday = day;
  const currentSunday = addDays(today, -daysSinceSunday);
  const previousSunday = addDays(currentSunday, -7);
  return {
    periodStart: dateKey(previousSunday),
    periodEnd: dateKey(addDays(previousSunday, 6)),
  };
}

function currentCommissionPeriod() {
  const today = new Date();
  const day = today.getDay();
  const daysSinceSunday = day;
  const currentSunday = addDays(today, -daysSinceSunday);
  return {
    periodStart: dateKey(currentSunday),
    periodEnd: dateKey(addDays(currentSunday, 6)),
  };
}

function commissionPeriodKey(period = {}) {
  return `${period.periodStart || ''}|${period.periodEnd || ''}`;
}

function commissionReportFilename(prefix, periodStart, periodEnd) {
  return `${prefix}-${String(periodStart || 'periode').replaceAll('-', '')}-${String(periodEnd || 'akhir').replaceAll('-', '')}.pdf`;
}

function commissionAmount(driver, field, fallback = 0) {
  const value = Number(driver?.[field]);
  return Number.isFinite(value) ? value : fallback;
}

function buildCommissionPdfRows(drivers = [], statusResolver = driverPaymentStatus) {
  return drivers.map((driver, index) => {
    const grossAmount = commissionAmount(driver, 'grossAmount', commissionAmount(driver, 'totalAmount'));
    const deductionAmount = commissionAmount(driver, 'deductionAmount');
    const netAmount = commissionAmount(driver, 'netAmount', grossAmount - deductionAmount);
    const unpaidAmount = commissionAmount(driver, 'unpaidAmount');
    const status = statusResolver(driver);

    return {
      reportNumber: index + 1,
      driverName: driver.driverName || '-',
      totalItems: driver.totalItems || 0,
      grossAmount,
      deductionAmount,
      netAmount,
      unpaidAmount,
      statusLabel: statusLabels[status] || status || '-',
    };
  });
}

function buildCommissionPeriodOptions(batches = [], selectedReport = null) {
  const current = currentCommissionPeriod();
  const windowStart = addDateKeyDays(current.periodStart, -(COMMISSION_PERIOD_LOOKBACK - 1) * 7);
  const byPeriod = new Map();
  byPeriod.set(commissionPeriodKey(current), { ...current, status: 'draft', totalItems: 0, totalAmount: 0 });

  for (const batch of batches) {
    if (!batch.periodStart || batch.periodStart < windowStart || batch.periodStart > current.periodStart) continue;
    const key = commissionPeriodKey(batch);
    byPeriod.set(key, {
      ...(byPeriod.get(key) || {}),
      ...batch,
      status: batch.status || byPeriod.get(key)?.status || 'draft',
    });
  }

  if (selectedReport?.periodStart && selectedReport?.periodEnd && byPeriod.has(commissionPeriodKey(selectedReport))) {
    const key = commissionPeriodKey(selectedReport);
    const activeBatch = selectedReport.activeBatch || {};
    byPeriod.set(key, {
      ...(byPeriod.get(key) || {}),
      periodStart: selectedReport.periodStart,
      periodEnd: selectedReport.periodEnd,
      status: activeBatch.status || selectedReport.status || byPeriod.get(key)?.status || 'draft',
      rejectionNote: activeBatch.rejectionNote || byPeriod.get(key)?.rejectionNote || '',
      totalItems: selectedReport.summary?.totalItems ?? activeBatch.totalItems ?? byPeriod.get(key)?.totalItems ?? 0,
      totalAmount: selectedReport.summary?.totalAmount ?? activeBatch.totalAmount ?? byPeriod.get(key)?.totalAmount ?? 0,
    });
  }

  return Array.from(byPeriod.values()).sort((left, right) => (
    String(right.periodStart || '').localeCompare(String(left.periodStart || ''))
      || String(right.periodEnd || '').localeCompare(String(left.periodEnd || ''))
  ));
}

function StatusPill({ status }) {
  const tone = {
    empty: 'border-slate-200 bg-slate-50 text-slate-500',
    draft: 'border-amber-200 bg-amber-50 text-amber-700',
    unsubmitted: 'border-amber-200 bg-amber-50 text-amber-700',
    submitted: 'border-sky-200 bg-sky-50 text-sky-700',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    paid: 'border-slate-300 bg-slate-100 text-slate-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    rejected: 'border-rose-200 bg-rose-50 text-rose-700',
  }[status] || 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase leading-none ${tone}`}>
      {statusLabels[status] || status || '-'}
    </span>
  );
}

const metricCardTones = {
  slate: 'bg-slate-100 text-slate-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

function MetricCard({ icon: Icon, label, value, helper, tone = 'slate', pill = false, onClick }) {
  const Wrapper = onClick ? 'button' : 'article';
  return (
    <Wrapper
      className={`w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md ${onClick ? 'cursor-pointer hover:border-red-200' : ''}`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${metricCardTones[tone] || metricCardTones.slate}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          {pill ? (
            <div className="mt-1.5">{value}</div>
          ) : (
            <strong className="mt-1 block break-words text-xl font-black text-slate-950">{value}</strong>
          )}
          {helper ? <small className="mt-1 block text-xs leading-relaxed text-slate-500">{helper}</small> : null}
        </div>
      </div>
    </Wrapper>
  );
}

function driverPaymentStatus(driver) {
  if (driver.paidItems > 0 && driver.unpaidItems === 0) return 'paid';
  if (driver.submittedItems > 0 || driver.approvedItems > 0) return 'submitted';
  return 'unsubmitted';
}

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function BatchCommissionDropdown({ periods, selectedPeriodStart, selectedPeriodEnd, selectedStatus, loading, onSelect }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const disabled = loading || !periods.length;
  const selectedKey = commissionPeriodKey({ periodStart: selectedPeriodStart, periodEnd: selectedPeriodEnd });

  return (
    <div className="relative min-w-0 flex-1" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label="Pilih batch komisi"
        className="master-filter-select flex h-10 w-full max-w-none items-center justify-between gap-2 normal-case disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate text-sm font-bold text-slate-900">{formatDate(selectedPeriodStart)} - {formatDate(selectedPeriodEnd)}</span>
          <StatusPill status={selectedStatus} />
        </span>
        <ChevronDown className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} size={16} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {periods.map((period) => (
            <button
              className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50 ${commissionPeriodKey(period) === selectedKey ? 'bg-red-50/60' : ''}`}
              key={commissionPeriodKey(period)}
              onClick={() => {
                onSelect(period);
                setOpen(false);
              }}
              type="button"
            >
              <div className="min-w-0">
                <strong className="block truncate text-xs font-black text-slate-900">{formatDate(period.periodStart)} - {formatDate(period.periodEnd)}</strong>
                <small className="mt-0.5 block text-[11px] font-semibold text-slate-500">{period.totalItems || 0} job</small>
                {period.status === 'rejected' && period.rejectionNote ? (
                  <small className="mt-1 block truncate text-[11px] font-bold text-rose-600">Ditolak: {period.rejectionNote}</small>
                ) : null}
              </div>
              <StatusPill status={period.status} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const BATCH_PICKER_PAGE_SIZE = 20;

function BatchPickerModal({ open, onClose, onSelectBatch, selectedPeriodStart, selectedPeriodEnd }) {
  const [page, setPage] = useState(1);
  const [monthFilter, setMonthFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (open) {
      setPage(1);
      setMonthFilter('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;

    async function loadBatches() {
      setLoading(true);
      setError('');
      try {
        const { dateFrom, dateTo } = getMonthDateRange(monthFilter);
        const result = await fetchDriverCommissionBatches({
          page,
          pageSize: BATCH_PICKER_PAGE_SIZE,
          ...(dateFrom && dateTo ? { periodStart: dateFrom, periodEnd: dateTo } : {}),
        });
        if (!active) return;
        setRows(result?.rows || []);
        setTotal(Number(result?.pagination?.total || 0));
      } catch (fetchError) {
        if (active) {
          setRows([]);
          setError(fetchError.message || 'Daftar batch gagal dimuat.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBatches();
    return () => {
      active = false;
    };
  }, [open, page, monthFilter]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / BATCH_PICKER_PAGE_SIZE));
  const selectedKey = commissionPeriodKey({ periodStart: selectedPeriodStart, periodEnd: selectedPeriodEnd });

  return (
    <ModalPortal>
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="master-modal flex max-h-[90vh] w-full max-w-5xl flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operational-batch-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="master-form-heading">
          <div className="min-w-0">
            <span>Riwayat Pengajuan</span>
            <h2 id="operational-batch-picker-title">Riwayat Batch yang Sudah Diajukan</h2>
            <p>{total} batch yang sudah pernah diajukan ke Finance, terbaru di atas.</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup pilih batch komisi">
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <MonthFilterControl
            className="mb-4 max-w-xs"
            label="Filter Bulan"
            monthAriaLabel="Filter batch komisi bulan"
            onChange={(value) => {
              setMonthFilter(value);
              setPage(1);
            }}
            value={monthFilter}
            yearAriaLabel="Filter batch komisi tahun"
          />
          {loading ? <p className="text-sm font-semibold text-slate-500">Memuat batch...</p> : null}
          {!loading && error ? <div className="alert error">{error}</div> : null}
          {!loading && !error && !rows.length ? (
            <p className="text-sm font-semibold text-slate-500">{monthFilter ? 'Tidak ada batch pada bulan ini.' : 'Belum ada batch komisi.'}</p>
          ) : null}
          {!loading && !error && rows.length ? (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rows.map((batch) => (
                <button
                  className={`flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-3 ${commissionPeriodKey(batch) === selectedKey ? 'bg-red-50/60' : ''}`}
                  key={batch.id}
                  onClick={() => {
                    onSelectBatch(batch);
                    onClose();
                  }}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="block break-words text-xs text-slate-950">{formatDate(batch.periodStart)} - {formatDate(batch.periodEnd)}</strong>
                    <small className="mt-0.5 block break-words text-[11px] text-slate-500">
                      {batch.totalItems || 0} job | {formatCurrency(batch.totalAmount || 0)} | Diajukan {batch.submittedByName || '-'} | {formatDateTime(batch.submittedAt)}
                    </small>
                    {batch.status === 'rejected' && batch.rejectionNote ? (
                      <small className="mt-1 block break-words text-[11px] font-bold text-rose-600">
                        Ditolak Finance: {batch.rejectionNote}
                      </small>
                    ) : null}
                  </div>
                  <StatusPill status={batch.status} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {totalPages > 1 ? (
          <div className="master-form-actions justify-between">
            <button className="secondary-button inline-flex items-center gap-1.5" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">
              <ChevronLeft size={15} /> Sebelumnya
            </button>
            <strong className="text-xs font-bold text-slate-700">Halaman {page} dari {totalPages}</strong>
            <button className="secondary-button inline-flex items-center gap-1.5" disabled={loading || page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">
              Berikutnya <ChevronRight size={15} />
            </button>
          </div>
        ) : null}
      </section>
    </div>
    </ModalPortal>
  );
}

const deductionTypeLabels = {
  hutang_sopir: 'Hutang Sopir',
  kasbon: 'Kasbon',
  penalti: 'Penalti',
  lainnya: 'Lainnya',
};

function DriverDetailModal({ driver, open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !driver) return null;

  const grossAmount = driver.grossAmount ?? driver.totalAmount ?? 0;
  const deductionAmount = driver.deductionAmount ?? 0;
  const netAmount = driver.netAmount ?? grossAmount;
  const activeDeductions = (driver.deductions || []).filter((item) => item.status === 'active');
  const hasDeduction = deductionAmount > 0;

  return (
    <ModalPortal>
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="master-modal flex max-h-[92vh] w-full max-w-4xl flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-commission-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="master-form-heading">
          <div className="min-w-0">
            <span>Detail Sopir</span>
            <h2 id="driver-commission-detail-title" className="break-words">{driver.driverName}</h2>
            <p>{driver.totalItems} job | {formatCurrency(grossAmount)}</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup detail komisi">
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {hasDeduction ? (
            <p className="mb-3 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black uppercase text-amber-700">
              Ada Potongan Finance
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-[11px] font-black uppercase text-slate-400">Sebelum Potongan</span>
              <strong className="mt-1 block text-lg text-slate-950">{formatCurrency(grossAmount)}</strong>
            </div>
            <div className="rounded-lg border border-rose-100 bg-rose-50 p-3">
              <span className="text-[11px] font-black uppercase text-rose-500">Potongan Finance</span>
              <strong className="mt-1 block text-lg text-rose-700">{formatCurrency(deductionAmount)}</strong>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <span className="text-[11px] font-black uppercase text-emerald-600">Harus Dibayar</span>
              <strong className="mt-1 block text-lg text-emerald-700">{formatCurrency(netAmount)}</strong>
            </div>
          </div>
          <div className="mt-3">
            <span className="mt-2 block"><StatusPill status={driverPaymentStatus(driver)} /></span>
          </div>

          {hasDeduction ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <h3 className="text-xs font-black uppercase text-amber-700">Catatan Potongan dari Finance</h3>
              <div className="mt-2 grid gap-2">
                {activeDeductions.map((item) => (
                  <div className="rounded-md border border-amber-100 bg-white px-3 py-2" key={item.id}>
                    <strong className="block text-xs text-slate-800">{deductionTypeLabels[item.deductionType] || item.deductionType} - {formatCurrency(item.amount)}</strong>
                    <p className="mt-1 text-[11px] text-slate-600">{item.operationalNote || item.reason}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] font-medium text-amber-700">Potongan ini dikelola oleh Finance. Hubungi Finance untuk pertanyaan lebih lanjut dari sopir.</p>
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {(driver.items || []).map((item, index) => (
              <article key={item.id || item.containerJobId || index} className="rounded-lg border border-slate-200 p-4">
                <div className="min-w-0">
                  <strong className="block break-words text-sm text-slate-950">{item.containerNumber || '-'}</strong>
                  <small className="mt-0.5 block break-words text-xs text-slate-500">{item.soNumber || '-'} | {item.containerSize || '-'}</small>
                </div>
                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div><dt className="font-black uppercase text-slate-400">Tanggal Selesai</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{formatDate(item.completedDate)}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Truck</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.truckPlateNumber || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Customer</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.customerName || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Tujuan</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.destination || '-'}</dd></div>
                </dl>
                <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-black text-amber-700">
                  {formatCurrency(item.amount)}
                  {item.commissionNote ? <small className="ml-2 font-semibold text-amber-600">{item.commissionNote}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
    </ModalPortal>
  );
}

function DriverCommissionOperationalPage() {
  const { user } = useAuth();
  const { notify, confirmAction } = useFeedback();
  const defaultPeriod = useMemo(() => defaultCompletedCommissionPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);
  const [periodOptions, setPeriodOptions] = useState(() => buildCommissionPeriodOptions());
  const [report, setReport] = useState(emptyReport);
  const [selectedDriverKey, setSelectedDriverKey] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canSubmit = hasPermission(user, 'driver_commission.submit') || hasPermission(user, 'operations.update');
  const summary = report.summary || emptyReport.summary;
  const drivers = report.drivers || [];
  const commissionTotals = useMemo(() => summarizeDriverCommissions(drivers), [drivers]);
  const reviewRows = report.reviewRows || [];
  const selectedDriver = drivers.find((driver) => (driver.driverKey || driver.driverId || driver.driverName) === selectedDriverKey) || drivers[0] || null;
  const activeBatch = report.activeBatch || null;
  const hasActiveBatch = Boolean(activeBatch?.id);
  const selectedPeriodOption = periodOptions.find((period) => commissionPeriodKey(period) === commissionPeriodKey({ periodStart, periodEnd })) || null;
  const financeRejectionNote = activeBatch?.rejectionNote || selectedPeriodOption?.rejectionNote || '';
  const showFinanceRejection = Boolean(financeRejectionNote && (activeBatch?.status === 'rejected' || selectedPeriodOption?.status === 'rejected' || report.status === 'rejected'));
  const validBatchPeriod = isWeeklyCommissionPeriod(periodStart, periodEnd);
  const submitDisabled = saving || loading || !summary.unsubmittedItems || hasActiveBatch || !validBatchPeriod || reviewRows.length > 0;

  const loadReport = useCallback(async (nextPeriodStart, nextPeriodEnd) => {
    setLoading(true);
    try {
      const [reportResult, batchResult] = await Promise.all([
        fetchDriverCommissionPeriodReport({ periodStart: nextPeriodStart, periodEnd: nextPeriodEnd }),
        fetchDriverCommissionBatches({ pageSize: 50 }),
      ]);
      const nextReport = reportResult || emptyReport;
      setReport(nextReport);
      setPeriodOptions(buildCommissionPeriodOptions(batchResult?.rows || [], nextReport));
      setSelectedDriverKey((current) => {
        const nextDrivers = nextReport.drivers || [];
        if (nextDrivers.some((driver) => (driver.driverKey || driver.driverId || driver.driverName) === current)) return current;
        const firstDriver = nextDrivers[0];
        return firstDriver ? firstDriver.driverKey || firstDriver.driverId || firstDriver.driverName : '';
      });
    } catch (error) {
      notify({ type: 'error', title: 'Report komisi gagal dimuat', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadReport(periodStart, periodEnd);
  }, [loadReport, periodEnd, periodStart]);

  async function handleSubmitBatch() {
    if (!summary.unsubmittedItems) {
      notify({ type: 'error', title: 'Belum ada komisi', message: 'Tidak ada komisi yang bisa diajukan pada periode ini.' });
      return;
    }
    if (hasActiveBatch) {
      notify({ type: 'error', title: 'Sudah diajukan', message: 'Periode ini sudah memiliki batch aktif di Finance.' });
      return;
    }
    if (reviewRows.length) {
      notify({ type: 'error', title: 'Masih ada yang perlu dicek', message: 'Beresi dulu ritasi di panel Perlu Cek sebelum submit batch komisi.' });
      return;
    }
    if (!validBatchPeriod) {
      notify({ type: 'error', title: 'Periode belum sesuai', message: 'Pengajuan komisi wajib Minggu sampai Sabtu.' });
      return;
    }

    const confirmed = await confirmAction({
      title: 'Ajukan komisi sopir?',
      message: `${summary.unsubmittedItems} job senilai ${formatCurrency(summary.unpaidAmount || summary.totalAmount)} akan diajukan ke Finance.`,
      confirmLabel: 'Ajukan',
      cancelLabel: 'Cek Lagi',
      tone: 'info',
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      await submitDriverCommissionBatch({ periodStart, periodEnd });
      notify({ title: 'Komisi diajukan', message: 'Finance sudah bisa melakukan pengecekan batch komisi.' });
      await loadReport(periodStart, periodEnd);
    } catch (error) {
      notify({ type: 'error', title: 'Pengajuan gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadPdf() {
    downloadPdfReport({
      reportLabel: 'Komisi Sopir',
      title: 'Report Komisi Sopir',
      subtitle: `Periode ${formatDate(periodStart)} - ${formatDate(periodEnd)}`,
      filename: commissionReportFilename('komisi-sopir-operational', periodStart, periodEnd),
      meta: [
        { label: 'Sopir', value: `${summary.totalDrivers || 0}` },
        { label: 'Sebelum Potongan', value: formatCurrency(commissionTotals.grossAmount) },
        { label: 'Potongan Finance', value: formatCurrency(commissionTotals.deductionAmount) },
        { label: 'Harus Dibayar', value: formatCurrency(commissionTotals.netAmount) },
      ],
      columns: [
        { label: 'No', width: 0.4, value: (row) => row.reportNumber, align: 'center' },
        { label: 'Sopir', width: 1.8, value: (row) => row.driverName, bold: true },
        { label: 'Job', width: 0.55, value: (row) => row.totalItems, align: 'center' },
        { label: 'Sebelum Potongan', width: 1, value: (row) => formatCurrency(row.grossAmount), align: 'right' },
        { label: 'Potongan', width: 1, value: (row) => (row.deductionAmount ? formatCurrency(row.deductionAmount) : '-'), align: 'right' },
        { label: 'Harus Dibayar', width: 1, value: (row) => formatCurrency(row.netAmount), align: 'right' },
        { label: 'Belum Dibayar', width: 1, value: (row) => formatCurrency(row.unpaidAmount), align: 'right' },
        { label: 'Status', width: 1.1, value: (row) => row.statusLabel },
      ],
      rows: buildCommissionPdfRows(drivers),
    });
  }

  function handleDownloadCsv() {
    downloadCsv(
      commissionReportFilename('komisi-sopir-operational-detail', periodStart, periodEnd).replace(/\.pdf$/, '.csv'),
      DRIVER_COMMISSION_CSV_HEADERS,
      buildDriverCommissionCsvRows(drivers, {
        periodStart,
        periodEnd,
        batchStatus: activeBatch?.status || report.status,
      }),
    );
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Komisi Sopir</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Report Komisi Sopir</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              Cek komisi per sopir sebelum diajukan ke Finance untuk periode Minggu sampai Sabtu.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-[420px] sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Batch Komisi</span>
              <BatchCommissionDropdown
                loading={loading}
                onSelect={(period) => {
                  setPeriodStart(period.periodStart);
                  setPeriodEnd(period.periodEnd);
                }}
                periods={periodOptions}
                selectedPeriodEnd={periodEnd}
                selectedPeriodStart={periodStart}
                selectedStatus={report.status}
              />
              <small className="mt-1 block text-xs font-semibold normal-case tracking-normal text-slate-500">Periode otomatis Minggu sampai Sabtu. Target pembayaran hari Rabu.</small>
            </div>
            <div className="flex gap-2 sm:flex-col">
              <button className="secondary-button inline-flex items-center justify-center gap-2" type="button" onClick={handleDownloadPdf} disabled={loading || !drivers.length}>
                <Download size={16} /> Download PDF
              </button>
              <button className="secondary-button inline-flex items-center justify-center gap-2" type="button" onClick={handleDownloadCsv} disabled={loading || !drivers.length}>
                <Download size={16} /> Download CSV
              </button>
              <button className="secondary-button inline-flex items-center justify-center gap-2" type="button" onClick={() => loadReport(periodStart, periodEnd)} disabled={loading}>
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <MetricCard
          icon={CalendarDays}
          label="Periode"
          tone="slate"
          value={`${formatDate(periodStart)} - ${formatDate(periodEnd)}`}
          helper={<>Tanggal selesai job. <span className="font-bold text-red-600">Klik untuk lihat riwayat lengkap.</span></>}
          onClick={() => setBatchPickerOpen(true)}
        />
        <MetricCard icon={UserRound} label="Sopir" tone="sky" value={`${summary.totalDrivers || 0} sopir`} helper={`${summary.totalItems || 0} job komisi`} />
        <MetricCard icon={CircleDollarSign} label="Sebelum Potongan" tone="amber" value={formatCurrency(commissionTotals.grossAmount)} helper="Total komisi bruto" />
        <MetricCard icon={CircleDollarSign} label="Potongan Finance" tone="rose" value={formatCurrency(commissionTotals.deductionAmount)} helper="Total potongan aktif" />
        <MetricCard icon={CircleDollarSign} label="Harus Dibayar" tone="emerald" value={formatCurrency(commissionTotals.netAmount)} helper="Bruto dikurangi potongan" />
        <MetricCard icon={AlertTriangle} label="Perlu Cek" tone="amber" value={`${summary.reviewItems || reviewRows.length || 0} ritasi`} helper={`${summary.noCommissionItems || report.noCommissionCount || 0} ritasi tanpa komisi`} />
        <MetricCard icon={BadgeCheck} label="Status" tone="emerald" pill value={<StatusPill status={report.status} />} helper={activeBatch ? `Diajukan ${formatDateTime(activeBatch.submittedAt)}` : 'Belum masuk batch Finance.'} />
      </section>

      {showFinanceRejection ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} />
            <div>
              <h2 className="text-sm font-black text-rose-900">Batch Ditolak Finance</h2>
              <p className="mt-1 font-semibold leading-relaxed">{financeRejectionNote}</p>
              <p className="mt-1 text-xs font-semibold text-rose-700">Perbaiki data yang disebutkan, lalu ajukan ulang batch komisi.</p>
            </div>
          </div>
        </section>
      ) : null}

      {reviewRows.length ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 shadow-sm">
          <div className="border-b border-amber-200 px-4 py-3">
            <h2 className="text-base font-black text-amber-900">Ritasi Perlu Cek</h2>
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Data di bawah ini belum bisa ikut batch komisi. Perbaiki dulu sopir penerima komisi, nominal, atau status komisinya.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] divide-y divide-amber-200 text-left text-sm">
              <thead className="bg-amber-100/70 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                <tr>
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">Tanggal Selesai</th>
                  <th className="px-4 py-3">SO / Container</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Sopir Komisi</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-4 py-3">Masalah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 bg-white">
                {reviewRows.map((row, index) => (
                  <tr key={row.containerJobId || `${row.soNumber}-${index}`} className="hover:bg-amber-50/70">
                    <td className="px-4 py-3 text-xs font-black text-slate-700">{index + 1}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{formatDate(row.completedDate)}</td>
                    <td className="px-4 py-3">
                      <strong className="block text-xs text-slate-950">{row.accurateSoNumber || row.soNumber || '-'}</strong>
                      <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{row.containerNumber || '-'} | {row.containerSize || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.customerName || '-'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.driverName || '-'}</td>
                    <td className="px-4 py-3 text-right text-xs font-black text-slate-900">{formatCurrency(row.amount || 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(row.reviewReasons || ['Perlu dicek']).map((reason) => (
                          <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">{reason}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">Ringkasan Per Sopir</h2>
              <p className="text-xs leading-relaxed text-slate-500">Klik sopir untuk mengecek container dan nominal komisinya.</p>
            </div>
            {canSubmit ? (
              <div className="flex flex-col items-stretch gap-1 sm:items-end">
                <button className="primary-button inline-flex items-center justify-center gap-2" type="button" disabled={submitDisabled} onClick={handleSubmitBatch}>
                  <Send size={16} /> Ajukan ke Finance
                </button>
                {!validBatchPeriod ? <small className="text-xs font-semibold text-amber-700">Periode submit wajib Minggu-Sabtu.</small> : null}
                {reviewRows.length ? <small className="text-xs font-semibold text-amber-700">Submit dikunci karena masih ada ritasi perlu cek.</small> : null}
              </div>
            ) : null}
          </div>
          {hasActiveBatch ? (
            <div className="border-b border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
              Periode ini sudah memiliki batch aktif. Perubahan pembayaran dilanjutkan di Finance.
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Sopir</th>
                  <th className="px-4 py-3 text-right">Job</th>
                  <th className="px-4 py-3 text-right">Sebelum Potongan</th>
                  <th className="px-4 py-3 text-right">Potongan Finance</th>
                  <th className="px-4 py-3 text-right">Harus Dibayar</th>
                  <th className="px-4 py-3 text-right">Belum Dibayar</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drivers.map((driver) => {
                  const driverKey = driver.driverKey || driver.driverId || driver.driverName;
                  return (
                  <tr key={driverKey} className="align-middle hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-xs font-bold text-slate-950">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {driver.driverName}
                        {driver.deductionAmount > 0 ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700">
                            Ada Potongan Finance
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{driver.totalItems}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-amber-700">{formatCurrency(driver.grossAmount ?? driver.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-rose-600">{driver.deductionAmount ? formatCurrency(driver.deductionAmount) : '-'}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">{formatCurrency(driver.netAmount ?? driver.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-rose-600">{formatCurrency(driver.unpaidAmount)}</td>
                    <td className="px-4 py-3"><StatusPill status={driverPaymentStatus(driver)} /></td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="secondary-button inline-flex items-center gap-2"
                        type="button"
                        onClick={() => {
                          setSelectedDriverKey(driverKey);
                          setDetailOpen(true);
                        }}
                      >
                        <FileText size={15} /> Detail <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
                {!drivers.length ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-xs font-semibold text-slate-500" colSpan={8}>{loading ? 'Memuat report komisi...' : 'Belum ada komisi pada periode ini.'}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <DriverDetailModal driver={selectedDriver} open={detailOpen} onClose={() => setDetailOpen(false)} />

      <BatchPickerModal
        onClose={() => setBatchPickerOpen(false)}
        onSelectBatch={(batch) => {
          setPeriodStart(batch.periodStart);
          setPeriodEnd(batch.periodEnd);
        }}
        open={batchPickerOpen}
        selectedPeriodEnd={periodEnd}
        selectedPeriodStart={periodStart}
      />
    </main>
  );
}

export default DriverCommissionOperationalPage;
