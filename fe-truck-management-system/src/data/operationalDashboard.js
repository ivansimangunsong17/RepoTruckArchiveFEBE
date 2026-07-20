import { initialSalesOrders } from './salesOrders';

export function toDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

export function todayKey() {
  return toDateKey(new Date());
}

export function normalizeSize(size) {
  return String(size || '').toUpperCase();
}

export function getTripDate(order) {
  return order.tripDate || order.plannedDate || order.soDate || order.receivedAt;
}

export function offsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function getDemoTripDate(orderIndex, order) {
  if (getTripDate(order)) return getTripDate(order);
  if (orderIndex === 0) return offsetDate(0);
  if (orderIndex === 1) return offsetDate(1);
  if (orderIndex === 2) return offsetDate(2);
  return getTripDate(order);
}

export function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function isCompleted(job) {
  return ['completed', 'Selesai'].includes(job.status);
}

export function isCancelled(job) {
  return ['cancelled', 'Dibatalkan', 'Batal'].includes(job.status);
}

export function isTerminal(job) {
  return isCompleted(job) || isCancelled(job);
}

export function isAssigned(job) {
  return Boolean(job.plateNumber || job.truck || job.driver);
}

export function isRunning(job) {
  return ['running', 'Sedang Jalan'].includes(job.status);
}

export function isActiveOperationalJob(job, currentDateKey = todayKey()) {
  if (!job || isTerminal(job) || !isAssigned(job)) return false;
  if (!job.tripDateKey) return true;
  return job.tripDateKey <= currentDateKey;
}

export function getActiveOperationalJobs(jobs = [], currentDateKey = todayKey()) {
  return jobs.filter((job) => isActiveOperationalJob(job, currentDateKey));
}

export function getOperationalWorkStage(job) {
  if (!job || isTerminal(job)) return 'terminal';
  if (isRunning(job)) return 'running';
  if (!isAssigned(job)) return 'assignment';

  const rpujReady = ['approved', 'paid'].includes(job.rpujStatus);
  const spkReady = Boolean(job.spkNumber || job.spkDocument);
  return rpujReady && spkReady ? 'ready' : 'attention';
}

function getContainerTripDate(container, orderTripDate) {
  if (isCompleted(container)) {
    return container.completedAt || container.updatedAt || container.runningAt || orderTripDate;
  }
  if (!isCompleted(container) && isAssigned(container)) {
    return container.runningAt || container.updatedAt || orderTripDate;
  }
  return orderTripDate;
}

export function createDemoProspectJobs() {
  return [
    { id: 'demo-prospect-1', soNumber: 'SO-2607-004', customer: 'PT Sumber Logistik', salesName: 'Sinta Maharani', containerNumber: 'PROS-20-001', size: '20FT', origin: 'Tanjung Priok', destination: 'Cikarang', shipment: 'Import', tripDate: offsetDate(1), tripDateKey: offsetDate(1), status: 'received' },
    { id: 'demo-prospect-2', soNumber: 'SO-2607-004', customer: 'PT Sumber Logistik', salesName: 'Sinta Maharani', containerNumber: 'PROS-40-001', size: '40FT', origin: 'Tanjung Priok', destination: 'Cikarang', shipment: 'Import', tripDate: offsetDate(1), tripDateKey: offsetDate(1), status: 'received' },
    { id: 'demo-prospect-3', soNumber: 'SO-2607-005', customer: 'PT Lautan Niaga', salesName: 'Rangga Saputra', containerNumber: 'PROS-20-002', size: '20FT', origin: 'Bekasi', destination: 'Tanjung Priok', shipment: 'Export', tripDate: offsetDate(2), tripDateKey: offsetDate(2), status: 'received' },
    { id: 'demo-prospect-4', soNumber: 'SO-2607-006', customer: 'PT Mitra Kimia', salesName: 'Dewi Lestari', containerNumber: 'PROS-40-002', size: '40FT', origin: 'Marunda', destination: 'Karawang', shipment: 'Domestik Outward', tripDate: offsetDate(2), tripDateKey: offsetDate(2), status: 'received' },
    { id: 'demo-prospect-5', soNumber: 'SO-2607-007', customer: 'PT Cipta Retail', salesName: 'Sinta Maharani', containerNumber: 'PROS-20-003', size: '20FT', origin: 'Tangerang', destination: 'Cikarang', shipment: 'Domestik Inward', tripDate: offsetDate(4), tripDateKey: offsetDate(4), status: 'received' },
  ];
}

