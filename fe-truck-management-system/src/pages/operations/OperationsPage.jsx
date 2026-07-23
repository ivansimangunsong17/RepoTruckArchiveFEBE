import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
import UjRecommendationCard from '../../components/operations/UjRecommendationCard';
import { parseOtherCost } from '../../utils/otherCost';
import { cancelContainerJob, fetchContainerJobsPage, generateContainerJobSpk } from '../../services/archive/containerJobService';

const PAGE_SIZE = 8;
const STATUS_ORDER = { received: 0, running: 1, repo_stored: 2, completed: 3, cancelled: 4 };
const EMPTY_STATUS_COUNTS = { received: 0, running: 0, repo_stored: 0, completed: 0, cancelled: 0 };
const CANCEL_SOURCE_OPTIONS = [
  { value: 'customer', label: 'Customer' },
  { value: 'sales', label: 'Sales' },
  { value: 'operational', label: 'Operational' },
  { value: 'other', label: 'Lainnya' },
];
const rpujStageOptions = [
  { value: 'queue', label: 'Antri Pengajuan', description: 'Belum diajukan atau perlu diajukan ulang' },
  { value: 'submitted', label: 'Sudah Diajukan', description: 'Menunggu approval atau transfer Finance' },
  { value: 'paid', label: 'UJ Dikirim', description: 'Bukti transfer UJ sudah masuk' },
];

function getStatusOrder(status) {
  return STATUS_ORDER[status] ?? Number.MAX_SAFE_INTEGER;
}

function getJobStatusLabel(status) {
  if (status === 'completed') return 'Selesai';
  if (status === 'running') return 'Sedang Jalan';
  if (status === 'repo_stored') return 'Dititipkan Repo';
  if (status === 'cancelled') return 'Batal';
  return 'Belum Jalan';
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
    { label: 'EIR', file: job.eirDocument },
    { label: 'Bon Muat / Bon Bongkar', file: job.loadingVoucherDocument },
    { label: 'TILA / Delivery Card / Gatepass / SP2', file: job.tilaGatepassDocumentFile || job.unloadingVoucherDocument || job.weighingDocumentFile },
    { label: 'Surat Jalan', file: job.travelDocumentFile },
  ];
  return {
    completed: required.filter((document) => Boolean(document.file)).length,
    total: required.length,
    missing: required.filter((document) => !document.file).map((document) => document.label),
  };
}

function containerLabel(job) {
  return job?.containerNumber || 'Container belum diisi';
}

function getRepoStorageMissing(job) {
  const missing = [];
  if (!String(job?.containerNumber || '').trim()) missing.push('No. Container');
  if (!String(job?.driver || '').trim()) missing.push('Sopir');
  if (!String(job?.plateNumber || '').trim()) missing.push('Truck');
  return missing;
}

function canStoreRepoJob(job) {
  return Boolean(job && !['completed', 'cancelled', 'repo_stored'].includes(job.status));
}

function otherCostValue(job) {
  const otherCost = parseOtherCost(job?.rpujNotes);
  return {
    amount: otherCost.amount,
    notes: otherCost.notes || '-',
    amountLabel: otherCost.amount ? formatCurrency(otherCost.amount) : '-',
  };
}

function getRpujStage(job) {
  if (job?.rpujStatus === 'paid') return 'paid';
  if (['submitted', 'approved'].includes(job?.rpujStatus)) return 'submitted';
  return 'queue';
}

function rpujDetail(job) {
  if (job?.rpujStatus === 'paid') return { tone: 'paid', label: 'UJ Dikirim', helper: 'Bukti transfer masuk' };
  if (job?.rpujStatus === 'approved') return { tone: 'approved', label: 'Disetujui Finance', helper: 'Siap transfer / SPK' };
  if (job?.rpujStatus === 'submitted') return { tone: 'submitted', label: 'Menunggu Finance', helper: 'Pengajuan sudah masuk' };
  if (job?.rpujStatus === 'rejected') return {
    tone: 'rejected',
    label: 'Ditolak Finance',
    helper: job.rpujRejectionNote || 'Ajukan ulang',
  };
  return { tone: 'queue', label: 'Belum Diajukan', helper: 'Perlu ajukan UJ' };
}

