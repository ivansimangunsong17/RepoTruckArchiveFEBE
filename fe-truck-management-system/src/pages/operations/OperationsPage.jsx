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
  Moon,
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
import { updateTruckDefaultDriver } from '../../services/master-data/masterDataService';
import { formatDateTime } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import DocumentLink from '../../components/common/DocumentLink';
import UjRecommendationCard from '../../components/operations/UjRecommendationCard';
import { parseOtherCost } from '../../utils/otherCost';
import {
  cancelContainerJob,
  fetchContainerJob,
  fetchContainerJobsPage,
  generateContainerJobSpk,
} from '../../services/archive/containerJobService';

const PAGE_SIZE = 8;
const STATUS_ORDER = { received: 0, running: 1, inap: 2, repo_stored: 3, completed: 4, cancelled: 5 };
const EMPTY_STATUS_COUNTS = { received: 0, running: 0, inap: 0, repo_stored: 0, completed: 0, cancelled: 0 };
const CANCEL_SOURCE_OPTIONS = [
  { value: 'customer', label: 'Customer' },
  { value: 'sales', label: 'Sales' },
  { value: 'operational', label: 'Operational' },
  { value: 'other', label: 'Lainnya' },
];
const rpujStageOptions = [
  { value: 'queue', label: 'Belum Dicatat', description: 'Biaya perjalanan belum dicatat' },
  { value: 'submitted', label: 'Biaya Tercatat', description: 'Pemakaian saldo sudah dicatat Operational' },
  { value: 'approved', label: 'Dicek Finance', description: 'Catatan saldo sudah dicek Finance' },
  { value: 'paid', label: 'Bukti Tercatat', description: 'Bukti pembayaran sudah tersedia' },
];
const REPO_CONTAINER_CONDITIONS = [
  { value: 'empty', label: 'Kosong' },
  { value: 'loaded', label: 'Isi' },
];
const EXPENSE_CATEGORY_OPTIONS = [
  { value: 'uj_awal', label: 'UJ Awal' },
  { value: 'top_up_uj', label: 'Top Up UJ' },
  { value: 'tol', label: 'Tol' },
  { value: 'parkir', label: 'Parkir' },
  { value: 'bongkar', label: 'Bongkar' },
  { value: 'muat', label: 'Muat' },
  { value: 'lolo', label: 'LOLO' },
  { value: 'inap', label: 'Inap' },
  { value: 'terminal_depo', label: 'Terminal / Depo' },
  { value: 'tunggu', label: 'Tunggu' },
  { value: 'reimbursement', label: 'Reimbursement' },
  { value: 'lainnya', label: 'Lainnya' },
];
const EXPENSE_PAYMENT_STATUS_OPTIONS = [
  { value: 'belum_dibayar', label: 'Belum Dibayar' },
  { value: 'pending_pembayaran', label: 'Pending Pembayaran' },
  { value: 'sudah_dibayar', label: 'Sudah Dibayar' },
  { value: 'ditahan_sopir', label: 'Ditahan Sopir' },
  { value: 'dipakai_job_berikutnya', label: 'Dipakai Job Berikutnya' },
];
const EXPENSE_FINANCE_STATUS_OPTIONS = [
  { value: 'belum_dicek', label: 'Belum Dicek' },
  { value: 'sudah_dicek', label: 'Sudah Dicek' },
  { value: 'perlu_klarifikasi', label: 'Perlu Klarifikasi' },
  { value: 'dikoreksi', label: 'Dikoreksi' },
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

function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value || '-';
}