export function buildOperationalJobs(orders, currentDateKey = todayKey(), useDemoDates = false) {
  return (orders || []).filter(Boolean).filter((order) => order.status !== 'cancelled').flatMap((order, orderIndex) => {
    const orderTripDate = useDemoDates ? getDemoTripDate(orderIndex, order) : getTripDate(order);
    const containers = Array.isArray(order.containers) ? order.containers.filter(Boolean) : [];
    return containers.map((container) => {
      const tripDate = getContainerTripDate(container, orderTripDate);
      const tripDateKey = toDateKey(tripDate);
      return {
        ...container,
        order,
        soNumber: order.soNumber,
        customer: order.customer,
        salesName: order.salesName || order.createdBy,
        createdBy: order.createdBy,
        origin: order.origin,
        destination: order.destination,
        shipment: order.shipment,
        orderCategory: order.orderCategory || container.orderCategory || 'pendek',
        tripDate,
        tripDateKey,
        category: tripDateKey === currentDateKey ? 'Eksisting' : tripDateKey > currentDateKey ? 'Prospek' : 'Lewat',
      };
    });
  });
}

export function groupFutureJobsByDate(jobs) {
  const grouped = (jobs || []).filter(Boolean).reduce((result, job) => {
    if (!job.tripDateKey) return result;

    const current = result[job.tripDateKey] || {
      tripDateKey: job.tripDateKey,
      dateKey: job.tripDateKey,
      tripDate: job.tripDate,
      orderNumbers: new Set(),
      customers: new Set(),
      salesNames: new Set(),
      jobs: [],
    totalContainers: 0,
    total: 0,
    twentyFt: 0,
    fortyFt: 0,
      panjang: 0,
      pendek: 0,
    };

    const size = normalizeSize(job.size);
    const orderCategory = String(job.orderCategory || job.order?.orderCategory || 'pendek').toLowerCase();
    current.orderNumbers.add(job.soNumber || job.id || job.containerNumber);
    if (job.customer) current.customers.add(job.customer);
    if (job.salesName || job.createdBy) current.salesNames.add(job.salesName || job.createdBy);
    current.jobs.push(job);
    current.totalContainers += 1;
    current.total += 1;
    current.twentyFt += size === '20FT' ? 1 : 0;
    current.fortyFt += size === '40FT' ? 1 : 0;
    current.panjang += orderCategory === 'panjang' ? 1 : 0;
    current.pendek += orderCategory === 'pendek' ? 1 : 0;
    result[job.tripDateKey] = current;
    return result;
  }, {});

  return Object.values(grouped)
    .sort((a, b) => a.tripDateKey.localeCompare(b.tripDateKey))
    .map((group) => {
      const customers = Array.from(group.customers);
      const salesNames = Array.from(group.salesNames);
      return {
        ...group,
        totalOrders: group.orderNumbers.size,
        orderCount: group.orderNumbers.size,
        customerSummary: customers.join(', ') || '-',
        shortCustomerSummary: customers.length > 1 ? `${customers[0]} +${customers.length - 1}` : customers[0] || '-',
        salesSummary: salesNames.join(', ') || '-',
      };
    });
}

export function getOperationalDashboardData(orders, options = {}) {
  const currentDateKey = options.currentDateKey || todayKey();
  const hasLiveOrders = Boolean(options.hasLiveOrders);
  const allowDemoFallback = options.allowDemoFallback !== false;
  let jobs = buildOperationalJobs(orders, currentDateKey, !hasLiveOrders);
  const hasVisibleDashboardJobs = jobs.some((job) => job && !isTerminal(job));

  if (allowDemoFallback && !hasVisibleDashboardJobs) {
    jobs = buildOperationalJobs(initialSalesOrders, currentDateKey, true);
  }

  const todayJobs = jobs.filter((job) => job && job.tripDateKey === currentDateKey && !isTerminal(job));
  const dueJobs = jobs.filter((job) => job
    && !isTerminal(job)
    && (!job.tripDateKey || job.tripDateKey <= currentDateKey));
  const activeJobs = getActiveOperationalJobs(jobs, currentDateKey);
  const futureJobs = jobs.filter((job) => job && job.tripDateKey > currentDateKey && !isTerminal(job));
  const visibleFutureJobs = allowDemoFallback && !hasLiveOrders && futureJobs.length < 4 ? [...futureJobs, ...createDemoProspectJobs()] : futureJobs;
  const prospectSchedule = groupFutureJobsByDate(visibleFutureJobs);
  const workQueues = {
    assignment: dueJobs.filter((job) => getOperationalWorkStage(job) === 'assignment'),
    ready: dueJobs.filter((job) => getOperationalWorkStage(job) === 'ready'),
    running: dueJobs.filter((job) => getOperationalWorkStage(job) === 'running'),
    attention: dueJobs.filter((job) => getOperationalWorkStage(job) === 'attention'),
  };

  return {
    currentDateKey,
    jobs,
    todayJobs,
    dueJobs,
    activeJobs,
    workQueues,
    futureJobs,
    visibleFutureJobs,
    prospectSchedule,
    assignedTodayJobs: todayJobs.filter(isAssigned).length,
    assignedActiveJobs: activeJobs.filter(isAssigned).length,
    prospectTwentyFt: visibleFutureJobs.filter((job) => normalizeSize(job.size) === '20FT').length,
    prospectFortyFt: visibleFutureJobs.filter((job) => normalizeSize(job.size) === '40FT').length,
    nextSchedule: prospectSchedule[0],
  };
}
