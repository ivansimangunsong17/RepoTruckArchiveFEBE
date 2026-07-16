import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileText,
  X,
  Search,
  Truck,
  UserRound,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import OperationalForm from '../../components/forms/OperationalForm';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { USER_ROLES, hasPermission } from '../../constants/roles';
import { useArchiveData } from '../../hooks/useArchiveData';
import { formatDateTime } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import DocumentLink from '../../components/common/DocumentLink';
import FilterStatus from '../../components/common/FilterStatus';
import UjRecommendationCard from '../../components/operations/UjRecommendationCard';
import { parseOtherCost } from '../../utils/otherCost';
import { cancelContainerJob, fetchContainerJobsPage, generateContainerJobSpk } from '../../services/archive/containerJobService';

const PAGE_SIZE = 8;
const STATUS_ORDER = { received: 0, running: 1, completed: 2, cancelled: 3 };

function getStatusOrder(status) {
  return STATUS_ORDER[status] ?? Number.MAX_SAFE_INTEGER;
}

function formatShipmentLabel(value) {
  const shipmentMap = {
    import: 'Import',
    export: 'Export',
    'domestik inward': 'Domestik Inward',
    'domestik outward': 'Domestik Outward',
  };
  return shipmentMap[String(value || '').toLowerCase()] || value || '-';
}

function sortOperationalJobs(rows) {
  return [...rows].sort((left, right) => {
    const statusDiff = getStatusOrder(left.status) - getStatusOrder(right.status);
    if (statusDiff !== 0) return statusDiff;
    return new Date(left.tripDate || left.receivedAt || left.createdAt || 0) - new Date(right.tripDate || right.receivedAt || right.createdAt || 0);
  });
}

function documentState(job) {
  const required = [
    job.loadingVoucherDocument,
    job.tilaGatepassDocumentFile || job.unloadingVoucherDocument || job.weighingDocumentFile,
    job.travelDocumentFile,
  ];
  return { completed: required.filter(Boolean).length, total: required.length || 1 };
}

function containerLabel(job) {
  return job?.containerNumber || 'Container belum diisi';
}

function otherCostValue(job) {
  const otherCost = parseOtherCost(job?.rpujNotes);
  return {
    amount: otherCost.amount,
    notes: otherCost.notes || '-',
    amountLabel: otherCost.amount ? formatCurrency(otherCost.amount) : '-',
  };
}

function flattenDemoJobs(orders) {
  return orders.filter((order) => order.status !== 'cancelled').flatMap((order) => order.containers.map((container) => ({
    qty20ft: order.containers.filter((item) => String(item.size || '').toUpperCase().replace(/\s/g, '') === '20FT').length,
    qty40ft: order.containers.filter((item) => String(item.size || '').toUpperCase().replace(/\s/g, '') === '40FT').length,
    ...container,
    orderId: order.id,
    soNumber: order.soNumber,
    doNumber: order.doNumber,
    customer: order.customer,
    shipment: order.shipment,
    jobType: order.jobType,
    vesselName: order.vesselName || order.shipName || order.namaKapal,
    origin: order.origin,
    destination: order.destination,
    tripDate: order.tripDate || order.plannedDate || order.soDate || order.receivedAt,
    salesName: order.salesName || order.createdBy,
    createdBy: order.createdBy,
    updatedBy: container.updatedBy || order.updatedBy,
    updatedAt: container.updatedAt || order.updatedAt,
  })));
}

function flattenPendingCancelJobs(orders) {
  return orders.filter(Boolean).flatMap((order) => (order.containers || []).filter((container) => container.cancelRequestStatus === 'submitted').map((container) => ({
    ...container,
    orderId: order.id,
    soNumber: order.soNumber,
    doNumber: order.doNumber,
    customer: order.customer,
    shipment: order.shipment,
    jobType: order.jobType,
    vesselName: order.vesselName || order.shipName || order.namaKapal,
    origin: order.origin,
    destination: order.destination,
    tripDate: order.tripDate || order.plannedDate || order.soDate || order.receivedAt,
    salesName: order.salesName || order.createdBy,
    createdBy: order.createdBy,
    updatedBy: container.updatedBy || order.updatedBy,
    updatedAt: container.updatedAt || order.updatedAt,
  })));
}

