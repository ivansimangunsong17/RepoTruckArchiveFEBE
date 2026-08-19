import { BadgeCheck, CalendarDays, ChevronRight, CircleDollarSign, FileText, RefreshCw, Send, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../contexts/FeedbackContext';
import { hasPermission } from '../../constants/roles';
import {
  fetchDriverCommissionPeriodReport,
  submitDriverCommissionBatch,
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
    unsubmittedItems: 0,
    submittedItems: 0,
    paidItems: 0,
    paidAmount: 0,
    unpaidAmount: 0,
  },
  drivers: [],
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
  return Boolean(start && start.getUTCDay() === 4 && addDateKeyDays(periodStart, 6) === periodEnd);
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

function MetricCard({ icon: Icon, label, value, helper }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <strong className="mt-1 block break-words text-xl font-black text-slate-950">{value}</strong>
          {helper ? <small className="mt-1 block text-xs leading-relaxed text-slate-500">{helper}</small> : null}
        </div>
      </div>
    </article>
  );
}

function driverPaymentStatus(driver) {
  if (driver.paidItems > 0 && driver.unpaidItems === 0) return 'paid';
  if (driver.submittedItems > 0 || driver.approvedItems > 0) return 'submitted';
  return 'unsubmitted';
}

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="presentation" onMouseDown={onClose}>
      <section
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-commission-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Detail Sopir</p>
            <h2 id="driver-commission-detail-title" className="mt-1 break-words text-xl font-black text-slate-950">{driver.driverName}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{driver.totalItems} job | {formatCurrency(driver.totalAmount)}</p>
          </div>
          <button className="secondary-button inline-flex h-10 w-10 shrink-0 items-center justify-center p-0" type="button" onClick={onClose} aria-label="Tutup detail komisi">
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-[11px] font-black uppercase text-slate-400">Total Job</span>
              <strong className="mt-1 block text-lg text-slate-950">{driver.totalItems}</strong>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <span className="text-[11px] font-black uppercase text-amber-600">Total Komisi</span>
              <strong className="mt-1 block text-lg text-amber-700">{formatCurrency(driver.totalAmount)}</strong>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-[11px] font-black uppercase text-slate-400">Status</span>
              <span className="mt-2 block"><StatusPill status={driverPaymentStatus(driver)} /></span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {(driver.items || []).map((item, index) => (
              <article key={item.id || item.containerJobId || index} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <strong className="block break-words text-sm text-slate-950">{item.containerNumber || '-'}</strong>
                    <small className="mt-0.5 block break-words text-xs text-slate-500">{item.soNumber || '-'} | {item.containerSize || '-'}</small>
                  </div>
                  <StatusPill status={item.paymentStatus || item.batchStatus || 'unsubmitted'} />
                </div>
                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div><dt className="font-black uppercase text-slate-400">Tanggal Selesai</dt><dd className="mt-0.5 font-bold text-slate-700">{formatDate(item.completedDate)}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Truck</dt><dd className="mt-0.5 font-bold text-slate-700">{item.truckPlateNumber || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Customer</dt><dd className="mt-0.5 font-bold text-slate-700">{item.customerName || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Tujuan</dt><dd className="mt-0.5 font-bold text-slate-700">{item.destination || '-'}</dd></div>
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
  );
}

function DriverCommissionOperationalPage() {
  const { user } = useAuth();
  const { notify, confirmAction } = useFeedback();
  const defaultPeriod = useMemo(() => defaultCompletedCommissionPeriod(), []);
  const periodStart = defaultPeriod.periodStart;
  const periodEnd = defaultPeriod.periodEnd;
  const [report, setReport] = useState(emptyReport);
  const [selectedDriverKey, setSelectedDriverKey] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canSubmit = hasPermission(user, 'operations.update');
  const summary = report.summary || emptyReport.summary;
  const drivers = report.drivers || [];
  const selectedDriver = drivers.find((driver) => (driver.driverKey || driver.driverId || driver.driverName) === selectedDriverKey) || drivers[0] || null;
  const activeBatch = report.activeBatch || null;
  const hasActiveBatch = Boolean(activeBatch?.id);
  const validBatchPeriod = isWeeklyCommissionPeriod(periodStart, periodEnd);
  const submitDisabled = saving || loading || !summary.unsubmittedItems || hasActiveBatch || !validBatchPeriod;

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDriverCommissionPeriodReport({ periodStart, periodEnd });
      const nextReport = result || emptyReport;
      setReport(nextReport);
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
  }, [notify, periodEnd, periodStart]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  async function handleSubmitBatch() {
    if (!summary.unsubmittedItems) {
      notify({ type: 'error', title: 'Belum ada komisi', message: 'Tidak ada komisi yang bisa diajukan pada periode ini.' });
      return;
    }
    if (hasActiveBatch) {
      notify({ type: 'error', title: 'Sudah diajukan', message: 'Periode ini sudah memiliki batch aktif di Finance.' });
      return;
    }
    if (!validBatchPeriod) {
      notify({ type: 'error', title: 'Periode belum sesuai', message: 'Pengajuan komisi wajib Kamis sampai Rabu.' });
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
      await loadReport();
    } catch (error) {
      notify({ type: 'error', title: 'Pengajuan gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Operational</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Report Komisi Sopir</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              Cek komisi per sopir sebelum diajukan ke Finance untuk periode Kamis sampai Rabu.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-[340px] sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Batch berjalan</span>
              <strong className="mt-1 block break-words text-sm text-slate-950">{formatDate(periodStart)} - {formatDate(periodEnd)}</strong>
              <small className="mt-0.5 block text-xs text-slate-500">Otomatis Kamis sampai Rabu.</small>
            </div>
            <button className="secondary-button inline-flex items-center justify-center gap-2" type="button" onClick={loadReport} disabled={loading}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={CalendarDays} label="Periode" value={`${formatDate(periodStart)} - ${formatDate(periodEnd)}`} helper="Tanggal selesai job." />
        <MetricCard icon={UserRound} label="Sopir" value={`${summary.totalDrivers || 0} sopir`} helper={`${summary.totalItems || 0} job komisi`} />
        <MetricCard icon={CircleDollarSign} label="Total Komisi" value={formatCurrency(summary.totalAmount || 0)} helper={`${formatCurrency(summary.unpaidAmount || 0)} belum dibayar`} />
        <MetricCard icon={BadgeCheck} label="Status" value={statusLabels[report.status] || report.status || '-'} helper={activeBatch ? `Diajukan ${formatDateTime(activeBatch.submittedAt)}` : 'Belum masuk batch Finance.'} />
      </section>

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
                {!validBatchPeriod ? <small className="text-xs font-semibold text-amber-700">Periode submit wajib Kamis-Rabu.</small> : null}
              </div>
            ) : null}
          </div>
          {hasActiveBatch ? (
            <div className="border-b border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
              Periode ini sudah memiliki batch aktif. Perubahan pembayaran dilanjutkan di Finance.
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="responsive-data-table w-full min-w-[860px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Sopir</th>
                  <th className="px-3 py-3 text-right">Job</th>
                  <th className="px-3 py-3 text-right">Total Komisi</th>
                  <th className="px-3 py-3 text-right">Belum Dibayar</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => {
                  const driverKey = driver.driverKey || driver.driverId || driver.driverName;
                  return (
                  <tr key={driverKey} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-black text-slate-950" data-label="Sopir">{driver.driverName}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700" data-label="Job">{driver.totalItems}</td>
                    <td className="px-3 py-3 text-right font-black text-amber-700" data-label="Total Komisi">{formatCurrency(driver.totalAmount)}</td>
                    <td className="px-3 py-3 text-right font-bold text-rose-700" data-label="Belum Dibayar">{formatCurrency(driver.unpaidAmount)}</td>
                    <td className="px-3 py-3" data-label="Status"><StatusPill status={driverPaymentStatus(driver)} /></td>
                    <td className="px-3 py-3 text-right" data-label="Detail">
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
                  <tr className="responsive-empty-row">
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={6}>{loading ? 'Memuat report komisi...' : 'Belum ada komisi pada periode ini.'}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <DriverDetailModal driver={selectedDriver} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </main>
  );
}

export default DriverCommissionOperationalPage;
