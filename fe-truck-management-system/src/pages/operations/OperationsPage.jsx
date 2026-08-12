import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  X,
  Search,
  SlidersHorizontal,
  Truck,
  UserRound,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import AttachmentUploadField from '../../components/common/AttachmentUploadField';
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
const DATABASE_FETCH_PAGE_SIZE = 200;
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
const REPO_CONTAINER_CONDITIONS = [
  { value: 'empty', label: 'Kosong' },
  { value: 'loaded', label: 'Isi' },
];

function getStatusOrder(status) {
  return STATUS_ORDER[status] ?? Number.MAX_SAFE_INTEGER;
}

function getDateFilterKey(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (dateOnly) return dateOnly;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
}

function getJobStatusLabel(status) {
  if (status === 'completed') return 'Selesai';
  if (status === 'running') return 'Sedang Jalan';
  if (status === 'repo_stored') return 'Container Titip';
  if (status === 'cancelled') return 'Batal';
  return 'Belum Jalan';
}

function formatShipmentLabel(value) {
  const shipmentMap = {
    import: 'Import',
    export: 'Export',
    'domestik inward': 'Domestik Inward',
    'domestik outward': 'Domestik Outward',
    repo_empty: 'Repo Empty',
    repo_full: 'Repo Full',
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
  const eirRequirement = isRepoStoredJob(job)
    ? { label: 'EIR Titip', file: job.repoEirDocument }
    : { label: 'EIR', file: job.eirDocument };
  const required = [
    eirRequirement,
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

function repoStorageSummary(job) {
  const location = job?.repoLocation || 'Depo penitipan belum dipilih';
  const storedAt = job?.repoStoredAt ? formatDateTime(job.repoStoredAt) : 'Waktu titip belum diisi';
  return {
    location,
    storedAt,
    reason: job?.repoReason || 'Alasan titip belum diisi',
  };
}

function isRepoStoredJob(job) {
  return Boolean(job?.status === 'repo_stored' || (job?.repoStoredAt && !job?.repoPickedUpAt));
}

function hasRepoStorageHistory(job) {
  return Boolean(
    job?.status === 'repo_stored'
      || job?.repoLocation
      || job?.repoStoredAt
      || job?.repoEirNumber
      || job?.repoPickedUpAt,
  );
}

function getRepoStorageMissing(job) {
  const missing = [];
  if (!String(job?.containerNumber || '').trim()) missing.push('No. Container');
  if (!String(job?.driver || '').trim()) missing.push('Sopir');
  if (!String(job?.plateNumber || '').trim()) missing.push('Truck');
  return missing;
}

function canStoreRepoJob(job) {
  return Boolean(job && job.status === 'running' && !hasRepoStorageHistory(job));
}

function repoContainerConditionLabel(value) {
  return REPO_CONTAINER_CONDITIONS.find((option) => option.value === value)?.label || '-';
}

function normalizeDepotOptions(rows = []) {
  const activeDepots = (Array.isArray(rows) ? rows : [])
    .filter((row) => !row.status || row.status === 'Aktif')
    .filter((row) => (row.depotType || 'destination') === 'storage');

  return activeDepots
    .map((row) => row.name || row.label || '')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'id'));
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
  if (job?.status === 'cancelled') return 'cancelled';
  if (job?.rpujStatus === 'paid') return 'paid';
  if (['submitted', 'approved'].includes(job?.rpujStatus)) return 'submitted';
  return 'queue';
}

function rpujDetail(job) {
  if (job?.status === 'cancelled') return { tone: 'cancelled', label: 'Tidak Diproses', helper: 'Job sudah batal' };
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

function nextActionHint(job, documents, rpuj, { documentFollowUp = false, repoSummary = null } = {}) {
  if (job?.status === 'cancelled') return null;
  if (repoSummary) return { label: 'Perlu ambil container', tone: 'repo' };
  if (documentFollowUp && documents.missing.length) return { label: 'Dokumen belum lengkap', tone: 'warning' };
  if (!String(job?.containerNumber || '').trim()) return { label: 'Isi nomor container', tone: 'warning' };
  if (rpuj.tone === 'rejected') return { label: 'Ajukan ulang UJ', tone: 'danger' };
  if (rpuj.tone === 'queue') return { label: 'Ajukan UJ', tone: 'warning' };
  if (!String(job?.driver || '').trim() || !String(job?.plateNumber || '').trim()) return { label: 'Lengkapi assignment', tone: 'warning' };
  if (documents.missing.length && !['cancelled'].includes(job?.status)) return { label: 'Dokumen belum lengkap', tone: 'neutral' };
  if (job?.status === 'running') return { label: 'Pantau perjalanan', tone: 'info' };
  return null;
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

function getSoGroupStats(group) {
  const jobs = Array.isArray(group?.jobs) ? group.jobs : [];
  const completed = jobs.filter((job) => job.status === 'completed').length;
  const running = jobs.filter((job) => job.status === 'running' || isRepoStoredJob(job)).length;
  const cancelled = jobs.filter((job) => job.status === 'cancelled').length;
  const waiting = Math.max(0, jobs.length - completed - running - cancelled);
  return {
    total: jobs.length,
    completed,
    running,
    waiting,
    cancelled,
    handled: completed + running,
  };
}

function formatSoGroupSummary(group) {
  const stats = getSoGroupStats(group);
  const parts = [
    `${stats.total} container`,
    `${stats.completed} selesai`,
    `${stats.running} jalan`,
    `${stats.waiting} belum`,
  ];
  if (stats.cancelled) parts.push(`${stats.cancelled} batal`);
  return parts.join(' | ');
}

async function fetchAllContainerJobs(params = {}) {
  const firstResult = await fetchContainerJobsPage({
    ...params,
    page: 1,
    pageSize: DATABASE_FETCH_PAGE_SIZE,
  });
  const total = Number(firstResult?.total || 0);
  const rows = Array.isArray(firstResult?.rows) ? [...firstResult.rows] : [];
  let page = 2;

  while (rows.length < total) {
    const nextResult = await fetchContainerJobsPage({
      ...params,
      page,
      pageSize: DATABASE_FETCH_PAGE_SIZE,
    });
    const nextRows = Array.isArray(nextResult?.rows) ? nextResult.rows : [];
    if (!nextRows.length) break;
    rows.push(...nextRows);
    page += 1;
  }

  return {
    ...firstResult,
    rows,
    total,
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

function OperationsPage({ documentFollowUp = false, repoStorageOnly = false }) {
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
  const [tripDateFilter, setTripDateFilter] = useState('');
  const [mobileRpujFilterOpen, setMobileRpujFilterOpen] = useState(false);
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
  const [repoForm, setRepoForm] = useState({
    repoLocation: '',
    repoReason: '',
    repoNotes: '',
    repoContainerCondition: '',
    repoEirNumber: '',
    repoEirDocument: null,
  });
  const [repoSaving, setRepoSaving] = useState(false);
  const canEdit = hasPermission(user, 'operations.update');
  const canReviewCancel = canEdit || user?.role === USER_ROLES.ADMIN;
  const canViewDocuments = hasPermission(user, 'documents.operational.read');
  const detailOtherCost = otherCostValue(detail);
  const detailDocuments = detail ? documentState(detail) : { completed: 0, total: 0, missing: [] };
  const detailRpuj = detail ? rpujDetail(detail) : { label: '-', helper: '' };
  const cancelReasonValid = cancelForm.cancelReason.trim().length >= 8;
  const repoMissing = getRepoStorageMissing(repoTarget);
  const depotOptions = useMemo(() => normalizeDepotOptions(archive.masters?.depots), [archive.masters?.depots]);
  const hasCurrentDepot = Boolean(repoForm.repoLocation && !depotOptions.includes(repoForm.repoLocation));
  const activeRpujFilterLabel = rpujStageOptions.find((option) => option.value === rpujStage)?.label || 'Filter UJ';
  const repoLocationValid = repoForm.repoLocation.trim().length >= 3;
  const repoReasonValid = repoForm.repoReason.trim().length >= 8;
  const repoConditionValid = ['empty', 'loaded'].includes(repoForm.repoContainerCondition);
  const repoEirNumberValid = Boolean(repoForm.repoEirNumber.trim());
  const repoEirValid = Boolean(repoForm.repoEirDocument || repoTarget?.repoEirDocument);
  const repoFormValid = Boolean(repoTarget && !repoMissing.length && repoLocationValid && repoReasonValid && repoConditionValid && repoEirNumberValid && repoEirValid);
  const effectiveStatus = repoStorageOnly ? 'repo_stored' : status;
  const effectiveTripDateFilter = documentFollowUp || repoStorageOnly ? '' : tripDateFilter;

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
    const matchesRpujStage = !rpujStage || (job.status !== 'cancelled' && getRpujStage(job) === rpujStage);
    const matchesRepoStorage = !repoStorageOnly || isRepoStoredJob(job);
    const matchesStatus = !effectiveStatus || (effectiveStatus === 'repo_stored' ? isRepoStoredJob(job) : job.status === effectiveStatus);
    const matchesTripDate = !effectiveTripDateFilter || getDateFilterKey(job.tripDate) === effectiveTripDateFilter;
    const matchesDocumentFollowUp = !documentFollowUp
      || (job.status === 'completed' && documentState(job).completed < documentState(job).total);
    return matchesQuery && matchesStatus && matchesRpujStage && matchesRepoStorage && matchesTripDate && matchesDocumentFollowUp;
  })), [demoJobs, documentFollowUp, effectiveStatus, effectiveTripDateFilter, query, repoStorageOnly, rpujStage]);

  const visibleJobs = archive.isDatabaseMode ? sortOperationalJobs(databaseJobs) : filteredDemoJobs;
  const allGroupedJobs = useMemo(() => groupJobsBySo(visibleJobs), [visibleJobs]);
  const counts = archive.isDatabaseMode ? statusCounts : {
    received: demoJobs.filter((job) => job.status === 'received').length,
    running: demoJobs.filter((job) => job.status === 'running').length,
    repo_stored: demoJobs.filter((job) => isRepoStoredJob(job)).length,
    completed: demoJobs.filter((job) => job.status === 'completed').length,
    cancelled: demoJobs.filter((job) => job.status === 'cancelled').length,
  };
  const activeRpujCounts = archive.isDatabaseMode ? rpujCounts : {
    queue: demoJobs.filter((job) => job.status !== 'cancelled' && getRpujStage(job) === 'queue').length,
    submitted: demoJobs.filter((job) => job.status !== 'cancelled' && getRpujStage(job) === 'submitted').length,
    paid: demoJobs.filter((job) => job.status !== 'cancelled' && getRpujStage(job) === 'paid').length,
  };
  const totalJobs = (counts.received || 0) + (counts.running || 0) + (counts.repo_stored || 0) + (counts.completed || 0) + (counts.cancelled || 0);
  const totalItems = archive.isDatabaseMode ? serverTotal : filteredDemoJobs.length;
  const totalGroups = allGroupedJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const groupedJobs = useMemo(() => (
    allGroupedJobs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  ), [allGroupedJobs, currentPage]);
  const groupShowingFrom = totalGroups ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const groupShowingTo = Math.min(currentPage * PAGE_SIZE, totalGroups);
  const pendingCancelJobs = useMemo(() => (
    (archive.isDatabaseMode ? pendingDatabaseJobs : flattenPendingCancelJobs(archive.orders || []))
      .filter((job) => job && job.cancelRequestStatus === 'submitted')
  ), [archive.isDatabaseMode, archive.orders, pendingDatabaseJobs]);

  useEffect(() => {
    setPage(1);
  }, [query, rpujStage, status, effectiveTripDateFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!archive.isDatabaseMode) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const result = await fetchAllContainerJobs({
          query,
          status: documentFollowUp ? 'completed' : effectiveStatus,
          rpujStage: documentFollowUp || repoStorageOnly ? '' : rpujStage,
          documentStatus: documentFollowUp ? 'incomplete' : '',
          tripDate: effectiveTripDateFilter,
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
  }, [archive.isDatabaseMode, documentFollowUp, effectiveStatus, effectiveTripDateFilter, listVersion, query, repoStorageOnly, rpujStage]);

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
    const actorName = user?.fullName || user?.name || 'Operational';
    const payload = editing.repoPickupMode
      ? {
          ...form,
          status: 'running',
          runningAt: form.runningAt || new Date().toISOString(),
          repoPickedUpAt: new Date().toISOString(),
          repoPickedUpByName: actorName,
          updatedBy: actorName,
        }
      : form;
    try {
      const saved = await archive.updateJob(editing.id, payload);
      if (archive.isDatabaseMode) {
        if (saved) {
          setDatabaseJobs((current) => current.map((job) => (job.id === saved.id ? saved : job)));
        }
        setListVersion((value) => value + 1);
        archive.refresh?.();
      }
      setEditing(null);
      notify({
        title: editing.repoPickupMode ? 'Container diambil dari Repo' : 'Proses Operational diperbarui',
        message: editing.repoPickupMode
          ? `${containerNumber} berhasil diambil dari Repo dan lanjut Sedang Jalan dengan assignment baru.`
          : `${containerNumber} berhasil disimpan dengan status ${getJobStatusLabel(form.status)}.`,
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
    if (hasRepoStorageHistory(job)) {
      notify({ type: 'error', title: 'Container pernah dititipkan', message: 'Container yang sudah masuk flow titip tidak bisa dibatalkan dari detail operational.' });
      return;
    }
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
      repoContainerCondition: job.repoContainerCondition || '',
      repoEirNumber: job.repoEirNumber || '',
      repoEirDocument: job.repoEirDocument || null,
    });
  }

  function openRepoPickup(job) {
    setEditing({
      ...job,
      status: 'received',
      plateNumber: '',
      driver: '',
      driverId: null,
      vehicleId: null,
      chassis: '',
      runningAt: '',
      completedAt: '',
      repoPickupMode: true,
    });
    setDetail(null);
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
      repoContainerCondition: repoForm.repoContainerCondition,
      repoEirNumber: repoForm.repoEirNumber.trim(),
      repoEirDocument: repoForm.repoEirDocument || repoTarget.repoEirDocument || null,
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
        title: 'Container dititipkan',
        message: `${containerLabel(repoTarget)} dititipkan di ${repoForm.repoLocation.trim()}. Truck dan sopir bisa dipakai untuk job lain.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Penitipan container gagal', message: requestError.message });
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
    <div className={`page operations-page ${documentFollowUp ? 'operational-document-followup-page' : ''} ${repoStorageOnly ? 'operational-repo-storage-page' : ''}`.trim()}>
      <PageHeader
        eyebrow="Operational"
        title={repoStorageOnly ? 'Container Titip' : documentFollowUp ? 'Dokumen Container Belum Lengkap' : 'Container Job'}
        description={repoStorageOnly
          ? 'Pantau container yang sedang dititipkan di depo penitipan dan ambil kembali saat siap dijalankan.'
          : documentFollowUp
            ? 'Tindak lanjuti container selesai yang masih membutuhkan dokumen operasional.'
            : 'Kelola assignment, dokumen operasional, status, dan timeline setiap container.'}
      />

      {canReviewCancel && !repoStorageOnly && pendingCancelJobs.length ? (
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
        <div><span>Container Titip</span><strong>{counts.repo_stored}</strong><small>Truck dan sopir sudah lepas</small></div>
        <div><span>Selesai</span><strong>{counts.completed}</strong><small>Proses telah lengkap</small></div>
        <div><span>Total Job</span><strong>{totalJobs}</strong><small>Container dalam daftar</small></div>
      </div> : null}

      <section className="panel operational-workspace">
        <div className="operational-filter-strip">
          <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari SO, container, driver, atau truck..." /></label>
          {!documentFollowUp && !repoStorageOnly ? <div className="job-status-tabs" role="tablist" aria-label="Status Container Job">
            {[
              ['', 'Semua', totalJobs],
              ['received', 'Belum Jalan', counts.received],
              ['running', 'Sedang Jalan', counts.running],
              ['repo_stored', 'Container Titip', counts.repo_stored],
              ['completed', 'Selesai', counts.completed],
              ['cancelled', 'Batal', counts.cancelled],
            ].map(([value, label, count]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={effectiveStatus === value}
                className={`${effectiveStatus === value ? 'active' : ''} ${value ? `is-${value}` : ''}`.trim()}
                onClick={() => setStatus(value)}
                title={value === 'repo_stored' ? 'Container sedang dititipkan dan perlu dipantau.' : label}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div> : repoStorageOnly ? (
            <div className="operational-document-followup-summary"><Archive size={17} /><strong>{totalItems}</strong><span>container sedang dititipkan</span></div>
          ) : <div className="operational-document-followup-summary"><FileText size={17} /><strong>{totalItems}</strong><span>container perlu dilengkapi</span></div>}
        </div>
        {!documentFollowUp && !repoStorageOnly ? <div className={`operational-filter-substrip ${mobileRpujFilterOpen ? 'is-mobile-open' : ''}`.trim()}>
          <button
            className={`rpuj-mobile-toggle ${rpujStage ? 'active' : ''}`.trim()}
            type="button"
            onClick={() => setMobileRpujFilterOpen((value) => !value)}
            aria-expanded={mobileRpujFilterOpen}
          >
            <SlidersHorizontal size={15} />
            {activeRpujFilterLabel}
            {rpujStage ? <strong>{activeRpujCounts[rpujStage] || 0}</strong> : null}
          </button>
          <span>RPUJ</span>
          <div className="job-rpuj-tabs" role="tablist" aria-label="Status Pengajuan Uang Jalan">
            {rpujStageOptions.map((option) => {
              const active = rpujStage === option.value;
              return (
                <button
                  aria-selected={active}
                  className={active ? 'active' : ''}
                  key={option.value}
                  onClick={() => {
                    setRpujStage(active ? '' : option.value);
                    setMobileRpujFilterOpen(false);
                  }}
                  role="tab"
                  title={option.description}
                  type="button"
                >
                  {option.label}<strong>{activeRpujCounts[option.value] || 0}</strong>
                </button>
              );
            })}
          </div>
          <label className={`operational-date-filter ${effectiveTripDateFilter ? 'active' : ''}`.trim()}>
            <CalendarDays size={15} />
            <span>Tanggal Jalan</span>
            <input
              aria-label="Filter tanggal jalan"
              type="date"
              value={tripDateFilter}
              onChange={(event) => setTripDateFilter(event.target.value)}
            />
          </label>
          <small>Menampilkan {totalGroups} SO dari {totalItems} container job</small>
          {query.trim() || effectiveStatus || rpujStage || effectiveTripDateFilter ? (
            <button className="filter-reset-link" type="button" onClick={() => {
              setQuery('');
              setStatus('');
              setRpujStage('');
              setTripDateFilter('');
              setMobileRpujFilterOpen(false);
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
          {!loading && !error ? groupedJobs.map((group, groupIndex) => {
            const groupStats = getSoGroupStats(group);
            return (
            <section className="operational-so-group" key={group.key}>
              <header className="operational-so-header">
                <span className="operational-so-number">SO {groupShowingFrom + groupIndex}</span>
                <div className="operational-so-identity">
                  <div className="operational-so-title">
                    <span>Sales Order</span>
                    <strong>{group.soNumber}</strong>
                  </div>
                  <div className="operational-so-meta">
                    <small><b>Customer</b>{group.customer}</small>
                    <small><b>Rute</b>{group.route}</small>
                  </div>
                </div>
                <em>{formatSoGroupSummary(group)}</em>
                <div className="operational-so-progress" aria-label={`Progress ${group.soNumber}`}>
                  <span><b>{groupStats.total}</b> Container</span>
                  <span className="waiting"><b>{groupStats.waiting}</b> Belum</span>
                  <span className="running"><b>{groupStats.running}</b> Jalan</span>
                  <span className="completed"><b>{groupStats.completed}</b> Selesai</span>
                  {groupStats.cancelled ? <span className="cancelled"><b>{groupStats.cancelled}</b> Batal</span> : null}
                </div>
              </header>
              <div className="operational-container-list">
                {group.jobs.map((job, jobIndex) => {
                  const documents = documentState(job);
                  const shipmentLabel = formatShipmentLabel(job.shipment || job.jobType);
                  const hasContainerNumber = Boolean(job.containerNumber);
                  const sizeTypeLabel = [job.size, job.type].filter(Boolean).join(' / ') || '-';
                  const rpuj = rpujDetail(job);
                  const documentPercent = (documents.completed / documents.total) * 100;
                  const repoSummary = isRepoStoredJob(job) ? repoStorageSummary(job) : null;
                  const actionHint = nextActionHint(job, documents, rpuj, { documentFollowUp, repoSummary });
                  return (
                    <article className={`operational-container-row ${repoSummary ? 'is-repo-stored' : ''}`} key={job.id}>
                      <div className="container-row-main">
                        <span className="container-sequence">Container {jobIndex + 1} dari {group.jobs.length}</span>
                        <strong className={hasContainerNumber ? '' : 'is-empty'}>{containerLabel(job)}</strong>
                        <small>{repoSummary ? `Container Titip - ${repoSummary.reason}` : `${shipmentLabel} - ${sizeTypeLabel}`}</small>
                        {repoSummary && actionHint ? <em className={`container-action-hint ${actionHint.tone}`}>{actionHint.label}</em> : null}
                      </div>
                      <div className="container-row-status">
                        <StatusBadge status={job.status} />
                        {actionHint ? <em className={`container-action-hint ${actionHint.tone}`}>{actionHint.label}</em> : null}
                      </div>
                      <div className={`container-rpuj-status ${rpuj.tone}`}>
                        <span>RPUJ</span>
                        <strong>{rpuj.label}</strong>
                        <small>{rpuj.helper}</small>
                      </div>
                      <div className={`container-row-assignment ${repoSummary ? 'is-repo-summary' : ''}`}>
                        {repoSummary ? (
                          <>
                            <span><Archive size={13} /> <b>Depo</b>{repoSummary.location}</span>
                            <span><Truck size={13} /> <b>Titip</b>{repoSummary.storedAt} - {repoContainerConditionLabel(job.repoContainerCondition)}</span>
                          </>
                        ) : (
                          <>
                            <span><UserRound size={13} /> {job.driver || 'Driver belum ditentukan'}</span>
                            <span><Truck size={13} /> {job.plateNumber || 'Truck belum ditentukan'}</span>
                          </>
                        )}
                      </div>
                      <div className="container-row-docs">
                        <span>Dokumen</span>
                        <div><i style={{ width: `${documentPercent}%` }} /></div>
                        <strong title={documents.missing.length ? `Belum ada: ${documents.missing.join(', ')}` : 'Lengkap'}>{documents.completed}/{documents.total}</strong>
                        {documentFollowUp ? <small title={documents.missing.join(', ')}>Kurang: {documents.missing.join(', ')}</small> : null}
                      </div>
                      <div className="container-row-actions">
                        <button className="secondary-button" type="button" onClick={() => setDetail(job)}><Eye size={14} /> Detail</button>
                        {canEdit && canStoreRepoJob(job) ? <button className="secondary-button repo-action-button" type="button" onClick={() => openRepoStorage(job)}><Archive size={14} /> Titipkan</button> : null}
                        {canEdit && isRepoStoredJob(job) ? <button className="operational-primary-action repo" type="button" onClick={() => openRepoPickup(job)}><Truck size={14} /> Ambil Container</button> : null}
                        {canEdit && !isRepoStoredJob(job) && !['cancelled'].includes(job.status) ? <button className="operational-primary-action" type="button" onClick={() => setEditing(job)}>{documentFollowUp ? 'Lengkapi' : 'Update'}</button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
          }) : null}
          {!loading && !error && !totalGroups ? (
            <div className="archive-empty-wrapper">
              <EmptyState
                title={repoStorageOnly ? 'Belum ada container titip' : documentFollowUp ? 'Semua dokumen sudah lengkap' : 'Belum ada Container Job'}
                description={repoStorageOnly
                  ? 'Container yang dititipkan akan tampil di sini.'
                  : documentFollowUp
                    ? 'Tidak ada container selesai yang membutuhkan tindak lanjut dokumen.'
                    : 'Pekerjaan akan tampil setelah tim Sales membuat Sales Order.'}
              />
            </div>
          ) : null}
        </div>
        {!loading && !error && totalGroups ? (
          <div className="master-pagination">
            <span>
              Menampilkan {groupShowingFrom}-{groupShowingTo} dari {totalGroups} SO ({totalItems} container job)
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
            <div className="container-job-mobile-summary" aria-label="Ringkasan detail container">
              <div><span>Status</span><StatusBadge status={detail.status} /></div>
              <div><span>Dokumen</span><strong>{detailDocuments.completed}/{detailDocuments.total}</strong></div>
              <div><span>Jenis</span><strong>{formatShipmentLabel(detail.shipment || detail.jobType)} / {detail.size || '-'}</strong></div>
            </div>
            <div className="container-job-detail-body">
              <section className="container-detail-assignment"><h3>Penugasan</h3><div><span>No. Container<strong>{detail.containerNumber || '-'}</strong></span><span>Driver<strong>{detail.driver || '-'}</strong></span><span>Truck<strong>{detail.plateNumber || '-'}</strong></span><span>Detail Truck<strong>{detail.chassis || '-'}</strong></span></div></section>
              <section className="container-detail-billing"><h3>Biaya Lainnya & SPK</h3><div><span>Biaya Lainnya<strong>{detailOtherCost.amountLabel}</strong></span><span>Catatan Biaya<strong>{detailOtherCost.notes}</strong></span><span>Status RPUJ<strong>{detailRpuj.label}</strong><small>{detail.rpujRejectionNote || detailRpuj.helper}</small></span><span>No. SPK<strong>{detail.spkNumber || '-'}</strong></span><span>No. EIR<strong>{detail.eirNumber || '-'}</strong></span></div></section>
              <section className="container-detail-uj"><h3>Rekomendasi UJ</h3><UjRecommendationCard job={detail} destinations={archive.masters.destinations} /></section>
              {canViewDocuments ? <section className="container-detail-documents"><h3>Dokumen Operational</h3><div className="detail-documents">{documentFieldsForDetail(detail).map(([label, value]) => <span key={label}><FileText size={15} /> <strong>{label}</strong><DocumentLink file={value} /></span>)}</div></section> : null}
              <section className="container-detail-timeline"><h3>Timeline</h3><div className="job-timeline-detail"><span className="done"><i />Diterima<strong>{formatDateTime(detail.receivedAt)}</strong></span><span className={detail.runningAt ? 'done' : ''}><i />Mulai<strong>{formatDateTime(detail.runningAt)}</strong></span><span className={detail.completedAt ? 'done' : ''}><i />Selesai<strong>{formatDateTime(detail.completedAt)}</strong></span></div></section>
              {isRepoStoredJob(detail) || detail.repoLocation || detail.repoStoredAt ? (
                <section className="container-repo-summary">
                  <h3>Penitipan Container</h3>
                  <div>
                    <span>Depo Penitipan<strong>{detail.repoLocation || '-'}</strong></span>
                    <span>Waktu titip<strong>{formatDateTime(detail.repoStoredAt)}</strong></span>
                    <span>No. EIR Titip<strong>{detail.repoEirNumber || '-'}</strong></span>
                    <span>Alasan<strong>{detail.repoReason || '-'}</strong></span>
                    <span>Kondisi Container<strong>{repoContainerConditionLabel(detail.repoContainerCondition)}</strong></span>
                    <span>Dicatat oleh<strong>{detail.repoCreatedByName || detail.updatedBy || '-'}</strong></span>
                    <span>Resource<strong>Truck & sopir sudah lepas</strong><small>Bisa dipakai untuk job lain</small></span>
                    <span>Diambil oleh<strong>{detail.repoPickedUpByName || '-'}</strong><small>{formatDateTime(detail.repoPickedUpAt)}</small></span>
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
              <section className="container-detail-history"><h3>Riwayat Perubahan</h3><div><span>Dibuat oleh<strong>{detail.createdBy || '-'}</strong></span><span>Diperbarui oleh<strong>{detail.updatedBy || '-'}</strong></span><span>Waktu pembaruan<strong>{formatDateTime(detail.updatedAt)}</strong></span></div></section>
            </div>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setDetail(null)}>Tutup</button>
              {canEdit && canStoreRepoJob(detail) ? <button className="secondary-button repo-action-button" type="button" onClick={() => openRepoStorage(detail)}><Archive size={16} /> Titipkan Container</button> : null}
              {canEdit && isRepoStoredJob(detail) ? <button className="operational-primary-action repo" type="button" onClick={() => openRepoPickup(detail)}><Truck size={16} /> Ambil Container</button> : null}
              {canEdit && !hasRepoStorageHistory(detail) && !['completed', 'cancelled'].includes(detail.status) ? <button className="danger-button" type="button" onClick={() => openCancelOperational(detail)}><Ban size={16} /> Batalkan Job</button> : null}
              {canEdit && !isRepoStoredJob(detail) && !['cancelled'].includes(detail.status) ? <button className="operational-primary-action" type="button" onClick={() => { setEditing(detail); setDetail(null); }}>Update Proses</button> : null}
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
                <h2 id="container-repo-title">Titipkan Container</h2>
                <p>{containerLabel(repoTarget)} - {repoTarget.soNumber || '-'} - {repoTarget.customer || '-'}</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup penitipan container" disabled={repoSaving} onClick={() => setRepoTarget(null)}><X size={18} /></button>
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
                  <span>Lengkapi {repoMissing.join(', ')} sebelum container bisa dititipkan.</span>
                </div>
              ) : (
                <div className="container-repo-warning">
                  <AlertTriangle size={16} />
                  <span>Setelah disimpan, truck dan sopir tidak lagi terkunci oleh container ini.</span>
                </div>
              )}
              <label>
                Depo Penitipan
                <select
                  autoFocus
                  value={repoForm.repoLocation}
                  onChange={(event) => setRepoForm((current) => ({ ...current, repoLocation: event.target.value }))}
                >
                  <option value="">Pilih Depo Penitipan</option>
                  {hasCurrentDepot ? <option value={repoForm.repoLocation}>{repoForm.repoLocation}</option> : null}
                  {depotOptions.map((depot) => <option key={depot} value={depot}>{depot}</option>)}
                </select>
              </label>
              <label>
                Kondisi Container
                <select
                  value={repoForm.repoContainerCondition}
                  onChange={(event) => setRepoForm((current) => ({ ...current, repoContainerCondition: event.target.value }))}
                >
                  <option value="">Pilih Kondisi Container</option>
                  {REPO_CONTAINER_CONDITIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
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
                No. EIR Titip
                <input
                  value={repoForm.repoEirNumber}
                  onChange={(event) => setRepoForm((current) => ({ ...current, repoEirNumber: event.target.value }))}
                  placeholder="EIR-TITIP-2026-001"
                />
              </label>
              <div className="repo-document-field">
                <span className="repo-field-label">Dokumen EIR Titip</span>
                <AttachmentUploadField
                  id="repo-eir-document"
                  label="Dokumen EIR Titip"
                  title="Upload EIR Titip"
                  helper="Wajib. PDF, JPG, PNG"
                  value={repoForm.repoEirDocument}
                  onSelect={(file, validationError) => {
                    if (validationError) {
                      notify({ type: 'error', title: 'Dokumen EIR Titip tidak valid', message: validationError });
                      return;
                    }
                    setRepoForm((current) => ({ ...current, repoEirDocument: file }));
                  }}
                  onClear={() => setRepoForm((current) => ({ ...current, repoEirDocument: null }))}
                />
              </div>
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
    ['Lampiran EIR Titip', job.repoEirDocument],
    ['Lampiran EIR', job.eirDocument],
    ['Bon Muat', job.loadingVoucherDocument],
    ['TILA / Delivery Card / Gatepass / SP2', job.tilaGatepassDocumentFile || job.unloadingVoucherDocument || job.weighingDocumentFile],
    ['Surat Jalan', job.travelDocumentFile],
    ...(job.tilaGatepassLegacyDocumentFiles || []).map((document) => [document.name || 'Legacy TILA / Gatepass', document.file]),
    ...(job.otherDocuments || []).map((document) => [document.name || 'Other Document', document.file]),
  ];
}

export default OperationsPage;
