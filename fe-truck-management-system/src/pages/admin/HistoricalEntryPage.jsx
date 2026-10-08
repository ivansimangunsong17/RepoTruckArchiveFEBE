import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Download, Lock, PencilLine, Plus, RefreshCw, Save, Unlock, X } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import DateTimeWibInput from '../../components/common/DateTimeWibInput';
import SalesOrderForm from '../../components/forms/SalesOrderForm';
import { useArchiveData } from '../../hooks/useArchiveData';
import { useFeedback } from '../../hooks/useFeedback';
import { fetchHistoricalEntryPeriod, updateHistoricalEntryPeriod } from '../../services/admin/historicalEntryService';
import { fetchSalesOrdersPage } from '../../services/archive/salesOrderService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import {
  buildReportCsv,
  downloadCsv,
  formatCsvDate,
  formatCsvDateTime,
  formatCsvStatus,
} from '../../utils/reportCsv';

const PAGE_SIZE = 8;
const FETCH_PAGE_SIZE = 100;

function previousMonthValue() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
  ].join('-');
}

function formatPeriod(value) {
  if (!value) return '-';
  const [year, month] = String(value).split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function periodFromDate(value, fallback = '') {
  const dateKey = String(value || '').trim().match(/^(\d{4}-\d{2})-/)?.[1] || '';
  return dateKey || fallback;
}

function getContainerSummary(order) {
  const containers = Array.isArray(order?.containers) ? order.containers : [];
  const total = containers.length || Number(order?.quantity || 0);
  const completed = containers.filter((container) => container.status === 'completed').length;
  const cancelled = containers.filter((container) => container.status === 'cancelled').length;
  if (!total) return '-';
  return `${total} container | ${completed} selesai | ${cancelled} batal`;
}

function hasValue(value) {
  return String(value ?? '').trim().length > 0;
}

function getJobValidationIssues(job, index) {
  const label = getJobLabel(job, index);
  const status = job?.status || 'received';
  const issues = [];
  if (status === 'cancelled') {
    if (!job?.cancelledAt) issues.push(`${label}: waktu batal belum diisi`);
    return issues;
  }
  if (!hasValue(job?.containerNumber)) issues.push(`${label}: nomor container belum diisi`);
  if (!hasValue(job?.driverId || job?.driver)) issues.push(`${label}: sopir belum diisi`);
  if (!hasValue(job?.vehicleId || job?.plateNumber)) issues.push(`${label}: truck belum diisi`);
  if (!job?.runningAt) issues.push(`${label}: waktu mulai belum diisi`);
  if (status !== 'completed') issues.push(`${label}: belum selesai`);
  if (status === 'completed' && !job?.completedAt) issues.push(`${label}: waktu selesai belum diisi`);
  if (job?.runningAt && job?.completedAt && new Date(job.completedAt) < new Date(job.runningAt)) {
    issues.push(`${label}: waktu selesai lebih awal dari mulai`);
  }
  return issues;
}

function getOrderValidation(order) {
  const containers = Array.isArray(order?.containers) ? order.containers : [];
  const orderIssues = [];
  if (!hasValue(order?.soNumber)) orderIssues.push('Nomor SO belum diisi');
  if (!containers.length) {
    return {
      issueCount: orderIssues.length + 1,
      containerIssueCount: 0,
      firstIssue: orderIssues[0] || 'Container belum terbentuk',
      complete: false,
      cancelled: order?.status === 'cancelled',
    };
  }
  const jobIssues = containers.map((container, index) => getJobValidationIssues(container, index));
  const issues = [...orderIssues, ...jobIssues.flat()];
  const cancelled = containers.every((container) => container.status === 'cancelled');
  return {
    issueCount: issues.length,
    containerIssueCount: jobIssues.filter((items) => items.length > 0).length,
    firstIssue: issues[0] || 'Lengkap',
    complete: issues.length === 0,
    cancelled,
  };
}

function buildHistoricalSummary(orders = []) {
  const auditedOrders = orders.map((order) => ({ order, validation: getOrderValidation(order) }));
  return auditedOrders.reduce((result, item) => {
    const containers = Array.isArray(item.order?.containers) ? item.order.containers : [];
    return {
      orders: result.orders + 1,
      containers: result.containers + Number(item.order?.quantity || containers.length || 0),
      completedContainers: result.completedContainers + containers.filter((container) => container.status === 'completed').length,
      cancelledContainers: result.cancelledContainers + containers.filter((container) => container.status === 'cancelled').length,
      issueOrders: result.issueOrders + (item.validation.issueCount > 0 ? 1 : 0),
      completeOrders: result.completeOrders + (item.validation.complete ? 1 : 0),
    };
  }, {
    orders: 0,
    containers: 0,
    completedContainers: 0,
    cancelledContainers: 0,
    issueOrders: 0,
    completeOrders: 0,
  });
}

function getPeriodReadiness(summary) {
  if (!summary.orders) {
    return {
      status: 'empty',
      title: 'Belum ada data periode',
      message: 'Input Sales Order lama terlebih dahulu untuk periode ini.',
      action: 'Input Data Lama',
      tone: 'neutral',
    };
  }
  if (summary.issueOrders > 0) {
    return {
      status: 'needs_action',
      title: 'Belum siap dipakai laporan',
      message: `${summary.issueOrders} Sales Order masih perlu dilengkapi sebelum data periode ini dianggap rapi.`,
      action: 'Lihat Yang Perlu Dilengkapi',
      tone: 'warning',
    };
  }
  return {
    status: 'ready',
    title: 'Siap dipakai laporan',
    message: 'Semua Sales Order historical pada periode ini sudah lengkap berdasarkan validasi sistem.',
    action: 'Export Validasi',
    tone: 'success',
  };
}

function buildHistoricalValidationRows(orders = []) {
  return orders.flatMap((order, orderIndex) => {
    const containers = Array.isArray(order?.containers) ? order.containers : [];
    if (!containers.length) {
      const validation = getOrderValidation(order);
      return [[
        orderIndex + 1,
        order.historicalPeriod || '',
        formatCsvDate(order.tripDate),
        order.soNumber || '',
        order.customer || '',
        order.destination || '',
        '',
        '',
        '',
        '',
        '',
        '',
        formatCsvStatus(order.status),
        '',
        '',
        '',
        validation.complete ? 'Lengkap' : 'Perlu Dilengkapi',
        validation.firstIssue,
        order.historicalNotes || '',
      ]];
    }

    return containers.map((job, jobIndex) => {
      const issues = getJobValidationIssues(job, jobIndex);
      return [
        `${orderIndex + 1}.${jobIndex + 1}`,
        order.historicalPeriod || job.historicalPeriod || '',
        formatCsvDate(order.tripDate),
        order.soNumber || '',
        order.customer || '',
        order.destination || '',
        jobIndex + 1,
        job.containerNumber || '',
        job.containerSize || job.size || '',
        job.containerType || job.type || '',
        job.plateNumber || '',
        job.driver || '',
        formatCsvStatus(job.status),
        formatCsvDateTime(job.runningAt),
        formatCsvDateTime(job.completedAt),
        formatCsvDateTime(job.cancelledAt),
        issues.length ? 'Perlu Dilengkapi' : 'Lengkap',
        issues.join('; '),
        job.historicalNotes || order.historicalNotes || '',
      ];
    });
  });
}

function buildHistoricalValidationCsv({ period, rows, summary }) {
  return buildReportCsv({
    title: 'Validasi Data Lama',
    filters: [
      ['Periode Data', formatPeriod(period)],
      ['Sales Order', summary.orders],
      ['Total Container', summary.containers],
      ['Container Selesai', summary.completedContainers],
      ['Order Perlu Cek', summary.issueOrders],
      ['Order Lengkap', summary.completeOrders],
    ],
    headers: [
      'No',
      'Periode',
      'Tanggal Jalan',
      'Nomor SO',
      'Customer',
      'Tujuan',
      'Container Ke',
      'Nomor Container',
      'Ukuran',
      'Tipe',
      'Truck',
      'Sopir',
      'Status',
      'Mulai Jalan',
      'Selesai',
      'Batal',
      'Status Validasi',
      'Catatan Validasi',
      'Catatan Data Lama',
    ],
    rows: buildHistoricalValidationRows(rows),
  });
}

function buildExportFilename(period) {
  return `validasi-data-lama-${String(period || 'semua').replace(/[^0-9a-z-]/gi, '-')}.csv`;
}

async function fetchPagedSalesOrders(params = {}) {
  const first = await fetchSalesOrdersPage({
    page: 1,
    pageSize: FETCH_PAGE_SIZE,
    ...params,
  });
  const rows = [...(first.rows || [])];
  const total = Number(first.total || rows.length || 0);
  const totalPages = Math.max(1, Math.ceil(total / FETCH_PAGE_SIZE));

  for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
    const next = await fetchSalesOrdersPage({
      page: nextPage,
      pageSize: FETCH_PAGE_SIZE,
      ...params,
    });
    rows.push(...(next.rows || []));
  }

  return rows;
}

