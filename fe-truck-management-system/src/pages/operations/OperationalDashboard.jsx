import { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Truck,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { initialSalesOrders } from '../../data/salesOrders';
import { useArchiveData } from '../../hooks/useArchiveData';
import { formatShortDate, getOperationalDashboardData, normalizeSize } from '../../data/operationalDashboard';

function routeView(job) {
  return (
    <strong className="queue-route-inline">
      <span>{job.origin}</span>
      <ArrowRight size={15} aria-hidden="true" />
      <span>{job.destination}</span>
    </strong>
  );
}

function OperationalDashboard() {
  const [activeDashboard, setActiveDashboard] = useState('existing');
  const [selectedProspectGroup, setSelectedProspectGroup] = useState(null);
  const [selectedExistingJob, setSelectedExistingJob] = useState(null);
  const archive = useArchiveData();
  const hasLiveOrders = archive.isDatabaseMode && archive.orders.length > 0;
  const salesOrders = archive.isDatabaseMode ? archive.orders : initialSalesOrders;
  const {
    activeJobs,
    visibleFutureJobs,
    prospectSchedule,
    assignedActiveJobs,
    prospectTwentyFt,
    prospectFortyFt,
    nextSchedule,
  } = getOperationalDashboardData(salesOrders, {
    hasLiveOrders,
    allowDemoFallback: !archive.isDatabaseMode,
  });

  return (
    <div className="page operational-dashboard-page">
      <PageHeader
        eyebrow="Operational Control"
        title="Dashboard Operational"
        description="Pantau eksisting hari ini dan prospek jadwal truck/container mendatang."
        actions={
          <Link className="primary-button" to="/operations">
            <ClipboardCheck size={17} /> Buka Proses Operational
          </Link>
        }
      />

      <div className="ops-dashboard-switch" role="tablist" aria-label="Pilih dashboard operational">
        <button type="button" className={activeDashboard === 'existing' ? 'active' : ''} onClick={() => setActiveDashboard('existing')}>
          <Truck size={16} /> Eksisting
        </button>
        <button type="button" className={activeDashboard === 'prospect' ? 'active' : ''} onClick={() => setActiveDashboard('prospect')}>
          <CalendarDays size={16} /> Prospek
        </button>
      </div>

      {activeDashboard === 'existing' ? (
        <section className="ops-dashboard-shell" aria-label="Dashboard Eksisting">
          <div className="operational-overview operational-overview-tight ops-kpi-grid ops-existing-kpi-grid">
            <div className="operational-kpi">
              <span className="kpi-icon"><Truck size={20} /></span>
              <div><span>Container Aktif</span><strong>{activeJobs.length}</strong><small>Truck/container belum selesai</small></div>
            </div>
            <div className="operational-kpi">
              <span className="kpi-icon"><ClipboardCheck size={20} /></span>
              <div><span>Sudah Assign</span><strong>{assignedActiveJobs}</strong><small>Truck sudah dipilih</small></div>
            </div>
          </div>

          <section className="panel ops-today-panel">
            <div className="panel-header ops-panel-header">
              <div><h2>Eksisting Aktif</h2><p>Fokus operator: container, truck, driver, rute, dan status yang belum selesai.</p></div>
            </div>
            <div className="ops-today-list">
              {activeJobs.length ? activeJobs.map((job) => (
                <article className="ops-job-row" key={job.id}>
                  <div className="ops-job-main">
                    <span>Customer</span>
                    <strong>{job.customer || '-'}</strong>
                    <small>Sales: {job.salesName || job.createdBy || '-'}</small>
                  </div>
                  <div className="ops-job-main">
                    <span>Container</span>
                    <strong>{job.containerNumber}</strong>
                    <small>{normalizeSize(job.size) || '-'}</small>
                  </div>
                  <div className="ops-job-truck">
                    <span><Truck size={14} /> Truck</span>
                    <strong>{job.plateNumber || 'Belum dipilih'}</strong>
                    <small>{job.driver || 'Driver otomatis belum ada'}</small>
                  </div>
                  <div className="ops-job-route">
                    <span>{formatShortDate(job.tripDate)}</span>
                    {routeView(job)}
                  </div>
                  <button className="secondary-button ops-detail-button" type="button" onClick={() => setSelectedExistingJob(job)}>Detail</button>
                </article>
              )) : (
                <div className="empty-state compact-empty">Belum ada truck/container aktif.</div>
              )}
            </div>
          </section>
        </section>
      ) : (
        <section className="ops-dashboard-shell" aria-label="Dashboard Prospek">
          <div className="operational-overview operational-overview-tight ops-kpi-grid">
            <div className="operational-kpi">
              <span className="kpi-icon"><CalendarDays size={20} /></span>
              <div><span>Total Prospek</span><strong>{visibleFutureJobs.length}</strong><small>Estimasi truck/container mendatang</small></div>
            </div>
            <div className="operational-kpi">
              <span className="kpi-icon"><CalendarDays size={20} /></span>
              <div><span>Tanggal Terdekat</span><strong className="kpi-date-value">{nextSchedule ? formatShortDate(nextSchedule.tripDate) : '-'}</strong><small>{nextSchedule ? `${nextSchedule.totalContainers} truck/container` : 'Belum ada prospek'}</small></div>
            </div>
            <div className="operational-kpi">
              <span className="kpi-icon"><Truck size={20} /></span>
              <div><span>20FT</span><strong>{prospectTwentyFt}</strong><small>Container ukuran 20FT</small></div>
            </div>
            <div className="operational-kpi">
              <span className="kpi-icon"><Truck size={20} /></span>
              <div><span>40FT</span><strong>{prospectFortyFt}</strong><small>Container ukuran 40FT</small></div>
            </div>
          </div>

          <section className="panel ops-side-panel ops-prospect-panel">
            <div className="panel-header ops-panel-header">
              <div><h2>Prospek Jadwal</h2><p>Jumlah truck/container yang akan jalan per tanggal.</p></div>
            </div>            <div className="ops-prospect-table">
              <div className="ops-prospect-head" aria-hidden="true">
                <span>Tanggal</span>
                <span>Customer</span>
                <span>Sales Input</span>
                <span>Order</span>
                <span>Truck/Container</span>
                <span>20FT</span>
                <span>40FT</span>
                <span>Detail</span>
              </div>
              <div className="ops-schedule-list ops-schedule-list-wide">
                {prospectSchedule.length ? prospectSchedule.map((group) => (
                  <div className="ops-schedule-row" key={group.tripDateKey}>
                    <strong>{formatShortDate(group.tripDate)}</strong>
                    <span>{group.customerSummary}</span>
                    <span>{group.salesSummary}</span>
                    <span>{group.totalOrders} order</span>
                    <span>{group.totalContainers} truck/container</span>
                    <span>{group.twentyFt} x 20FT</span>
                    <span>{group.fortyFt} x 40FT</span>
                    <button className="secondary-button ops-detail-button" type="button" onClick={() => setSelectedProspectGroup(group)}>Detail</button>
                  </div>
                )) : (
                  <div className="empty-state compact-empty">Belum ada rencana truck mendatang.</div>
                )}
              </div>
            </div>
          </section>
        </section>
      )}

      {selectedExistingJob ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedExistingJob(null)}>
          <section className="ops-trip-modal ops-prospect-modal" role="dialog" aria-modal="true" aria-labelledby="existing-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Detail Eksisting</span>
                <h2 id="existing-detail-title">{selectedExistingJob.containerNumber || '-'}</h2>
                <p>{selectedExistingJob.customer || '-'} - {formatShortDate(selectedExistingJob.tripDate)}</p>
              </div>
              <button type="button" onClick={() => setSelectedExistingJob(null)} aria-label="Tutup detail"><X size={19} /></button>
            </header>

            <div className="ops-prospect-detail-list">
              <article className="ops-prospect-detail-row">
                <div>
                  <span>Customer</span>
                  <strong>{selectedExistingJob.customer || '-'}</strong>
                  <small>{selectedExistingJob.soNumber || '-'}</small>
                </div>
                <div>
                  <span>Truck</span>
                  <strong>{selectedExistingJob.plateNumber || 'Belum dipilih'}</strong>
                  <small>{selectedExistingJob.driver || 'Driver otomatis belum ada'}</small>
                </div>
                <div>
                  <span>Rute</span>
                  {routeView(selectedExistingJob)}
                  <small>{selectedExistingJob.shipment || '-'}</small>
                </div>
                <div>
                  <span>Status</span>
                  <strong><StatusBadge status={selectedExistingJob.status} /></strong>
                  <small>{normalizeSize(selectedExistingJob.size) || '-'}</small>
                </div>
              </article>
              <article className="ops-prospect-detail-row">
                <div>
                  <span>Sales Input</span>
                  <strong>{selectedExistingJob.salesName || selectedExistingJob.createdBy || '-'}</strong>
                  <small>Input order</small>
                </div>
                <div>
                  <span>Surat Jalan</span>
                  <strong>{selectedExistingJob.travelDocument || 'Belum tersedia'}</strong>
                  <small>Dokumen perjalanan</small>
                </div>
                <div>
                  <span>Surat Timbang</span>
                  <strong>{selectedExistingJob.weighingDocument || 'Belum tersedia'}</strong>
                  <small>Dokumen timbang</small>
                </div>
                <div>
                  <span>Catatan</span>
                  <strong>{selectedExistingJob.notes || 'Tidak ada catatan'}</strong>
                  <small>{selectedExistingJob.updatedBy ? `Update: ${selectedExistingJob.updatedBy}` : 'Belum ada update'}</small>
                </div>
              </article>
            </div>

            <footer>
              <button className="secondary-button" type="button" onClick={() => setSelectedExistingJob(null)}>Tutup</button>
              <Link className="primary-button" to="/operations">Buka Proses Operational</Link>
            </footer>
          </section>
        </div>
      ) : null}
      {selectedProspectGroup ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedProspectGroup(null)}>
          <section className="ops-trip-modal ops-prospect-modal" role="dialog" aria-modal="true" aria-labelledby="prospect-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Detail Prospek</span>
                <h2 id="prospect-detail-title">{formatShortDate(selectedProspectGroup.tripDate)}</h2>
                <p>{selectedProspectGroup.totalOrders} order - {selectedProspectGroup.totalContainers} truck/container</p>
              </div>
              <button type="button" onClick={() => setSelectedProspectGroup(null)} aria-label="Tutup detail"><X size={19} /></button>
            </header>

            <div className="ops-prospect-detail-list">
              {selectedProspectGroup.jobs.map((job) => (
                <article className="ops-prospect-detail-row" key={job.id}>
                  <div>
                    <span>Customer</span>
                    <strong>{job.customer || '-'}</strong>
                    <small>{job.soNumber || '-'}</small>
                  </div>
                  <div>
                    <span>Sales Input</span>
                    <strong>{job.salesName || job.createdBy || '-'}</strong>
                    <small>{job.shipment || '-'}</small>
                  </div>
                  <div>
                    <span>Rute</span>
                    {routeView(job)}
                    <small>{job.containerNumber || 'Container belum diisi'}</small>
                  </div>
                  <div>
                    <span>Size</span>
                    <strong>{normalizeSize(job.size) || '-'}</strong>
                    <small>{job.notes || 'Tidak ada catatan'}</small>
                  </div>
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

export default OperationalDashboard;









