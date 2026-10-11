import { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import DocumentLink from '../../components/common/DocumentLink';
import { fetchContainerJob, fetchContainerJobAssignmentHistory, fetchContainerJobsPage } from '../../services/archive/containerJobService';
import { buildJobTimelinePhases } from '../operations/jobTimeline';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';

const PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  ['', 'Semua Status'], ['received', 'Order'], ['running', 'Sedang Jalan'],
  ['inap', 'Inap'], ['repo_stored', 'Container Dititipkan'],
  ['completed', 'Selesai'], ['cancelled', 'Batal'],
];

function Field({ label, value }) {
  return <div><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value || '-'}</dd></div>;
}

export default function FinanceContainerJobsPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchContainerJobsPage({ page, pageSize: PAGE_SIZE, query, status, tripDate })
      .then((result) => {
        if (!active) return;
        setRows(result?.rows || []);
        setTotal(Number(result?.total || 0));
      })
      .catch((err) => { if (active) setError(err.message || 'Container Job gagal dimuat.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, query, status, tripDate]);

  async function openDetail(id) {
    setDetail(null);
    setHistory([]);
    setDetailError('');
    setDetailLoading(true);
    try {
      const [job, assignmentHistory] = await Promise.all([
        fetchContainerJob(id), fetchContainerJobAssignmentHistory(id),
      ]);
      setDetail(job);
      setHistory(Array.isArray(assignmentHistory) ? assignmentHistory : assignmentHistory?.rows || []);
    } catch (err) {
      setDetailError(err.message || 'Detail Container Job gagal dimuat.');
    } finally {
      setDetailLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const documents = detail ? [
    ['SPK', detail.spkDocument], ['EIR', detail.eirDocument], ['EIR Repo', detail.repoEirDocument],
    ['Surat Jalan', detail.travelDocumentFile], ['Bon Muat/Bongkar', detail.loadingVoucherDocument],
    ['TILA/Gatepass', detail.tilaGatepassDocumentFile],
  ].filter(([, file]) => file) : [];

  return <div className="space-y-5">
    <PageHeader eyebrow="Finance" title="Container Job" description="Informasi pelaksanaan dan timeline Container Job. Read Only." />
    <section className="panel p-4">
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs font-bold">Cari container, SO, atau customer
          <input className="master-filter-select" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} />
        </label>
        <label className="grid gap-1 text-xs font-bold">Status
          <select className="master-filter-select" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold">Tanggal Jalan
          <input className="master-filter-select" type="date" value={tripDate} onChange={(event) => { setPage(1); setTripDate(event.target.value); }} />
        </label>
      </div>
      {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
      {loading ? <p className="mt-4 text-sm">Memuat Container Job...</p> : <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm"><thead><tr className="border-b text-slate-500">
          <th className="p-3">No. SO</th><th className="p-3">Customer</th><th className="p-3">Container</th>
          <th className="p-3">Status</th><th className="p-3">Tanggal Jalan</th><th className="p-3">Aksi</th>
        </tr></thead><tbody>{rows.map((job) => <tr key={job.id} className="border-b">
          <td className="p-3">{job.soNumber || '-'}</td><td className="p-3">{job.customer || '-'}</td>
          <td className="p-3">{job.containerNumber || '-'} ({job.size || '-'})</td>
          <td className="p-3">{STATUS_OPTIONS.find(([value]) => value === job.status)?.[1] || job.status}</td>
          <td className="p-3">{job.tripDate ? formatDate(job.tripDate) : '-'}</td>
          <td className="p-3"><button type="button" className="secondary-button" onClick={() => openDetail(job.id)}>Detail</button></td>
        </tr>)}</tbody></table>
        {!rows.length && <p className="p-4 text-sm text-slate-500">Tidak ada Container Job.</p>}
      </div>}
      <div className="mt-4 flex items-center gap-3 text-sm">
        <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
        <span>Halaman {page} dari {totalPages} · {total} job</span>
        <button type="button" className="secondary-button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Berikutnya</button>
      </div>
    </section>
    {(detail || detailLoading || detailError) && <section className="panel space-y-5 p-5" aria-label="Detail Container Job">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Detail Container Job · Read Only</h2>
        <button type="button" className="secondary-button" onClick={() => { setDetail(null); setDetailError(''); }}>Tutup</button></div>
      {detailLoading && <p>Memuat detail...</p>}{detailError && <p className="text-rose-700">{detailError}</p>}
      {detail && <>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="No. SO" value={detail.soNumber} /><Field label="Customer" value={detail.customer} />
          <Field label="Container" value={detail.containerNumber} /><Field label="Ukuran / Tipe" value={[detail.size, detail.type].filter(Boolean).join(' / ')} />
          <Field label="Layanan" value={detail.serviceName || detail.shipment} /><Field label="Status" value={STATUS_OPTIONS.find(([value]) => value === detail.status)?.[1] || detail.status} />
          <Field label="Sumber Eksekusi" value={detail.executionSource === 'vendor' ? 'Vendor' : 'Internal'} />
          <Field label="Truck" value={detail.plateNumber} /><Field label="Sopir" value={detail.driver} />
          <Field label="Chassis" value={detail.chassis?.chassisCode || detail.chassis?.code} />
          <Field label="Terminal" value={detail.terminal} /><Field label="Depo Repo" value={detail.repoLocation} />
          <Field label="Tujuan" value={detail.destination} /><Field label="Tanggal Jalan" value={detail.tripDate ? formatDate(detail.tripDate) : ''} />
          <Field label="UJ Snapshot" value={detail.ujAmountSnapshot == null ? '' : formatCurrency(detail.ujAmountSnapshot)} />
        </dl>
        <div><h3 className="font-bold">Timeline</h3><ol className="mt-2 space-y-2 border-l pl-4 text-sm">
          {buildJobTimelinePhases(detail).map((phase) => <li key={phase.key} className={phase.done ? 'text-slate-900' : 'text-slate-400'}>
            <strong>{phase.label}</strong>: {phase.value ? (phase.format === 'date' ? formatDate(phase.value) : formatDateTime(phase.value)) : 'Belum terjadi'}
            {phase.warning && <span className="ml-2 text-amber-700">{phase.warning}</span>}
          </li>)}
        </ol></div>
        {!!history.length && <div><h3 className="font-bold">Riwayat Assignment</h3><ul className="mt-2 space-y-2 text-sm">
          {history.map((item) => <li key={item.id} className="rounded border p-3">
            <strong>{item.createdAt ? formatDateTime(item.createdAt) : '-'}</strong> · {item.changeSource || '-'}<br />
            Sopir: {item.previousDriverName || '-'} → {item.nextDriverName || '-'} · Truck: {item.previousPlateNumber || '-'} → {item.nextPlateNumber || '-'}
            {item.reason && <span className="block">Alasan: {item.reason}</span>}
          </li>)}
        </ul></div>}
        {!!detail.expenses?.length && <div><h3 className="font-bold">Ringkasan Biaya Operasional</h3><ul className="mt-2 space-y-1 text-sm">
          {detail.expenses.map((expense) => <li key={expense.id}>{expense.category || '-'} · {formatCurrency(expense.amount)} · {expense.financeCheckStatus || '-'}</li>)}
        </ul></div>}
        {!!documents.length && <div><h3 className="font-bold">Dokumen</h3><div className="mt-2 flex flex-wrap gap-3">
          {documents.map(([label, file]) => <DocumentLink key={label} file={file} label={label} />)}
        </div></div>}
      </>}
    </section>}
  </div>;
}
