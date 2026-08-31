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
  ['CHANGE_PASSWORD', 'Ganti Password'],
  ['CREATE_SALES_ORDER', 'Buat Sales Order'],
  ['UPDATE_SALES_ORDER', 'Ubah Sales Order'],
  ['ADMIN_CORRECTION_SALES_ORDER', 'Koreksi Admin Sales Order'],
  ['REQUEST_CANCEL_SALES_ORDER', 'Ajukan Batal Sales Order'],
  ['APPROVE_CANCEL_SALES_ORDER', 'Setujui Batal Sales Order'],
  ['REJECT_CANCEL_SALES_ORDER', 'Tolak Batal Sales Order'],
  ['CANCEL_SALES_ORDER', 'Batalkan Sales Order'],
  ['SALES_SEND_INVOICE', 'Kirim Invoice ke Customer'],
  ['SALES_UPDATE_INVOICE_DELIVERY_STATUS', 'Ubah Status Pengiriman Invoice'],
  ['CREATE_HISTORICAL_SALES_ORDER', 'Input SO Data Lama'],
  ['UPDATE_HISTORICAL_SALES_ORDER', 'Ubah SO Data Lama'],
  ['CREATE_CONTAINER_JOB', 'Buat Container Job'],
  ['UPDATE_CONTAINER_JOB', 'Ubah Container Job'],
  ['ADMIN_CORRECTION_CONTAINER_JOB', 'Koreksi Admin Container'],
  ['CREATE_HISTORICAL_CONTAINER_JOB', 'Input Container Data Lama'],
  ['UPDATE_HISTORICAL_CONTAINER_JOB', 'Ubah Container Data Lama'],
  ['LOCK_HISTORICAL_PERIOD', 'Kunci Periode Data Lama'],
  ['UNLOCK_HISTORICAL_PERIOD', 'Buka Kunci Data Lama'],
  ['UPDATE_JOB_STATUS', 'Ubah Status Job'],
  ['REQUEST_CANCEL_CONTAINER_JOB', 'Ajukan Batal Container'],
  ['APPROVE_CANCEL_CONTAINER_JOB', 'Setujui Batal Container'],
  ['REJECT_CANCEL_CONTAINER_JOB', 'Tolak Batal Container'],
  ['CANCEL_CONTAINER_JOB', 'Batalkan Container Job'],
  ['STORE_CONTAINER_JOB_REPO', 'Simpan Container ke Depo'],
  ['PICKUP_CONTAINER_JOB_REPO', 'Ambil Container dari Depo'],
  ['INAP_CONTAINER_JOB', 'Tandai Inap'],
  ['RESUME_CONTAINER_JOB_FROM_INAP', 'Selesai Inap'],
  ['FINANCE_CREATE_REVENUE_LINE', 'Tambah Revenue Manual'],
  ['FINANCE_UPDATE_REVENUE_LINE', 'Ubah Revenue Manual'],
  ['FINANCE_VOID_REVENUE_LINE', 'Batalkan Revenue Manual'],
  ['OPERATIONAL_REQUEST_RPUJ', 'Ajukan RPUJ'],
  ['GENERATE_SPK', 'Generate SPK'],
  ['OPERATIONAL_CREATE_CONTAINER_JOB_EXPENSE', 'Input Biaya Operational'],
  ['OPERATIONAL_CORRECT_CONTAINER_JOB_EXPENSE', 'Koreksi Biaya Operational'],
  ['OPERATIONAL_UPLOAD_CONTAINER_JOB_EXPENSE_PROOF', 'Upload Bukti Biaya Operational'],
  ['UPLOAD_ATTACHMENT', 'Upload Dokumen'],
  ['DELETE_ATTACHMENT', 'Hapus Dokumen'],
  ['UPDATE_SETTINGS', 'Ubah Settings'],
  ['CREATE_USER', 'Buat User'],
  ['UPDATE_USER', 'Ubah User'],
  ['UPDATE_USER_ROLE', 'Ubah Role User'],
  ['FINANCE_INPUT_SO_NUMBER', 'Input Nomor SO Finance'],
  ['FINANCE_APPROVE_ORDER', 'Setujui Order Finance'],
  ['FINANCE_APPROVE_RPUJ', 'Setujui RPUJ'],
  ['FINANCE_REJECT_RPUJ', 'Tolak RPUJ'],
  ['FINANCE_UPLOAD_TRANSFER_PROOF', 'Upload Bukti Transfer'],
  ['FINANCE_INPUT_INVOICE_NUMBER', 'Input Nomor Invoice'],
  ['FINANCE_UPLOAD_INVOICE_DOCUMENT', 'Upload Dokumen Invoice'],
  ['FINANCE_RECORD_INVOICE_PAYMENT', 'Catat Pembayaran Invoice'],
  ['FINANCE_VOID_INVOICE_PAYMENT', 'Batalkan Pembayaran Invoice'],
  ['FINANCE_INPUT_DEBIT_NOTE_NUMBER', 'Input Nomor Debit Note'],
  ['FINANCE_RECORD_DEBIT_NOTE_PAYMENT', 'Catat Pembayaran Debit Note'],
  ['FINANCE_VOID_DEBIT_NOTE_PAYMENT', 'Batalkan Pembayaran Debit Note'],
  ['FINANCE_RECONCILE_CONTAINER_JOB_EXPENSE', 'Rekonsiliasi Biaya Container'],
  ['FINANCE_CLOSE_OPERATIONAL_FUND_BATCH', 'Tutup Batch Dana Operational'],
  ['FINANCE_REOPEN_OPERATIONAL_FUND_BATCH', 'Buka Kembali Batch Dana Operational'],
  ['OPERATIONAL_FUND_REQUEST_SUBMITTED', 'Ajukan Dana Operational'],
  ['FINANCE_DEPOSIT_OPERATIONAL_FUND', 'Setor Dana Operational'],
  ['FINANCE_APPROVE_OPERATIONAL_FUND', 'Setujui Dana Operational'],
  ['FINANCE_REJECT_OPERATIONAL_FUND', 'Tolak Dana Operational'],
  ['FINANCE_UPLOAD_OPERATIONAL_FUND_TRANSFER_PROOF', 'Upload Bukti Transfer Dana Operational'],
  ['FINANCE_CORRECTION_REQUESTED', 'Ajukan Koreksi Finance'],
  ['FINANCE_CORRECTION_APPLIED', 'Terapkan Koreksi Finance'],
  ['FINANCE_CORRECTION_APPROVED', 'Setujui Koreksi Finance'],
  ['FINANCE_CORRECTION_REJECTED', 'Tolak Koreksi Finance'],
  ['SUBMIT_DRIVER_COMMISSION_BATCH', 'Ajukan Batch Komisi Sopir'],
  ['APPROVE_DRIVER_COMMISSION_BATCH', 'Setujui Batch Komisi Sopir'],
  ['REJECT_DRIVER_COMMISSION_BATCH', 'Tolak Batch Komisi Sopir'],
  ['PAY_DRIVER_COMMISSION_PAYMENT', 'Bayar Komisi Sopir'],
  ['VOID_DRIVER_COMMISSION_PAYMENT', 'Batalkan Pembayaran Komisi Sopir'],
  ['UPLOAD_DRIVER_COMMISSION_PAYMENT_PROOF', 'Upload Bukti Pembayaran Komisi Sopir'],
  ['CREATE_VEHICLE', 'Buat Truck'],
  ['UPDATE_VEHICLE', 'Ubah Truck'],
  ['DELETE_VEHICLE', 'Hapus Truck'],
  ['CREATE_DESTINATION', 'Buat Tujuan'],
  ['UPDATE_DESTINATION', 'Ubah Tujuan'],
  ['UPDATE_DESTINATION_UJ', 'Ubah Tarif UJ Tujuan'],
  ['DELETE_DESTINATION', 'Hapus Tujuan'],
  ['CREATE_MASTER_CUSTOMERS', 'Buat Customer'],
  ['UPDATE_MASTER_CUSTOMERS', 'Ubah Customer'],
  ['DELETE_MASTER_CUSTOMERS', 'Hapus Customer'],
  ['CREATE_MASTER_DRIVERS', 'Buat Sopir'],
  ['UPDATE_MASTER_DRIVERS', 'Ubah Sopir'],
  ['DELETE_MASTER_DRIVERS', 'Hapus Sopir'],
  ['CREATE_MASTER_DEPOTS', 'Buat Depo'],
  ['UPDATE_MASTER_DEPOTS', 'Ubah Depo'],
  ['DELETE_MASTER_DEPOTS', 'Hapus Depo'],
  ['CREATE_MASTER_TERMINALS', 'Buat Terminal'],
  ['UPDATE_MASTER_TERMINALS', 'Ubah Terminal'],
  ['DELETE_MASTER_TERMINALS', 'Hapus Terminal'],
  ['CREATE_MASTER_STIDS', 'Buat STID'],
  ['UPDATE_MASTER_STIDS', 'Ubah STID'],
  ['DELETE_MASTER_STIDS', 'Hapus STID'],
  ['UPDATE_MASTER_VIEWER_NOTE', 'Ubah Catatan Viewer'],
  ['CREATE_VEHICLE_DOCUMENT', 'Buat Dokumen Kendaraan'],
  ['UPDATE_VEHICLE_DOCUMENT', 'Ubah Dokumen Kendaraan'],
  ['DELETE_VEHICLE_DOCUMENT', 'Hapus Dokumen Kendaraan'],
  ['DOWNLOAD_VEHICLE_DOCUMENT', 'Unduh Dokumen Kendaraan'],
  ['UPSERT_UTILIZATION_NOTE', 'Simpan Catatan Utilisasi'],
  ['DELETE_UTILIZATION_NOTE', 'Hapus Catatan Utilisasi'],
  ['RESTORE_STORAGE_TRASH', 'Pulihkan dari Sampah'],
  ['PURGE_STORAGE_TRASH', 'Hapus Permanen dari Sampah'],
];

const moduleOptions = [
  ['auth', 'Auth'],
  ['sales_orders', 'Sales Order'],
  ['container_jobs', 'Container Job'],
  ['finance', 'Finance'],
  ['driver_commissions', 'Komisi Sopir'],
  ['master_data', 'Master Data'],
  ['vehicles', 'Truck'],
  ['vehicle_documents', 'Dokumen Kendaraan'],
  ['reports', 'Reports'],
  ['storage', 'Storage'],
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
  if (item.action === 'ADMIN_CORRECTION_CONTAINER_JOB') {
    const reference = [
      metadata.soNumber,
      metadata.containerNumber,
    ].filter(Boolean).join(' / ');
    return [
      reference || item.target || 'Container Job',
      metadata.adminCorrectionReason ? `Alasan: ${metadata.adminCorrectionReason}` : '',
    ].filter(Boolean).join(' - ');
  }
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
