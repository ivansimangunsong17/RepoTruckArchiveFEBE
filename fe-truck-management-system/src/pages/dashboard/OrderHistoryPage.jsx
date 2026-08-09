import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, Eye, Maximize2, X, XCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { USER_ROLES, hasPermission } from '../../constants/roles';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../contexts/FeedbackContext';
import { useArchiveData } from '../../hooks/useArchiveData';
import { fetchOperationReport } from '../../services/reports/reportService';
import { deleteUtilizationNote, fetchUtilizationNotes, saveUtilizationNote } from '../../services/reports/utilizationNoteService';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import { buildMonthlyUtilizationPivot, MonthlyUtilizationModal } from '../reports/ReportsPage';

const MONTHS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

const PAGE_SIZE_OPTIONS = [10, 20];
const DEFAULT_SUMMARY = {
  jobs: 0,
  completed: 0,
  cancelled: 0,
};

function currentPeriod() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function monthRange(month, year) {
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0);
  const format = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    dateFrom: format(start),
    dateTo: format(end),
  };
}

function monthKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function utilizationNoteKey(resourceId, date) {
  return `${String(resourceId || '').trim()}|${String(date || '').trim().slice(0, 10)}`;
}

function statusLabel(value) {
  const labels = {
    received: 'Belum Jalan',
    waiting_operational: 'Belum Jalan',
    running: 'Sedang Jalan',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
    repo_stored: 'Titip Repo',
  };
  return labels[String(value || '').toLowerCase()] || value || '-';
}