function getJobStatusLabel(status) {
  if (status === 'completed') return 'Selesai';
  if (status === 'running') return 'Sedang Jalan';
  if (status === 'inap') return 'Inap';
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

function isHistoricalJob(job) {
  return job?.entrySource === 'historical' || Boolean(job?.historicalPeriod);
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

function isInapJob(job) {
  return job?.status === 'inap';
}

function hasInapHistory(job) {
  return Boolean(job?.inapStartedAt || job?.inapReason);
}

function canMarkInap(job) {
  return Boolean(job && job.status === 'running');
}

function inapSummary(job) {
  return {
    startedAt: job?.inapStartedAt ? formatDateTime(job.inapStartedAt) : 'Waktu inap belum diisi',
    endedAt: job?.inapEndedAt ? formatDateTime(job.inapEndedAt) : '',
    reason: job?.inapReason || 'Alasan inap belum diisi',
    notes: job?.inapNotes || '',
  };
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
  if (job?.rpujStatus === 'approved') return 'approved';
  if (job?.rpujStatus === 'submitted') return 'submitted';
  return 'queue';
}

function rpujDetail(job) {
  if (job?.status === 'cancelled') return { tone: 'cancelled', label: 'Tidak Diproses', helper: 'Job sudah batal' };
  if (job?.rpujStatus === 'paid') return { tone: 'paid', label: 'Bukti Tercatat', helper: 'Bukti pembayaran tersedia' };
  if (job?.rpujStatus === 'approved') return { tone: 'approved', label: 'Dicek Finance', helper: 'Catatan sudah dicek' };
  if (job?.rpujStatus === 'submitted') return { tone: 'submitted', label: 'Biaya Tercatat', helper: 'Pemakaian saldo tercatat' };
  if (job?.rpujStatus === 'rejected') return {
    tone: 'rejected',
    label: 'Perlu Koreksi',
    helper: job.rpujRejectionNote || 'Perbaiki catatan biaya',
  };
  return { tone: 'queue', label: 'Belum Dicatat', helper: 'Catat biaya perjalanan' };
}

function nextActionHint(job, documents, rpuj, { documentFollowUp = false, repoSummary = null } = {}) {
  if (job?.status === 'cancelled') return null;
  if (repoSummary) return { label: 'Perlu ambil container', tone: 'repo' };
  if (isInapJob(job)) return { label: 'Sedang inap', tone: 'warning' };
  if (documentFollowUp && documents.missing.length) return { label: 'Dokumen belum lengkap', tone: 'warning' };
  if (!String(job?.containerNumber || '').trim()) return { label: 'Isi nomor container', tone: 'warning' };
  if (rpuj.tone === 'rejected') return { label: 'Koreksi biaya', tone: 'danger' };
  if (rpuj.tone === 'queue') return { label: 'Catat biaya', tone: 'warning' };
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
  const running = jobs.filter((job) => job.status === 'running' || isInapJob(job) || isRepoStoredJob(job)).length;
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
  const [serverTotalRows, setServerTotalRows] = useState(0);
  const [statusCounts, setStatusCounts] = useState(EMPTY_STATUS_COUNTS);
  const [rpujCounts, setRpujCounts] = useState({ queue: 0, submitted: 0, approved: 0, paid: 0 });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [rpujStage, setRpujStage] = useState('');
  const [tripDateFilter, setTripDateFilter] = useState('');
  const [completedDateFilter, setCompletedDateFilter] = useState('');
  const [mobileRpujFilterOpen, setMobileRpujFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(archive.isDatabaseMode);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoadingId, setDetailLoadingId] = useState('');
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
  const [inapTarget, setInapTarget] = useState(null);
  const [inapForm, setInapForm] = useState({ inapReason: '', inapNotes: '' });
  const [inapSaving, setInapSaving] = useState(false);
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
  const activeRpujFilterLabel = rpujStageOptions.find((option) => option.value === rpujStage)?.label || 'Filter Saldo';
  const repoLocationValid = repoForm.repoLocation.trim().length >= 3;
  const repoReasonValid = repoForm.repoReason.trim().length >= 8;
  const repoConditionValid = ['empty', 'loaded'].includes(repoForm.repoContainerCondition);
  const repoEirNumberValid = Boolean(repoForm.repoEirNumber.trim());
  const repoEirValid = Boolean(repoForm.repoEirDocument || repoTarget?.repoEirDocument);
  const repoFormValid = Boolean(repoTarget && !repoMissing.length && repoLocationValid && repoReasonValid && repoConditionValid && repoEirNumberValid && repoEirValid);
  const inapReasonValid = inapForm.inapReason.trim().length >= 8;
  const inapFormValid = Boolean(inapTarget && inapReasonValid);
  const effectiveStatus = repoStorageOnly ? 'repo_stored' : status;
  const effectiveTripDateFilter = documentFollowUp || repoStorageOnly ? '' : tripDateFilter;
  const effectiveCompletedDateFilter = documentFollowUp || repoStorageOnly ? '' : completedDateFilter;
  const canManageHistoricalEntry = hasPermission(user, 'historical_entry.manage') || user?.role === USER_ROLES.ADMIN;
  const entrySourceFilter = canManageHistoricalEntry ? '' : 'realtime';

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

  useEffect(() => {
    if (!inapTarget) return undefined;

    function closeInapOnEscape(event) {
      if (event.key === 'Escape' && !inapSaving) setInapTarget(null);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeInapOnEscape);
    return () => {
      document.body.style.overflow = detail ? 'hidden' : '';
      window.removeEventListener('keydown', closeInapOnEscape);
    };
  }, [detail, inapSaving, inapTarget]);

  const demoJobs = useMemo(() => flattenDemoJobs(archive.orders), [archive.orders]);
  const filteredDemoJobs = useMemo(() => sortOperationalJobs(demoJobs.filter((job) => {
    const matchesQuery = !query || [
      job.soNumber, job.doNumber, job.customer, job.containerNumber, job.driver, job.plateNumber,
    ].some((value) => value?.toLowerCase().includes(query.toLowerCase()));
    const matchesRpujStage = !rpujStage || (job.status !== 'cancelled' && getRpujStage(job) === rpujStage);
    const matchesRepoStorage = !repoStorageOnly || isRepoStoredJob(job);
    const matchesStatus = !effectiveStatus || (effectiveStatus === 'repo_stored' ? isRepoStoredJob(job) : job.status === effectiveStatus);
    const matchesTripDate = !effectiveTripDateFilter || getDateFilterKey(job.tripDate) === effectiveTripDateFilter;
    const matchesCompletedDate = !effectiveCompletedDateFilter || getDateFilterKey(job.completedAt) === effectiveCompletedDateFilter;
    const matchesDocumentFollowUp = !documentFollowUp
      || (job.status === 'completed' && documentState(job).completed < documentState(job).total);
    return matchesQuery && matchesStatus && matchesRpujStage && matchesRepoStorage && matchesTripDate && matchesCompletedDate && matchesDocumentFollowUp;
  })), [demoJobs, documentFollowUp, effectiveCompletedDateFilter, effectiveStatus, effectiveTripDateFilter, query, repoStorageOnly, rpujStage]);

  const visibleJobs = archive.isDatabaseMode ? databaseJobs : filteredDemoJobs;
  const allGroupedJobs = useMemo(() => groupJobsBySo(visibleJobs), [visibleJobs]);
  const counts = archive.isDatabaseMode ? statusCounts : {
    received: demoJobs.filter((job) => job.status === 'received').length,
    running: demoJobs.filter((job) => job.status === 'running').length,
    inap: demoJobs.filter((job) => isInapJob(job)).length,
    repo_stored: demoJobs.filter((job) => isRepoStoredJob(job)).length,
    completed: demoJobs.filter((job) => job.status === 'completed').length,
    cancelled: demoJobs.filter((job) => job.status === 'cancelled').length,
  };
  const activeRpujCounts = archive.isDatabaseMode ? rpujCounts : {
    queue: demoJobs.filter((job) => job.status !== 'cancelled' && getRpujStage(job) === 'queue').length,
    submitted: demoJobs.filter((job) => job.status !== 'cancelled' && getRpujStage(job) === 'submitted').length,
    approved: demoJobs.filter((job) => job.status !== 'cancelled' && getRpujStage(job) === 'approved').length,
    paid: demoJobs.filter((job) => job.status !== 'cancelled' && getRpujStage(job) === 'paid').length,
  };
  const totalJobs = (counts.received || 0) + (counts.running || 0) + (counts.inap || 0) + (counts.repo_stored || 0) + (counts.completed || 0) + (counts.cancelled || 0);
  const totalItems = archive.isDatabaseMode ? serverTotalRows : filteredDemoJobs.length;
  const totalGroups = archive.isDatabaseMode ? serverTotal : allGroupedJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const groupedJobs = useMemo(() => (
    archive.isDatabaseMode ? allGroupedJobs : allGroupedJobs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  ), [allGroupedJobs, archive.isDatabaseMode, currentPage]);
  const groupShowingFrom = totalGroups ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const groupShowingTo = totalGroups
    ? archive.isDatabaseMode
      ? Math.min(groupShowingFrom + allGroupedJobs.length - 1, totalGroups)
      : Math.min(currentPage * PAGE_SIZE, totalGroups)
    : 0;
  const pendingCancelJobs = useMemo(() => (
    (archive.isDatabaseMode ? pendingDatabaseJobs : flattenPendingCancelJobs(archive.orders || []))
      .filter((job) => job && job.cancelRequestStatus === 'submitted')
  ), [archive.isDatabaseMode, archive.orders, pendingDatabaseJobs]);

  useEffect(() => {
    setPage(1);
  }, [query, rpujStage, status, effectiveTripDateFilter, effectiveCompletedDateFilter]);

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
        const result = await fetchContainerJobsPage({
          page,
          pageSize: PAGE_SIZE,
          groupByOrder: true,
          query,
          status: documentFollowUp ? 'completed' : effectiveStatus,
          rpujStage: documentFollowUp || repoStorageOnly ? '' : rpujStage,
          documentStatus: documentFollowUp ? 'incomplete' : '',
          tripDate: effectiveTripDateFilter,
          completedDate: effectiveCompletedDateFilter,
          entrySource: entrySourceFilter,
        });
        if (!active) return;
        setDatabaseJobs(result.rows);
        setServerTotal(result.total);
        setServerTotalRows(result.totalRows ?? result.total);
        setStatusCounts({ ...EMPTY_STATUS_COUNTS, ...result.counts });
        setRpujCounts({ queue: 0, submitted: 0, approved: 0, paid: 0, ...result.rpujCounts });
      } catch (requestError) {
        if (!active) return;
        setDatabaseJobs([]);
        setServerTotal(0);
        setServerTotalRows(0);
        setStatusCounts(EMPTY_STATUS_COUNTS);
        setRpujCounts({ queue: 0, submitted: 0, approved: 0, paid: 0 });
        setError(requestError.message || 'Data Container Job gagal dimuat dari database.');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [archive.isDatabaseMode, documentFollowUp, effectiveCompletedDateFilter, effectiveStatus, effectiveTripDateFilter, entrySourceFilter, listVersion, page, query, repoStorageOnly, rpujStage]);

  useEffect(() => {
    if (!archive.isDatabaseMode) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchContainerJobsPage({ page: 1, pageSize: 100, requestStatus: 'submitted', entrySource: entrySourceFilter });
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
  }, [archive.isDatabaseMode, entrySourceFilter, listVersion]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function openJobDetail(job) {
    if (!archive.isDatabaseMode) {
      setDetail(job);
      return;
    }

    setDetailLoadingId(job.id);
    try {
      const freshJob = await fetchContainerJob(job.id);
      setDetail(freshJob);
    } catch (requestError) {
      notify({ type: 'error', title: 'Detail gagal dimuat', message: requestError.message });
      setDetail(job);
    } finally {
      setDetailLoadingId('');
    }
  }

  async function updateOperational(form) {
    if (isHistoricalJob(editing) && !canManageHistoricalEntry) {
      notify({
        type: 'error',
        title: 'Data lama terkunci',
        message: 'Data historis Container Job hanya dapat diinput atau diubah oleh Admin.',
      });
      return;
    }

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
          ? `${containerNumber} berhasil diambil dari Repo dan lanjut Sedang Jalan dengan assignment perjalanan.`
          : `${containerNumber} berhasil disimpan dengan status ${getJobStatusLabel(form.status)}.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Proses gagal disimpan', message: requestError.message });
      throw requestError;
    }
  }

  // Aksi terpisah dari updateOperational -- cuma menulis default_driver_id/name di master truck,
  // tidak pernah menyentuh container job yang sedang diedit. Feedback sukses/gagal ditampilkan
  // inline di OperationalForm sendiri (bukan toast di sini) supaya tidak dobel notifikasi.
  async function setTruckDefaultDriver(truckId, payload) {
    const saved = await updateTruckDefaultDriver(truckId, payload);
    archive.refresh?.();
    return saved;
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

  function openInap(job) {
    setInapTarget(job);
    setInapForm({ inapReason: '', inapNotes: '' });
  }

  async function submitInap(event) {
    event.preventDefault();
    if (!inapFormValid || inapSaving) return;

    const actorName = user?.fullName || user?.name || 'Operational';
    const payload = {
      status: 'inap',
      inapReason: inapForm.inapReason.trim(),
      inapNotes: inapForm.inapNotes.trim(),
      updatedBy: actorName,
    };

    setInapSaving(true);
    try {
      const saved = await archive.updateJob(inapTarget.id, payload);
      if (archive.isDatabaseMode) {
        if (saved) setDatabaseJobs((current) => current.map((job) => (job.id === saved.id ? saved : job)));
        setListVersion((value) => value + 1);
        archive.refresh?.();
      }
      setDetail(null);
      setInapTarget(null);
      notify({
        title: 'Container ditandai inap',
        message: `${containerLabel(inapTarget)} ditandai inap. Truck dan sopir tetap terkunci ke job ini.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Penandaan inap gagal', message: requestError.message });
    } finally {
      setInapSaving(false);
    }
  }

  async function resumeFromInap(job) {
    const actorName = user?.fullName || user?.name || 'Operational';
    try {
      const saved = await archive.updateJob(job.id, {
        status: 'running',
        containerNumber: job.containerNumber,
        driver: job.driver,
        plateNumber: job.plateNumber,
        updatedBy: actorName,
      });
      if (archive.isDatabaseMode) {
        if (saved) setDatabaseJobs((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setListVersion((value) => value + 1);
        archive.refresh?.();
      }
      setDetail(null);
      notify({ title: 'Perjalanan dilanjutkan', message: `${containerLabel(job)} keluar dari status inap.` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Gagal melanjutkan perjalanan', message: requestError.message });
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
              ['inap', 'Inap', counts.inap],
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
          <span>Saldo</span>
          <div className="job-rpuj-tabs" role="tablist" aria-label="Status pencatatan saldo perjalanan">
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
          <label className={`operational-date-filter ${effectiveCompletedDateFilter ? 'active' : ''}`.trim()}>
            <CheckCircle2 size={15} />
            <span>Tanggal Selesai</span>
            <input
              aria-label="Filter tanggal selesai"
              type="date"
              value={completedDateFilter}
              onChange={(event) => setCompletedDateFilter(event.target.value)}
            />
          </label>
          <small>Menampilkan {totalGroups} SO dari {totalItems} container job</small>
          {query.trim() || effectiveStatus || rpujStage || effectiveTripDateFilter || effectiveCompletedDateFilter ? (
            <button className="filter-reset-link" type="button" onClick={() => {
              setQuery('');
              setStatus('');
              setRpujStage('');
              setTripDateFilter('');
              setCompletedDateFilter('');
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
                <div className="operational-container-header" aria-hidden="true">
                  <span>No / Container</span>
                  <span>Status</span>
                  <span>Saldo</span>
                  <span>Assignment</span>
                  <span>Dokumen</span>
                  <span>Aksi</span>
                </div>
                {group.jobs.map((job, jobIndex) => {
                  const documents = documentState(job);
                  const shipmentLabel = formatShipmentLabel(job.shipment || job.jobType);
                  const hasContainerNumber = Boolean(job.containerNumber);
                  const sizeTypeLabel = [job.size, job.type].filter(Boolean).join(' / ') || '-';
                  const rpuj = rpujDetail(job);
                  const documentPercent = (documents.completed / documents.total) * 100;
                  const repoSummary = isRepoStoredJob(job) ? repoStorageSummary(job) : null;
                  const actionHint = nextActionHint(job, documents, rpuj, { documentFollowUp, repoSummary });
                  const historicalLocked = isHistoricalJob(job) && !canManageHistoricalEntry;
                  return (
                    <article className={`operational-container-row ${repoSummary ? 'is-repo-stored' : ''}`} key={job.id}>
                      <div className="container-row-main">
                        <div className="container-row-title">
                          <span className="container-sequence" title={`Container ${jobIndex + 1} dari ${group.jobs.length}`}>#{jobIndex + 1}</span>
                          <strong className={hasContainerNumber ? '' : 'is-empty'}>{containerLabel(job)}</strong>
                        </div>
                        <small>{repoSummary ? `Container Titip - ${repoSummary.reason}` : `${shipmentLabel} - ${sizeTypeLabel}`}</small>
                        {historicalLocked ? <em className="container-action-hint warning">Data Lama - Admin only</em> : null}
                        {repoSummary && actionHint ? <em className={`container-action-hint ${actionHint.tone}`}>{actionHint.label}</em> : null}
                      </div>
                      <div className="container-row-status">
                        <StatusBadge status={job.status} />
                        {actionHint ? <em className={`container-action-hint ${actionHint.tone}`}>{actionHint.label}</em> : null}
                      </div>
                      <div className={`container-rpuj-status ${rpuj.tone}`}>
                        <span>Saldo</span>
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
                        <button className="secondary-button" type="button" disabled={detailLoadingId === job.id} onClick={() => openJobDetail(job)}><Eye size={14} /> {detailLoadingId === job.id ? 'Memuat' : 'Detail'}</button>
                        {canEdit && !historicalLocked && canStoreRepoJob(job) ? <button className="secondary-button repo-action-button" type="button" onClick={() => openRepoStorage(job)}><Archive size={14} /> Titipkan</button> : null}
                        {canEdit && !historicalLocked && isRepoStoredJob(job) ? <button className="operational-primary-action repo" type="button" onClick={() => openRepoPickup(job)}><Truck size={14} /> Ambil Container</button> : null}
                        {canEdit && !historicalLocked && canMarkInap(job) ? <button className="secondary-button repo-action-button" type="button" onClick={() => openInap(job)}><Moon size={14} /> Tandai Inap</button> : null}
                        {canEdit && !historicalLocked && isInapJob(job) ? <button className="operational-primary-action" type="button" onClick={() => resumeFromInap(job)}><CheckCircle2 size={14} /> Selesai Inap</button> : null}
                        {canEdit && !historicalLocked && !isRepoStoredJob(job) && !isInapJob(job) && !['cancelled'].includes(job.status) ? <button className="operational-primary-action" type="button" onClick={() => setEditing(job)}>{documentFollowUp ? 'Lengkapi' : 'Update'}</button> : null}
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
              <section className="container-detail-billing"><h3>Biaya Lainnya & SPK</h3><div><span>Biaya Lainnya<strong>{detailOtherCost.amountLabel}</strong></span><span>Catatan Biaya<strong>{detailOtherCost.notes}</strong></span><span>Status Saldo<strong>{detailRpuj.label}</strong><small>{detail.rpujRejectionNote || detailRpuj.helper}</small></span><span>No. SPK<strong>{detail.spkNumber || '-'}</strong></span><span>No. EIR<strong>{detail.eirNumber || '-'}</strong></span></div></section>
              <section className="container-detail-billing">
                <h3>Transaksi Biaya Lapangan</h3>
                <p className="section-helper-text">Pencatatan biaya dilakukan lewat menu Rekening Dropping.</p>
                <div>
                  {(detail.expenses || []).length ? (detail.expenses || []).map((expense) => (
                    <span key={expense.id}>
                      {optionLabel(EXPENSE_CATEGORY_OPTIONS, expense.category)}
                      <strong>{formatCurrency(expense.amount)}</strong>
                      <small>{optionLabel(EXPENSE_PAYMENT_STATUS_OPTIONS, expense.paymentStatus)} - {expense.description || expense.recipientName || '-'}</small>
                      <small>Finance: {optionLabel(EXPENSE_FINANCE_STATUS_OPTIONS, expense.financeCheckStatus || 'belum_dicek')}</small>
                      {expense.financeNote ? <small>Catatan: {expense.financeNote}</small> : null}
                      {expense.proofAttachment ? <DocumentLink file={expense.proofAttachment} label="Bukti" /> : null}
                    </span>
                  )) : <span>Belum ada transaksi biaya<strong>Rp 0</strong><small>Catat biaya lewat menu Rekening Dropping.</small></span>}
                </div>
              </section>
              <section className="container-detail-uj"><h3>Acuan Biaya Perjalanan</h3><UjRecommendationCard job={detail} destinations={archive.masters.destinations} /></section>
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
              {hasInapHistory(detail) ? (
                <section className="container-repo-summary">
                  <h3>Inap</h3>
                  <div>
                    <span>Mulai inap<strong>{inapSummary(detail).startedAt}</strong></span>
                    {detail.inapEndedAt ? <span>Selesai inap<strong>{formatDateTime(detail.inapEndedAt)}</strong></span> : null}
                    <span>Alasan<strong>{inapSummary(detail).reason}</strong></span>
                    <span>Dicatat oleh<strong>{detail.inapCreatedByName || detail.updatedBy || '-'}</strong></span>
                  </div>
                  {detail.inapNotes ? <p>{detail.inapNotes}</p> : null}
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
              {isHistoricalJob(detail) && !canManageHistoricalEntry ? <span className="container-action-hint warning">Data Lama - hanya Admin yang dapat mengubah.</span> : null}
              {canEdit && !(isHistoricalJob(detail) && !canManageHistoricalEntry) && canStoreRepoJob(detail) ? <button className="secondary-button repo-action-button" type="button" onClick={() => openRepoStorage(detail)}><Archive size={16} /> Titipkan Container</button> : null}
              {canEdit && !(isHistoricalJob(detail) && !canManageHistoricalEntry) && isRepoStoredJob(detail) ? <button className="operational-primary-action repo" type="button" onClick={() => openRepoPickup(detail)}><Truck size={16} /> Ambil Container</button> : null}
              {canEdit && !(isHistoricalJob(detail) && !canManageHistoricalEntry) && canMarkInap(detail) ? <button className="secondary-button repo-action-button" type="button" onClick={() => openInap(detail)}><Moon size={16} /> Tandai Inap</button> : null}
              {canEdit && !(isHistoricalJob(detail) && !canManageHistoricalEntry) && isInapJob(detail) ? <button className="operational-primary-action" type="button" onClick={() => resumeFromInap(detail)}><CheckCircle2 size={16} /> Selesai Inap</button> : null}
              {canEdit && !(isHistoricalJob(detail) && !canManageHistoricalEntry) && !hasRepoStorageHistory(detail) && !['completed', 'cancelled'].includes(detail.status) ? <button className="danger-button" type="button" onClick={() => openCancelOperational(detail)}><Ban size={16} /> Batalkan Job</button> : null}
              {canEdit && !(isHistoricalJob(detail) && !canManageHistoricalEntry) && !isRepoStoredJob(detail) && !isInapJob(detail) && !['cancelled'].includes(detail.status) ? <button className="operational-primary-action" type="button" onClick={() => { setEditing(detail); setDetail(null); }}>Update Proses</button> : null}
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

      {inapTarget ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => !inapSaving && setInapTarget(null)}>
          <section className="container-repo-modal" role="dialog" aria-modal="true" aria-labelledby="container-inap-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span><Moon size={18} /></span>
              <div>
                <h2 id="container-inap-title">Tandai Inap</h2>
                <p>{containerLabel(inapTarget)} - {inapTarget.soNumber || '-'} - {inapTarget.customer || '-'}</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup penandaan inap" disabled={inapSaving} onClick={() => setInapTarget(null)}><X size={18} /></button>
            </header>
            <form onSubmit={submitInap}>
              <div className="repo-assignment-snapshot">
                <span>Truck<strong>{inapTarget.plateNumber || '-'}</strong></span>
                <span>Sopir<strong>{inapTarget.driver || '-'}</strong></span>
                <span>Status<strong>{getJobStatusLabel(inapTarget.status)}</strong></span>
              </div>
              <div className="container-repo-warning">
                <AlertTriangle size={16} />
                <span>Truck dan sopir TETAP terkunci ke job ini selama inap. Nominal biaya inap (kalau ada) diisi Finance, bukan di sini.</span>
              </div>
              <label>
                Alasan Inap
                <textarea
                  autoFocus
                  rows={3}
                  value={inapForm.inapReason}
                  onChange={(event) => setInapForm((current) => ({ ...current, inapReason: event.target.value }))}
                  placeholder="Contoh: Curfew malam, truk tidak boleh jalan sampai subuh"
                />
              </label>
              <label>
                Catatan Tambahan
                <textarea
                  rows={3}
                  value={inapForm.inapNotes}
                  onChange={(event) => setInapForm((current) => ({ ...current, inapNotes: event.target.value }))}
                  placeholder="Lokasi parkir, kondisi container, atau info lain (opsional)"
                />
              </label>
              <footer>
                <button className="secondary-button" type="button" disabled={inapSaving} onClick={() => setInapTarget(null)}>Batal</button>
                <button className="primary-button repo-submit-button" type="submit" disabled={!inapFormValid || inapSaving}>
                  <Moon size={16} /> {inapSaving ? 'Menyimpan...' : 'Simpan Inap'}
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
          onSetTruckDefaultDriver={setTruckDefaultDriver}
        />
      ) : null}
    </div>
  );
}

function documentFieldsForDetail(job) {
  return [
    ['Lampiran Biaya Lainnya', job.additionalCostDocument || job.spkDocument],
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