async function fetchHistoricalOrders({ period }) {
  const [historicalRows, runningRealtimeRows, waitingRealtimeRows] = await Promise.all([
    fetchPagedSalesOrders({
      entrySource: 'historical',
      historicalPeriod: period,
    }),
    fetchPagedSalesOrders({
      status: 'running',
      entrySource: 'realtime',
    }),
    fetchPagedSalesOrders({
      status: 'waiting_operational',
      entrySource: 'realtime',
    }),
  ]);
  const realtimeRows = [...runningRealtimeRows, ...waitingRealtimeRows];
  const periodRows = period
    ? realtimeRows.filter((order) => periodFromDate(order.tripDate || order.soDate || order.plannedDate, '') === period)
    : realtimeRows;
  const rowsById = new Map();

  [...historicalRows, ...periodRows].forEach((order) => {
    if (!order?.id || rowsById.has(order.id)) return;
    rowsById.set(order.id, order);
  });

  return Array.from(rowsById.values()).sort((left, right) => String(right.tripDate || '').localeCompare(String(left.tripDate || '')));
}

function getOrderStatusLabel(value) {
  const labels = {
    waiting_operational: 'Belum Jalan',
    received: 'Belum Jalan',
    running: 'Sedang Jalan',
    completed: 'Selesai',
    cancelled: 'Batal',
  };
  return labels[value] || value || '-';
}

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const pad = (part) => String(part).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getTruckPlate(truck) {
  return truck?.plateNumber || truck?.plate_number || truck?.registrationNumber || '';
}

function getTruckUnitCode(truck) {
  return truck?.unitCode || truck?.unit_code || truck?.code || '';
}

function getTruckDetail(truck) {
  return [
    getTruckUnitCode(truck),
    truck?.brand,
    truck?.vehicleType || truck?.vehicle_type,
  ].filter(Boolean).join(' - ');
}

function normalizeContainerSize(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (normalized === 'COMBO') return 'COMBO';
  if (normalized === '40FT') return '40FT';
  if (normalized === '20FT') return '20FT';
  return '';
}