function statusClass(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'cancelled') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function statusIconMeta(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'completed') {
    return {
      Icon: CheckCircle2,
      label: 'Selesai',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }
  if (status === 'cancelled') {
    return {
      Icon: XCircle,
      label: 'Dibatalkan',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }
  return {
    Icon: null,
    label: statusLabel(value),
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  };
}

function rpujStatusLabel(value) {
  const labels = {
    pending: 'Belum Diajukan',
    rejected: 'Ditolak Finance',
    submitted: 'Menunggu Finance',
    approved: 'Disetujui Finance',
    paid: 'UJ Dikirim',
  };
  return labels[String(value || '').toLowerCase()] || value || '-';
}

function hasRepoHistory(job) {
  return Boolean(job?.repoStoredAt || job?.repoLocation || job?.repoEirNumber || job?.repoPickedUpAt);
}

function repoConditionLabel(value) {
  if (value === 'empty') return 'Kosong';
  if (value === 'loaded') return 'Isi';
  return '-';
}

function getJobPlateNumber(job) {
  return job?.plateNumber || job?.truck || job?.truckPlate || job?.vehiclePlate || '-';
}

function getJobDriverName(job) {
  return job?.driver || job?.driverName || job?.driver_name || '-';
}

function toValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortHistoryRows(rows = []) {
  return [...rows].sort((left, right) => {
    const rightTime = toValidDate(right.completedAt || right.cancelledAt)?.getTime() || 0;
    const leftTime = toValidDate(left.completedAt || left.cancelledAt)?.getTime() || 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return (toValidDate(right.tripDate)?.getTime() || 0) - (toValidDate(left.tripDate)?.getTime() || 0);
  });
}

function DetailField({ label, value }) {
  return (
    <span className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <small className="block text-[10px] font-black uppercase text-slate-500">{label}</small>
      <strong className="mt-1 block text-xs font-black text-slate-900">{value || '-'}</strong>
    </span>
  );
}

function journeyLog(job) {
  const doReceivedDate = job?.soDate || job?.receivedAt;
  return [
    { label: 'DO diterima', value: formatDate(doReceivedDate) },
    { label: 'Tanggal jalan', value: formatDate(job?.tripDate) },
    { label: 'Mulai jalan', value: formatDateTime(job?.runningAt) },
    ...(hasRepoHistory(job) ? [
      { label: 'Container dititipkan', value: formatDateTime(job?.repoStoredAt) },
      { label: 'Container diambil', value: formatDateTime(job?.repoPickedUpAt) },
    ] : []),
    {
      label: job?.status === 'cancelled' ? 'Dibatalkan' : 'Selesai',
      value: formatDateTime(job?.cancelledAt || job?.completedAt),
    },
    { label: 'Update terakhir', value: formatDateTime(job?.updatedAt) },
  ];
}

function OrderHistoryDetailModal({ job, onClose }) {
  if (!job) return null;
  const repoHistory = hasRepoHistory(job);

  const modal = (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-slate-950/45 px-3 py-6" role="presentation" onMouseDown={onClose}>
      <section className="flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="order-history-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-100 px-5 py-4">
          <div>
            <span className="text-[10px] font-black uppercase text-slate-500">Container Job</span>
            <h2 id="order-history-detail-title" className="mt-1 text-lg font-black text-slate-950">{job.containerNumber || 'Container belum diisi'}</h2>
            <p className="mt-1 text-xs font-bold text-slate-600">{job.soNumber || '-'} - {job.customer || '-'}</p>
          </div>
          <div className="flex items-center gap-2">
            {repoHistory ? (
              <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 text-[11px] font-black text-sky-800">
                <Archive size={13} />
                Pernah Titip
              </span>
            ) : null}
            <span className={`inline-flex min-h-7 items-center rounded-full border px-3 text-[11px] font-black ${statusClass(job.status)}`}>
              {statusLabel(job.status)}
            </span>
            <button className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" type="button" aria-label="Tutup detail" onClick={onClose}>
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-2 text-xs font-black uppercase text-slate-500">Ringkasan Order</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <DetailField label="Customer" value={job.customer} />
              <DetailField label="Sales" value={job.salesName} />
              <DetailField label="Rute" value={`${job.origin || '-'} ke ${job.destination || '-'}`} />
              <DetailField label="Jenis / Size" value={`${job.type || '-'} / ${job.size || '-'}`} />
              <DetailField label="RPUJ" value={rpujStatusLabel(job.rpujStatus)} />
              <DetailField label="No. SPK" value={job.spkNumber} />
              <DetailField label="Truck Akhir" value={job.plateNumber} />
              <DetailField label="Sopir Akhir" value={job.driver} />
            </div>
          </section>

          {repoHistory ? (
            <section className="rounded-lg border border-sky-200 bg-sky-50/70 p-3">
              <h3 className="mb-2 text-xs font-black uppercase text-sky-800">Penitipan Container</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <DetailField label="Depo Penitipan" value={job.repoLocation} />
                <DetailField label="Waktu Titip" value={formatDateTime(job.repoStoredAt)} />
                <DetailField label="No. EIR Titip" value={job.repoEirNumber} />
                <DetailField label="Kondisi" value={repoConditionLabel(job.repoContainerCondition)} />
                <DetailField label="Alasan" value={job.repoReason} />
                <DetailField label="Dicatat Oleh" value={job.repoCreatedByName} />
                <DetailField label="Diambil Oleh" value={job.repoPickedUpByName} />
                <DetailField label="Waktu Ambil" value={formatDateTime(job.repoPickedUpAt)} />
              </div>
              {job.repoNotes ? <p className="mt-2 rounded-md border border-sky-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{job.repoNotes}</p> : null}
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-xs font-black uppercase text-slate-500">Dokumen & Nomor Operasional</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <DetailField label="Bon Muat" value={job.loadingVoucher} />
              <DetailField label="TILA / Gatepass" value={job.tilaGatepassDocument} />
              <DetailField label="Surat Jalan" value={job.travelDocument} />
              <DetailField label="Timbang" value={job.weighingDocument} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-black uppercase text-slate-500">Log Perjalanan</h3>
            <div className="grid gap-2">
              {journeyLog(job).map((item, index) => (
                <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2" key={`${item.label}-${index}`}>
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-slate-300 bg-white text-[10px] font-black text-slate-700">{index + 1}</span>
                  <strong className="text-xs font-black text-slate-800">{item.label}</strong>
                  <span className="text-xs font-semibold text-slate-600">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-100" type="button" onClick={onClose}>Tutup</button>
        </footer>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

async function loadMonthlyUtilizationRows(range) {
  const pageSize = 100;
  const collected = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (collected.length < total) {
    const result = await fetchOperationReport({
      page,
      pageSize,
      status: 'completed',
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    collected.push(...rows);
    total = Number(result?.total || rows.length || 0);
    if (!rows.length || rows.length < pageSize) break;
    page += 1;
  }

  return collected;
}

function OrderHistoryPage() {
  const archive = useArchiveData();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const initialPeriod = useMemo(() => currentPeriod(), []);
  const [month, setMonth] = useState(initialPeriod.month);
  const [year, setYear] = useState(initialPeriod.year);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [utilizationRows, setUtilizationRows] = useState([]);
  const [utilizationLoading, setUtilizationLoading] = useState(true);
  const [utilizationError, setUtilizationError] = useState('');
  const [utilizationModalOpen, setUtilizationModalOpen] = useState(false);
  const [utilizationNotes, setUtilizationNotes] = useState([]);
  const [utilizationNoteSuggestions, setUtilizationNoteSuggestions] = useState([]);
  const [utilizationNoteSaving, setUtilizationNoteSaving] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const activeMonthLabel = MONTHS.find((item) => item.value === Number(month))?.label || '-';
  const activePeriodKey = monthKey(month, year);
  const canReadUtilizationNotes = user?.role === USER_ROLES.ADMIN
    || user?.role === USER_ROLES.OPERATIONAL
    || user?.role === USER_ROLES.OBSERVER
    || hasPermission(user, 'reports.read')
    || hasPermission(user, 'operations.read');
  const canEditUtilizationNotes = user?.role === USER_ROLES.ADMIN || hasPermission(user, 'operations.update');
  const range = useMemo(() => monthRange(month, year), [month, year]);
  const yearOptions = useMemo(() => {
    const baseYear = currentPeriod().year;
    return Array.from({ length: 7 }, (_, index) => baseYear - 4 + index);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    fetchOperationReport({
      page,
      pageSize,
      status: 'finished',
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    }).then((result) => {
      if (!active) return;
      setRows(sortHistoryRows(Array.isArray(result?.rows) ? result.rows : []));
      setTotal(Number(result?.total || 0));
      setSummary({
        jobs: Number(result?.summary?.jobs || 0),
        completed: Number(result?.summary?.completed || 0),
        cancelled: Number(result?.summary?.cancelled || 0),
      });
    }).catch((requestError) => {
      if (!active) return;
      setRows([]);
      setTotal(0);
      setSummary(DEFAULT_SUMMARY);
      setError(requestError.message || 'Riwayat order gagal dimuat.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [page, pageSize, range.dateFrom, range.dateTo]);

  useEffect(() => {
    let active = true;
    setUtilizationLoading(true);
    setUtilizationError('');

    loadMonthlyUtilizationRows(range)
      .then((result) => {
        if (!active) return;
        setUtilizationRows(result);
      })
      .catch((requestError) => {
        if (!active) return;
        setUtilizationRows([]);
        setUtilizationError(requestError.message || 'Utilization bulanan gagal dimuat.');
      })
      .finally(() => {
        if (active) setUtilizationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [range]);

  useEffect(() => {
    let active = true;
    if (!canReadUtilizationNotes) {
      setUtilizationNotes([]);
      setUtilizationNoteSuggestions([]);
      return () => {
        active = false;
      };
    }

    fetchUtilizationNotes({ resourceType: 'truck', period: activePeriodKey })
      .then((result) => {
        if (!active) return;
        setUtilizationNotes(Array.isArray(result?.rows) ? result.rows : []);
        setUtilizationNoteSuggestions(Array.isArray(result?.suggestions) ? result.suggestions : []);
      })
      .catch(() => {
        if (!active) return;
        setUtilizationNotes([]);
        setUtilizationNoteSuggestions([]);
      });

    return () => {
      active = false;
    };
  }, [activePeriodKey, canReadUtilizationNotes]);

  useEffect(() => {
    if (!selectedJob) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedJob]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const utilizationPivot = useMemo(
    () => buildMonthlyUtilizationPivot(archive.masters?.trucks || [], utilizationRows, month, year),
    [archive.masters?.trucks, month, utilizationRows, year],
  );
  const utilizationNotesByKey = useMemo(() => {
    const map = new Map();
    utilizationNotes.forEach((note) => {
      map.set(utilizationNoteKey(note.resourceId, note.date), note);
    });
    return map;
  }, [utilizationNotes]);
  const showingFrom = total ? (page - 1) * pageSize + 1 : 0;
  const showingTo = total ? Math.min(page * pageSize, total) : 0;

  function updateMonth(nextMonth) {
    setMonth(Number(nextMonth));
    setPage(1);
  }

  function updateYear(nextYear) {
    setYear(Number(nextYear));
    setPage(1);
  }

  function updatePageSize(nextPageSize) {
    setPageSize(Number(nextPageSize));
    setPage(1);
  }

  async function reloadUtilizationNotes() {
    if (!canReadUtilizationNotes) return;
    const result = await fetchUtilizationNotes({ resourceType: 'truck', period: activePeriodKey });
    setUtilizationNotes(Array.isArray(result?.rows) ? result.rows : []);
    setUtilizationNoteSuggestions(Array.isArray(result?.suggestions) ? result.suggestions : []);
  }

  async function handleSaveUtilizationNote(payload) {
    try {
      setUtilizationNoteSaving(true);
      const saved = await saveUtilizationNote(payload);
      setUtilizationNotes((current) => {
        const key = utilizationNoteKey(saved.resourceId, saved.date);
        const withoutCurrent = current.filter((note) => utilizationNoteKey(note.resourceId, note.date) !== key);
        return [...withoutCurrent, saved];
      });
      setUtilizationNoteSuggestions((current) => {
        const label = String(saved.reasonLabel || '').trim();
        if (!label) return current;
        const withoutCurrent = current.filter((item) => String(item.label || '').toUpperCase() !== label.toUpperCase());
        return [{ label, usageCount: 1 }, ...withoutCurrent].slice(0, 20);
      });
      await reloadUtilizationNotes();
      notify({ title: 'Catatan utilisasi disimpan', message: `${saved.resourceLabel} ${formatDate(saved.date)}: ${saved.reasonLabel}` });
      return saved;
    } catch (requestError) {
      notify({ type: 'error', title: 'Catatan gagal disimpan', message: requestError.message });
      throw requestError;
    } finally {
      setUtilizationNoteSaving(false);
    }
  }

  async function handleDeleteUtilizationNote(note) {
    if (!note?.id) return;
    try {
      setUtilizationNoteSaving(true);
      await deleteUtilizationNote(note.id);
      setUtilizationNotes((current) => current.filter((item) => item.id !== note.id));
      await reloadUtilizationNotes();
      notify({ title: 'Catatan utilisasi dihapus', message: `${note.resourceLabel} ${formatDate(note.date)}` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Catatan gagal dihapus', message: requestError.message });
      throw requestError;
    } finally {
      setUtilizationNoteSaving(false);
    }
  }

  return (
    <div className="page space-y-4">
      <PageHeader
        eyebrow="Order"
        title="Riwayat Order"
        description="Data order historis berdasarkan bulan dan tahun yang dipilih."
        actions={(
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800 hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setUtilizationModalOpen(true)}
            disabled={utilizationLoading || Boolean(utilizationError)}
          >
            <Maximize2 size={15} />
            Lihat Utilization Bulanan
          </button>
        )}
      />

      <section className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              Bulan
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                value={month}
                onChange={(event) => updateMonth(event.target.value)}
              >
                {MONTHS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              Tahun
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                value={year}
                onChange={(event) => updateYear(event.target.value)}
              >
                {yearOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              Per Halaman
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                value={pageSize}
                onChange={(event) => updatePageSize(event.target.value)}
              >
                {PAGE_SIZE_OPTIONS.map((item) => <option key={item} value={item}>{item} data</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[450px]">
            <div className="rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm">
              <span className="block text-[10px] font-black uppercase text-slate-500">Periode</span>
              <strong className="text-sm font-black text-slate-950">{activeMonthLabel} {year}</strong>
            </div>
            <div className="rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm">
              <span className="block text-[10px] font-black uppercase text-slate-500">Container Job</span>
              <strong className="text-sm font-black text-slate-950">{summary.jobs}</strong>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm">
              <span className="block text-[10px] font-black uppercase text-slate-500">Selesai</span>
              <strong className="text-sm font-black text-emerald-900">{summary.completed}</strong>
            </div>
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 shadow-sm">
              <span className="block text-[10px] font-black uppercase text-slate-500">Batal</span>
              <strong className="text-sm font-black text-rose-900">{summary.cancelled}</strong>
            </div>
          </div>
        </div>

        {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat riwayat order...</p></div> : null}
        {!loading && error ? (
          <div className="archive-inline-state is-error">
            <h3>Riwayat order gagal dimuat</h3>
            <p>{error}</p>
          </div>
        ) : null}

        {!loading && !error && rows.length ? (
          <div className="table-wrap">
            <table className="data-table responsive-data-table border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-100">
                  <th>No.</th>
                  <th>Tanggal Selesai</th>
                  <th>Nomor Container</th>
                  <th>Unit / Sopir</th>
                  <th>Customer</th>
                  <th>Jenis</th>
                  <th>Size</th>
                  <th>Sales</th>
                  <th className="!w-[84px] !px-2 !text-center">
                    <span className="mx-auto flex w-12 items-center justify-center">Status</span>
                  </th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job, index) => (
                  <tr className="border-t border-slate-200 text-slate-800 odd:bg-white even:bg-slate-50/80 hover:bg-slate-100/70" key={job.id || `${job.containerNumber}-${index}`}>
                    <td data-label="No."><strong>{showingFrom + index}.</strong></td>
                    <td data-label="Tanggal Selesai"><strong>{formatDate(job.completedAt || job.cancelledAt)}</strong></td>
                    <td data-label="Nomor Container">
                      <strong className="block text-slate-950">{job.containerNumber || '-'}</strong>
                      <span className="block text-[11px] text-slate-500">{job.soNumber || '-'}</span>
                    </td>
                    <td data-label="Unit / Sopir">
                      <strong className="block text-slate-950">{getJobPlateNumber(job)}</strong>
                      <span className="block text-[11px] font-semibold text-slate-500">{getJobDriverName(job)}</span>
                    </td>
                    <td data-label="Customer"><strong className="text-slate-800">{job.customer || '-'}</strong></td>
                    <td data-label="Jenis">{job.type || '-'}</td>
                    <td data-label="Size"><strong className="text-slate-900">{job.size || '-'}</strong></td>
                    <td data-label="Sales">{job.salesName || '-'}</td>
                    <td data-label="Status" className="!w-[84px] !px-2 text-center align-middle">
                      <div className="mx-auto flex w-12 items-center justify-center">
                        {(() => {
                          const meta = statusIconMeta(job.status);
                          const Icon = meta.Icon;
                          return (
                            <span
                              className="relative inline-flex h-7 w-12 items-center justify-center"
                              title={meta.label}
                              aria-label={meta.label}
                            >
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${meta.className}`}>
                                {Icon ? <Icon size={14} strokeWidth={2.6} /> : <span className="text-[9px] font-black">{meta.label}</span>}
                              </span>
                              {hasRepoHistory(job) ? (
                                <span
                                  className="absolute left-1/2 top-0 ml-1 inline-flex h-3.5 min-w-4 items-center justify-center rounded-full border border-white bg-sky-700 px-1 text-[8px] font-black leading-none text-white shadow-sm"
                                  title="Pernah Titip"
                                  aria-label="Pernah Titip"
                                >
                                  PT
                                </span>
                              ) : null}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td data-label="Aksi">
                      <button
                        type="button"
                        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[11px] font-black text-slate-700 hover:border-slate-400 hover:bg-slate-100"
                        onClick={() => setSelectedJob(job)}
                      >
                        <Eye size={13} />
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && !rows.length ? (
          <div className="p-8 text-center">
            <h3 className="text-sm font-black text-slate-900">Belum ada riwayat order</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Tidak ada order pada {activeMonthLabel} {year}.</p>
          </div>
        ) : null}

        {!loading && !error && total ? (
          <div className="master-pagination border-t border-slate-200 bg-slate-50">
            <span>Menampilkan {showingFrom}-{showingTo} dari {total} container job</span>
            <div>
              <button type="button" aria-label="Halaman sebelumnya" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft size={15} />
              </button>
              <strong>Halaman {page} dari {totalPages}</strong>
              <button type="button" aria-label="Halaman berikutnya" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <MonthlyUtilizationModal
        open={utilizationModalOpen}
        onClose={() => setUtilizationModalOpen(false)}
        pivot={utilizationPivot}
        activeMonthLabel={activeMonthLabel}
        year={year}
        utilizationNotesByKey={utilizationNotesByKey}
        utilizationNoteSuggestions={utilizationNoteSuggestions}
        canEditNotes={canEditUtilizationNotes}
        noteSaving={utilizationNoteSaving}
        onSaveNote={handleSaveUtilizationNote}
        onDeleteNote={handleDeleteUtilizationNote}
      />
      {utilizationError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {utilizationError}
        </div>
      ) : null}
      <OrderHistoryDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      <span className="sr-only">Filter aktif {monthKey(month, year)}</span>
    </div>
  );
}

export default OrderHistoryPage;
