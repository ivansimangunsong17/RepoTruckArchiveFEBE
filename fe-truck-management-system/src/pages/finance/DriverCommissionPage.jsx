import { BadgeCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, CreditCard, FileText, RefreshCw, Upload, UserRound, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DocumentLink from '../../components/common/DocumentLink';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../contexts/FeedbackContext';
import { USER_ROLES } from '../../constants/roles';
import {
  approveDriverCommissionBatch,
  fetchDriverCommissionBatchDetail,
  fetchDriverCommissionBatches,
  fetchDriverCommissionPeriodReport,
  rejectDriverCommissionBatch,
  uploadDriverCommissionTransferProof,
} from '../../services/finance/driverCommissionService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';

const emptyReport = {
  periodStart: '',
  periodEnd: '',
  status: 'empty',
  activeBatch: null,
  summary: {
    totalDrivers: 0,
    totalItems: 0,
    totalAmount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
  },
  drivers: [],
};

const statusLabels = {
  empty: 'Kosong',
  draft: 'Draft',
  unsubmitted: 'Belum Diajukan',
  submitted: 'Menunggu Finance',
  approved: 'Siap Dibayar',
  rejected: 'Ditolak',
  paid: 'Sudah Dibayar',
  pending: 'Belum Dibayar',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function defaultCompletedCommissionPeriod() {
  const today = new Date();
  const day = today.getDay();
  const daysSinceThursday = (day - 4 + 7) % 7;
  const currentThursday = addDays(today, -daysSinceThursday);
  const previousThursday = addDays(currentThursday, -7);
  return {
    periodStart: dateKey(previousThursday),
    periodEnd: dateKey(addDays(previousThursday, 6)),
  };
}

function currentCommissionPeriod() {
  const today = new Date();
  const day = today.getDay();
  const daysSinceThursday = (day - 4 + 7) % 7;
  const currentThursday = addDays(today, -daysSinceThursday);
  return {
    periodStart: dateKey(currentThursday),
    periodEnd: dateKey(addDays(currentThursday, 6)),
  };
}

function commissionPeriodKey(period = {}) {
  return `${period.periodStart || ''}|${period.periodEnd || ''}`;
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

function BatchCommissionDropdown({ batches, selectedPeriodStart, selectedPeriodEnd, selectedStatus, loading, onSelect }) {
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

  const disabled = loading || !batches.length;
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
        {selectedPeriodStart && selectedPeriodEnd ? (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate text-sm font-bold text-slate-900">{formatDate(selectedPeriodStart)} - {formatDate(selectedPeriodEnd)}</span>
            <StatusPill status={selectedStatus} />
          </span>
        ) : (
          <span className="text-sm font-semibold text-slate-500">{loading ? 'Memuat batch...' : 'Belum ada batch'}</span>
        )}
        <ChevronDown className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} size={16} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {batches.map((batch) => (
            <button
              aria-label={`Pilih batch ${formatDate(batch.periodStart)} - ${formatDate(batch.periodEnd)}`}
              className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50 ${commissionPeriodKey(batch) === selectedKey ? 'bg-red-50/60' : ''}`}
              key={batch.id || commissionPeriodKey(batch)}
              onClick={() => {
                onSelect(batch);
                setOpen(false);
              }}
              type="button"
            >
              <div className="min-w-0">
                <strong className="block truncate text-xs font-black text-slate-900">{formatDate(batch.periodStart)} - {formatDate(batch.periodEnd)}</strong>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{batch.totalItems || 0} job | {formatCurrency(batch.totalAmount || 0)}</span>
              </div>
              <StatusPill status={batch.status} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const metricCardTones = {
  slate: 'bg-slate-100 text-slate-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
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

function driverFinanceStatus(driver) {
  if (driver.paymentStatus === 'paid' || driver.batchStatus === 'paid') return 'paid';
  if (driver.batchStatus === 'approved') return 'approved';
  if (driver.batchStatus === 'submitted') return 'submitted';
  return driver.paymentStatus || driver.batchStatus || 'unsubmitted';
}

function paymentAccountLabel(driver = {}) {
  if (driver.paymentMethod === 'emoney') {
    return `${driver.emoneyProvider || '-'} ${driver.emoneyNumber || ''}`.trim();
  }
  return `${driver.bankName || '-'} ${driver.bankAccountNumber || ''}`.trim();
}

function accountHolderLabel(driver = {}) {
  if (driver.paymentMethod === 'emoney') return driver.emoneyAccountHolder || '-';
  return driver.bankAccountHolder || '-';
}

function resolveSelectedPayment(batch, driver) {
  if (!batch || !driver) return null;
  return (batch.payments || []).find((payment) => (
    payment.id === driver.paymentId
      || (driver.driverKey && payment.driverKey === driver.driverKey)
      || (driver.driverId && payment.driverId === driver.driverId)
      || payment.driverName === driver.driverName
  )) || null;
}

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function DriverFinanceDetailModal({ driver, payment, selectedBatch, canFinance, saving, onUploadProof, open, onClose }) {
  const [noteDraft, setNoteDraft] = useState('');
  const [pendingFile, setPendingFile] = useState(null);

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
      setNoteDraft('');
      setPendingFile(null);
    }
  }, [open, driver?.driverKey, driver?.driverId, driver?.driverName]);

  if (!open || !driver) return null;

  const accountSource = payment || driver;
  const alreadyPaid = payment?.status === 'paid';
  const canUploadProof = canFinance && ['approved', 'paid'].includes(selectedBatch?.status || '');

  function submitProof(event) {
    event.preventDefault();
    if (!pendingFile) return;
    onUploadProof(payment, pendingFile, noteDraft);
    setPendingFile(null);
  }

  return (
    <ModalPortal>
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="master-modal flex max-h-[92vh] w-full max-w-5xl flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-driver-commission-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="master-form-heading">
          <div className="min-w-0">
            <span>Detail Pembayaran</span>
            <h2 id="finance-driver-commission-detail-title" className="break-words">{driver.driverName}</h2>
            <p>{driver.totalItems} job | {formatCurrency(driver.totalAmount)}</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup detail pembayaran">
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="block text-[11px] font-black uppercase text-slate-400">Status</span>
              <span className="mt-2 block"><StatusPill status={driverFinanceStatus(driver)} /></span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="block text-[11px] font-black uppercase text-slate-400">Rekening</span>
              <strong className="mt-1 block break-words text-sm text-slate-800">{paymentAccountLabel(accountSource)}</strong>
              <span className="mt-1 block text-xs text-slate-500">{accountHolderLabel(accountSource)}</span>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <span className="block text-[11px] font-black uppercase text-amber-600">Total Komisi</span>
              <strong className="mt-1 block text-lg text-amber-700">{formatCurrency(driver.totalAmount)}</strong>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            {payment?.paidAt ? (
              <p className="text-xs font-semibold text-emerald-700">Paid {formatDateTime(payment.paidAt)} oleh {payment.paidByName || '-'}</p>
            ) : <p className="text-xs font-semibold text-slate-500">Pembayaran belum dicatat paid.</p>}
            {payment?.paymentProofAttachmentId || driver.paymentProofAttachmentId ? (
              <p className="mt-1 text-xs font-semibold text-sky-700">Bukti transfer tersimpan.</p>
            ) : null}
            {payment?.paymentNote || driver.paymentNote ? (
              <p className="mt-1 text-xs text-slate-500">{payment?.paymentNote || driver.paymentNote}</p>
            ) : null}
            {canUploadProof ? (
              <div className="mt-4">
                {pendingFile ? (
                  <form className="grid gap-3" onSubmit={submitProof}>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="min-w-0 truncate text-xs font-bold text-slate-800">{pendingFile.name}</span>
                      <button
                        className="shrink-0 text-xs font-bold text-red-600 hover:underline disabled:opacity-60"
                        disabled={saving}
                        onClick={() => setPendingFile(null)}
                        type="button"
                      >
                        Ganti File
                      </button>
                    </div>
                    <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
                      Catatan Pembayaran (opsional)
                      <textarea
                        autoFocus
                        className="min-h-16 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium normal-case text-slate-900 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
                        disabled={saving}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        placeholder="Contoh: Transfer via BCA, referensi TRX123"
                        value={noteDraft}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className="primary-button inline-flex items-center gap-2" disabled={saving} type="submit">
                        <Upload size={16} /> {saving ? 'Mengirim...' : 'Kirim Bukti'}
                      </button>
                      <button className="secondary-button" disabled={saving} onClick={() => setPendingFile(null)} type="button">Batal</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <label className={`primary-button inline-flex cursor-pointer items-center gap-2 ${saving ? 'pointer-events-none opacity-60' : ''}`}>
                      <Upload size={16} /> {alreadyPaid ? 'Ganti Bukti' : 'Upload Bukti'}
                      <input
                        className="sr-only"
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        disabled={saving}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) setPendingFile(file);
                        }}
                      />
                    </label>
                    {alreadyPaid ? (
                      <p className="mt-2 text-xs text-slate-500">Salah kirim bukti? Upload file yang benar untuk menggantikan bukti sebelumnya.</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {(driver.items || []).map((item, index) => (
              <article key={item.id || item.containerJobId || index} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <strong className="block break-words text-sm text-slate-950">{item.containerNumber || '-'}</strong>
                    <small className="mt-0.5 block break-words text-xs text-slate-500">{item.accurateSoNumber || item.soNumber || '-'} | {item.containerSize || '-'}</small>
                  </div>
                  <strong className="text-sm text-amber-700">{formatCurrency(item.amount)}</strong>
                </div>
                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div><dt className="font-black uppercase text-slate-400">Tanggal Selesai</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{formatDate(item.completedDate)}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Truck</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.truckPlateNumber || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Customer</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.customerName || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Tujuan</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.destination || '-'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
    </ModalPortal>
  );
}

const BATCH_PICKER_PAGE_SIZE = 20;

function BatchPickerModal({ open, onClose, onSelectBatch, selectedBatchId }) {
  const [page, setPage] = useState(1);
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
    if (open) setPage(1);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;

    async function loadBatches() {
      setLoading(true);
      setError('');
      try {
        const result = await fetchDriverCommissionBatches({ page, pageSize: BATCH_PICKER_PAGE_SIZE });
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
  }, [open, page]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / BATCH_PICKER_PAGE_SIZE));

  return (
    <ModalPortal>
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="master-modal flex max-h-[90vh] w-full max-w-5xl flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-picker-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="master-form-heading">
          <div className="min-w-0">
            <span>Riwayat Pengajuan</span>
            <h2 id="batch-picker-modal-title">Pilih Batch Komisi</h2>
            <p>{total} batch dari Operational, terbaru di atas.</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup pilih batch komisi">
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {loading ? <p className="text-sm font-semibold text-slate-500">Memuat batch...</p> : null}
          {!loading && error ? <div className="alert error">{error}</div> : null}
          {!loading && !error && !rows.length ? (
            <p className="text-sm font-semibold text-slate-500">Belum ada batch komisi.</p>
          ) : null}
          {!loading && !error && rows.length ? (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rows.map((batch) => (
                <button
                  className={`flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-3 ${selectedBatchId === batch.id ? 'bg-red-50/60' : ''}`}
                  key={batch.id}
                  onClick={() => {
                    onSelectBatch(batch.id);
                    onClose();
                  }}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="block break-words text-xs text-slate-950">{formatDate(batch.periodStart)} - {formatDate(batch.periodEnd)}</strong>
                    <small className="mt-0.5 block break-words text-[11px] text-slate-500">
                      {batch.totalItems || 0} job | {formatCurrency(batch.totalAmount || 0)} | Diajukan {batch.submittedByName || '-'} | {formatDateTime(batch.submittedAt)}
                    </small>
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

function DriverCommissionPage() {
  const { user } = useAuth();
  const { notify, confirmAction } = useFeedback();
  const defaultPeriod = useMemo(() => defaultCompletedCommissionPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);
  const [report, setReport] = useState(emptyReport);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedDriverKey, setSelectedDriverKey] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canFinance = [USER_ROLES.ADMIN, USER_ROLES.FINANCE].includes(user?.role);
  const summary = report.summary || emptyReport.summary;
  const drivers = report.drivers || [];
  const dropdownBatches = useMemo(() => {
    const current = currentCommissionPeriod();
    if (batches.some((batch) => batch.periodStart === current.periodStart)) return batches;
    return [{ periodStart: current.periodStart, periodEnd: current.periodEnd, status: 'draft', totalItems: 0, totalAmount: 0 }, ...batches];
  }, [batches]);
  const selectedDriver = drivers.find((driver) => (driver.driverKey || driver.driverId || driver.driverName) === selectedDriverKey) || drivers[0] || null;
  const selectedPayment = resolveSelectedPayment(selectedBatch, selectedDriver);

  const applySelectedReport = useCallback((nextReport) => {
    setReport(nextReport || emptyReport);
    setSelectedDriverKey((current) => {
      const nextDrivers = nextReport?.drivers || [];
      if (nextDrivers.some((driver) => (driver.driverKey || driver.driverId || driver.driverName) === current)) return current;
      const firstDriver = nextDrivers[0];
      return firstDriver ? firstDriver.driverKey || firstDriver.driverId || firstDriver.driverName : '';
    });
  }, []);

  const loadData = useCallback(async (preferredBatchId = '') => {
    setLoading(true);
    try {
      const batchResult = await fetchDriverCommissionBatches({ pageSize: 50 });
      const nextBatches = batchResult?.rows || [];
      setBatches(nextBatches);

      const targetBatch = nextBatches.find((batch) => batch.id === preferredBatchId) || nextBatches[0] || null;
      const nextPeriodStart = targetBatch?.periodStart || defaultPeriod.periodStart;
      const nextPeriodEnd = targetBatch?.periodEnd || defaultPeriod.periodEnd;
      setPeriodStart(nextPeriodStart);
      setPeriodEnd(nextPeriodEnd);

      const [reportResult, detailResult] = await Promise.all([
        fetchDriverCommissionPeriodReport({ periodStart: nextPeriodStart, periodEnd: nextPeriodEnd }),
        targetBatch?.id ? fetchDriverCommissionBatchDetail(targetBatch.id).catch(() => null) : Promise.resolve(null),
      ]);

      applySelectedReport(reportResult || emptyReport);
      setSelectedBatch(detailResult || targetBatch || null);
    } catch (error) {
      notify({ type: 'error', title: 'Komisi gagal dimuat', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [applySelectedReport, defaultPeriod.periodEnd, defaultPeriod.periodStart, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function openBatch(batchId) {
    try {
      setLoading(true);
      const detail = await fetchDriverCommissionBatchDetail(batchId);
      const nextPeriodStart = detail?.periodStart || defaultPeriod.periodStart;
      const nextPeriodEnd = detail?.periodEnd || defaultPeriod.periodEnd;
      const reportResult = await fetchDriverCommissionPeriodReport({ periodStart: nextPeriodStart, periodEnd: nextPeriodEnd });
      setPeriodStart(nextPeriodStart);
      setPeriodEnd(nextPeriodEnd);
      setSelectedBatch(detail);
      applySelectedReport(reportResult || emptyReport);
    } catch (error) {
      notify({ type: 'error', title: 'Detail gagal dimuat', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function previewPeriod(period) {
    try {
      setLoading(true);
      const reportResult = await fetchDriverCommissionPeriodReport({ periodStart: period.periodStart, periodEnd: period.periodEnd });
      setPeriodStart(period.periodStart);
      setPeriodEnd(period.periodEnd);
      setSelectedBatch(null);
      applySelectedReport(reportResult || emptyReport);
    } catch (error) {
      notify({ type: 'error', title: 'Report gagal dimuat', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  function selectDropdownPeriod(period) {
    if (period.id) {
      openBatch(period.id);
      return;
    }
    previewPeriod(period);
  }

  async function handleApprove(batch) {
    const confirmed = await confirmAction({
      title: 'Setujui komisi?',
      message: `Batch ${formatDate(batch.periodStart)} - ${formatDate(batch.periodEnd)} akan masuk daftar pembayaran Finance.`,
      confirmLabel: 'Setujui',
      cancelLabel: 'Batal',
      tone: 'info',
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      const updated = await approveDriverCommissionBatch(batch.id);
      notify({ title: 'Komisi disetujui', message: 'Finance bisa mulai mencatat pembayaran per sopir.' });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      notify({ type: 'error', title: 'Approve gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleReject(batch) {
    const rejectionNote = window.prompt('Catatan penolakan komisi:', batch.rejectionNote || '');
    if (rejectionNote === null) return;

    setSaving(true);
    try {
      const updated = await rejectDriverCommissionBatch(batch.id, rejectionNote);
      notify({ title: 'Komisi ditolak', message: 'Item batch dibuka agar Operational bisa mengajukan ulang.' });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      notify({ type: 'error', title: 'Reject gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadProof(payment, file, paymentNote = '') {
    if (!payment?.id || !file) return;

    setSaving(true);
    try {
      const updated = await uploadDriverCommissionTransferProof(payment.id, file, { paymentNote });
      notify({ title: 'Bukti transfer disimpan', message: `${payment.driverName} ditandai paid.` });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      notify({ type: 'error', title: 'Upload bukti gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Finance</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Pembayaran Komisi Sopir</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              Cek pengajuan Operational per sopir, approve batch, lalu catat pembayaran mingguan.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-[420px] sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Batch Komisi</span>
              <BatchCommissionDropdown
                batches={dropdownBatches}
                loading={loading}
                onSelect={selectDropdownPeriod}
                selectedPeriodEnd={periodEnd}
                selectedPeriodStart={periodStart}
                selectedStatus={report.status}
              />
            </div>
            <button className="secondary-button inline-flex items-center justify-center gap-2" type="button" onClick={() => loadData(selectedBatch?.id)} disabled={loading}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard
          icon={CalendarDays}
          label="Periode"
          tone="slate"
          value={`${formatDate(periodStart)} - ${formatDate(periodEnd)}`}
          helper={<>Berdasarkan tanggal selesai job. <span className="font-bold text-red-600">Klik untuk pilih batch lain.</span></>}
          onClick={() => setBatchPickerOpen(true)}
        />
        <MetricCard icon={UserRound} label="Sopir" tone="sky" value={`${summary.totalDrivers || 0} sopir`} helper={`${summary.totalItems || 0} job komisi`} />
        <MetricCard icon={CircleDollarSign} label="Total Komisi" tone="amber" value={formatCurrency(summary.totalAmount || 0)} helper={`${formatCurrency(summary.paidAmount || 0)} sudah dibayar`} />
        <MetricCard icon={BadgeCheck} label="Status Batch" tone="emerald" pill value={<StatusPill status={selectedBatch?.status || report.status || ''} />} helper={selectedBatch ? `Diajukan ${formatDateTime(selectedBatch.submittedAt)}` : 'Belum ada pengajuan aktif.'} />
      </section>

      <section>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">Report Per Sopir</h2>
              <p className="text-xs leading-relaxed text-slate-500">Daftar komisi dari batch yang dipilih.</p>
            </div>
            {canFinance && selectedBatch?.status === 'submitted' ? (
              <div className="flex flex-wrap gap-2">
                <button className="primary-button inline-flex items-center gap-2" type="button" disabled={saving} onClick={() => handleApprove(selectedBatch)}>
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button className="secondary-button inline-flex items-center gap-2" type="button" disabled={saving} onClick={() => handleReject(selectedBatch)}>
                  <XCircle size={16} /> Reject
                </button>
              </div>
            ) : null}
          </div>
          {!selectedBatch ? (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Belum ada batch aktif dari Operational untuk periode ini.
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Sopir</th>
                  <th className="px-4 py-3">Rekening</th>
                  <th className="px-4 py-3 text-right">Job</th>
                  <th className="px-4 py-3 text-right">Total Komisi</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drivers.map((driver) => {
                  const driverKey = driver.driverKey || driver.driverId || driver.driverName;
                  return (
                  <tr key={driverKey} className="align-middle hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-xs font-bold text-slate-950">{driver.driverName}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-700"><CreditCard size={15} /> {paymentAccountLabel(driver)}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{driver.totalItems}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-amber-700">{formatCurrency(driver.totalAmount)}</td>
                    <td className="px-4 py-3"><StatusPill status={driverFinanceStatus(driver)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {driver.paymentProofAttachment ? (
                          <>
                            <DocumentLink
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                              file={driver.paymentProofAttachment}
                              label="View"
                            />
                            <DocumentLink
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-bold text-sky-700 hover:bg-sky-100"
                              download
                              file={driver.paymentProofAttachment}
                              label="Download"
                            />
                          </>
                        ) : null}
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
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {!drivers.length ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-xs font-semibold text-slate-500" colSpan={6}>{loading ? 'Memuat report komisi...' : 'Belum ada komisi pada periode ini.'}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <BatchPickerModal
        onClose={() => setBatchPickerOpen(false)}
        onSelectBatch={(batchId) => openBatch(batchId)}
        open={batchPickerOpen}
        selectedBatchId={selectedBatch?.id}
      />

      <DriverFinanceDetailModal
        driver={selectedDriver}
        payment={selectedPayment}
        selectedBatch={selectedBatch}
        canFinance={canFinance}
        saving={saving}
        onUploadProof={handleUploadProof}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </main>
  );
}

export default DriverCommissionPage;
