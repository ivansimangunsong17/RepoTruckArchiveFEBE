import { BadgeCheck, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, CreditCard, FileText, RefreshCw, Upload, UserRound, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../contexts/FeedbackContext';
import { USER_ROLES } from '../../constants/roles';
import {
  approveDriverCommissionBatch,
  fetchDriverCommissionBatchDetail,
  fetchDriverCommissionBatches,
  fetchDriverCommissionPeriodReport,
  payDriverCommissionPayment,
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

function DriverFinanceDetailModal({ driver, payment, selectedBatch, canFinance, saving, onPay, onUploadProof, open, onClose }) {
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

  const accountSource = payment || driver;
  const canPay = canFinance && selectedBatch?.status === 'approved' && payment?.status !== 'paid';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="presentation" onMouseDown={onClose}>
      <section
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-driver-commission-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Detail Pembayaran</p>
            <h2 id="finance-driver-commission-detail-title" className="mt-1 break-words text-xl font-black text-slate-950">{driver.driverName}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{driver.totalItems} job | {formatCurrency(driver.totalAmount)}</p>
          </div>
          <button className="secondary-button inline-flex h-10 w-10 shrink-0 items-center justify-center p-0" type="button" onClick={onClose} aria-label="Tutup detail pembayaran">
            <X size={18} />
          </button>
        </header>

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
            {canPay ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <label className={`primary-button inline-flex cursor-pointer items-center gap-2 ${saving ? 'pointer-events-none opacity-60' : ''}`}>
                  <Upload size={16} /> Upload Bukti
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={saving}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      onUploadProof(payment, file);
                    }}
                  />
                </label>
                <button className="secondary-button inline-flex items-center gap-2" type="button" disabled={saving} onClick={() => onPay(payment)}>
                  <CircleDollarSign size={16} /> Paid Tanpa File
                </button>
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
                  <div><dt className="font-black uppercase text-slate-400">Tanggal Selesai</dt><dd className="mt-0.5 font-bold text-slate-700">{formatDate(item.completedDate)}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Truck</dt><dd className="mt-0.5 font-bold text-slate-700">{item.truckPlateNumber || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Customer</dt><dd className="mt-0.5 font-bold text-slate-700">{item.customerName || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Tujuan</dt><dd className="mt-0.5 font-bold text-slate-700">{item.destination || '-'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canFinance = [USER_ROLES.ADMIN, USER_ROLES.FINANCE].includes(user?.role);
  const summary = report.summary || emptyReport.summary;
  const drivers = report.drivers || [];
  const selectedDriver = drivers.find((driver) => (driver.driverKey || driver.driverId || driver.driverName) === selectedDriverKey) || drivers[0] || null;
  const selectedPayment = resolveSelectedPayment(selectedBatch, selectedDriver);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportResult, batchResult] = await Promise.all([
        fetchDriverCommissionPeriodReport({ periodStart, periodEnd }),
        fetchDriverCommissionBatches({ periodStart, periodEnd, pageSize: 50 }),
      ]);
      const nextReport = reportResult || emptyReport;
      const nextBatches = batchResult?.rows || [];
      setReport(nextReport);
      setBatches(nextBatches);
      setSelectedDriverKey((current) => {
        const nextDrivers = nextReport.drivers || [];
        if (nextDrivers.some((driver) => (driver.driverKey || driver.driverId || driver.driverName) === current)) return current;
        const firstDriver = nextDrivers[0];
        return firstDriver ? firstDriver.driverKey || firstDriver.driverId || firstDriver.driverName : '';
      });

      const batchId = selectedBatch?.id || nextReport.activeBatch?.id || nextBatches[0]?.id;
      setSelectedBatch(batchId ? await fetchDriverCommissionBatchDetail(batchId).catch(() => null) : null);
    } catch (error) {
      notify({ type: 'error', title: 'Komisi gagal dimuat', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [notify, periodEnd, periodStart, selectedBatch?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function openBatch(batchId) {
    try {
      setSelectedBatch(await fetchDriverCommissionBatchDetail(batchId));
    } catch (error) {
      notify({ type: 'error', title: 'Detail gagal dimuat', message: error.message });
    }
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
      await loadData();
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
      await loadData();
    } catch (error) {
      notify({ type: 'error', title: 'Reject gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handlePay(payment) {
    if (!payment?.id) return;
    const paymentNote = window.prompt(`Catatan pembayaran untuk ${payment.driverName}:`, payment.paymentNote || '');
    if (paymentNote === null) return;

    setSaving(true);
    try {
      const updated = await payDriverCommissionPayment(payment.id, { paymentNote });
      notify({ title: 'Pembayaran dicatat', message: `${payment.driverName} ditandai paid.` });
      setSelectedBatch(updated);
      await loadData();
    } catch (error) {
      notify({ type: 'error', title: 'Pembayaran gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadProof(payment, file) {
    if (!payment?.id || !file) return;
    const paymentNote = window.prompt(`Catatan pembayaran untuk ${payment.driverName}:`, payment.paymentNote || '');
    if (paymentNote === null) return;

    setSaving(true);
    try {
      const updated = await uploadDriverCommissionTransferProof(payment.id, file, { paymentNote });
      notify({ title: 'Bukti transfer disimpan', message: `${payment.driverName} ditandai paid.` });
      setSelectedBatch(updated);
      await loadData();
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
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">
              Dari
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">
              Sampai
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
            </label>
            <button className="secondary-button mt-5 inline-flex items-center justify-center gap-2" type="button" onClick={loadData} disabled={loading}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={CalendarDays} label="Periode" value={`${formatDate(periodStart)} - ${formatDate(periodEnd)}`} helper="Berdasarkan tanggal selesai job." />
        <MetricCard icon={UserRound} label="Sopir" value={`${summary.totalDrivers || 0} sopir`} helper={`${summary.totalItems || 0} job komisi`} />
        <MetricCard icon={CircleDollarSign} label="Total Komisi" value={formatCurrency(summary.totalAmount || 0)} helper={`${formatCurrency(summary.paidAmount || 0)} sudah dibayar`} />
        <MetricCard icon={BadgeCheck} label="Status Batch" value={statusLabels[report.status] || report.status || '-'} helper={report.activeBatch ? `Diajukan ${formatDateTime(report.activeBatch.submittedAt)}` : 'Belum ada pengajuan aktif.'} />
      </section>

      <section>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">Report Per Sopir</h2>
              <p className="text-xs leading-relaxed text-slate-500">Daftar komisi dari pengajuan Operational pada periode filter.</p>
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
          {!report.activeBatch ? (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Belum ada batch aktif dari Operational untuk periode ini.
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="responsive-data-table w-full min-w-[920px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Sopir</th>
                  <th className="px-3 py-3">Rekening</th>
                  <th className="px-3 py-3 text-right">Job</th>
                  <th className="px-3 py-3 text-right">Total Komisi</th>
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
                    <td className="px-3 py-3" data-label="Rekening">
                      <span className="flex items-center gap-2 text-slate-700"><CreditCard size={15} /> {paymentAccountLabel(driver)}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700" data-label="Job">{driver.totalItems}</td>
                    <td className="px-3 py-3 text-right font-black text-amber-700" data-label="Total Komisi">{formatCurrency(driver.totalAmount)}</td>
                    <td className="px-3 py-3" data-label="Status"><StatusPill status={driverFinanceStatus(driver)} /></td>
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

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-base font-black text-slate-950">Batch Komisi</h2>
          <p className="text-xs text-slate-500">Riwayat pengajuan pada periode filter.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {batches.map((batch) => (
            <button key={batch.id} className="flex w-full flex-col gap-2 p-4 text-left hover:bg-slate-50 sm:flex-row sm:items-start sm:justify-between" type="button" onClick={() => openBatch(batch.id)}>
              <div>
                <strong className="block text-sm text-slate-950">{formatDate(batch.periodStart)} - {formatDate(batch.periodEnd)}</strong>
                <small className="mt-1 block text-xs text-slate-500">{batch.totalItems} job | {formatCurrency(batch.totalAmount)}</small>
                <small className="mt-1 block text-xs text-slate-400">Diajukan {batch.submittedByName || '-'} | {formatDateTime(batch.submittedAt)}</small>
              </div>
              <StatusPill status={batch.status} />
            </button>
          ))}
          {!batches.length ? <p className="p-4 text-sm text-slate-500">Belum ada batch untuk periode ini.</p> : null}
        </div>
      </section>

      <DriverFinanceDetailModal
        driver={selectedDriver}
        payment={selectedPayment}
        selectedBatch={selectedBatch}
        canFinance={canFinance}
        saving={saving}
        onPay={handlePay}
        onUploadProof={handleUploadProof}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </main>
  );
}

export default DriverCommissionPage;