function groupJobsBySo(rows = []) {
  const groups = new Map();
  rows.forEach((job) => {
    const key = job.orderId || job.soNumber || `${job.customer || 'SO'}-${job.origin || ''}-${job.destination || ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        soNumber: job.soNumber || '-',
        customer: job.customer || '-',
        route: `${job.origin || '-'} ke ${job.destination || '-'}`,
        jobs: [],
      });
    }
    groups.get(key).jobs.push(job);
  });
  return Array.from(groups.values());
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

function OperationsPage({ documentFollowUp = false }) {
  const { user } = useAuth();
  const { notify, confirmAction } = useFeedback();
  const archive = useArchiveData();
  const [databaseJobs, setDatabaseJobs] = useState([]);
  const [pendingDatabaseJobs, setPendingDatabaseJobs] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState(EMPTY_STATUS_COUNTS);
  const [rpujCounts, setRpujCounts] = useState({ queue: 0, submitted: 0, paid: 0 });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [rpujStage, setRpujStage] = useState('');
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(archive.isDatabaseMode);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelForm, setCancelForm] = useState({ cancelSource: 'customer', cancelReason: '' });
  const [cancelSaving, setCancelSaving] = useState(false);
  const [repoTarget, setRepoTarget] = useState(null);
  const [repoForm, setRepoForm] = useState({ repoLocation: '', repoReason: '', repoNotes: '' });
  const [repoSaving, setRepoSaving] = useState(false);
  const canEdit = hasPermission(user, 'operations.update');
  const canReviewCancel = canEdit || user?.role === USER_ROLES.ADMIN;
  const canViewDocuments = hasPermission(user, 'documents.operational.read');
  const detailOtherCost = otherCostValue(detail);
  const cancelReasonValid = cancelForm.cancelReason.trim().length >= 8;
  const repoMissing = getRepoStorageMissing(repoTarget);
  const repoLocationValid = repoForm.repoLocation.trim().length >= 3;
  const repoReasonValid = repoForm.repoReason.trim().length >= 8;
  const repoFormValid = Boolean(repoTarget && !repoMissing.length && repoLocationValid && repoReasonValid);

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

  useEffect(() => {
    if (!cancelTarget) return undefined;

    function closeCancelOnEscape(event) {
      if (event.key === 'Escape' && !cancelSaving) setCancelTarget(null);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeCancelOnEscape);
    return () => {
      document.body.style.overflow = detail ? 'hidden' : '';
      window.removeEventListener('keydown', closeCancelOnEscape);
    };
  }, [cancelSaving, cancelTarget, detail]);

  useEffect(() => {
    if (!repoTarget) return undefined;

    function closeRepoOnEscape(event) {
      if (event.key === 'Escape' && !repoSaving) setRepoTarget(null);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeRepoOnEscape);
    return () => {
      document.body.style.overflow = detail ? 'hidden' : '';
      window.removeEventListener('keydown', closeRepoOnEscape);
    };
  }, [detail, repoSaving, repoTarget]);

  const demoJobs = useMemo(() => flattenDemoJobs(archive.orders), [archive.orders]);
  const filteredDemoJobs = useMemo(() => sortOperationalJobs(demoJobs.filter((job) => {
    const matchesQuery = !query || [
      job.soNumber, job.doNumber, job.customer, job.containerNumber, job.driver, job.plateNumber,
    ].some((value) => value?.toLowerCase().includes(query.toLowerCase()));
    const matchesRpujStage = !rpujStage || getRpujStage(job) === rpujStage;
    const matchesDocumentFollowUp = !documentFollowUp
      || (job.status === 'completed' && documentState(job).completed < documentState(job).total);
    return matchesQuery && (!status || job.status === status) && matchesRpujStage && matchesDocumentFollowUp;
  })), [demoJobs, documentFollowUp, query, rpujStage, status]);

  const jobs = archive.isDatabaseMode
    ? sortOperationalJobs(databaseJobs)
    : filteredDemoJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const groupedJobs = useMemo(() => groupJobsBySo(jobs), [jobs]);
  const counts = archive.isDatabaseMode ? statusCounts : {
    received: demoJobs.filter((job) => job.status === 'received').length,
    running: demoJobs.filter((job) => job.status === 'running').length,
    repo_stored: demoJobs.filter((job) => job.status === 'repo_stored').length,
    completed: demoJobs.filter((job) => job.status === 'completed').length,
    cancelled: demoJobs.filter((job) => job.status === 'cancelled').length,
  };
  const activeRpujCounts = archive.isDatabaseMode ? rpujCounts : {
    queue: demoJobs.filter((job) => getRpujStage(job) === 'queue').length,
    submitted: demoJobs.filter((job) => getRpujStage(job) === 'submitted').length,
    paid: demoJobs.filter((job) => getRpujStage(job) === 'paid').length,
  };
  const totalJobs = (counts.received || 0) + (counts.running || 0) + (counts.repo_stored || 0) + (counts.completed || 0) + (counts.cancelled || 0);
  const totalItems = archive.isDatabaseMode ? serverTotal : filteredDemoJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pendingCancelJobs = useMemo(() => (
    (archive.isDatabaseMode ? pendingDatabaseJobs : flattenPendingCancelJobs(archive.orders || []))
      .filter((job) => job && job.cancelRequestStatus === 'submitted')
  ), [archive.isDatabaseMode, archive.orders, pendingDatabaseJobs]);

  useEffect(() => {
    setPage(1);
  }, [query, rpujStage, status]);

  useEffect(() => {
    if (!archive.isDatabaseMode) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const result = await fetchContainerJobsPage({
          page,
          pageSize: PAGE_SIZE,
          query,
          status: documentFollowUp ? 'completed' : status,
          rpujStage: documentFollowUp ? '' : rpujStage,
          documentStatus: documentFollowUp ? 'incomplete' : '',
        });
        if (!active) return;
        setDatabaseJobs(result.rows);
        setServerTotal(result.total);
        setStatusCounts({ ...EMPTY_STATUS_COUNTS, ...result.counts });
        setRpujCounts({ queue: 0, submitted: 0, paid: 0, ...result.rpujCounts });
      } catch (requestError) {
        if (!active) return;
        setDatabaseJobs([]);
        setServerTotal(0);
        setStatusCounts(EMPTY_STATUS_COUNTS);
        setRpujCounts({ queue: 0, submitted: 0, paid: 0 });
        setError(requestError.message || 'Data Container Job gagal dimuat dari database.');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [archive.isDatabaseMode, documentFollowUp, listVersion, page, query, rpujStage, status]);

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
        archive.refresh?.();
      }
      setEditing(null);
      notify({
        title: 'Proses Operational diperbarui',
        message: `${containerNumber} berhasil disimpan dengan status ${getJobStatusLabel(form.status)}.`,
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

  function openCancelOperational(job) {
    setCancelTarget(job);
    setCancelForm({
      cancelSource: job.cancelSource || 'customer',
      cancelReason: job.cancelReason || job.cancelRequestNote || '',
    });
  }

  async function cancelOperational(event) {
    event.preventDefault();
    if (!cancelTarget || !cancelReasonValid || cancelSaving) return;

    const actorName = user?.fullName || user?.name || 'Operational';
    const payload = {
      status: 'cancelled',
      cancelSource: cancelForm.cancelSource,
      cancelReason: cancelForm.cancelReason.trim(),
      cancelRequestNote: cancelForm.cancelReason.trim(),
      cancelledByName: actorName,
      cancelledAt: new Date().toISOString(),
      updatedBy: actorName,
    };
    setCancelSaving(true);
    try {
      if (archive.isDatabaseMode) {
        await cancelContainerJob(cancelTarget.id, payload);
        setListVersion((value) => value + 1);
      } else {
        await archive.updateJob(cancelTarget.id, payload);
      }
      setDetail(null);
      setCancelTarget(null);
      notify({
        title: 'Container Job dibatalkan',
        message: `${containerLabel(cancelTarget)} berhasil ditandai batal.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Container Job gagal dibatalkan', message: requestError.message });
    } finally {
      setCancelSaving(false);
    }
  }

  function openRepoStorage(job) {
    setRepoTarget(job);
    setRepoForm({
      repoLocation: job.repoLocation || '',
      repoReason: job.repoReason || '',
      repoNotes: job.repoNotes || '',
    });
  }

  async function storeRepoJob(event) {
    event.preventDefault();
    if (!repoFormValid || repoSaving) return;

    const actorName = user?.fullName || user?.name || 'Operational';
    const payload = {
      status: 'repo_stored',
      repoLocation: repoForm.repoLocation.trim(),
      repoReason: repoForm.repoReason.trim(),
      repoNotes: repoForm.repoNotes.trim(),
      repoStoredAt: new Date().toISOString(),
      repoReleasedDriverId: repoTarget.driverId || null,
      repoReleasedVehicleId: repoTarget.vehicleId || null,
      repoCreatedByName: actorName,
      updatedBy: actorName,
    };

    setRepoSaving(true);
    try {
      const saved = await archive.updateJob(repoTarget.id, payload);
      if (archive.isDatabaseMode) {
        if (saved) setDatabaseJobs((current) => current.map((job) => (job.id === saved.id ? saved : job)));
        setListVersion((value) => value + 1);
        archive.refresh?.();
      }
      setDetail(null);
      setRepoTarget(null);
      notify({
        title: 'Container dititipkan Repo',
        message: `${containerLabel(repoTarget)} ditandai Dititipkan Repo. Truck dan sopir bisa dipakai untuk job lain.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Penitipan Repo gagal', message: requestError.message });
    } finally {
      setRepoSaving(false);
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
      await archive.reviewJobCancellation(job.id, { approved: true, cancelReviewNote: '', cancelSource: job.cancelSource || 'sales' });
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
    <div className={`page ${documentFollowUp ? 'operational-document-followup-page' : ''}`.trim()}>
      <PageHeader
        eyebrow="Operational"
        title={documentFollowUp ? 'Dokumen Container Belum Lengkap' : 'Container Job'}
        description={documentFollowUp
          ? 'Tindak lanjuti container selesai yang masih membutuhkan dokumen operasional.'
          : 'Kelola assignment, dokumen operasional, status, dan timeline setiap container.'}
      />

      {canReviewCancel && pendingCancelJobs.length ? (
        <section className="panel cancel-review-panel">
          <header className="cancel-review-head">
            <div>
              <span>Approval Pembatalan</span>
              <h3>Permintaan Pembatalan Container</h3>
            </div>
            <strong>{pendingCancelJobs.length} menunggu</strong>
          </header>
          <div className="cancel-review-list">
            {pendingCancelJobs.slice(0, 5).map((job) => (
              <article className="cancel-review-item" key={job.id}>
                <div className="cancel-review-main">
                  <div className="cancel-review-title">
                    <strong>{job.containerNumber || 'Container belum diisi'}</strong>
                    <StatusBadge status={job.cancelRequestStatus} />
                  </div>
                  <span>{job.soNumber || '-'} - {job.customer || '-'}</span>
                  <small>{job.cancelRequestNote || 'Tidak ada catatan'}</small>
                </div>
                <div className="cancel-review-actions">
                  <button className="secondary-button" type="button" onClick={() => rejectJobCancellation(job)}>
                    <X size={15} /> Tolak
                  </button>
                  <button className="danger-button" type="button" onClick={() => approveJobCancellation(job)}>
                    <CheckCircle2 size={15} /> Setujui
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!documentFollowUp ? <div className="quick-stats operational-stats">
        <div><span>Belum Jalan</span><strong>{counts.received}</strong><small>Menunggu truck dan driver</small></div>
        <div><span>Sedang Jalan</span><strong>{counts.running}</strong><small>Dalam perjalanan</small></div>
        <div><span>Dititipkan Repo</span><strong>{counts.repo_stored}</strong><small>Truck dan sopir sudah lepas</small></div>
        <div><span>Selesai</span><strong>{counts.completed}</strong><small>Proses telah lengkap</small></div>
        <div><span>Total Job</span><strong>{totalJobs}</strong><small>Container dalam daftar</small></div>
      </div> : null}

      <section className="panel operational-workspace">
        <div className="operational-filter-strip">
          <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari SO, container, driver, atau truck..." /></label>
          {!documentFollowUp ? <div className="job-status-tabs" role="tablist" aria-label="Status Container Job">
            {[
              ['', 'Semua', totalJobs],
              ['received', 'Belum Jalan', counts.received],
              ['running', 'Sedang Jalan', counts.running],
              ['repo_stored', 'Dititipkan Repo', counts.repo_stored],
              ['completed', 'Selesai', counts.completed],
              ['cancelled', 'Batal', counts.cancelled],
            ].map(([value, label, count]) => (
              <button key={label} type="button" role="tab" aria-selected={status === value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>
                {label}<span>{count}</span>
              </button>
            ))}
          </div> : <div className="operational-document-followup-summary"><FileText size={17} /><strong>{totalItems}</strong><span>container perlu dilengkapi</span></div>}
        </div>
        {!documentFollowUp ? <div className="operational-filter-substrip">
          <span>RPUJ</span>
          <div className="job-rpuj-tabs" role="tablist" aria-label="Status Pengajuan Uang Jalan">
            {rpujStageOptions.map((option) => {
              const active = rpujStage === option.value;
              return (
                <button
                  aria-selected={active}
                  className={active ? 'active' : ''}
                  key={option.value}
                  onClick={() => setRpujStage(active ? '' : option.value)}
                  role="tab"
                  title={option.description}
                  type="button"
                >
                  {option.label}<strong>{activeRpujCounts[option.value] || 0}</strong>
                </button>
              );
            })}
          </div>
          <small>Menampilkan {totalItems} dari {totalJobs} container job</small>
          {query.trim() || status || rpujStage ? (
            <button className="filter-reset-link" type="button" onClick={() => {
              setQuery('');
              setStatus('');
              setRpujStage('');
            }}>Reset</button>
          ) : null}
        </div> : null}

        <div className="operational-so-list">
          {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat Container Job...</p></div> : null}
          {!loading && error ? (
            <div className="archive-inline-state is-error">
              <h3>Container Job gagal dimuat</h3>
              <p>{error}</p>
              <button className="secondary-button" type="button" onClick={() => setListVersion((value) => value + 1)}>Muat Ulang</button>
            </div>
          ) : null}
          {!loading && !error ? groupedJobs.map((group) => (
            <section className="operational-so-group" key={group.key}>
              <header className="operational-so-header">
                <div>
                  <span>Sales Order</span>
                  <strong>{group.soNumber}</strong>
                  <small>{group.customer} - {group.route}</small>
                </div>
                <em>{group.jobs.length} container</em>
              </header>
              <div className="operational-container-list">
                {group.jobs.map((job) => {
                  const documents = documentState(job);
                  const shipmentLabel = formatShipmentLabel(job.shipment || job.jobType);
                  const hasContainerNumber = Boolean(job.containerNumber);
                  const sizeTypeLabel = [job.size, job.type].filter(Boolean).join(' / ') || '-';
                  const rpuj = rpujDetail(job);
                  const documentPercent = (documents.completed / documents.total) * 100;
                  return (
                    <article className="operational-container-row" key={job.id}>
                      <div className="container-row-main">
                        <strong className={hasContainerNumber ? '' : 'is-empty'}>{containerLabel(job)}</strong>
                        <small>{shipmentLabel} - {sizeTypeLabel}</small>
                      </div>
                      <div className="container-row-status">
                        <StatusBadge status={job.status} />
                      </div>
                      <div className={`container-rpuj-status ${rpuj.tone}`}>
                        <span>RPUJ</span>
                        <strong>{rpuj.label}</strong>
                        <small>{rpuj.helper}</small>
                      </div>
                      <div className="container-row-assignment">
                        <span><UserRound size={13} /> {job.driver || 'Driver belum ditentukan'}</span>
                        <span><Truck size={13} /> {job.plateNumber || 'Truck belum ditentukan'}</span>
                      </div>
                      <div className="container-row-docs">
                        <span>Dokumen</span>
                        <div><i style={{ width: `${documentPercent}%` }} /></div>
                        <strong title={documents.missing.length ? `Belum ada: ${documents.missing.join(', ')}` : 'Lengkap'}>{documents.completed}/{documents.total}</strong>
                        {documentFollowUp ? <small title={documents.missing.join(', ')}>Kurang: {documents.missing.join(', ')}</small> : null}
                      </div>
                      <div className="container-row-actions">
                        <button className="secondary-button" type="button" onClick={() => setDetail(job)}><Eye size={14} /> Detail</button>
                        {canEdit && job.status !== 'cancelled' ? <button className="primary-button" type="button" onClick={() => setEditing(job)}>{documentFollowUp ? 'Lengkapi' : 'Update'}</button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )) : null}
          {!loading && !error && !totalItems ? (
            <div className="archive-empty-wrapper">
              <EmptyState
                title={documentFollowUp ? 'Semua dokumen sudah lengkap' : 'Belum ada Container Job'}
                description={documentFollowUp
                  ? 'Tidak ada container selesai yang membutuhkan tindak lanjut dokumen.'
                  : 'Pekerjaan akan tampil setelah tim Sales membuat Sales Order.'}
              />
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
              <section><h3>Biaya Lainnya & SPK</h3><div><span>Biaya Lainnya<strong>{detailOtherCost.amountLabel}</strong></span><span>Catatan Biaya<strong>{detailOtherCost.notes}</strong></span><span>Status RPUJ<strong>{rpujDetail(detail).label}</strong><small>{detail.rpujRejectionNote || rpujDetail(detail).helper}</small></span><span>No. SPK<strong>{detail.spkNumber || '-'}</strong></span><span>No. EIR<strong>{detail.eirNumber || '-'}</strong></span></div></section>
              <section><h3>Rekomendasi UJ</h3><UjRecommendationCard job={detail} destinations={archive.masters.destinations} /></section>
              {canViewDocuments ? <section><h3>Dokumen Operational</h3><div className="detail-documents">{documentFieldsForDetail(detail).map(([label, value]) => <span key={label}><FileText size={15} /> <strong>{label}</strong><DocumentLink file={value} /></span>)}</div></section> : null}
              <section><h3>Timeline</h3><div className="job-timeline-detail"><span className="done"><i />Diterima<strong>{formatDateTime(detail.receivedAt)}</strong></span><span className={detail.runningAt ? 'done' : ''}><i />Mulai<strong>{formatDateTime(detail.runningAt)}</strong></span><span className={detail.completedAt ? 'done' : ''}><i />Selesai<strong>{formatDateTime(detail.completedAt)}</strong></span></div></section>
              {detail.status === 'repo_stored' || detail.repoLocation || detail.repoStoredAt ? (
                <section className="container-repo-summary">
                  <h3>Penitipan Repo</h3>
                  <div>
                    <span>Lokasi<strong>{detail.repoLocation || '-'}</strong></span>
                    <span>Waktu titip<strong>{formatDateTime(detail.repoStoredAt)}</strong></span>
                    <span>Alasan<strong>{detail.repoReason || '-'}</strong></span>
                    <span>Dicatat oleh<strong>{detail.repoCreatedByName || detail.updatedBy || '-'}</strong></span>
                  </div>
                  {detail.repoNotes ? <p>{detail.repoNotes}</p> : null}
                </section>
              ) : null}
              {detail.status === 'cancelled' || detail.cancelReason || detail.cancelRequestStatus === 'approved' ? (
                <section className="container-cancel-summary">
                  <h3>Pembatalan</h3>
                  <div>
                    <span>Sumber<strong>{CANCEL_SOURCE_OPTIONS.find((option) => option.value === detail.cancelSource)?.label || detail.cancelSource || '-'}</strong></span>
                    <span>Alasan<strong>{detail.cancelReason || detail.cancelRequestNote || '-'}</strong></span>
                    <span>Dibatalkan oleh<strong>{detail.cancelledByName || detail.cancelReviewedByName || detail.updatedBy || '-'}</strong></span>
                    <span>Waktu batal<strong>{formatDateTime(detail.cancelledAt || detail.cancelReviewedAt)}</strong></span>
                  </div>
                </section>
              ) : null}
              <section><h3>Riwayat Perubahan</h3><div><span>Dibuat oleh<strong>{detail.createdBy || '-'}</strong></span><span>Diperbarui oleh<strong>{detail.updatedBy || '-'}</strong></span><span>Waktu pembaruan<strong>{formatDateTime(detail.updatedAt)}</strong></span></div></section>
            </div>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setDetail(null)}>Tutup</button>
              {canEdit && canStoreRepoJob(detail) ? <button className="secondary-button repo-action-button" type="button" onClick={() => openRepoStorage(detail)}><Archive size={16} /> Titipkan Repo</button> : null}
              {canEdit && !['completed', 'cancelled'].includes(detail.status) ? <button className="danger-button" type="button" onClick={() => openCancelOperational(detail)}><Ban size={16} /> Batalkan Job</button> : null}
              {canEdit && !['cancelled', 'repo_stored'].includes(detail.status) ? <button className="primary-button" type="button" onClick={() => { setEditing(detail); setDetail(null); }}>Update Proses</button> : null}
            </footer>
          </section>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => !cancelSaving && setCancelTarget(null)}>
          <section className="container-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="container-cancel-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span><AlertTriangle size={18} /></span>
              <div>
                <h2 id="container-cancel-title">Batalkan Container Job</h2>
                <p>{containerLabel(cancelTarget)} - {cancelTarget.soNumber || '-'} - {cancelTarget.customer || '-'}</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup pembatalan" disabled={cancelSaving} onClick={() => setCancelTarget(null)}><X size={18} /></button>
            </header>
            <form onSubmit={cancelOperational}>
              <label>
                Sumber Pembatalan
                <select
                  value={cancelForm.cancelSource}
                  onChange={(event) => setCancelForm((current) => ({ ...current, cancelSource: event.target.value }))}
                >
                  {CANCEL_SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Alasan Pembatalan
                <textarea
                  rows={4}
                  value={cancelForm.cancelReason}
                  onChange={(event) => setCancelForm((current) => ({ ...current, cancelReason: event.target.value }))}
                  placeholder="Contoh: Customer hanya menjalankan 2 dari 3 container"
                />
              </label>
              <div className="container-cancel-warning">
                <AlertTriangle size={16} />
                <span>Container yang sudah dibatalkan keluar dari pekerjaan aktif dan akan tercatat di audit log.</span>
              </div>
              <footer>
                <button className="secondary-button" type="button" disabled={cancelSaving} onClick={() => setCancelTarget(null)}>Batal</button>
                <button className="danger-button" type="submit" disabled={!cancelReasonValid || cancelSaving}>
                  <Ban size={16} /> {cancelSaving ? 'Membatalkan...' : 'Batalkan Job'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {repoTarget ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => !repoSaving && setRepoTarget(null)}>
          <section className="container-repo-modal" role="dialog" aria-modal="true" aria-labelledby="container-repo-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span><Archive size={18} /></span>
              <div>
                <h2 id="container-repo-title">Titipkan Container ke Repo</h2>
                <p>{containerLabel(repoTarget)} - {repoTarget.soNumber || '-'} - {repoTarget.customer || '-'}</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup penitipan repo" disabled={repoSaving} onClick={() => setRepoTarget(null)}><X size={18} /></button>
            </header>
            <form onSubmit={storeRepoJob}>
              <div className="repo-assignment-snapshot">
                <span>Truck<strong>{repoTarget.plateNumber || '-'}</strong></span>
                <span>Sopir<strong>{repoTarget.driver || '-'}</strong></span>
                <span>Status<strong>{getJobStatusLabel(repoTarget.status)}</strong></span>
              </div>
              {repoMissing.length ? (
                <div className="container-repo-warning is-blocked">
                  <AlertTriangle size={16} />
                  <span>Lengkapi {repoMissing.join(', ')} sebelum container bisa dititipkan Repo.</span>
                </div>
              ) : (
                <div className="container-repo-warning">
                  <AlertTriangle size={16} />
                  <span>Setelah disimpan, truck dan sopir tidak lagi terkunci oleh container ini.</span>
                </div>
              )}
              <label>
                Lokasi Repo
                <input
                  autoFocus
                  value={repoForm.repoLocation}
                  onChange={(event) => setRepoForm((current) => ({ ...current, repoLocation: event.target.value }))}
                  placeholder="Contoh: Repo Marunda Blok A"
                />
              </label>
              <label>
                Alasan Penitipan
                <textarea
                  rows={3}
                  value={repoForm.repoReason}
                  onChange={(event) => setRepoForm((current) => ({ ...current, repoReason: event.target.value }))}
                  placeholder="Contoh: Menunggu instruksi bongkar dari customer"
                />
              </label>
              <label>
                Catatan Tambahan
                <textarea
                  rows={3}
                  value={repoForm.repoNotes}
                  onChange={(event) => setRepoForm((current) => ({ ...current, repoNotes: event.target.value }))}
                  placeholder="Seal, posisi blok, atau instruksi keamanan"
                />
              </label>
              <footer>
                <button className="secondary-button" type="button" disabled={repoSaving} onClick={() => setRepoTarget(null)}>Batal</button>
                <button className="primary-button repo-submit-button" type="submit" disabled={!repoFormValid || repoSaving}>
                  <Archive size={16} /> {repoSaving ? 'Menyimpan...' : 'Simpan Titipan'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {editing ? (
        <OperationalForm
          container={editing}
          masterTrucks={archive.masters.trucks}
          masterDrivers={archive.masters.drivers}
          masterDestinations={archive.masters.destinations}
          activeJobs={archive.isDatabaseMode ? databaseJobs : demoJobs}
          currentUser={user}
          initialPhase={documentFollowUp ? 'closing' : 'preparation'}
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