function OperationsPage() {
  const { user } = useAuth();
  const { notify, confirmAction } = useFeedback();
  const archive = useArchiveData();
  const [databaseJobs, setDatabaseJobs] = useState([]);
  const [pendingDatabaseJobs, setPendingDatabaseJobs] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ received: 0, running: 0, completed: 0, cancelled: 0 });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(archive.isDatabaseMode);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const canEdit = hasPermission(user, 'operations.update');
  const canReviewCancel = canEdit || user?.role === USER_ROLES.ADMIN;
  const canViewDocuments = hasPermission(user, 'documents.operational.read');
  const detailOtherCost = otherCostValue(detail);

  useEffect(() => {
    if (!detail) return undefined;

    function closeDetailOnEscape(event) {
      if (event.key === 'Escape') setDetail(null);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeDetailOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeDetailOnEscape);
    };
  }, [detail]);

  const demoJobs = useMemo(() => flattenDemoJobs(archive.orders), [archive.orders]);
  const filteredDemoJobs = useMemo(() => sortOperationalJobs(demoJobs.filter((job) => {
    const matchesQuery = !query || [
      job.soNumber, job.doNumber, job.customer, job.containerNumber, job.driver, job.plateNumber,
    ].some((value) => value?.toLowerCase().includes(query.toLowerCase()));
    return matchesQuery && (!status || job.status === status);
  })), [demoJobs, query, status]);

  const jobs = archive.isDatabaseMode
    ? sortOperationalJobs(databaseJobs)
    : filteredDemoJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const counts = archive.isDatabaseMode ? statusCounts : {
    received: demoJobs.filter((job) => job.status === 'received').length,
    running: demoJobs.filter((job) => job.status === 'running').length,
    completed: demoJobs.filter((job) => job.status === 'completed').length,
    cancelled: demoJobs.filter((job) => job.status === 'cancelled').length,
  };
  const totalJobs = (counts.received || 0) + (counts.running || 0) + (counts.completed || 0) + (counts.cancelled || 0);
  const totalItems = archive.isDatabaseMode ? serverTotal : filteredDemoJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pendingCancelJobs = useMemo(() => (
    (archive.isDatabaseMode ? pendingDatabaseJobs : flattenPendingCancelJobs(archive.orders || []))
      .filter((job) => job && job.cancelRequestStatus === 'submitted')
  ), [archive.isDatabaseMode, archive.orders, pendingDatabaseJobs]);

  useEffect(() => {
    setPage(1);
  }, [query, status]);

  useEffect(() => {
    if (!archive.isDatabaseMode) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const result = await fetchContainerJobsPage({ page, pageSize: PAGE_SIZE, query, status });
        if (!active) return;
        setDatabaseJobs(result.rows);
        setServerTotal(result.total);
        setStatusCounts({ received: 0, running: 0, completed: 0, cancelled: 0, ...result.counts });
      } catch (requestError) {
        if (!active) return;
        setDatabaseJobs([]);
        setServerTotal(0);
        setStatusCounts({ received: 0, running: 0, completed: 0, cancelled: 0 });
        setError(requestError.message || 'Data Container Job gagal dimuat dari database.');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [archive.isDatabaseMode, listVersion, page, query, status]);

  useEffect(() => {
    if (!archive.isDatabaseMode) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchContainerJobsPage({ page: 1, pageSize: 100, requestStatus: 'submitted' });
        if (!active) return;
        setPendingDatabaseJobs(result.rows || []);
      } catch {
        if (!active) return;
        setPendingDatabaseJobs([]);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [archive.isDatabaseMode, listVersion]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function updateOperational(form) {
    const containerNumber = form.containerNumber || containerLabel(editing);
    try {
      const saved = await archive.updateJob(editing.id, form);
      if (archive.isDatabaseMode) {
        if (saved) {
          setDatabaseJobs((current) => current.map((job) => (job.id === saved.id ? saved : job)));
        }
        setListVersion((value) => value + 1);
      }
      setEditing(null);
      notify({
        title: 'Proses Operational diperbarui',
        message: `${containerNumber} berhasil disimpan dengan status ${form.status === 'completed' ? 'Selesai' : form.status === 'running' ? 'Sedang Jalan' : 'Belum Jalan'}.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Proses gagal disimpan', message: requestError.message });
    }
  }

  async function generateOperationalSpk(form) {
    if (!editing?.id) {
      throw new Error('Container Job belum dipilih.');
    }

    const saved = await generateContainerJobSpk(editing.id, {
      ...form,
      updatedBy: user?.fullName || user?.name || 'Operational',
    });

    setEditing((current) => (current?.id === saved.id ? { ...current, ...saved } : current));
    setDetail((current) => (current?.id === saved.id ? { ...current, ...saved } : current));
    if (archive.isDatabaseMode) setListVersion((value) => value + 1);
    return saved;
  }

  async function cancelOperational(job) {
    const confirmed = await confirmAction({
      title: 'Batalkan Container Job?',
      message: `${containerLabel(job)} akan ditandai batal dan tidak masuk pekerjaan aktif.`,
      confirmLabel: 'Batalkan Job',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      if (archive.isDatabaseMode) {
        await cancelContainerJob(job.id, user?.fullName || user?.name || 'Operational');
        setListVersion((value) => value + 1);
      } else {
        await archive.updateJob(job.id, { status: 'cancelled' });
      }
      setDetail(null);
      notify({
        title: 'Container Job dibatalkan',
        message: `${containerLabel(job)} berhasil ditandai batal.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Container Job gagal dibatalkan', message: requestError.message });
    }
  }

  async function approveJobCancellation(job) {
    const confirmed = await confirmAction({
      title: 'Setujui pembatalan?',
      message: `${job.containerNumber || 'Container ini'} akan dibatalkan dan keluar dari antrean operational.`,
      confirmLabel: 'Setujui',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await archive.reviewJobCancellation(job.id, { approved: true, cancelReviewNote: '' });
      if (archive.isDatabaseMode) setListVersion((value) => value + 1);
      notify({ title: 'Pembatalan disetujui', message: `${job.containerNumber || 'Container'} dibatalkan oleh Ops.` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Approval gagal', message: requestError.message });
    }
  }

  async function rejectJobCancellation(job) {
    const confirmed = await confirmAction({
      title: 'Tolak pembatalan?',
      message: `${job.containerNumber || 'Container ini'} tetap berjalan dan request akan ditandai ditolak.`,
      confirmLabel: 'Tolak',
      tone: 'warning',
    });
    if (!confirmed) return;

    try {
      await archive.reviewJobCancellation(job.id, { approved: false, cancelReviewNote: '' });
      notify({ title: 'Pembatalan ditolak', message: `${job.containerNumber || 'Container'} tetap aktif.` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Penolakan gagal', message: requestError.message });
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Operational" title="Container Job" description="Kelola assignment, dokumen operasional, status, dan timeline setiap container." />

      {canReviewCancel && pendingCancelJobs.length ? (
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Permintaan Pembatalan Container</h3>
              <small style={{ color: 'var(--text-muted, #64748b)' }}>{pendingCancelJobs.length} menunggu approval</small>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {pendingCancelJobs.slice(0, 5).map((job) => (
              <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{job.containerNumber || '-'}</strong>
                    <StatusBadge status={job.cancelRequestStatus} />
                  </div>
                  <div style={{ marginTop: 4, color: '#334155', fontSize: '.9rem' }}>{job.soNumber || '-'} - {job.customer || '-'}</div>
                  <div style={{ marginTop: 3, color: '#64748b', fontSize: '.82rem' }}>{job.cancelRequestNote || 'Tidak ada catatan'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="secondary-button" type="button" onClick={() => rejectJobCancellation(job)}>
                    <X size={16} /> Tolak
                  </button>
                  <button className="danger-button" type="button" onClick={() => approveJobCancellation(job)}>
                    <CheckCircle2 size={16} /> Setujui
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="quick-stats operational-stats">
        <div><span>Belum Jalan</span><strong>{counts.received}</strong><small>Menunggu truck dan driver</small></div>
        <div><span>Sedang Jalan</span><strong>{counts.running}</strong><small>Dalam perjalanan</small></div>
        <div><span>Selesai</span><strong>{counts.completed}</strong><small>Proses telah lengkap</small></div>
        <div><span>Total Job</span><strong>{totalJobs}</strong><small>Container dalam daftar</small></div>
      </div>

      <section className="panel operational-workspace">
        <div className="filter-bar">
          <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari SO, container, driver, atau truck..." /></label>
        </div>
        <div className="job-status-tabs" role="tablist" aria-label="Status Container Job">
          {[
            ['received', 'Belum Jalan', counts.received],
            ['running', 'Sedang Jalan', counts.running],
            ['completed', 'Selesai', counts.completed],
            ['cancelled', 'Batal', counts.cancelled],
            ['', 'Semua', totalJobs],
          ].map(([value, label, count]) => (
            <button key={label} type="button" role="tab" aria-selected={status === value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>
              {label}<span>{count}</span>
            </button>
          ))}
        </div>
        <FilterStatus
          total={totalItems}
          filtered={totalItems}
          active={Boolean(query.trim() || status)}
          label="container job"
          onReset={() => {
            setQuery('');
            setStatus('');
          }}
        />

        <div className="operational-job-list">
          {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat Container Job...</p></div> : null}
          {!loading && error ? (
            <div className="archive-inline-state is-error">
              <h3>Container Job gagal dimuat</h3>
              <p>{error}</p>
              <button className="secondary-button" type="button" onClick={() => setListVersion((value) => value + 1)}>Muat Ulang</button>
            </div>
          ) : null}
          {!loading && !error ? jobs.map((job) => {
            const documents = documentState(job);
            const shipmentLabel = formatShipmentLabel(job.shipment || job.jobType);
            const hasContainerNumber = Boolean(job.containerNumber);
            const routeLabel = `${job.origin || '-'} ke ${job.destination || '-'}`;
            const sizeTypeLabel = [job.size, job.type].filter(Boolean).join(' / ') || '-';
            return (
              <article className="operational-job-card" key={job.id}>
                <div className="job-heading">
                  <div>
                    <span>Nomor Container</span>
                    <h3 className={hasContainerNumber ? 'job-container-number' : 'job-container-number is-empty'}>
                      {containerLabel(job)}
                    </h3>
                    <div className="job-heading-meta">
                      <span>SO: {job.soNumber || '-'}</span>
                      <span>{shipmentLabel}</span>
                      <span>{sizeTypeLabel}</span>
                    </div>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
                <div className="job-route">
                  <ClipboardCheck size={17} />
                  <div>
                    <span>Rute Pengiriman</span>
                    <strong>{routeLabel}</strong>
                  </div>
                </div>
                <div className="job-assignment">
                  <div className="job-assignment-item">
                    <span><UserRound size={14} /> Sopir</span>
                    <strong>{job.driver || 'Belum ditentukan'}</strong>
                  </div>
                  <div className="job-assignment-item">
                    <span><Truck size={14} /> Truck</span>
                    <strong>{job.plateNumber || 'Belum ditentukan'}</strong>
                  </div>
                </div>
                <div className="job-document-progress">
                  <span>Dokumen Operational</span><div><i style={{ width: `${(documents.completed / documents.total) * 100}%` }} /></div><strong>{documents.completed}/{documents.total}</strong>
                </div>
                <div className="job-footer">
                  <span>Diperbarui {job.updatedBy || job.createdBy || '-'} - {formatDateTime(job.updatedAt || job.receivedAt)}</span>
                  <div>
                    <button className="secondary-button" type="button" onClick={() => setDetail(job)}><Eye size={15} /> Detail</button>
                    {canEdit && job.status !== 'cancelled' ? <button className="primary-button" type="button" onClick={() => setEditing(job)}>Update Proses</button> : null}
                  </div>
                </div>
              </article>
            );
          }) : null}
          {!loading && !error && !totalItems ? (
            <div className="archive-empty-wrapper">
              <EmptyState title="Belum ada Container Job" description="Pekerjaan akan tampil setelah tim Sales membuat Sales Order." />
            </div>
          ) : null}
        </div>
        {!loading && !error && totalItems ? (
          <div className="master-pagination">
            <span>
              Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}-
              {Math.min(currentPage * PAGE_SIZE, totalItems)} dari {totalItems} container job
            </span>
            <div>
              <button type="button" aria-label="Halaman sebelumnya" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft size={15} />
              </button>
              <strong>Halaman {currentPage} dari {totalPages}</strong>
              <button type="button" aria-label="Halaman berikutnya" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {detail ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => setDetail(null)}>
          <section className="container-job-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>{detail.soNumber}</span><h2>{containerLabel(detail)}</h2><p>{detail.customer} - {detail.origin} - {detail.destination}</p></div>
              <button className="modal-close-button" type="button" aria-label="Tutup detail Container Job" onClick={() => setDetail(null)}><X size={19} /></button>
            </header>
            <div className="container-job-detail-body">
              <section><h3>Penugasan</h3><div><span>No. Container<strong>{detail.containerNumber || '-'}</strong></span><span>Driver<strong>{detail.driver || '-'}</strong></span><span>Truck<strong>{detail.plateNumber || '-'}</strong></span><span>Detail Truck<strong>{detail.chassis || '-'}</strong></span></div></section>
              <section><h3>Biaya Lainnya & SPK</h3><div><span>Biaya Lainnya<strong>{detailOtherCost.amountLabel}</strong></span><span>Catatan Biaya<strong>{detailOtherCost.notes}</strong></span><span>No. SPK<strong>{detail.spkNumber || '-'}</strong></span><span>No. EIR<strong>{detail.eirNumber || '-'}</strong></span></div></section>
              <section><h3>Rekomendasi UJ</h3><UjRecommendationCard job={detail} destinations={archive.masters.destinations} /></section>
              {canViewDocuments ? <section><h3>Dokumen Operational</h3><div className="detail-documents">{documentFieldsForDetail(detail).map(([label, value]) => <span key={label}><FileText size={15} /> <strong>{label}</strong><DocumentLink file={value} /></span>)}</div></section> : null}
              <section><h3>Timeline</h3><div className="job-timeline-detail"><span className="done"><i />Diterima<strong>{formatDateTime(detail.receivedAt)}</strong></span><span className={detail.runningAt ? 'done' : ''}><i />Mulai<strong>{formatDateTime(detail.runningAt)}</strong></span><span className={detail.completedAt ? 'done' : ''}><i />Selesai<strong>{formatDateTime(detail.completedAt)}</strong></span></div></section>
              <section><h3>Riwayat Perubahan</h3><div><span>Dibuat oleh<strong>{detail.createdBy || '-'}</strong></span><span>Diperbarui oleh<strong>{detail.updatedBy || '-'}</strong></span><span>Waktu pembaruan<strong>{formatDateTime(detail.updatedAt)}</strong></span></div></section>
            </div>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setDetail(null)}>Tutup</button>
              {canEdit && !['completed', 'cancelled'].includes(detail.status) ? <button className="danger-button" type="button" onClick={() => cancelOperational(detail)}>Batalkan Job</button> : null}
              {canEdit && detail.status !== 'cancelled' ? <button className="primary-button" type="button" onClick={() => { setEditing(detail); setDetail(null); }}>Update Proses</button> : null}
            </footer>
          </section>
        </div>
      ) : null}

      {editing ? (
        <OperationalForm
          container={editing}
          masterTrucks={archive.masters.trucks}
          masterDestinations={archive.masters.destinations}
          onClose={() => setEditing(null)}
          onSubmit={updateOperational}
          onGenerateSpk={generateOperationalSpk}
        />
      ) : null}
    </div>
  );
}

function documentFieldsForDetail(job) {
  return [
    ['Lampiran Biaya Lainnya', job.spkDocument],
    ['Lampiran EIR', job.eirDocument],
    ['Bon Muat', job.loadingVoucherDocument],
    ['TILA / Delivery Card / Gatepass / SP2', job.tilaGatepassDocumentFile || job.unloadingVoucherDocument || job.weighingDocumentFile],
    ['Surat Jalan', job.travelDocumentFile],
    ...(job.tilaGatepassLegacyDocumentFiles || []).map((document) => [document.name || 'Legacy TILA / Gatepass', document.file]),
    ...(job.otherDocuments || []).map((document) => [document.name || 'Other Document', document.file]),
  ];
}

export default OperationsPage;