function getTruckCapacity(truck) {
  return normalizeContainerSize(
    truck?.capacity
    || truck?.containerSize
    || truck?.container_size
    || truck?.chassisSize
    || truck?.chassis_size
    || truck?.size,
  );
}

function getContainerJobSize(job) {
  return normalizeContainerSize(job?.containerSize || job?.container_size || job?.size);
}

function truckSizeMismatchForJob(truck, job) {
  const truckCapacity = getTruckCapacity(truck);
  const jobSize = getContainerJobSize(job);
  if (!truck || !jobSize || !truckCapacity || truckCapacity === 'COMBO') return false;
  // Kapasitas hierarkis: truck 40FT juga sah untuk container 20FT.
  if (truckCapacity === '40FT' && jobSize === '20FT') return false;
  return truckCapacity !== jobSize;
}

function getDriverName(driver) {
  return driver?.nickname || driver?.name || driver?.fullName || driver?.full_name || '';
}

function getJobLabel(job, index) {
  return job?.containerNumber || job?.container_number || `Container ${index + 1}`;
}

function getJobStatusClass(status) {
  if (status === 'completed') return 'is-completed';
  if (status === 'running' || status === 'repo_stored') return 'is-running';
  if (status === 'cancelled') return 'is-cancelled';
  return '';
}

const JOB_STATUS_OPTIONS = [
  ['completed', 'Selesai'],
  ['cancelled', 'Batal'],
];

function getHistoricalEditableStatus(status) {
  return status === 'cancelled' ? 'cancelled' : 'completed';
}

function preventEnterSubmit(event) {
  if (event.key !== 'Enter') return;
  const tagName = String(event.target?.tagName || '').toLowerCase();
  const inputType = String(event.target?.type || '').toLowerCase();
  if (tagName === 'textarea' || inputType === 'button' || inputType === 'submit') return;
  event.preventDefault();
}

