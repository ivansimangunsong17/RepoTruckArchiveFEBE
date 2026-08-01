import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, FileWarning, Search } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { useArchiveData } from '../../hooks/useArchiveData';
import {
  buildDocumentMonitoringRows,
  summarizeDocumentMonitoring,
} from '../../utils/documentMonitoring';
import { formatDate } from '../../utils/formatDate';

const CATEGORY_OPTIONS = ['Semua Data', 'Truck', 'Sopir', 'Customer', 'Chassis'];
const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'expired', label: 'Lewat OFF' },
  { value: 'warning', label: 'Mendekati OFF' },
  { value: 'incomplete', label: 'Dokumen Kurang' },
  { value: 'complete', label: 'Lengkap' },
];

const STATUS_META = {
  expired: {
    label: 'Lewat OFF',
    icon: AlertTriangle,
    badgeClass: 'border-red-200 bg-red-50 text-red-700',
    rowClass: 'bg-red-50/40',
  },
  warning: {
    label: 'Mendekati OFF',
    icon: Clock3,
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    rowClass: 'bg-amber-50/40',
  },
  incomplete: {
    label: 'Dokumen Kurang',
    icon: FileWarning,
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    rowClass: 'bg-sky-50/30',
  },
  complete: {
    label: 'Lengkap',
    icon: CheckCircle2,
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rowClass: '',
  },
};

function StatItem({ label, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    sky: 'border-sky-200 bg-sky-50 text-sky-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  }[tone] || 'border-slate-200 bg-white text-slate-950';

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wide opacity-75">{label}</span>
      <strong className="mt-1 block text-xl font-black">{value}</strong>
    </div>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.incomplete;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${meta.badgeClass}`}>
      <Icon size={13} />
      {meta.label}
    </span>
  );
}

function formatDistance(daysUntil) {
  if (daysUntil == null) return 'Tanggal belum diisi';
  if (daysUntil < 0) return `Lewat ${Math.abs(daysUntil)} hari`;
  if (daysUntil === 0) return 'Hari ini';
  return `H-${daysUntil}`;
}

function dateToneClass(status) {
  if (status === 'expired') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'missing') return 'border-slate-200 bg-slate-50 text-slate-500';
  return 'border-slate-200 bg-white text-slate-700';
}

function DateList({ row }) {
  const displayed = row.dateItems.filter((item) => item.alert || item.value).slice(0, 5);
  if (!displayed.length) return <span className="text-xs font-semibold text-slate-400">-</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayed.map((item) => (
        <span
          key={item.key}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${dateToneClass(item.status)}`}
          title={`${item.label}: ${item.date ? formatDate(item.date) : 'belum diisi'}`}
        >
          <span>{item.label}</span>
          <strong>{item.date ? formatDate(item.date) : '-'}</strong>
          {item.alert ? <span className="font-black">{formatDistance(item.daysUntil)}</span> : null}
        </span>
      ))}
    </div>
  );
}

function MissingList({ row }) {
  const missing = [
    ...row.missingDocuments.map((item) => item.label),
    ...row.missingDates.map((item) => `Tanggal ${item.label}`),
  ];
  if (!missing.length) {
    return <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">Lengkap</span>;
  }

  const visible = missing.slice(0, 3);
  const remaining = missing.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((item) => (
        <span key={item} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700">
          {item}
        </span>
      ))}
      {remaining > 0 ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">+{remaining}</span> : null}
    </div>
  );
}

function DocumentProgress({ row }) {
  return (
    <div className="min-w-[120px]">
      <div className="flex items-center justify-between text-[11px] font-black text-slate-700">
        <span>{row.documentComplete}/{row.documentTotal}</span>
        <span>{row.documentPercent}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${row.documentPercent === 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
          style={{ width: `${row.documentPercent}%` }}
        />
      </div>
    </div>
  );
}

function matchesSearch(row, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const values = [
    row.category,
    row.name,
    row.raw?.plateNumber,
    row.raw?.unitCode,
    row.raw?.kirNumber,
    row.raw?.stnkNumber,
    row.raw?.stidCode,
    row.raw?.nickname,
    row.raw?.name,
    row.raw?.pic,
  ];
  return values.some((value) => String(value || '').toLowerCase().includes(needle));
}

function DocumentMonitoringPage() {
  const archive = useArchiveData();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Semua Data');
  const [status, setStatus] = useState('all');
  const rows = useMemo(() => buildDocumentMonitoringRows(archive.masters || {}), [archive.masters]);
  const summary = useMemo(() => summarizeDocumentMonitoring(rows), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => (
    (category === 'Semua Data' || row.category === category)
    && (status === 'all' || row.status === status)
    && matchesSearch(row, query)
  )), [category, query, rows, status]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Monitoring"
        title="Monitoring Dokumen & Waktu OFF"
        description="Pantau kelengkapan dokumen master data dan tanggal OFF tanpa mengubah data."
      />

      {archive.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {archive.error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatItem label="Total Data" value={summary.total} />
        <StatItem label="Lengkap" value={summary.complete} tone="emerald" />
        <StatItem label="Dokumen Kurang" value={summary.incomplete} tone="sky" />
        <StatItem label="Mendekati OFF" value={summary.warning} tone="amber" />
        <StatItem label="Lewat OFF" value={summary.expired} tone="red" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="grid gap-3 border-b border-slate-200 p-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              placeholder="Cari truck, sopir, customer, chassis..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500">
                <th className="w-14 px-3 py-3 font-black">No</th>
                <th className="w-28 px-3 py-3 font-black">Data</th>
                <th className="px-3 py-3 font-black">Nama / Identitas</th>
                <th className="w-40 px-3 py-3 font-black">Kelengkapan</th>
                <th className="px-3 py-3 font-black">Yang Belum Lengkap</th>
                <th className="px-3 py-3 font-black">Waktu OFF</th>
                <th className="w-40 px-3 py-3 font-black">Status</th>
              </tr>
            </thead>
            <tbody>
              {archive.loading ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm font-semibold text-slate-500" colSpan={7}>Memuat data monitoring...</td>
                </tr>
              ) : filteredRows.length ? filteredRows.map((row, index) => (
                <tr key={row.id} className={`border-b border-slate-200 ${STATUS_META[row.status]?.rowClass || ''}`}>
                  <td className="px-3 py-3 text-center font-black text-slate-700">{index + 1}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                      <FileCheck2 size={13} />
                      {row.category}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <strong className="block text-sm font-black text-slate-950">{row.name}</strong>
                    {row.raw?.plateNumber && row.raw?.unitCode ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{row.raw.unitCode}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3"><DocumentProgress row={row} /></td>
                  <td className="px-3 py-3"><MissingList row={row} /></td>
                  <td className="px-3 py-3"><DateList row={row} /></td>
                  <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-8 text-center text-sm font-semibold text-slate-500" colSpan={7}>
                    Tidak ada data yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default DocumentMonitoringPage;
