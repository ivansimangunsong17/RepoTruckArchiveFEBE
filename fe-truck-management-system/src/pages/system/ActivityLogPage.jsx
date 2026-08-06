import { Activity, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import { fetchActivityLogPage, isActivityLogDatabaseEnabled } from '../../services/system/activityLogService';
import { formatDateTime } from '../../utils/formatDate';
import FilterStatus from '../../components/common/FilterStatus';

const PAGE_SIZE = 10;

const actionOptions = [
  ['LOGIN_SUCCESS', 'Login berhasil'],
  ['LOGIN_FAILED', 'Login gagal'],
  ['LOGOUT', 'Logout'],
  ['CREATE_SALES_ORDER', 'Buat Sales Order'],
  ['UPDATE_SALES_ORDER', 'Ubah Sales Order'],
  ['CANCEL_SALES_ORDER', 'Batalkan Sales Order'],
  ['CREATE_HISTORICAL_SALES_ORDER', 'Input SO Data Lama'],
  ['UPDATE_HISTORICAL_SALES_ORDER', 'Ubah SO Data Lama'],
  ['CREATE_CONTAINER_JOB', 'Buat Container Job'],
  ['UPDATE_CONTAINER_JOB', 'Ubah Container Job'],
  ['CREATE_HISTORICAL_CONTAINER_JOB', 'Input Container Data Lama'],
  ['UPDATE_HISTORICAL_CONTAINER_JOB', 'Ubah Container Data Lama'],
  ['LOCK_HISTORICAL_PERIOD', 'Kunci Periode Data Lama'],
  ['UNLOCK_HISTORICAL_PERIOD', 'Buka Kunci Data Lama'],
  ['UPDATE_JOB_STATUS', 'Ubah Status Job'],
  ['REQUEST_CANCEL_CONTAINER_JOB', 'Ajukan Batal Container'],
  ['APPROVE_CANCEL_CONTAINER_JOB', 'Setujui Batal Container'],
  ['REJECT_CANCEL_CONTAINER_JOB', 'Tolak Batal Container'],
  ['CANCEL_CONTAINER_JOB', 'Batalkan Container Job'],
  ['UPLOAD_ATTACHMENT', 'Upload Dokumen'],
  ['DELETE_ATTACHMENT', 'Hapus Dokumen'],
  ['UPDATE_SETTINGS', 'Ubah Settings'],
  ['CREATE_USER', 'Buat User'],
  ['UPDATE_USER', 'Ubah User'],
  ['UPDATE_USER_ROLE', 'Ubah Role User'],
  ['CHANGE_PASSWORD', 'Ganti Password'],
];

const moduleOptions = [
  ['auth', 'Auth'],
  ['sales_orders', 'Sales Order'],
  ['container_jobs', 'Container Job'],
  ['historical_entry', 'Data Lama'],
  ['attachments', 'Dokumen'],
  ['settings', 'Settings'],
  ['users', 'User'],
];

const actionLabels = Object.fromEntries(actionOptions);

function formatActionLabel(action) {
  return actionLabels[action] || String(action || '-').replaceAll('_', ' ');
}

function formatPeriod(value) {
  if (!value) return '';
  const [year, month] = String(value).split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function formatLogTarget(item) {
  const metadata = item.metadata || {};
  if (item.module !== 'historical_entry') return item.target || item.module || '-';
  const period = formatPeriod(metadata.historicalPeriod);
  const reference = [
    metadata.soNumber,
    metadata.containerNumber,
  ].filter(Boolean).join(' / ');
  return [
    reference || item.target || 'Data Lama',
    period ? `Periode ${period}` : '',
  ].filter(Boolean).join(' - ');
}

const activities = [
  { id: 1, time: '20 Jun 2026, 09:42', user: 'Andi Pratama', role: 'Admin', action: 'Memperbarui data truck', target: 'TRK-002 · B 9142 UYK' },
  { id: 2, time: '20 Jun 2026, 09:18', user: 'Budi Operational', role: 'Operational', action: 'Memperbarui status container', target: 'MSCU-774210-8 - Sedang Jalan' },
  { id: 3, time: '20 Jun 2026, 08:55', user: 'Sinta Maharani', role: 'Sales', action: 'Membuat Sales Order', target: 'SO-2606-0183' },
  { id: 4, time: '19 Jun 2026, 16:30', user: 'Andi Pratama', role: 'Admin', action: 'Menambahkan user baru', target: 'Rina Management' },
];

function ActivityLogPage() {
  const databaseMode = isActivityLogDatabaseEnabled();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [action, setAction] = useState('');
  const [module, setModule] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState(activities);
  const [page, setPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(databaseMode);
  const [error, setError] = useState('');

  const filteredRows = useMemo(() => rows.filter((item) =>
    (!query || `${item.user} ${item.action} ${item.target}`.toLowerCase().includes(query.toLowerCase()))
    && (!role || item.role.toLowerCase() === role.toLowerCase())
    && (!action || item.action === action)
    && (!module || item.module === module || item.target === module)
    && (!dateFrom || String(item.time || '').slice(0, 10) >= dateFrom)
    && (!dateTo || String(item.time || '').slice(0, 10) <= dateTo),
  ), [action, dateFrom, dateTo, module, query, role, rows]);
  const totalItems = databaseMode ? serverTotal : filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = databaseMode
    ? rows
    : filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = totalItems ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalItems);

  useEffect(() => {
    setPage(1);
  }, [action, dateFrom, dateTo, module, query, role]);

  useEffect(() => {
    if (!databaseMode) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const result = await fetchActivityLogPage({
          page,
          pageSize: PAGE_SIZE,
          query,
          role,
          action,
          module,
          dateFrom,
          dateTo,
        });
        if (!active) return;
        setRows(result.rows);
        setServerTotal(result.total);
      } catch (requestError) {
        if (!active) return;
        setRows([]);
        setServerTotal(0);
        setError(requestError.message || 'Activity Log gagal dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [action, databaseMode, dateFrom, dateTo, module, page, query, role]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="System"
        title="Activity Log"
        description="Riwayat aktivitas pengguna dan perubahan data penting dalam sistem."
      />
      <section className="panel activity-log-panel">
        <div className="filter-bar">
          <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari user, aktivitas, atau data..." /></label>
          <select aria-label="Filter role" value={role} onChange={(event) => setRole(event.target.value)}><option value="">Semua Role</option><option value="admin">Admin</option><option value="sales">Sales</option><option value="operational">Operational</option><option value="observer">Viewer</option></select>
          <select aria-label="Filter modul" value={module} onChange={(event) => setModule(event.target.value)}>
            <option value="">Semua Modul</option>
            {moduleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Filter aksi" value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">Semua Aksi</option>
            {actionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="report-date-field"><span>Dari</span><input aria-label="Tanggal dari" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className="report-date-field"><span>Sampai</span><input aria-label="Tanggal sampai" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
        <FilterStatus
          total={totalItems}
          filtered={totalItems}
          active={Boolean(query.trim() || role || module || action || dateFrom || dateTo)}
          label="aktivitas"
          onReset={() => {
            setQuery('');
            setRole('');
            setModule('');
            setAction('');
            setDateFrom('');
            setDateTo('');
          }}
        />
        <div className="activity-log-list">
          {loading ? <div className="role-empty-state"><p>Memuat aktivitas...</p></div> : null}
          {!loading && error ? <div className="role-empty-state"><h3>Activity Log gagal dimuat</h3><p>{error}</p></div> : null}
          {!loading && !error ? paginatedRows.map((item) => (
            <article key={item.id}>
              <span className="activity-log-icon"><Activity size={17} /></span>
              <div><strong>{formatActionLabel(item.action)}</strong><p>{formatLogTarget(item)}</p></div>
              <div className="activity-actor"><strong>{item.user}</strong><span>{item.role}</span></div>
              <time>{databaseMode ? formatDateTime(item.time) : item.time}</time>
            </article>
          )) : null}
          {!loading && !error && !totalItems ? (
            <div className="role-empty-state">
              <Activity size={28} />
              <h3>Aktivitas tidak ditemukan</h3>
              <p>Ubah kata kunci atau reset filter untuk melihat aktivitas lainnya.</p>
            </div>
          ) : null}
        </div>
        {!loading && !error && totalItems ? (
          <div className="master-pagination">
            <span>Menampilkan {rangeStart}–{rangeEnd} dari {totalItems} aktivitas</span>
            <div>
              <button
                type="button"
                aria-label="Halaman sebelumnya"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={15} />
              </button>
              <strong>Halaman {currentPage} dari {totalPages}</strong>
              <button
                type="button"
                aria-label="Halaman berikutnya"
                disabled={currentPage === totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default ActivityLogPage;