function HistoricalEntryPage() {
  const archive = useArchiveData();
  const { notify } = useFeedback();
  const [period, setPeriod] = useState(previousMonthValue);
  const [notes, setNotes] = useState('');
  const [sourceRows, setSourceRows] = useState([]);
  const [auditFilter, setAuditFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(archive.isDatabaseMode);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [orderFormOrder, setOrderFormOrder] = useState(null);
  const [listVersion, setListVersion] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  const [jobForm, setJobForm] = useState(null);
  const [jobSaving, setJobSaving] = useState(false);
  const [periodState, setPeriodState] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [soNumberOrder, setSoNumberOrder] = useState(null);
  const [soNumberForm, setSoNumberForm] = useState('');
  const [soNumberSaving, setSoNumberSaving] = useState(false);

  const localRows = useMemo(() => (
    (archive.orders || [])
      .filter((order) => (
        (order.entrySource === 'historical' && (!period || order.historicalPeriod === period))
        || (
          ['waiting_operational', 'received', 'running'].includes(order.status)
          && (order.entrySource || 'realtime') !== 'historical'
          && (!period || periodFromDate(order.tripDate || order.soDate || order.plannedDate, '') === period)
        )
      ))
      .sort((left, right) => String(right.tripDate || '').localeCompare(String(left.tripDate || '')))
  ), [archive.orders, period]);

  const truckOptions = useMemo(() => (
    (archive.masters?.trucks || []).filter((truck) => !truck.archivedAt && !truck.archived_at)
  ), [archive.masters?.trucks]);

  const driverOptions = useMemo(() => (
    (archive.masters?.drivers || []).filter((driver) => !driver.archivedAt && !driver.archived_at)
  ), [archive.masters?.drivers]);

  const selectedTruck = useMemo(() => (
    truckOptions.find((truck) => String(truck.id) === String(jobForm?.vehicleId || '')) || null
  ), [jobForm?.vehicleId, truckOptions]);
  const selectedTruckSizeMismatch = useMemo(() => (
    editingJob ? truckSizeMismatchForJob(selectedTruck, editingJob) : false
  ), [editingJob, selectedTruck]);

  const auditRows = useMemo(() => (
    sourceRows.map((order) => ({
      ...order,
      validation: getOrderValidation(order),
    }))
  ), [sourceRows]);

  const filteredRows = useMemo(() => (
    auditRows.filter((order) => {
      if (auditFilter === 'needs_action') return order.validation.issueCount > 0;
      if (auditFilter === 'complete') return order.validation.complete;
      if (auditFilter === 'cancelled') return order.validation.cancelled;
      return true;
    })
  ), [auditFilter, auditRows]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = useMemo(() => filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredRows, page]);
  const historicalSummary = useMemo(() => buildHistoricalSummary(sourceRows), [sourceRows]);
  const periodReadiness = useMemo(() => getPeriodReadiness(historicalSummary), [historicalSummary]);
  const periodLocked = periodState?.status === 'locked';
  const filterCounts = useMemo(() => ({
    all: auditRows.length,
    needs_action: auditRows.filter((order) => order.validation.issueCount > 0).length,
    complete: auditRows.filter((order) => order.validation.complete).length,
    cancelled: auditRows.filter((order) => order.validation.cancelled).length,
  }), [auditRows]);

  useEffect(() => {
    setPage(1);
  }, [period, auditFilter]);

  useEffect(() => {
    if (!archive.isDatabaseMode) {
      setSourceRows(localRows);
      setLoading(false);
      setError('');
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const resultRows = await fetchHistoricalOrders({ period });
        if (!active) return;
        setSourceRows(resultRows);
      } catch (requestError) {
        if (!active) return;
        setSourceRows([]);
        setError(requestError.message || 'Data lama gagal dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [archive.isDatabaseMode, listVersion, localRows, period]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!archive.isDatabaseMode || !period) {
      setPeriodState({ period, status: 'draft' });
      setPeriodLoading(false);
      return undefined;
    }

    let active = true;
    setPeriodLoading(true);
    fetchHistoricalEntryPeriod(period)
      .then((result) => {
        if (active) setPeriodState(result || { period, status: 'draft' });
      })
      .catch(() => {
        if (active) setPeriodState({ period, status: 'draft' });
      })
      .finally(() => {
        if (active) setPeriodLoading(false);
      });

    return () => {
      active = false;
    };
  }, [archive.isDatabaseMode, period, listVersion]);

  useEffect(() => {
    if (!selectedOrder?.id) return;
    const refreshedOrder = auditRows.find((order) => order.id === selectedOrder.id);
    if (refreshedOrder) setSelectedOrder(refreshedOrder);
  }, [auditRows, selectedOrder?.id]);

  async function saveHistoricalOrder(form) {
    const existingOrder = orderFormOrder;
    const targetPeriod = periodFromDate(form.tripDate || form.plannedDate || form.soDate, period);
    const currentOrderPeriod = existingOrder ? periodFromDate(existingOrder.tripDate || existingOrder.soDate, existingOrder.historicalPeriod || period) : period;
    if (periodLocked && (targetPeriod === period || currentOrderPeriod === period)) {
      notify({ type: 'error', title: 'Periode terkunci', message: 'Buka kunci periode terlebih dahulu untuk mengubah data lama.' });
      return;
    }
    const receivedAt = form.receivedAt || existingOrder?.receivedAt || `${form.tripDate || `${targetPeriod}-01`}T00:00:00.000Z`;
    try {
      await archive.upsertOrder({
        ...form,
        receivedAt,
        entrySource: 'historical',
        historicalPeriod: targetPeriod,
        historicalNotes: form.historicalNotes || existingOrder?.historicalNotes || notes.trim(),
      }, existingOrder);
      setFormOpen(false);
      setOrderFormOrder(null);
      if (targetPeriod && targetPeriod !== period) setPeriod(targetPeriod);
      setListVersion((value) => value + 1);
      notify({
        title: existingOrder ? 'Data lama diperbarui' : 'Data lama disimpan',
        message: `Sales Order periode ${formatPeriod(targetPeriod)} berhasil ${existingOrder ? 'diperbarui' : 'ditambahkan'}.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Data lama gagal disimpan', message: requestError.message });
    }
  }

  function openHistoricalOrderForm(order = null) {
    if (periodLocked) {
      notify({ type: 'error', title: 'Periode terkunci', message: 'Buka kunci periode terlebih dahulu untuk mengubah data lama.' });
      return;
    }
    setOrderFormOrder(order);
    setFormOpen(true);
  }

  function closeHistoricalOrderForm() {
    setFormOpen(false);
    setOrderFormOrder(null);
  }

  function openSoNumberForm(order) {
    if (periodLocked) {
      notify({ type: 'error', title: 'Periode terkunci', message: 'Buka kunci periode terlebih dahulu untuk mengisi nomor SO.' });
      return;
    }
    setSoNumberOrder(order);
    setSoNumberForm(order.soNumber || '');
  }

  function closeSoNumberForm() {
    if (soNumberSaving) return;
    setSoNumberOrder(null);
    setSoNumberForm('');
  }

  async function saveSoNumber(event) {
    event.preventDefault();
    if (!soNumberOrder) return;
    const soNumber = soNumberForm.trim();
    if (!soNumber) {
      notify({ type: 'error', title: 'Nomor SO belum diisi', message: 'Isi nomor SO dari data lama terlebih dahulu.' });
      return;
    }
    const duplicate = sourceRows.some((order) => (
      order.id !== soNumberOrder.id
      && String(order.soNumber || '').trim().toLowerCase() === soNumber.toLowerCase()
    ));
    if (duplicate) {
      notify({ type: 'error', title: 'Nomor SO sudah ada', message: 'Gunakan nomor SO yang berbeda.' });
      return;
    }

    try {
      setSoNumberSaving(true);
      const targetPeriod = periodFromDate(soNumberOrder.tripDate, soNumberOrder.historicalPeriod || period);
      await archive.upsertOrder({
        ...soNumberOrder,
        soNumber,
        financeVerificationStatus: 'verified',
        entrySource: 'historical',
        historicalPeriod: targetPeriod,
        historicalNotes: soNumberOrder.historicalNotes || notes.trim(),
      }, soNumberOrder);
      setSoNumberOrder(null);
      setSoNumberForm('');
      if (targetPeriod && targetPeriod !== period) setPeriod(targetPeriod);
      setListVersion((value) => value + 1);
      archive.refresh?.();
      notify({ title: 'Nomor SO disimpan', message: `${soNumber} berhasil dipasang ke data lama.` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Nomor SO gagal disimpan', message: requestError.message });
    } finally {
      setSoNumberSaving(false);
    }
  }

  function exportValidation() {
    if (!sourceRows.length) {
      notify({ type: 'error', title: 'Belum ada data', message: `Belum ada data lama untuk periode ${formatPeriod(period)}.` });
      return;
    }
    const csv = buildHistoricalValidationCsv({
      period,
      rows: sourceRows,
      summary: historicalSummary,
    });
    downloadCsv(buildExportFilename(period), csv);
    notify({
      title: 'Export validasi dibuat',
      message: `Rekap validasi data lama periode ${formatPeriod(period)} berhasil diunduh.`,
    });
  }

  function handleReadinessAction() {
    if (periodReadiness.status === 'empty') {
      openHistoricalOrderForm();
      return;
    }
    if (periodReadiness.status === 'needs_action') {
      setAuditFilter('needs_action');
      return;
    }
    exportValidation();
  }

  function openRealization(order) {
    if (periodLocked) {
      notify({ type: 'error', title: 'Periode terkunci', message: 'Buka kunci periode terlebih dahulu untuk mengubah realisasi data lama.' });
      return;
    }
    setSelectedOrder(order);
    setEditingJob(null);
    setJobForm(null);
  }

  function openJobForm(job) {
    const status = getHistoricalEditableStatus(job.status);
    setEditingJob(job);
    setJobForm({
      containerNumber: job.containerNumber || '',
      status,
      driverId: job.driverId || '',
      vehicleId: job.vehicleId || '',
      runningAt: toDateTimeLocalValue(job.runningAt),
      completedAt: toDateTimeLocalValue(job.completedAt),
      cancelledAt: toDateTimeLocalValue(job.cancelledAt),
      cancelReason: job.cancelReason || '',
      historicalNotes: job.historicalNotes || selectedOrder?.historicalNotes || notes || '',
    });
  }

  function closeRealization() {
    if (jobSaving) return;
    setSelectedOrder(null);
    setEditingJob(null);
    setJobForm(null);
  }

  async function saveJobRealization(event) {
    event.preventDefault();
    if (!editingJob || !jobForm) return;
    if (periodLocked) {
      notify({ type: 'error', title: 'Periode terkunci', message: 'Buka kunci periode terlebih dahulu untuk menyimpan realisasi.' });
      return;
    }

    const status = jobForm.status || 'received';
    const requiresAssignment = ['running', 'completed'].includes(status);
    const runningAt = toIsoDateTime(jobForm.runningAt);
    const completedAt = toIsoDateTime(jobForm.completedAt);
    const cancelledAt = toIsoDateTime(jobForm.cancelledAt);

    if (requiresAssignment && !String(jobForm.containerNumber || '').trim()) {
      notify({ type: 'error', title: 'Nomor container belum diisi', message: 'Isi nomor container sebelum status dibuat berjalan atau selesai.' });
      return;
    }
    if (requiresAssignment && (!jobForm.vehicleId || !jobForm.driverId)) {
      notify({ type: 'error', title: 'Assignment belum lengkap', message: 'Pilih truck dan sopir untuk realisasi data lama.' });
      return;
    }
    if (requiresAssignment && !runningAt) {
      notify({ type: 'error', title: 'Waktu mulai belum diisi', message: 'Isi waktu mulai jalan untuk container ini.' });
      return;
    }
    if (status === 'completed' && !completedAt) {
      notify({ type: 'error', title: 'Waktu selesai belum diisi', message: 'Isi waktu selesai untuk container yang sudah selesai.' });
      return;
    }
    if (status === 'cancelled' && !cancelledAt) {
      notify({ type: 'error', title: 'Waktu batal belum diisi', message: 'Isi tanggal dan jam batal untuk container yang dibatalkan.' });
      return;
    }
    if (runningAt && completedAt && new Date(completedAt) < new Date(runningAt)) {
      notify({ type: 'error', title: 'Waktu tidak valid', message: 'Waktu selesai tidak boleh lebih awal dari waktu mulai.' });
      return;
    }
    if (runningAt && cancelledAt && new Date(cancelledAt) < new Date(runningAt)) {
      notify({ type: 'error', title: 'Waktu tidak valid', message: 'Waktu batal tidak boleh lebih awal dari waktu mulai.' });
      return;
    }

    const truck = truckOptions.find((item) => String(item.id) === String(jobForm.vehicleId));
    const driver = driverOptions.find((item) => String(item.id) === String(jobForm.driverId));
    const targetPeriod = periodFromDate(selectedOrder?.tripDate || editingJob.tripDate, selectedOrder?.historicalPeriod || period);
    const payload = {
      ...editingJob,
      containerNumber: String(jobForm.containerNumber || '').trim().toUpperCase(),
      status,
      driverId: jobForm.driverId || null,
      vehicleId: jobForm.vehicleId || null,
      driver: getDriverName(driver) || editingJob.driver || '',
      plateNumber: getTruckPlate(truck) || editingJob.plateNumber || '',
      unitCode: getTruckUnitCode(truck) || editingJob.unitCode || '',
      chassis: getTruckDetail(truck) || editingJob.chassis || '',
      runningAt: requiresAssignment ? runningAt : null,
      completedAt: status === 'completed' ? completedAt : null,
      cancelledAt: status === 'cancelled' ? cancelledAt : editingJob.cancelledAt || null,
      cancelReason: status === 'cancelled' ? jobForm.cancelReason || 'Pembatalan data lama' : editingJob.cancelReason || '',
      entrySource: 'historical',
      historicalPeriod: targetPeriod,
      historicalNotes: String(jobForm.historicalNotes || notes || selectedOrder?.historicalNotes || '').trim(),
    };

    try {
      setJobSaving(true);
      const saved = await archive.updateJob(editingJob.id, payload);
      if (archive.isDatabaseMode) {
        if (targetPeriod && targetPeriod !== period) setPeriod(targetPeriod);
        setListVersion((value) => value + 1);
        archive.refresh?.();
      } else {
        setSelectedOrder((current) => {
          if (!current) return current;
          const containers = (current.containers || []).map((container) => (container.id === editingJob.id ? { ...container, ...payload, ...saved } : container));
          return { ...current, containers };
        });
      }
      setEditingJob(null);
      setJobForm(null);
      notify({
        title: 'Realisasi disimpan',
        message: `${payload.containerNumber || 'Container'} berhasil diperbarui sebagai data lama.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Realisasi gagal disimpan', message: requestError.message });
    } finally {
      setJobSaving(false);
    }
  }

  async function togglePeriodLock() {
    if (!archive.isDatabaseMode) {
      notify({ type: 'error', title: 'Database belum aktif', message: 'Kunci periode hanya tersedia pada mode database.' });
      return;
    }
    if (!periodLocked && periodReadiness.status !== 'ready') {
      notify({ type: 'error', title: 'Periode belum siap', message: 'Lengkapi validasi data lama sebelum periode dikunci.' });
      setAuditFilter('needs_action');
      return;
    }

    try {
      setPeriodSaving(true);
      const nextStatus = periodLocked ? 'draft' : 'locked';
      const saved = await updateHistoricalEntryPeriod(period, {
        status: nextStatus,
        notes: notes.trim() || periodState?.notes || '',
      });
      setPeriodState(saved);
      setListVersion((value) => value + 1);
      notify({
        title: nextStatus === 'locked' ? 'Periode dikunci' : 'Periode dibuka',
        message: nextStatus === 'locked'
          ? `Data lama periode ${formatPeriod(period)} sudah dikunci untuk laporan.`
          : `Data lama periode ${formatPeriod(period)} bisa diedit kembali.`,
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Status periode gagal disimpan', message: requestError.message });
    } finally {
      setPeriodSaving(false);
    }
  }

  return (
    <div className="page-stack historical-entry-page">
      <PageHeader
        eyebrow="Admin"
        title="Input Data Lama"
        description="Gunakan halaman ini untuk memasukkan order bulan sebelumnya tanpa mengganggu input operasional harian."
        actions={(
          <button className="primary-button" type="button" disabled={periodLocked} onClick={() => openHistoricalOrderForm()}>
            <Plus size={18} /> Input Data Lama
          </button>
        )}
      />

      <section className="historical-entry-toolbar">
        <label>
          Periode Data
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <label className="historical-entry-notes">
          Catatan Batch
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Contoh: input backlog Juli 2026 dari file operasional"
          />
        </label>
        <div className="historical-entry-toolbar-actions">
          <button className="secondary-button" type="button" onClick={() => setListVersion((value) => value + 1)}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="secondary-button" type="button" disabled={loading || !sourceRows.length} onClick={exportValidation}>
            <Download size={16} /> Export Validasi
          </button>
          <button
            className={periodLocked ? 'secondary-button' : 'primary-button'}
            type="button"
            disabled={periodLoading || periodSaving || loading || (!periodLocked && periodReadiness.status !== 'ready')}
            onClick={togglePeriodLock}
            title={!periodLocked && periodReadiness.status !== 'ready' ? 'Lengkapi data lama sebelum periode dikunci' : undefined}
          >
            {periodLocked ? <Unlock size={16} /> : <Lock size={16} />}
            {periodSaving ? 'Menyimpan...' : periodLocked ? 'Buka Kunci' : 'Kunci Periode'}
          </button>
        </div>
      </section>

      <section className="historical-entry-summary">
        <div><span>Periode</span><strong>{formatPeriod(period)}</strong></div>
        <div className={periodLocked ? 'is-success' : ''}><span>Status Periode</span><strong>{periodLocked ? 'Terkunci' : 'Draft'}</strong></div>
        <div><span>Sales Order</span><strong>{historicalSummary.orders || 0}</strong></div>
        <div><span>Total Container</span><strong>{historicalSummary.containers || 0}</strong></div>
        <div><span>Selesai</span><strong>{historicalSummary.completedContainers || 0}</strong></div>
        <div className="is-warning"><span>Perlu Cek</span><strong>{historicalSummary.issueOrders || 0}</strong></div>
        <div className="is-success"><span>Lengkap</span><strong>{historicalSummary.completeOrders || 0}</strong></div>
      </section>

      <section className={`historical-readiness-panel is-${periodReadiness.tone}`}>
        <span>{periodReadiness.status === 'ready' ? <CheckCircle2 size={21} /> : <AlertTriangle size={21} />}</span>
        <div>
          <strong>{periodReadiness.title}</strong>
          <p>{periodReadiness.message}</p>
        </div>
        <button className="secondary-button" type="button" disabled={loading} onClick={handleReadinessAction}>
          {periodReadiness.action}
        </button>
      </section>

      <section className="historical-entry-panel">
        <div className="panel-header compact">
          <div>
            <h2>Data Lama Yang Sudah Diinput</h2>
            <p>Daftar ini hanya mengambil Sales Order yang ditandai sebagai data historical.</p>
          </div>
        </div>

        <div className="historical-audit-filters" aria-label="Filter kelengkapan data lama">
          {[
            ['all', 'Semua', filterCounts.all],
            ['needs_action', 'Perlu Dilengkapi', filterCounts.needs_action],
            ['complete', 'Lengkap', filterCounts.complete],
            ['cancelled', 'Batal', filterCounts.cancelled],
          ].map(([value, label, count]) => (
            <button
              key={value}
              className={auditFilter === value ? 'is-active' : ''}
              type="button"
              onClick={() => setAuditFilter(value)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        {loading ? <div className="archive-inline-state"><p>Memuat data lama...</p></div> : null}

        {!loading && !error && rows.length ? (
          <div className="historical-entry-table-wrap table-wrap">
            <table className="historical-entry-table responsive-data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal Jalan</th>
                  <th>Nomor SO</th>
                  <th>Customer</th>
                  <th>Tujuan</th>
                  <th>Container</th>
                  <th>Status</th>
                  <th>Validasi</th>
                  <th>Total</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order, index) => (
                  <tr key={order.id || `${order.customer}-${index}`}>
                    <td data-label="No">{(page - 1) * PAGE_SIZE + index + 1}</td>
                    <td data-label="Tanggal Jalan">{formatDate(order.tripDate)}</td>
                    <td data-label="Nomor SO">
                      {order.soNumber ? (
                        <span className="historical-so-number">{order.soNumber}</span>
                      ) : (
                        <button
                          className="historical-so-number-button"
                          type="button"
                          disabled={periodLocked}
                          onClick={() => openSoNumberForm(order)}
                        >
                          <PencilLine size={14} /> Isi Nomor SO
                        </button>
                      )}
                    </td>
                    <td data-label="Customer">{order.customer || '-'}</td>
                    <td data-label="Tujuan">{order.destination || '-'}</td>
                    <td data-label="Container">{getContainerSummary(order)}</td>
                    <td data-label="Status"><span className="historical-entry-status">{getOrderStatusLabel(order.status)}</span></td>
                    <td data-label="Validasi">
                      <span className={`historical-validation-status ${order.validation.issueCount ? 'is-warning' : 'is-ok'}`}>
                        {order.validation.issueCount ? `${order.validation.issueCount} catatan` : 'Lengkap'}
                      </span>
                      <small className="historical-validation-note">{order.validation.firstIssue}</small>
                    </td>
                    <td data-label="Total">{formatCurrency(order.totalAmount || 0)}</td>
                    <td data-label="Aksi">
                      <div className="historical-entry-actions">
                        <button className="secondary-button historical-entry-action" type="button" disabled={periodLocked} onClick={() => openHistoricalOrderForm(order)}>
                          <PencilLine size={15} /> Edit Data
                        </button>
                        <button className="secondary-button historical-entry-action" type="button" disabled={periodLocked} onClick={() => openRealization(order)}>
                          <ClipboardCheck size={15} /> Realisasi
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && !rows.length ? (
          <EmptyState
            title="Belum ada data lama"
            description={`Belum ada Sales Order historical untuk periode ${formatPeriod(period)}.`}
          />
        ) : null}

        {!loading && !error && total ? (
          <div className="master-pagination">
            <span>
              Menampilkan {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} dari {total} data lama
            </span>
            <div>
              <button type="button" aria-label="Halaman sebelumnya" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft size={15} />
              </button>
              <strong>Halaman {page} dari {totalPages}</strong>
              <button type="button" aria-label="Halaman berikutnya" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <SalesOrderForm
          existingOrders={archive.orders}
          customers={archive.masters.customers}
          depots={archive.masters.depots}
          terminals={archive.masters.terminals}
          destinations={archive.masters.destinations}
          order={orderFormOrder}
          onClose={closeHistoricalOrderForm}
          onSubmit={saveHistoricalOrder}
          historicalMode
        />
      ) : null}

      {soNumberOrder ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeSoNumberForm}>
          <section className="order-modal historical-so-number-modal" role="dialog" aria-modal="true" aria-labelledby="historical-so-number-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Data Lama</span>
                <h2 id="historical-so-number-title">Isi Nomor SO</h2>
              </div>
              <button type="button" aria-label="Tutup form nomor SO" disabled={soNumberSaving} onClick={closeSoNumberForm}><X size={20} /></button>
            </header>
            <form className="historical-so-number-form" onSubmit={saveSoNumber}>
              <div className="historical-so-number-context">
                <span>{formatDate(soNumberOrder.tripDate)}</span>
                <strong>{soNumberOrder.customer || '-'}</strong>
                <small>{soNumberOrder.destination || '-'}</small>
              </div>
              <label>
                Nomor SO
                <input
                  autoFocus
                  value={soNumberForm}
                  onChange={(event) => setSoNumberForm(event.target.value)}
                  placeholder="SO-ARM-000"
                />
              </label>
              <footer>
                <button className="secondary-button" type="button" disabled={soNumberSaving} onClick={closeSoNumberForm}>Batal</button>
                <button className="primary-button" type="submit" disabled={soNumberSaving}><Save size={16} /> {soNumberSaving ? 'Menyimpan...' : 'Simpan Nomor SO'}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {selectedOrder ? (
        <div className="modal-backdrop historical-realization-backdrop" role="presentation" onMouseDown={closeRealization}>
          <section className="order-modal historical-realization-modal" role="dialog" aria-modal="true" aria-labelledby="historical-realization-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Realisasi Data Lama</span>
                <h2 id="historical-realization-title">{selectedOrder.soNumber || selectedOrder.customer || 'Sales Order'}</h2>
              </div>
              <button type="button" aria-label="Tutup realisasi" disabled={jobSaving} onClick={closeRealization}><X size={20} /></button>
            </header>
            <div className="historical-realization-body">
              <div className="historical-job-list">
                <div className="historical-realization-context">
                  <span>{formatDate(selectedOrder.tripDate)}</span>
                  <strong>{selectedOrder.customer || '-'}</strong>
                  <small>{selectedOrder.destination || '-'}</small>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Container</th>
                      <th>Truck</th>
                      <th>Sopir</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.containers || []).map((job, index) => (
                      <tr key={job.id || index}>
                        <td>{index + 1}</td>
                        <td>
                          <strong>{getJobLabel(job, index)}</strong>
                          <small>{job.containerSize || job.size || '-'} {job.containerType || job.type || ''}</small>
                        </td>
                        <td>{job.plateNumber || '-'}</td>
                        <td>{job.driver || '-'}</td>
                        <td><span className={`historical-job-status ${getJobStatusClass(job.status)}`}>{getOrderStatusLabel(job.status)}</span></td>
                        <td><button type="button" onClick={() => openJobForm(job)}>Isi/Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editingJob && jobForm ? (
                <>
                  <button
                    className="historical-job-edit-scrim"
                    type="button"
                    aria-label="Tutup form realisasi"
                    disabled={jobSaving}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => { setEditingJob(null); setJobForm(null); }}
                  />
                  <form className="historical-job-form historical-job-edit-modal" onSubmit={saveJobRealization} onKeyDown={preventEnterSubmit}>
                    <div className="historical-job-form-head">
                      <span>Container Dipilih</span>
                      <strong>{getJobLabel(editingJob, (selectedOrder.containers || []).findIndex((item) => item.id === editingJob.id))}</strong>
                    </div>
                    <label>
                      Nomor Container
                      <input value={jobForm.containerNumber} onChange={(event) => setJobForm((current) => ({ ...current, containerNumber: event.target.value }))} placeholder="CONT1234567" />
                    </label>
                    <div className="historical-job-form-grid">
                      <label>
                        Status
                        <select
                          value={jobForm.status}
                          onChange={(event) => {
                            const nextStatus = event.target.value;
                            setJobForm((current) => ({
                              ...current,
                              status: nextStatus,
                              cancelledAt: nextStatus === 'cancelled' && !current.cancelledAt
                                ? current.completedAt || current.runningAt || ''
                                : current.cancelledAt,
                            }));
                          }}
                        >
                          {JOB_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label>
                        Truck {getContainerJobSize(editingJob) ? `(${getContainerJobSize(editingJob)})` : ''}
                        <select value={jobForm.vehicleId} onChange={(event) => setJobForm((current) => ({ ...current, vehicleId: event.target.value }))}>
                          <option value="">Pilih truck/unit</option>
                          {truckOptions.map((truck) => {
                            const capacity = getTruckCapacity(truck);
                            const mismatch = truckSizeMismatchForJob(truck, editingJob);
                            return (
                              <option key={truck.id || getTruckPlate(truck)} value={truck.id || ''}>
                                {getTruckPlate(truck)} {getTruckUnitCode(truck) ? `- ${getTruckUnitCode(truck)}` : ''}{capacity ? ` (${capacity})` : ''}{mismatch ? ' - beda ukuran' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {selectedTruckSizeMismatch ? <small>Ukuran truck berbeda dari container. Untuk data lama tetap boleh, misalnya karena tukar chassis.</small> : null}
                      </label>
                      <label>
                        Sopir
                        <select value={jobForm.driverId} onChange={(event) => setJobForm((current) => ({ ...current, driverId: event.target.value }))}>
                          <option value="">Pilih sopir</option>
                          {driverOptions.map((driver) => (
                            <option key={driver.id || getDriverName(driver)} value={driver.id || ''}>{getDriverName(driver)}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Mulai Jalan
                        <DateTimeWibInput value={jobForm.runningAt} onChange={(value) => setJobForm((current) => ({ ...current, runningAt: value }))} dateLabel="Tanggal mulai jalan" timeLabel="Jam mulai jalan WIB" />
                      </label>
                      <label>
                        Selesai
                        <DateTimeWibInput value={jobForm.completedAt} onChange={(value) => setJobForm((current) => ({ ...current, completedAt: value }))} dateLabel="Tanggal selesai" timeLabel="Jam selesai WIB" />
                      </label>
                      {jobForm.status === 'cancelled' ? (
                        <label>
                          Tanggal Batal
                          <DateTimeWibInput value={jobForm.cancelledAt} onChange={(value) => setJobForm((current) => ({ ...current, cancelledAt: value }))} dateLabel="Tanggal batal" timeLabel="Jam batal WIB" />
                        </label>
                      ) : null}
                    </div>
                    {jobForm.status === 'cancelled' ? (
                      <label>
                        Alasan Batal
                        <input value={jobForm.cancelReason} onChange={(event) => setJobForm((current) => ({ ...current, cancelReason: event.target.value }))} placeholder="Alasan pembatalan" />
                      </label>
                    ) : null}
                    <label>
                      Catatan Data Lama
                      <textarea rows={3} value={jobForm.historicalNotes} onChange={(event) => setJobForm((current) => ({ ...current, historicalNotes: event.target.value }))} placeholder="Catatan sumber data atau koreksi" />
                    </label>
                    <div className="historical-job-timeline">
                      <span>Mulai: <strong>{formatDateTime(editingJob.runningAt)}</strong></span>
                      <span>Selesai: <strong>{formatDateTime(editingJob.completedAt)}</strong></span>
                      <span>Batal: <strong>{formatDateTime(editingJob.cancelledAt)}</strong></span>
                    </div>
                    <footer>
                      <button className="secondary-button" type="button" disabled={jobSaving} onClick={() => { setEditingJob(null); setJobForm(null); }}>Batal</button>
                      <button className="primary-button" type="submit" disabled={jobSaving}><Save size={16} /> {jobSaving ? 'Menyimpan...' : 'Simpan Realisasi'}</button>
                    </footer>
                  </form>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default HistoricalEntryPage;
