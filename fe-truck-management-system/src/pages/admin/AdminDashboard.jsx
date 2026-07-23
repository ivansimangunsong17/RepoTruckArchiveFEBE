import { useState } from 'react';
import { AlertCircle, Archive, CalendarDays, ClipboardList, Database, FileWarning, Truck, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { useArchiveData } from '../../hooks/useArchiveData';
import {
  formatShortDate,
  getOperationalDashboardData,
  getTripDate,
  isAssigned,
  isCompleted,
  isRunning,
  normalizeSize,
} from '../../data/operationalDashboard';

function AdminMetric({ icon: Icon, label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`admin-metric-card ${tone}`}>
      <span><Icon size={18} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function routeText(job) {
  return `${job.origin || '-'} - ${job.destination || '-'}`;
}

function rpujStatusText(status) {
  if (status === 'paid') return 'UJ dikirim';
  if (status === 'approved') return 'Disetujui Finance';
  if (status === 'submitted') return 'Menunggu Finance';
  if (status === 'rejected') return 'Ditolak Finance';
  return 'Belum diajukan';
}

function AdminDashboard() {
  const [activeOpsView, setActiveOpsView] = useState('existing');
  const [selectedExistingJob, setSelectedExistingJob] = useState(null);
  const [selectedProspectGroup, setSelectedProspectGroup] = useState(null);
  const archive = useArchiveData();
  const orders = archive.orders || [];
  const masters = archive.masters || {};
  const hasLiveOrders = archive.isDatabaseMode && orders.length > 0;
  const {
    jobs,
    activeJobs,
    visibleFutureJobs,
    prospectSchedule,
  } = getOperationalDashboardData(orders, {
    hasLiveOrders,
    allowDemoFallback: !archive.isDatabaseMode,
  });

  const activeOrders = orders.filter((order) => order.status !== 'cancelled');
  const cancelledOrders = orders.filter((order) => order.status === 'cancelled');
  const assignedJobs = jobs.filter(isAssigned);
  const completedJobs = jobs.filter(isCompleted);
  const runningJobs = activeJobs.filter(isRunning);
  const existingJobs = activeJobs;
  const assignedActiveJobs = activeJobs.filter(isAssigned);
  const prospectJobs = visibleFutureJobs;
  const incompleteDocs = jobs.filter((job) => (
    !job.travelDocument
    || !(job.tilaGatepassDocument || job.unloadingVoucher || job.weighingDocument)
    || !job.spkNumber
  ));
  const completionRate = jobs.length ? Math.round((completedJobs.length / jobs.length) * 100) : 0;
  const assignmentRate = jobs.length ? Math.round((assignedJobs.length / jobs.length) * 100) : 0;

  const visibleProspectSchedule = prospectSchedule.slice(0, 5);

  const masterCards = [
    {
      label: 'Customer',
      value: masters.customers?.length || 0,
      detail: 'Data customer dan PIC untuk pembuatan Sales Order.',
      meta: `${activeOrders.length} SO aktif`,
      href: '/clients',
      icon: Users,
    },
    {
      label: 'Truck',
      value: masters.trucks?.length || 0,
      detail: 'Unit armada yang dapat dipilih oleh Operational.',
      meta: `${assignedJobs.length} container sudah assign`,
      href: '/trucks',
      icon: Truck,
    },
    {
      label: 'Driver',
      value: masters.drivers?.length || 0,
      detail: 'Sopir tetap yang melekat pada data truck.',
      meta: `${runningJobs.length} container berjalan`,
      href: '/drivers',
      icon: Users,
    },
    {
      label: 'User',
      value: masters.users?.length || 0,
      detail: 'Akun role Admin, Sales, Operational, dan Management.',
      meta: `${cancelledOrders.length} SO batal`,
      href: '/users',
      icon: Users,
    },
  ];

  const attentionRows = [
    ...prospectJobs.map((job) => ({
      title: job.containerNumber || job.order?.soNumber || 'Container belum diisi',
      meta: `${job.customer || '-'} - ${formatShortDate(job.tripDate)}`,
      type: 'Perlu Assign',
      href: '/operations',
    })),
    ...incompleteDocs.map((job) => ({
      title: job.containerNumber || job.order?.soNumber || 'Container belum diisi',
      meta: `${job.customer || '-'} - dokumen belum lengkap`,
      type: 'Dokumen',
      href: '/operations',
    })),
  ];

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || b.receivedAt || 0) - new Date(a.updatedAt || a.createdAt || a.receivedAt || 0));

  return (
    <div className="page admin-dashboard-page admin-dashboard-pro">
      <PageHeader
        eyebrow="System Administration"
        title="Dashboard Admin"
        description="Control center untuk memantau order, operational, master data, dokumen, dan aktivitas sistem."
        actions={<Link className="primary-button" to="/settings"><Database size={17} /> Pengaturan Sistem</Link>}
      />

      {archive.error ? <div className="admin-alert"><AlertCircle size={17} /> {archive.error}</div> : null}

      <section className="admin-control-band">
        <div>
          <span>System Overview</span>
          <h2>{activeOrders.length} SO aktif, {jobs.length} container tercatat</h2>
          <p>{incompleteDocs.length} dokumen perlu dicek, {prospectJobs.length} container menunggu assignment.</p>
        </div>
        <div className="admin-control-stats">
          <span><strong>{assignmentRate}%</strong> Assign Rate</span>
          <span><strong>{completionRate}%</strong> Completion</span>
          <span><strong>{cancelledOrders.length}</strong> Cancelled SO</span>
        </div>
      </section>

      <section className="admin-metric-grid pro">
        <AdminMetric icon={ClipboardList} label="Sales Order Aktif" value={activeOrders.length} detail={`${jobs.length} container dari seluruh SO`} tone="red" />
        <AdminMetric icon={Truck} label="Operational Aktif" value={existingJobs.length} detail={`${assignedActiveJobs.length} sudah assign, ${runningJobs.length} berjalan`} tone="blue" />
        <AdminMetric icon={CalendarDays} label="Prospek / Planning" value={prospectJobs.length} detail="Container belum punya truck atau driver" tone="amber" />
        <AdminMetric icon={FileWarning} label="Dokumen Belum Lengkap" value={incompleteDocs.length} detail="SPK, surat jalan, atau surat timbang" tone="red" />
      </section>


      <section className="panel admin-panel admin-ops-separated-panel">
        <div className="panel-header compact">
          <div><h2>Snapshot Operational</h2><p>Data Eksisting dan Prospek dipisah seperti dashboard ops.</p></div>
          <Link to="/operations">Buka Ops</Link>
        </div>
        <div className="ops-dashboard-switch admin-ops-switch" role="tablist" aria-label="Pilih snapshot operational admin">
          <button type="button" className={activeOpsView === 'existing' ? 'active' : ''} onClick={() => setActiveOpsView('existing')}><Truck size={16} /> Eksisting</button>
          <button type="button" className={activeOpsView === 'prospect' ? 'active' : ''} onClick={() => setActiveOpsView('prospect')}><CalendarDays size={16} /> Prospek</button>
        </div>

        {activeOpsView === 'existing' ? (
          <div className="admin-ops-list">
            {existingJobs.length ? existingJobs.slice(0, 6).map((job) => (
              <div key={job.id || job.containerNumber}>
                <div><strong>{job.customer || '-'}</strong><small>Sales: {job.salesName || '-'}</small></div>
                <div><strong>{job.containerNumber || '-'}</strong><small>{normalizeSize(job.size) || '-'}</small></div>
                <div><strong>{job.plateNumber || 'Belum dipilih'}</strong><small>{job.driver || 'Driver belum ada'}</small></div>
                <button className="secondary-button ops-detail-button" type="button" onClick={() => setSelectedExistingJob(job)}>Detail</button>
              </div>
            )) : <div className="empty-state compact-empty">Belum ada truck/container aktif.</div>}
          </div>
        ) : (
          <div className="admin-prospect-mini-table">
            <div className="admin-prospect-mini-head"><span>Tanggal</span><span>Customer</span><span>Order</span><span>Container</span><span>20FT</span><span>40FT</span><span>Detail</span></div>
            {visibleProspectSchedule.length ? visibleProspectSchedule.map((group) => (
              <div className="admin-prospect-mini-row" key={group.dateKey}>
                <strong>{formatShortDate(group.tripDate)}</strong>
                <span>{group.shortCustomerSummary || group.customerSummary}</span>
                <span>{group.orderCount} order</span>
                <span>{group.totalContainers}</span>
                <span>{group.twentyFt}</span>
                <span>{group.fortyFt}</span>
                <button className="secondary-button ops-detail-button" type="button" onClick={() => setSelectedProspectGroup(group)}>Detail</button>
              </div>
            )) : <div className="empty-state compact-empty">Belum ada prospek mendatang.</div>}
          </div>
        )}
      </section>

      <section className="panel admin-panel admin-master-panel admin-master-detail-panel">
        <div className="panel-header compact"><div><h2>Master Data</h2><p>Kesiapan data dasar untuk Sales dan Operational.</p></div></div>
        <div className="admin-master-card-grid">
          {masterCards.map((item) => {
            const Icon = item.icon;
            return (
              <Link to={item.href} className="admin-master-card" key={item.label}>
                <span className="admin-master-card-icon"><Icon size={18} /></span>
                <div>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                </div>
                <em>{item.meta}</em>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="admin-main-grid lower">
        <article className="panel admin-panel admin-table-panel">
          <div className="panel-header compact"><div><h2>Perlu Perhatian</h2><p>{attentionRows.length} item prioritas yang layak dicek admin.</p></div></div>
          <div className="admin-attention-list pro">
            {attentionRows.length ? attentionRows.map((row, index) => (
              <Link to={row.href} key={`${row.title}-${index}`}>
                <span>{row.type}</span>
                <strong>{row.title}</strong>
                <small>{row.meta}</small>
              </Link>
            )) : <div className="empty-state compact-empty">Tidak ada item prioritas.</div>}
          </div>
        </article>

        <article className="panel admin-panel admin-table-panel">
          <div className="panel-header compact"><div><h2>Order Terbaru</h2><p>{recentOrders.length} update terakhir dari Sales dan Operational.</p></div></div>
          <div className="admin-order-list pro">
            {recentOrders.map((order) => (
              <div key={order.id}>
                <div><strong>{order.soNumber}</strong><small>{order.customer}</small></div>
                <div><span>{formatShortDate(getTripDate(order))}</span><small>{order.salesName || order.createdBy || '-'}</small></div>
                <StatusBadge status={order.status} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel admin-panel admin-shortcut-panel">
        <div className="panel-header compact"><div><h2>Akses Cepat Admin</h2><p>Halaman inti untuk mengatur dan mengawasi sistem.</p></div></div>
        <div className="admin-shortcut-grid pro">
          <Link to="/sales-orders"><ClipboardList size={17} /> Sales Order</Link>
          <Link to="/operations"><Truck size={17} /> Operational</Link>
          <Link to="/trucks"><Truck size={17} /> Truck</Link>
          <Link to="/drivers"><Users size={17} /> Driver</Link>
          <Link to="/clients"><Users size={17} /> Customer</Link>
          <Link to="/activity-log"><Archive size={17} /> Activity Log</Link>
        </div>
      </section>

      {selectedExistingJob ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedExistingJob(null)}>
          <section className="ops-trip-modal ops-prospect-modal" role="dialog" aria-modal="true" aria-labelledby="admin-existing-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Detail Eksisting</span>
                <h2 id="admin-existing-detail-title">{selectedExistingJob.containerNumber || '-'}</h2>
                <p>{selectedExistingJob.customer || '-'} - {formatShortDate(selectedExistingJob.tripDate)}</p>
              </div>
              <button type="button" onClick={() => setSelectedExistingJob(null)} aria-label="Tutup detail"><X size={19} /></button>
            </header>
            <div className="ops-prospect-detail-list">
              <article className="ops-prospect-detail-row">
                <div><span>Customer</span><strong>{selectedExistingJob.customer || '-'}</strong><small>{selectedExistingJob.soNumber || '-'}</small></div>
                <div><span>Sales Input</span><strong>{selectedExistingJob.salesName || selectedExistingJob.createdBy || '-'}</strong><small>{selectedExistingJob.shipment || '-'}</small></div>
                <div><span>Truck</span><strong>{selectedExistingJob.plateNumber || 'Belum dipilih'}</strong><small>{selectedExistingJob.driver || 'Driver belum ada'}</small></div>
                <div><span>Rute</span><strong>{routeText(selectedExistingJob)}</strong><small>{normalizeSize(selectedExistingJob.size) || '-'}</small></div>
              </article>
              <article className="ops-prospect-detail-row">
                <div><span>Status</span><strong><StatusBadge status={selectedExistingJob.status} /></strong><small>Status container</small></div>
                <div><span>Surat Jalan</span><strong>{selectedExistingJob.travelDocument || 'Belum tersedia'}</strong><small>Dokumen perjalanan</small></div>
                <div><span>TILA / Delivery Card / Gatepass / SP2</span><strong>{selectedExistingJob.tilaGatepassDocument || selectedExistingJob.unloadingVoucher || selectedExistingJob.weighingDocument || 'Belum tersedia'}</strong><small>Dokumen operasional</small></div>
                <div><span>Catatan</span><strong>{selectedExistingJob.notes || 'Tidak ada catatan'}</strong><small>{selectedExistingJob.updatedBy ? `Update: ${selectedExistingJob.updatedBy}` : 'Belum ada update'}</small></div>
              </article>
              <article className="ops-prospect-detail-row">
                <div><span>Status RPUJ</span><strong>{rpujStatusText(selectedExistingJob.rpujStatus)}</strong><small>{selectedExistingJob.rpujReviewedBy ? `Review: ${selectedExistingJob.rpujReviewedBy}` : 'Pengajuan uang jalan'}</small></div>
                <div><span>Alasan Reject RPUJ</span><strong>{selectedExistingJob.rpujRejectionNote || '-'}</strong><small>{selectedExistingJob.rpujStatus === 'rejected' ? 'Perlu revisi Operational' : 'Tidak ada reject aktif'}</small></div>
                <div><span>No. SPK</span><strong>{selectedExistingJob.spkNumber || 'Belum tersedia'}</strong><small>Dokumen perintah kerja</small></div>
                <div><span>Bukti Transfer UJ</span><strong>{selectedExistingJob.rpujTransferProof?.name || 'Belum tersedia'}</strong><small>{selectedExistingJob.rpujTransferUploadedBy ? `Upload: ${selectedExistingJob.rpujTransferUploadedBy}` : 'Finance'}</small></div>
              </article>
            </div>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setSelectedExistingJob(null)}>Tutup</button>
              <Link className="primary-button" to="/operations">Buka Ops</Link>
            </footer>
          </section>
        </div>
      ) : null}

      {selectedProspectGroup ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedProspectGroup(null)}>
          <section className="ops-trip-modal ops-prospect-modal" role="dialog" aria-modal="true" aria-labelledby="admin-prospect-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Detail Prospek</span>
                <h2 id="admin-prospect-detail-title">{formatShortDate(selectedProspectGroup.tripDate)}</h2>
                <p>{selectedProspectGroup.totalOrders} order - {selectedProspectGroup.totalContainers} truck/container</p>
              </div>
              <button type="button" onClick={() => setSelectedProspectGroup(null)} aria-label="Tutup detail"><X size={19} /></button>
            </header>
            <div className="ops-prospect-detail-list">
              {selectedProspectGroup.jobs.map((job) => (
                <article className="ops-prospect-detail-row" key={job.id}>
                  <div><span>Customer</span><strong>{job.customer || '-'}</strong><small>{job.soNumber || '-'}</small></div>
                  <div><span>Sales Input</span><strong>{job.salesName || job.createdBy || '-'}</strong><small>{job.shipment || '-'}</small></div>
                  <div><span>Rute</span><strong>{routeText(job)}</strong><small>{job.containerNumber || 'Container belum diisi'}</small></div>
                  <div><span>Size</span><strong>{normalizeSize(job.size) || '-'}</strong><small>{job.notes || 'Tidak ada catatan'}</small></div>
                </article>
              ))}
            </div>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setSelectedProspectGroup(null)}>Tutup</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default AdminDashboard;



