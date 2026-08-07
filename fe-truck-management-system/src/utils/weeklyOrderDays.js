import { groupFutureJobsByDate, normalizeSize, toDateKey } from '../data/operationalDashboard';

function createDateFromKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getDateKeyOffset(dateKey, days) {
  const date = createDateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function formatDayLabel(dateKey) {
  const date = createDateFromKey(dateKey);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
  }).format(date);
}

function buildCustomerBreakdown(jobs = []) {
  return Array.from((jobs || []).reduce((result, job) => {
    const customer = job?.customer || '-';
    const current = result.get(customer) || {
      customer,
      totalContainers: 0,
      twentyFt: 0,
      fortyFt: 0,
    };
    const size = normalizeSize(job?.size);
    current.totalContainers += 1;
    current.twentyFt += size === '20FT' ? 1 : 0;
    current.fortyFt += size === '40FT' ? 1 : 0;
    result.set(customer, current);
    return result;
  }, new Map()).values());
}

export function buildWeeklyOrderDays(jobs = [], currentDateKey) {
  const groupedJobs = groupFutureJobsByDate(jobs);
  const groupedByDate = groupedJobs.reduce((result, group) => {
    result[group.dateKey] = group;
    return result;
  }, {});

  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = getDateKeyOffset(currentDateKey, index + 1);
    const group = groupedByDate[dateKey] || {};
    const customerList = Array.from(group.customers || []);
    const customerBreakdown = buildCustomerBreakdown(group.jobs);
    return {
      dateKey,
      label: formatDayLabel(dateKey),
      orderCount: group.orderCount || 0,
      totalContainers: group.totalContainers || 0,
      twentyFt: group.twentyFt || 0,
      fortyFt: group.fortyFt || 0,
      panjang: group.panjang || 0,
      pendek: group.pendek || 0,
      customerList,
      customerBreakdown,
      customerSummary: group.shortCustomerSummary || group.customerSummary || '-',
      shortCustomerSummary: group.shortCustomerSummary || group.customerSummary || '-',
      fullCustomerSummary: group.customerSummary || '-',
      salesSummary: group.salesSummary || '-',
    };
  });
}
