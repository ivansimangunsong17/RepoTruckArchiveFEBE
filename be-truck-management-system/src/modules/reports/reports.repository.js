import { query } from '../../db/client.js';
import { getCustomerOutstandingRollupPage } from '../finance/finance.repository.js';
import { utilizationChassisJoinsSql, utilizationChassisSizeSql, utilizationChassisSourceSql } from './utilization-chassis.sql.js';
import { getUtilizationTripRows } from './utilization-trips.repository.js';
import { getRepoRevenueRows } from './repo-revenue.repository.js';
import {
  getTransportLineItemForSize,
  splitFinancialLineItems,
} from './revenue-line-items.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function daysInMonth(month, year) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildDateWhere(column, { dateFrom = '', dateTo = '' } = {}, startIndex = 1) {
  const clauses = [];
  const params = [];
  if (dateFrom) {
    params.push(dateFrom);
    clauses.push(`${column} >= $${startIndex + params.length - 1}`);
  }
  if (dateTo) {
    params.push(dateTo);
    clauses.push(`${column} <= $${startIndex + params.length - 1}`);
  }
  return { clauses, params };
}

function normalizeEntrySourceFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'historical' || normalized === 'realtime') return normalized;
  return '';
}

function appendEntrySourceFilters(clauses, params, options = {}, alias = 'cj') {
  const entrySource = normalizeEntrySourceFilter(options.entrySource);
  if (entrySource) {
    params.push(entrySource);
    clauses.push(`coalesce(${alias}.entry_source, 'realtime') = $${params.length}`);
  }

  if (options.historicalPeriod) {
    params.push(String(options.historicalPeriod).trim());
    clauses.push(`${alias}.historical_period = $${params.length}`);
  }
}

function timestampToJakartaDateSql(expression) {
  return `(${expression} at time zone 'Asia/Jakarta')::date`;
}

function parseComparisonYear(options = {}) {
  const now = new Date();
  const year = Number(options.year || now.getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    const error = new Error('Tahun laporan perbandingan bulanan tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return year;
}

function monthIndexFromDate(value) {
  if (!value) return -1;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getUTCMonth();
  const month = Number(String(value).trim().slice(5, 7));
  return month >= 1 && month <= 12 ? month - 1 : -1;
}

function utilizationDaysInMonth(month, year, baseDate = new Date()) {
  const selectedMonthIndex = Number(month) - 1;
  const currentYear = baseDate.getFullYear();
  const currentMonthIndex = baseDate.getMonth();
  const totalDays = daysInMonth(month, year);

  if (Number(year) > currentYear || (Number(year) === currentYear && selectedMonthIndex > currentMonthIndex)) return 0;
  if (Number(year) === currentYear && selectedMonthIndex === currentMonthIndex) return Math.max(0, baseDate.getDate() - 1);
  return totalDays;
}

function getComparisonTruckKey(row = {}) {
  return String(
    row.vehicle_id
    || row.vehicleId
    || row.plate_number
    || row.plateNumber
    || row.unit_code
    || row.unitCode
    || '',
  ).trim();
}

function getComparisonDateKey(row = {}) {
  const value = row.completed_date || row.completedDate || row.completed_at || row.completedAt;
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, 10);
}

function normalizeReportIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function getReportDateKey(row = {}) {
  const value = row.completedDate
    || row.completedAt
    || row.completed_date
    || row.completed_at
    || row.tripDate
    || row.trip_date
    || row.updatedAt
    || row.updated_at;
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function collectReportVehicleKeys(row = {}) {
  return [
    row.vehicleId,
    row.vehicle_id,
    row.originalVehicleId,
    row.original_vehicle_id,
    row.plateNumber,
    row.plate_number,
    row.originalPlateNumber,
    row.original_plate_number,
    row.unitCode,
    row.unit_code,
    row.originalUnitCode,
    row.original_unit_code,
  ].map(normalizeReportIdentity).filter(Boolean);
}

function normalizeUtilizationChassisCorrection(correction = {}) {
  const sourceVehicleId = correction.sourceVehicleId || correction.source_vehicle_id || '';
  const sourcePlateNumber = correction.sourcePlateNumber || correction.source_plate_number || '';
  const sourceUnitCode = correction.sourceUnitCode || correction.source_unit_code || '';
  const targetVehicleId = correction.targetVehicleId || correction.target_vehicle_id || '';
  const targetPlateNumber = correction.targetPlateNumber || correction.target_plate_number || '';
  const targetUnitCode = correction.targetUnitCode || correction.target_unit_code || '';
  const sourceChassisSize = correction.sourceChassisSize || correction.source_chassis_size || '';
  const targetChassisSize = correction.targetChassisSize || correction.target_chassis_size || '';
  const effectiveFrom = getReportDateKey({ completedDate: correction.effectiveFrom || correction.effective_from });
  const effectiveTo = getReportDateKey({ completedDate: correction.effectiveTo || correction.effective_to });
  const sourceKeys = [sourceVehicleId, sourcePlateNumber, sourceUnitCode]
    .map(normalizeReportIdentity)
    .filter(Boolean);
  const sourceVehicleKey = normalizeReportIdentity(sourceVehicleId);
  const sourcePlateKey = normalizeReportIdentity(sourcePlateNumber);
  const sourceUnitKey = normalizeReportIdentity(sourceUnitCode);

  if (!sourceKeys.length || !targetVehicleId || !effectiveFrom || !effectiveTo
    || effectiveFrom > effectiveTo || !['20FT', '40FT'].includes(targetChassisSize)) return null;

  return {
    id: correction.id || '',
    sourceVehicleId,
    sourcePlateNumber,
    sourceUnitCode,
    targetVehicleId,
    targetPlateNumber,
    targetUnitCode,
    sourceChassisSize,
    targetChassisSize,
    effectiveFrom,
    effectiveTo,
    reason: correction.reason || '',
    note: correction.note || '',
    createdAt: correction.createdAt || correction.created_at || '',
    sourceVehicleKey,
    sourcePlateKey,
    sourceUnitKey,
    sourceKeys,
  };
}

function reportDateDistanceDays(dateFrom, dateTo) {
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}

function utilizationCorrectionMatchScore(correction, rowKeys = new Set()) {
  let score = 0;
  if (correction.sourceVehicleKey && rowKeys.has(correction.sourceVehicleKey)) score += 4;
  if (correction.sourcePlateKey && rowKeys.has(correction.sourcePlateKey)) score += 2;
  if (correction.sourceUnitKey && rowKeys.has(correction.sourceUnitKey)) score += 1;
  return score;
}

function chooseUtilizationChassisCorrection(corrections = [], rowKeys = new Set(), rowDate = '') {
  const matches = corrections
    .map((correction) => ({
      correction,
      score: utilizationCorrectionMatchScore(correction, rowKeys),
      days: reportDateDistanceDays(correction.effectiveFrom, correction.effectiveTo),
    }))
    .filter((entry) => entry.score > 0
      && rowDate >= entry.correction.effectiveFrom
      && rowDate <= entry.correction.effectiveTo);

  if (!matches.length) return null;

  matches.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.days !== right.days) return left.days - right.days;
    if (right.correction.effectiveFrom !== left.correction.effectiveFrom) {
      return right.correction.effectiveFrom.localeCompare(left.correction.effectiveFrom);
    }
    if (right.correction.createdAt !== left.correction.createdAt) {
      return String(right.correction.createdAt || '').localeCompare(String(left.correction.createdAt || ''));
    }
    return String(right.correction.id || '').localeCompare(String(left.correction.id || ''));
  });

  return matches[0].correction;
}

// Koreksi hanya mengubah ukuran chassis, bukan identitas truck pelaksana.
// Data asli container_jobs tetap utuh dan bisa diaudit lewat original* fields.
export function applyUtilizationChassisCorrectionsToRows(rows = [], corrections = []) {
  const normalizedCorrections = (corrections || [])
    .map(normalizeUtilizationChassisCorrection)
    .filter(Boolean);

  if (!normalizedCorrections.length) return rows;

  return (rows || []).map((row) => {
    if (row.utilizationChassisCorrection) return row;
    const rowDate = getReportDateKey(row);
    if (!rowDate) return row;

    const rowKeys = new Set(collectReportVehicleKeys(row));
    const correction = chooseUtilizationChassisCorrection(normalizedCorrections, rowKeys, rowDate);

    if (!correction) return row;

    const originalVehicleId = row.originalVehicleId || row.vehicleId || row.vehicle_id || '';
    const originalPlateNumber = row.originalPlateNumber || row.plateNumber || row.plate_number || '';
    const originalUnitCode = row.originalUnitCode || row.unitCode || row.unit_code || '';
    const originalChassisSize = row.originalChassisSize || row.chassisSize || row.chassis_size || row.size || '';

    return {
      ...row,
      originalVehicleId,
      originalPlateNumber,
      originalUnitCode,
      originalChassisSize,
      chassisSize: correction.targetChassisSize,
      chassisSource: 'manual',
      utilizationChassisCorrection: {
        id: correction.id,
        sourceVehicleId: correction.sourceVehicleId,
        sourcePlateNumber: correction.sourcePlateNumber || originalPlateNumber,
        sourceUnitCode: correction.sourceUnitCode || originalUnitCode,
        sourceChassisSize: correction.sourceChassisSize || originalChassisSize,
        targetVehicleId: correction.targetVehicleId,
        targetPlateNumber: correction.targetPlateNumber || row.plateNumber,
        targetUnitCode: correction.targetUnitCode || row.unitCode,
        targetChassisSize: correction.targetChassisSize || row.chassisSize || row.size,
        effectiveFrom: correction.effectiveFrom,
        effectiveTo: correction.effectiveTo,
        reason: correction.reason,
        note: correction.note,
      },
    };
  });
}

export function buildMonthlyComparisonRows(completedRows = [], repoRows = [], options = {}, baseDate = new Date()) {
  const year = parseComparisonYear(options);
  const activeTruckCount = Math.max(0, Number(options.activeTruckCount || 0));
  const months = MONTH_NAMES.map((label, index) => ({
    month: index + 1,
    monthKey: `${year}-${String(index + 1).padStart(2, '0')}`,
    label,
    totalRevenue: 0,
    totalTrips: 0,
    totalVolume: 0,
    totalCustomers: 0,
    activeSales: 0,
    utilizationPercent: 0,
    repoStoredCount: 0,
    repoRevenue: 0,
    customerKeys: new Set(),
    salesKeys: new Set(),
    truckDayKeys: new Set(),
  }));

  completedRows.forEach((row) => {
    const monthIndex = monthIndexFromDate(row.completed_date || row.completedDate || row.completed_at || row.completedAt);
    if (!months[monthIndex]) return;

    const month = months[monthIndex];
    const revenue = calculateCompletedJobRevenue(row);
    const customerKey = normalizeCustomerName(row).toLowerCase();
    const salesKey = normalizeSalesName(row).toLowerCase();
    month.totalRevenue += revenue;
    month.totalVolume += 1;
    if (customerKey) month.customerKeys.add(customerKey);
    if (salesKey) month.salesKeys.add(salesKey);
  });

  // Trip totals use the same physical events as Truck and Driver Utilization.
  // Callers passing only completedRows (older tests/consumers) retain the old input contract.
  const tripRows = options.utilizationTrips || completedRows.filter((row) =>
    (row.execution_source || row.executionSource || 'internal') !== 'vendor'
      && !((row.pickup_type || row.pickupType) === 'combo_2x20'
        && Number(row.pickup_sequence_no ?? row.pickupSequenceNo ?? 1) > 1));
  tripRows.forEach((row) => {
    const monthIndex = monthIndexFromDate(row.completed_date || row.completedDate || row.completed_at || row.completedAt);
    if (!months[monthIndex]) return;
    const month = months[monthIndex];
    month.totalTrips += 1;
    const truckKey = getComparisonTruckKey(row);
    const dateKey = getComparisonDateKey(row);
    if (truckKey && dateKey) month.truckDayKeys.add(`${truckKey}|${dateKey}`);
  });

  repoRows.forEach((row) => {
    const monthIndex = monthIndexFromDate(row.repo_stored_date || row.repoStoredDate || row.repo_stored_at || row.repoStoredAt);
    if (months[monthIndex]) months[monthIndex].repoStoredCount += 1;
  });

  // Revenue Repo terpisah dari revenue transport (totalRevenue), bertanggal movement.started_at.
  (options.repoRevenueRows || []).forEach((row) => {
    const monthIndex = monthIndexFromDate(row.revenueDate);
    if (months[monthIndex]) months[monthIndex].repoRevenue += Number(row.amount || 0);
  });

  return months.map((month) => {
    const utilizationDays = utilizationDaysInMonth(month.month, year, baseDate);
    const potentialTruckDays = activeTruckCount * utilizationDays;
    return {
      month: month.month,
      monthKey: month.monthKey,
      label: month.label,
      totalRevenue: month.totalRevenue,
      totalTrips: month.totalTrips,
      totalVolume: month.totalVolume,
      totalCustomers: month.customerKeys.size,
      activeSales: month.salesKeys.size,
      activeTruckCount,
      utilizationDays,
      potentialTruckDays,
      usedTruckDays: month.truckDayKeys.size,
      utilizationPercent: potentialTruckDays ? (month.totalTrips / potentialTruckDays) * 100 : 0,
      repoStoredCount: month.repoStoredCount,
      repoRevenue: month.repoRevenue,
      operationalRevenue: month.totalRevenue + month.repoRevenue,
    };
  });
}

export function calculateCompletedJobRevenue(row = {}) {
  const lineItems = row.line_items ?? row.lineItems;
  const financialItems = splitFinancialLineItems(lineItems);
  if (financialItems.items.length) {
    const transportItem = getTransportLineItemForSize(lineItems, row.container_size || row.containerSize || row.size);
    if (!transportItem) return 0;

    const unitPrice = Number(transportItem.price || 0);
    if (unitPrice > 0) return unitPrice;

    const qty = Math.max(1, Number(transportItem.qty || 1));
    return Number(transportItem.total || 0) / qty;
  }

  const unitPrice = Number(row.price || 0);
  if (unitPrice > 0) return unitPrice;

  const totalAmount = Number(row.total_amount || row.totalAmount || 0);
  const totalContainers = Math.max(1, Number(row.total_containers || row.totalContainers || 1));
  return totalAmount / totalContainers;
}

export function calculateDriverCommissionAmount(row = {}) {
  const hasCommission = Boolean(row.has_driver_commission ?? row.hasDriverCommission);
  if (!hasCommission) return 0;

  const amount = Number(row.driver_commission_amount ?? row.driverCommissionAmount ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function splitDriverCommissionPaymentAmount(row = {}) {
  const amount = calculateDriverCommissionAmount(row);
  const paymentStatus = String(row.commission_payment_status ?? row.commissionPaymentStatus ?? '').trim();
  return {
    paid: paymentStatus === 'paid' ? amount : 0,
    unpaid: amount > 0 && paymentStatus !== 'paid' ? amount : 0,
  };
}

function normalizeSalesName(row = {}) {
  return String(row.customer_sales_name || row.customerSalesName || row.sales_name || row.salesName || row.created_by_name || row.createdByName || 'Tanpa Sales').trim() || 'Tanpa Sales';
}

function normalizeCustomerName(row = {}) {
  return String(row.customer_name || row.customerName || row.customer || 'Tanpa Customer').trim() || 'Tanpa Customer';
}

function normalizeSalesOrderId(row = {}) {
  return String(row.id || row.sales_order_id || row.salesOrderId || row.so_number || row.soNumber || '').trim();
}

export function buildSalesPerformanceRows(rows = []) {
  const salesMap = new Map();

  rows.forEach((row) => {
    const salesName = normalizeSalesName(row);
    if (!salesMap.has(salesName)) {
      salesMap.set(salesName, {
        salesName,
        customerKeys: new Set(),
        orderKeys: new Set(),
        customerSummaries: new Map(),
        totalVolume: 0,
        totalRevenue: 0,
        container20ft: 0,
        container40ft: 0,
      });
    }

    const sales = salesMap.get(salesName);
    const customer = normalizeCustomerName(row);
    const customerKey = customer.toLowerCase();
    const orderKey = normalizeSalesOrderId(row);
    const revenue = calculateCompletedJobRevenue(row);
    const size = String(row.container_size || row.containerSize || row.size || '').trim().toUpperCase().replace(/\s/g, '');

    sales.customerKeys.add(customerKey);
    if (orderKey) sales.orderKeys.add(orderKey);
    sales.totalVolume += 1;
    sales.totalRevenue += revenue;
    if (size === '20FT') sales.container20ft += 1;
    if (size === '40FT') sales.container40ft += 1;

    if (!sales.customerSummaries.has(customerKey)) {
      sales.customerSummaries.set(customerKey, {
        customer,
        volume: 0,
        revenue: 0,
      });
    }
    const customerSummary = sales.customerSummaries.get(customerKey);
    customerSummary.volume += 1;
    customerSummary.revenue += revenue;
  });

  return Array.from(salesMap.values())
    .map((sales) => ({
      salesName: sales.salesName,
      customerCount: sales.customerKeys.size,
      completedOrders: sales.orderKeys.size,
      totalVolume: sales.totalVolume,
      totalTrips: sales.totalVolume,
      totalContainers: sales.totalVolume,
      totalRevenue: sales.totalRevenue,
      averageRevenuePerCustomer: sales.customerKeys.size ? sales.totalRevenue / sales.customerKeys.size : 0,
      averageRevenuePerVolume: sales.totalVolume ? sales.totalRevenue / sales.totalVolume : 0,
      container20ft: sales.container20ft,
      container40ft: sales.container40ft,
      customers: Array.from(sales.customerSummaries.values()).sort((left, right) => {
        if (right.revenue !== left.revenue) return right.revenue - left.revenue;
        if (right.volume !== left.volume) return right.volume - left.volume;
        return left.customer.localeCompare(right.customer);
      }),
    }))
    .sort((left, right) => {
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.totalVolume !== left.totalVolume) return right.totalVolume - left.totalVolume;
      return left.salesName.localeCompare(right.salesName);
    });
}

export function summarizeSalesPerformanceRows(rows = []) {
  const customerKeys = new Set();

  rows.forEach((row) => {
    (row.customers || []).forEach((customer) => {
      const key = String(customer.customer || '').trim().toLowerCase();
      if (key) customerKeys.add(key);
    });
  });

  const totalRevenue = rows.reduce((total, row) => total + Number(row.totalRevenue || 0), 0);
  const totalVolume = rows.reduce((total, row) => total + Number(row.totalVolume || 0), 0);

  return {
    totalSales: rows.length,
    activeSales: rows.filter((row) => Number(row.totalVolume || 0) > 0).length,
    totalCustomers: customerKeys.size,
    totalOrders: rows.reduce((total, row) => total + Number(row.completedOrders || 0), 0),
    totalVolume,
    totalContainers: rows.reduce((total, row) => total + Number(row.totalContainers || row.totalVolume || 0), 0),
    totalRevenue,
    averageRevenuePerSales: rows.length ? totalRevenue / rows.length : 0,
    averageRevenuePerVolume: totalVolume ? totalRevenue / totalVolume : 0,
  };
}

function normalizeLocationName(row = {}) {
  return String(
    row.location_name
    || row.locationName
    || row.warehouse_location_name_snapshot
    || row.warehouseLocationNameSnapshot
    || 'Tanpa Lokasi',
  ).trim() || 'Tanpa Lokasi';
}

function normalizeDestinationName(row = {}) {
  return String(
    row.destination_name
    || row.destinationName
    || row.destination
    || 'Tanpa Tujuan',
  ).trim() || 'Tanpa Tujuan';
}

function createDestinationPerformanceSummary(row = {}) {
  const destinationId = String(row.destination_id || row.destinationId || '').trim();
  return {
    destinationId: destinationId || null,
    destinationName: normalizeDestinationName(row),
    totalTrips: 0,
    totalRevenue: 0,
    container20ft: 0,
    container40ft: 0,
  };
}

export function buildLocationPerformanceRows(rows = []) {
  const locationMap = new Map();

  rows.forEach((row) => {
    const locationId = String(row.location_id || row.locationId || '').trim();
    const locationName = locationId ? normalizeLocationName(row) : 'Tanpa Lokasi';
    const locationKey = locationId ? `id:${locationId}` : 'unmapped';
    if (!locationMap.has(locationKey)) {
      locationMap.set(locationKey, {
        locationId: locationId || null,
        locationName,
        operationalStatus: String(row.operational_status || row.operationalStatus || '').trim(),
        customerKeys: new Set(),
        orderKeys: new Set(),
        destinationMap: new Map(),
        totalTrips: 0,
        totalRevenue: 0,
        container20ft: 0,
        container40ft: 0,
      });
    }

    const location = locationMap.get(locationKey);
    const customer = normalizeCustomerName(row);
    const orderKey = normalizeSalesOrderId(row);
    const revenue = calculateCompletedJobRevenue(row);
    const size = String(row.container_size || row.containerSize || row.size || '').trim().toUpperCase().replace(/\s/g, '');
    const destinationId = String(row.destination_id || row.destinationId || '').trim();
    const destinationName = normalizeDestinationName(row);
    const destinationKey = destinationId ? `id:${destinationId}` : `name:${destinationName.toLowerCase()}`;

    if (!location.destinationMap.has(destinationKey)) {
      location.destinationMap.set(destinationKey, createDestinationPerformanceSummary(row));
    }
    const destination = location.destinationMap.get(destinationKey);

    if (customer) location.customerKeys.add(customer.toLowerCase());
    if (orderKey) location.orderKeys.add(orderKey);
    location.totalTrips += 1;
    location.totalRevenue += revenue;
    destination.totalTrips += 1;
    destination.totalRevenue += revenue;
    if (size === '20FT') {
      location.container20ft += 1;
      destination.container20ft += 1;
    }
    if (size === '40FT') {
      location.container40ft += 1;
      destination.container40ft += 1;
    }
  });

  const totalTrips = rows.length;
  return Array.from(locationMap.values())
    .map((location) => {
      const destinations = Array.from(location.destinationMap.values())
        .map((destination) => ({
          ...destination,
          averageRevenuePerTrip: destination.totalTrips
            ? destination.totalRevenue / destination.totalTrips
            : 0,
        }))
        .sort((left, right) => {
          if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
          if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
          return left.destinationName.localeCompare(right.destinationName, 'id');
        });
      const destinationCount = destinations.length;

      return {
        locationId: location.locationId,
        locationName: location.locationName,
        mappingStatus: location.locationId ? 'mapped' : 'unmapped',
        mappingLabel: location.locationId ? '' : 'Data belum terpetakan',
        destinationName: destinationCount === 1
          ? destinations[0].destinationName
          : `Beragam (${destinationCount} tujuan)`,
        destinationCount,
        destinations,
        operationalStatus: location.operationalStatus,
        customerCount: location.customerKeys.size,
        completedOrders: location.orderKeys.size,
        totalTrips: location.totalTrips,
        totalVolume: location.totalTrips,
        totalRevenue: location.totalRevenue,
        averageRevenuePerTrip: location.totalTrips ? location.totalRevenue / location.totalTrips : 0,
        contributionPercent: totalTrips ? (location.totalTrips / totalTrips) * 100 : 0,
        contributionBasis: 'trip',
        container20ft: location.container20ft,
        container40ft: location.container40ft,
      };
    })
    .sort((left, right) => {
      if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      return left.locationName.localeCompare(right.locationName, 'id');
    });
}

export function summarizeLocationPerformanceRows(rows = []) {
  const mappedRows = rows.filter((row) => row.locationId);
  const unmappedRow = rows.find((row) => !row.locationId);
  const totalTrips = rows.reduce((total, row) => total + Number(row.totalTrips || 0), 0);
  const totalRevenue = rows.reduce((total, row) => total + Number(row.totalRevenue || 0), 0);
  const mappedRevenue = mappedRows.reduce((total, row) => total + Number(row.totalRevenue || 0), 0);
  const topLocation = mappedRows[0];

  return {
    totalLocations: mappedRows.length,
    locationsWithTrips: mappedRows.filter((row) => Number(row.totalTrips || 0) > 0).length,
    unmappedTrips: rows.filter((row) => !row.locationId).reduce((total, row) => total + Number(row.totalTrips || 0), 0),
    unmappedOrders: Number(unmappedRow?.completedOrders || 0),
    unmappedCustomers: Number(unmappedRow?.customerCount || 0),
    unmappedDestinations: Number(unmappedRow?.destinationCount || 0),
    totalTrips,
    totalVolume: totalTrips,
    totalRevenue,
    averageRevenuePerLocation: mappedRows.length ? mappedRevenue / mappedRows.length : 0,
    topLocation: topLocation?.locationName || '',
    topLocationTrips: Number(topLocation?.totalTrips || 0),
  };
}

function normalizeCustomerKey(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCustomerPerformanceStatus(row = {}) {
  const revenue = Number(row.totalRevenue || 0);
  const volume = Number(row.totalVolume || 0);
  const outstanding = Number(row.totalOutstandingAmount || 0);
  const overdue = Number(row.overdueAmount || 0);
  const collectionRate = Number(row.collectionRate || 0);

  if (overdue > 0) return 'Perlu Ditagih';
  if (revenue <= 0 && outstanding > 0) return 'Outstanding';
  if (outstanding > 0) return 'Piutang Berjalan';
  if (volume <= 0) return 'Belum Aktif';
  if (collectionRate >= 0.95) return 'Sehat';
  return 'Perlu Dipantau';
}

function createEmptyCustomerPerformanceSummary(customer) {
  return {
    customer,
    salesKeys: new Set(),
    salesNames: new Set(),
    orderKeys: new Set(),
    totalVolume: 0,
    totalRevenue: 0,
    container20ft: 0,
    container40ft: 0,
    lastOrderDate: null,
    totalOutstandingAmount: 0,
    currentAmount: 0,
    overdueAmount: 0,
    overdue1To15Amount: 0,
    overdue16To30Amount: 0,
    overdue1To30Amount: 0,
    overdue31To60Amount: 0,
    overdue60PlusAmount: 0,
    overdue61To90Amount: 0,
    overdue90PlusAmount: 0,
    invoiceCount: 0,
    oldestOverdueDays: 0,
    needsReview: false,
  };
}

export function buildCustomerPerformanceRows(rows = [], outstandingRows = []) {
  const customerMap = new Map();

  rows.forEach((row) => {
    const customer = normalizeCustomerName(row);
    const customerKey = normalizeCustomerKey(customer);
    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, createEmptyCustomerPerformanceSummary(customer));
    }

    const customerSummary = customerMap.get(customerKey);
    const salesName = normalizeSalesName(row);
    const salesKey = normalizeCustomerKey(salesName);
    const orderKey = normalizeSalesOrderId(row);
    const revenue = calculateCompletedJobRevenue(row);
    const size = String(row.container_size || row.containerSize || row.size || '').trim().toUpperCase().replace(/\s/g, '');
    const completedDate = row.completed_date || row.completedDate || row.trip_date || row.tripDate || null;

    if (salesKey) customerSummary.salesKeys.add(salesKey);
    if (salesName) customerSummary.salesNames.add(salesName);
    if (orderKey) customerSummary.orderKeys.add(orderKey);
    customerSummary.totalVolume += 1;
    customerSummary.totalRevenue += revenue;
    if (size === '20FT') customerSummary.container20ft += 1;
    if (size === '40FT') customerSummary.container40ft += 1;
    if (completedDate && (!customerSummary.lastOrderDate || new Date(completedDate) > new Date(customerSummary.lastOrderDate))) {
      customerSummary.lastOrderDate = completedDate;
    }
  });

  outstandingRows.forEach((row) => {
    const customer = normalizeCustomerName(row);
    const customerKey = normalizeCustomerKey(customer);
    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, createEmptyCustomerPerformanceSummary(customer));
    }

    const customerSummary = customerMap.get(customerKey);
    const rowOverdue1To15Amount = Number(row.overdue1To15Amount || 0);
    const rowOverdue16To30Amount = Number(row.overdue16To30Amount || 0)
      || Math.max(Number(row.overdue1To30Amount || 0) - rowOverdue1To15Amount, 0);
    const rowLegacy60PlusAmount = Number(row.overdue61To90Amount || 0) + Number(row.overdue90PlusAmount || 0);
    const rowOverdue60PlusAmount = Number(row.overdue60PlusAmount || 0) || rowLegacy60PlusAmount;

    customerSummary.totalOutstandingAmount += Number(row.totalOutstandingAmount || 0);
    customerSummary.currentAmount += Number(row.currentAmount || 0);
    customerSummary.overdueAmount += Number(row.overdueAmount || 0);
    customerSummary.overdue1To15Amount += rowOverdue1To15Amount;
    customerSummary.overdue16To30Amount += rowOverdue16To30Amount;
    customerSummary.overdue1To30Amount += rowOverdue1To15Amount + rowOverdue16To30Amount;
    customerSummary.overdue31To60Amount += Number(row.overdue31To60Amount || 0);
    customerSummary.overdue60PlusAmount += rowOverdue60PlusAmount;
    customerSummary.overdue61To90Amount += Number(row.overdue61To90Amount || 0);
    customerSummary.overdue90PlusAmount += Number(row.overdue90PlusAmount || 0);
    customerSummary.invoiceCount += Number(row.invoiceCount || 0);
    customerSummary.oldestOverdueDays = Math.max(customerSummary.oldestOverdueDays, Number(row.oldestOverdueDays || 0));
    customerSummary.needsReview = customerSummary.needsReview || Boolean(row.needsReview);
  });

  return Array.from(customerMap.values())
    .map((customer) => {
      const paidEstimate = Math.max(Number(customer.totalRevenue || 0) - Number(customer.totalOutstandingAmount || 0), 0);
      const collectionRate = customer.totalRevenue > 0 ? paidEstimate / customer.totalRevenue : 0;
      const row = {
        customer: customer.customer,
        salesCount: customer.salesKeys.size,
        salesNames: Array.from(customer.salesNames).sort((left, right) => left.localeCompare(right)),
        completedOrders: customer.orderKeys.size,
        totalVolume: customer.totalVolume,
        totalTrips: customer.totalVolume,
        totalContainers: customer.totalVolume,
        totalRevenue: customer.totalRevenue,
        averageRevenuePerVolume: customer.totalVolume ? customer.totalRevenue / customer.totalVolume : 0,
        container20ft: customer.container20ft,
        container40ft: customer.container40ft,
        totalOutstandingAmount: customer.totalOutstandingAmount,
        currentAmount: customer.currentAmount,
        overdueAmount: customer.overdueAmount,
        overdue1To15Amount: customer.overdue1To15Amount,
        overdue16To30Amount: customer.overdue16To30Amount,
        overdue1To30Amount: customer.overdue1To30Amount,
        overdue31To60Amount: customer.overdue31To60Amount,
        overdue60PlusAmount: customer.overdue60PlusAmount,
        overdue61To90Amount: customer.overdue61To90Amount,
        overdue90PlusAmount: customer.overdue90PlusAmount,
        invoiceCount: customer.invoiceCount,
        oldestOverdueDays: customer.oldestOverdueDays,
        needsReview: customer.needsReview,
        paidEstimate,
        collectionRate,
        collectionPercent: collectionRate * 100,
        lastOrderDate: customer.lastOrderDate,
      };
      return { ...row, status: resolveCustomerPerformanceStatus(row) };
    })
    .sort((left, right) => {
      if (right.totalOutstandingAmount !== left.totalOutstandingAmount) return right.totalOutstandingAmount - left.totalOutstandingAmount;
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.totalVolume !== left.totalVolume) return right.totalVolume - left.totalVolume;
      return left.customer.localeCompare(right.customer);
    });
}

export function summarizeCustomerPerformanceRows(rows = []) {
  const totalRevenue = rows.reduce((total, row) => total + Number(row.totalRevenue || 0), 0);
  const totalVolume = rows.reduce((total, row) => total + Number(row.totalVolume || 0), 0);
  const totalOutstandingAmount = rows.reduce((total, row) => total + Number(row.totalOutstandingAmount || 0), 0);
  const overdueAmount = rows.reduce((total, row) => total + Number(row.overdueAmount || 0), 0);
  const activeCustomers = rows.filter((row) => Number(row.totalVolume || 0) > 0).length;

  return {
    totalCustomers: rows.length,
    activeCustomers,
    outstandingCustomers: rows.filter((row) => Number(row.totalOutstandingAmount || 0) > 0).length,
    overdueCustomers: rows.filter((row) => Number(row.overdueAmount || 0) > 0).length,
    healthyCustomers: rows.filter((row) => row.status === 'Sehat').length,
    totalOrders: rows.reduce((total, row) => total + Number(row.completedOrders || 0), 0),
    totalVolume,
    totalContainers: rows.reduce((total, row) => total + Number(row.totalContainers || row.totalVolume || 0), 0),
    totalRevenue,
    totalOutstandingAmount,
    overdueAmount,
    averageRevenuePerCustomer: activeCustomers ? totalRevenue / activeCustomers : 0,
    averageRevenuePerVolume: totalVolume ? totalRevenue / totalVolume : 0,
    collectionRate: totalRevenue > 0 ? Math.max(totalRevenue - totalOutstandingAmount, 0) / totalRevenue : 0,
  };
}

export const DASHBOARD_SO_NUMBER_SQL = 'coalesce(so.accurate_so_number, so.so_number)';

export async function getDashboardReport() {
  const [orders, jobs, documents, masters, trucks, activeJobs, upcomingJobs, progressJobs] = await Promise.all([
    // Dikecualikan is_vendor_order (Phase 3): dashboard ini meringkas ritasi/revenue operasional,
    // dan order vendor tidak pernah punya ritasi -- revenue-nya juga bukan revenue otomatis internal.
    query(`
      select
        count(*)::int as total_orders,
        count(*) filter (where status = 'waiting_operational')::int as waiting_orders,
        count(*) filter (where status = 'running')::int as running_orders,
        count(*) filter (where status = 'completed')::int as completed_orders,
        count(*) filter (where status = 'cancelled')::int as cancelled_orders,
        coalesce(sum(total_amount), 0)::numeric as revenue
      from sales_orders
      where not is_vendor_order
    `),
    query(`
      select
        count(*)::int as total_jobs,
        count(*) filter (where status = 'received')::int as received_jobs,
        count(*) filter (where status = 'running')::int as running_jobs,
        count(*) filter (where status = 'completed')::int as completed_jobs,
        count(*) filter (where status = 'cancelled')::int as cancelled_jobs
      from container_jobs
      where coalesce(execution_source, 'internal') = 'internal'
    `),
    query('select count(*)::int as total_documents from attachments'),
    query(`
      select
        (select count(*)::int from customers where archived_at is null) as customers,
        (select count(*)::int from drivers where archived_at is null) as drivers,
        (select count(*)::int from vehicles where archived_at is null) as vehicles
    `),
    query(`
      select v.id, v.unit_code, v.plate_number, v.container_size, v.default_driver_name,
             default_driver.name as default_driver_full_name,
             default_driver.nickname as default_driver_nickname,
             v.operational_status, v.kir_chassis_number,
             kc.chassis_code, kc.container_size as chassis_size
      from vehicles v
      left join kir_chassis kc on kc.id = v.current_chassis_id
      left join drivers default_driver on default_driver.id = v.default_driver_id
      where v.archived_at is null
      order by v.unit_code asc, v.plate_number asc
    `),
    query(`
      select cj.id, cj.execution_source, cj.container_number, cj.container_size, cj.container_type, cj.status,
             cj.rpuj_status, cj.spk_number, cj.loading_voucher_number,
             cj.unloading_voucher_number, cj.travel_document_number,
             cj.weighing_document_number, cj.tila_gatepass_document_number,
             cj.received_at, cj.running_at,
             cj.completed_at, cj.updated_at, cj.assignment_snapshot,
             assigned_driver.name as driver_full_name,
             assigned_driver.nickname as driver_nickname,
             cj.repo_location, cj.repo_stored_at, cj.repo_reason,
             cj.repo_notes, cj.repo_container_condition,
             so.id as sales_order_id, ${DASHBOARD_SO_NUMBER_SQL} as so_number, so.customer_name,
             so.shipment_type, so.origin, cj.destination, so.trip_date,
             so.sales_name, so.created_by_name
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join drivers assigned_driver on assigned_driver.id = cj.driver_id
      where so.status <> 'cancelled'
        and coalesce(cj.execution_source, 'internal') = 'internal'
        and cj.status in ('received', 'running', 'repo_stored')
      order by so.trip_date asc, cj.created_at asc
      limit 200
    `),
    query(`
      select cj.id, cj.container_number, cj.container_size, cj.container_type, cj.status,
             cj.rpuj_status, cj.spk_number, cj.loading_voucher_number,
             cj.unloading_voucher_number, cj.travel_document_number,
             cj.weighing_document_number, cj.tila_gatepass_document_number,
             cj.received_at, cj.running_at,
             cj.completed_at, cj.updated_at, cj.assignment_snapshot,
             assigned_driver.name as driver_full_name,
             assigned_driver.nickname as driver_nickname,
             so.id as sales_order_id, ${DASHBOARD_SO_NUMBER_SQL} as so_number, so.customer_name,
             so.shipment_type, so.origin, cj.destination, so.trip_date,
             so.sales_name, so.created_by_name
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join drivers assigned_driver on assigned_driver.id = cj.driver_id
      where so.status <> 'cancelled'
        and coalesce(cj.execution_source, 'internal') = 'internal'
        and cj.status in ('received', 'running')
        and so.trip_date >= current_date
      order by so.trip_date asc, cj.created_at asc
      limit 500
    `),
    query(`
      select cj.id, cj.execution_source, cj.container_number, cj.container_size, cj.container_type, cj.status,
             cj.received_at, cj.running_at, cj.completed_at, cj.updated_at, cj.assignment_snapshot,
             assigned_driver.name as driver_full_name,
             assigned_driver.nickname as driver_nickname,
             so.id as sales_order_id, ${DASHBOARD_SO_NUMBER_SQL} as so_number, so.customer_name,
             so.shipment_type, so.origin, cj.destination, so.trip_date,
             so.sales_name, so.created_by_name
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join drivers assigned_driver on assigned_driver.id = cj.driver_id
      where not so.is_vendor_order
        and so.status <> 'cancelled'
        and cj.status <> 'cancelled'
        and exists (
          select 1
          from container_jobs pending
          where pending.sales_order_id = so.id
            and pending.status not in ('completed', 'cancelled')
        )
      order by so.trip_date asc, so.created_at asc, cj.created_at asc
      limit 1000
    `),
  ]);

  return {
    salesOrders: {
      total: orders.rows[0]?.total_orders || 0,
      waiting: orders.rows[0]?.waiting_orders || 0,
      running: orders.rows[0]?.running_orders || 0,
      completed: orders.rows[0]?.completed_orders || 0,
      cancelled: orders.rows[0]?.cancelled_orders || 0,
      revenue: Number(orders.rows[0]?.revenue || 0),
    },
    containerJobs: {
      total: jobs.rows[0]?.total_jobs || 0,
      received: jobs.rows[0]?.received_jobs || 0,
      running: jobs.rows[0]?.running_jobs || 0,
      completed: jobs.rows[0]?.completed_jobs || 0,
      cancelled: jobs.rows[0]?.cancelled_jobs || 0,
    },
    documents: {
      total: documents.rows[0]?.total_documents || 0,
    },
    masters: masters.rows[0] || { customers: 0, drivers: 0, vehicles: 0 },
    trucks: trucks.rows.map((row) => ({
      id: row.id,
      unitCode: row.unit_code,
      plateNumber: row.plate_number,
      capacity: row.container_size || '20FT',
      kirChassisNumber: row.kir_chassis_number || '',
      chassisCode: row.chassis_code || '',
      chassisSize: row.chassis_size || '',
      defaultDriver: row.default_driver_name || '',
      defaultDriverFullName: row.default_driver_full_name || row.default_driver_name || '',
      defaultDriverNickname: row.default_driver_nickname || '',
      status: row.operational_status || 'Aktif',
    })),
    activeJobs: activeJobs.rows.map((row) => ({
      id: row.id,
      orderId: row.sales_order_id,
      soNumber: row.so_number,
      customer: row.customer_name,
      shipment: row.shipment_type,
      origin: row.origin,
      destination: row.destination,
      salesName: row.sales_name || row.created_by_name,
      containerNumber: row.container_number,
      size: row.container_size,
      type: row.container_type,
      status: row.status,
      rpujStatus: row.rpuj_status,
      spkNumber: row.spk_number,
      loadingVoucher: row.loading_voucher_number,
      tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
      unloadingVoucher: row.unloading_voucher_number,
      travelDocument: row.travel_document_number,
      weighingDocument: row.weighing_document_number,
      driver: row.assignment_snapshot?.driver || null,
      driverFullName: row.driver_full_name || row.assignment_snapshot?.driver || null,
      driverNickname: row.driver_nickname || null,
      plateNumber: row.assignment_snapshot?.plateNumber || null,
      tripDate: row.trip_date,
      tripDateKey: row.trip_date,
      receivedAt: row.received_at,
      runningAt: row.running_at,
      completedAt: row.completed_at,
      repoLocation: row.repo_location || '',
      repoStoredAt: row.repo_stored_at,
      repoReason: row.repo_reason || '',
      repoNotes: row.repo_notes || '',
      repoContainerCondition: row.repo_container_condition || '',
      updatedAt: row.updated_at,
    })),
    progressJobs: progressJobs.rows.map((row) => ({
      id: row.id,
      executionSource: row.execution_source === 'vendor' ? 'vendor' : 'internal',
      orderId: row.sales_order_id,
      soNumber: row.so_number,
      customer: row.customer_name,
      shipment: row.shipment_type,
      origin: row.origin,
      destination: row.destination,
      salesName: row.sales_name || row.created_by_name,
      containerNumber: row.container_number,
      size: row.container_size,
      type: row.container_type,
      status: row.status,
      driver: row.assignment_snapshot?.driver || null,
      driverFullName: row.driver_full_name || row.assignment_snapshot?.driver || null,
      driverNickname: row.driver_nickname || null,
      plateNumber: row.assignment_snapshot?.plateNumber || null,
      tripDate: row.trip_date,
      receivedAt: row.received_at,
      runningAt: row.running_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    })),
    upcomingJobs: upcomingJobs.rows.map((row) => ({
      id: row.id,
      orderId: row.sales_order_id,
      soNumber: row.so_number,
      customer: row.customer_name,
      shipment: row.shipment_type,
      origin: row.origin,
      destination: row.destination,
      salesName: row.sales_name || row.created_by_name,
      containerNumber: row.container_number,
      size: row.container_size,
      type: row.container_type,
      status: row.status,
      rpujStatus: row.rpuj_status,
      spkNumber: row.spk_number,
      loadingVoucher: row.loading_voucher_number,
      tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
      unloadingVoucher: row.unloading_voucher_number,
      travelDocument: row.travel_document_number,
      weighingDocument: row.weighing_document_number,
      driver: row.assignment_snapshot?.driver || null,
      driverFullName: row.driver_full_name || row.assignment_snapshot?.driver || null,
      driverNickname: row.driver_nickname || null,
      plateNumber: row.assignment_snapshot?.plateNumber || null,
      tripDate: row.trip_date,
      tripDateKey: row.trip_date,
      receivedAt: row.received_at,
      runningAt: row.running_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function getSalesOrderReport(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const dateFilter = buildDateWhere('trip_date', options);
  // Order vendor (Phase 3) hanya pencatatan Sales Order, bukan ritasi internal -- jangan ikut
  // dihitung di laporan ritasi ini (baik baris maupun rollup revenue/container-nya).
  const clauses = [...dateFilter.clauses, 'not is_vendor_order'];
  const params = [...dateFilter.params];

  if (options.status) {
    params.push(options.status);
    clauses.push(`status = $${params.length}`);
  }
  if (options.customer) {
    params.push(`%${options.customer}%`);
    clauses.push(`customer_name ilike $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so_number ilike $${params.length}
      or do_number ilike $${params.length}
      or customer_name ilike $${params.length}
      or origin ilike $${params.length}
      or destination ilike $${params.length}
      or sales_name ilike $${params.length}
    )`);
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total, summary] = await Promise.all([
    query(
      `
        with filtered_orders as (
          select *
          from sales_orders
          ${whereSql}
          order by trip_date desc, created_at desc
          limit $${limitIndex} offset $${offsetIndex}
        )
        select fo.id, fo.so_number, fo.do_number, fo.so_date, fo.trip_date, fo.received_at,
               fo.customer_name, fo.customer_pic, fo.customer_phone, fo.shipment_type,
               fo.job_type, fo.origin, fo.destination, fo.status, fo.quantity, fo.price,
               fo.unit, fo.total_amount, fo.sales_name, fo.created_by_name, fo.notes, fo.created_at,
               coalesce(count(cj.id), 0)::int as planned_containers,
               coalesce(count(cj.id) filter (where cj.status not in ('cancelled')), 0)::int as active_containers,
               coalesce(count(cj.id) filter (where cj.status = 'completed'), 0)::int as completed_containers,
               coalesce(count(cj.id) filter (where cj.status = 'cancelled'), 0)::int as cancelled_containers
        from filtered_orders fo
        left join container_jobs cj on cj.sales_order_id = fo.id
        group by fo.id, fo.so_number, fo.do_number, fo.so_date, fo.trip_date, fo.received_at,
                 fo.customer_name, fo.customer_pic, fo.customer_phone, fo.shipment_type,
                 fo.job_type, fo.origin, fo.destination, fo.status, fo.quantity, fo.price,
                 fo.unit, fo.total_amount, fo.sales_name, fo.created_by_name, fo.notes, fo.created_at
        order by fo.trip_date desc, fo.created_at desc
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from sales_orders ${whereSql}`, params),
    query(
      `
        with filtered_orders as (
          select id, quantity, total_amount
          from sales_orders
          ${whereSql}
        ),
        job_summary as (
          select
            sales_order_id,
            count(*) filter (where status <> 'cancelled')::int as active_containers,
            count(*) filter (where status = 'completed')::int as completed_containers,
            count(*) filter (where status = 'cancelled')::int as cancelled_containers
          from container_jobs
          where sales_order_id in (select id from filtered_orders)
          group by sales_order_id
        )
        select count(*)::int as orders,
               coalesce(sum(fo.quantity), 0)::int as containers,
               coalesce(sum(js.active_containers), 0)::int as active_containers,
               coalesce(sum(js.completed_containers), 0)::int as completed_containers,
               coalesce(sum(js.cancelled_containers), 0)::int as cancelled_containers,
               coalesce(sum(fo.total_amount), 0)::numeric as revenue
        from filtered_orders fo
        left join job_summary js on js.sales_order_id = fo.id
      `,
      params,
    ),
  ]);

  return {
    rows: rows.rows.map((row) => ({
      id: row.id,
      soNumber: row.so_number,
      doNumber: row.do_number,
      soDate: row.so_date,
      tripDate: row.trip_date,
      receivedAt: row.received_at,
      customer: row.customer_name,
      customerPic: row.customer_pic,
      customerPhone: row.customer_phone,
      shipment: row.shipment_type,
      jobType: row.job_type,
      origin: row.origin,
      destination: row.destination,
      status: row.status,
      quantity: Number(row.quantity || 0),
      plannedContainers: Number(row.planned_containers || row.quantity || 0),
      activeContainers: Number(row.active_containers || 0),
      completedContainers: Number(row.completed_containers || 0),
      cancelledContainers: Number(row.cancelled_containers || 0),
      price: Number(row.price || 0),
      unit: row.unit,
      totalAmount: Number(row.total_amount || 0),
      salesName: row.sales_name || row.created_by_name,
      createdBy: row.created_by_name,
      notes: row.notes,
      createdAt: row.created_at,
    })),
    total: total.rows[0]?.total || 0,
    summary: {
      orders: summary.rows[0]?.orders || 0,
      containers: summary.rows[0]?.containers || 0,
      activeContainers: summary.rows[0]?.active_containers || 0,
      completedContainers: summary.rows[0]?.completed_containers || 0,
      cancelledContainers: summary.rows[0]?.cancelled_containers || 0,
      revenue: Number(summary.rows[0]?.revenue || 0),
    },
  };
}

function parseRevenuePeriod(options = {}) {
  const now = new Date();
  const year = Number(options.year || now.getFullYear());
  const month = Number(options.month || now.getMonth() + 1);

  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error('Bulan dan tahun laporan revenue tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const dateToExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { year, month, dateFrom, dateToExclusive };
}

// Leg transport asli untuk revenue operasional. Job yang sah dititip (repo_stored_at) memakai
// tanggal titip dan assignment yang dilepas saat titip -- sumber yang sama dengan Truck/Driver
// Utilization (repo_released_*, lalu riwayat pickup Repo, lalu assignment job). Job lain (termasuk
// data lama status repo_stored tanpa repo_stored_at) tetap: completed_at + assignment saat ini.
// Truck/sopir Repo dan revenue Repo tidak pernah ikut ke leg ini.
const transportRevenueJobFilterSql = "(cj.status = 'completed' or (cj.repo_stored_at is not null and cj.status <> 'cancelled'))";
const transportRevenueDateSql = timestampToJakartaDateSql('coalesce(cj.repo_stored_at, cj.completed_at)');
const transportRevenueOriginalAssignmentJoinsSql = `
  left join lateral (
    select h.previous_vehicle_id, h.previous_driver_id, h.previous_plate_number, h.previous_driver_name
    from container_job_assignment_history h
    where h.container_job_id = cj.id
      and h.change_source in ('repo_pickup', 'repo_combo_pickup')
    order by h.created_at asc, h.id asc
    limit 1
  ) repo_history on cj.repo_stored_at is not null
  left join vehicles original_vehicle on cj.repo_stored_at is not null
    and original_vehicle.id = coalesce(cj.repo_released_vehicle_id, repo_history.previous_vehicle_id, cj.vehicle_id)
  left join drivers original_driver on cj.repo_stored_at is not null
    and original_driver.id = coalesce(cj.repo_released_driver_id, repo_history.previous_driver_id, cj.driver_id)
`;

function originalTransportSql(repoExpression, normalExpression) {
  return `case when cj.repo_stored_at is not null then ${repoExpression} else ${normalExpression} end`;
}

const originalTransportDriverSql = (normalExpression) => originalTransportSql(
  `coalesce(nullif(repo_history.previous_driver_name, ''),
    case when cj.repo_picked_up_at is null then nullif(cj.assignment_snapshot->>'driver', '') end,
    original_driver.name)`,
  normalExpression,
);
const originalTransportPlateSql = (normalExpression) => originalTransportSql(
  `coalesce(nullif(repo_history.previous_plate_number, ''),
    case when cj.repo_picked_up_at is null then nullif(cj.assignment_snapshot->>'plateNumber', '') end,
    original_vehicle.plate_number)`,
  normalExpression,
);
const originalTransportUnitCodeSql = (normalExpression) => originalTransportSql(
  `coalesce(case when cj.repo_picked_up_at is null then nullif(cj.assignment_snapshot->>'unitCode', '') end,
    original_vehicle.unit_code)`,
  normalExpression,
);

export async function getMonthlyRevenueReport(options = {}) {
  const period = parseRevenuePeriod(options);
  const clauses = [];
  const params = [period.dateFrom, period.dateToExclusive];
  appendEntrySourceFilters(clauses, params, options, 'cj');
  const sourceWhereSql = clauses.length ? `and ${clauses.join(' and ')}` : '';
  const [result, repoRevenueRows] = await Promise.all([query(
    `
      with order_job_totals as (
        select sales_order_id, count(*)::int as total_jobs
        from container_jobs
        group by sales_order_id
      ),
      completed_jobs as (
        select
          cj.id as job_id,
          so.id,
          so.so_number,
          so.customer_name,
          cj.destination,
          so.price,
          so.total_amount,
          to_jsonb(so)->'line_items' as line_items,
          cj.container_number,
          cj.container_size,
          ${transportRevenueDateSql} as completed_date,
          coalesce(cj.entry_source, 'realtime') as entry_source,
          cj.historical_period,
          ${originalTransportDriverSql("nullif(cj.assignment_snapshot->>'driver', '')")} as driver,
          ${originalTransportUnitCodeSql("coalesce(nullif(cj.assignment_snapshot->>'unitCode', ''), v.unit_code, snapshot_vehicle.unit_code)")} as unit_code,
          ${originalTransportPlateSql("nullif(cj.assignment_snapshot->>'plateNumber', '')")} as plate_number,
          greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
        from sales_orders so
        join container_jobs cj on cj.sales_order_id = so.id
        left join order_job_totals ojt on ojt.sales_order_id = so.id
        left join vehicles v on v.id = cj.vehicle_id
        left join vehicles snapshot_vehicle on snapshot_vehicle.archived_at is null
          and trim(snapshot_vehicle.plate_number) = trim(nullif(cj.assignment_snapshot->>'plateNumber', ''))
        ${transportRevenueOriginalAssignmentJoinsSql}
        where so.status <> 'cancelled'
          and ${transportRevenueJobFilterSql}
          ${sourceWhereSql}
      )
      select *
      from completed_jobs
      where completed_date >= $1::date
        and completed_date < $2::date
      order by completed_date desc, plate_number asc nulls last, so_number asc, job_id asc
    `,
    params,
  ), getRepoRevenueRows({
    dateFrom: period.dateFrom,
    dateToExclusive: period.dateToExclusive,
    entrySource: normalizeEntrySourceFilter(options.entrySource),
    historicalPeriod: options.historicalPeriod,
  })]);

  const rows = result.rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    completedDate: row.completed_date,
    soNumber: row.so_number,
    customer: row.customer_name,
    destination: row.destination,
    container: row.container_number || row.container_size || '-',
    size: row.container_size,
    driver: row.driver || '',
    unitCode: row.unit_code || '',
    plateNumber: row.plate_number || '',
    totalContainers: Number(row.total_containers || 0),
    revenue: calculateCompletedJobRevenue(row),
    entrySource: row.entry_source || 'realtime',
    historicalPeriod: row.historical_period || '',
  }));
  const transportRevenue = rows.reduce((total, row) => total + row.revenue, 0);
  const repoRevenue = repoRevenueRows.reduce((total, row) => total + row.amount, 0);

  return {
    period: {
      month: period.month,
      year: period.year,
    },
    rows,
    // Revenue Repo dipisah dari transport: Rp300.000 per container (draft+active, tanpa void),
    // tanggal movement.started_at. totalRevenue tetap = revenue transport seperti sebelumnya.
    repoRevenueRows,
    summary: {
      totalRevenue: transportRevenue,
      transportRevenue,
      repoRevenue,
      repoContainers: repoRevenueRows.length,
      totalOperationalRevenue: transportRevenue + repoRevenue,
      totalOrders: new Set(rows.map((row) => row.id)).size,
      totalContainers: rows.length,
      totalTrucks: new Set(rows.map((row) => row.plateNumber).filter(Boolean)).size,
      totalTrips: rows.length,
    },
  };
}

export async function getSalesPerformanceReport(options = {}) {
  const period = parseRevenuePeriod(options);
  const clauses = [];
  const params = [period.dateFrom, period.dateToExclusive];
  appendEntrySourceFilters(clauses, params, options, 'cj');
  const sourceWhereSql = clauses.length ? `and ${clauses.join(' and ')}` : '';
  const result = await query(
    `
      with order_job_totals as (
        select sales_order_id, count(*)::int as total_jobs
        from container_jobs
        group by sales_order_id
      ),
      completed_jobs as (
        select
          cj.id as job_id,
          so.id,
          so.so_number,
          so.customer_name,
          c.sales_name as customer_sales_name,
          so.sales_name,
          so.created_by_name,
          so.price,
          so.total_amount,
          to_jsonb(so)->'line_items' as line_items,
          cj.container_size,
          ${transportRevenueDateSql} as completed_date,
          coalesce(cj.entry_source, 'realtime') as entry_source,
          cj.historical_period,
          greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
        from sales_orders so
        join container_jobs cj on cj.sales_order_id = so.id
        left join customers c on c.archived_at is null
          and (
            c.id = so.customer_id
            or (
              so.customer_id is null
              and lower(btrim(c.name)) = lower(btrim(so.customer_name))
            )
          )
        left join order_job_totals ojt on ojt.sales_order_id = so.id
        where so.status <> 'cancelled'
          and ${transportRevenueJobFilterSql}
          ${sourceWhereSql}
      )
      select *
      from completed_jobs
      where completed_date >= $1::date
        and completed_date < $2::date
      order by completed_date desc, customer_sales_name asc nulls last, sales_name asc nulls last, so_number asc, job_id asc
    `,
    params,
  );

  const rows = buildSalesPerformanceRows(result.rows);

  return {
    period: {
      month: period.month,
      year: period.year,
    },
    rows,
    total: rows.length,
    summary: summarizeSalesPerformanceRows(rows),
  };
}

async function getAllCustomerOutstandingRollupRows() {
  const pageSize = 100;
  const firstPage = await getCustomerOutstandingRollupPage({ page: 1, pageSize });
  const rows = Array.isArray(firstPage.rows) ? [...firstPage.rows] : [];
  const totalPages = Number(firstPage.totalPages || 1);

  for (let page = 2; page <= totalPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await getCustomerOutstandingRollupPage({ page, pageSize });
    if (Array.isArray(result.rows)) rows.push(...result.rows);
  }

  return rows;
}

export async function getCustomerPerformanceReport(options = {}) {
  const period = parseRevenuePeriod(options);
  const clauses = [];
  const params = [period.dateFrom, period.dateToExclusive];
  appendEntrySourceFilters(clauses, params, options, 'cj');
  const sourceWhereSql = clauses.length ? `and ${clauses.join(' and ')}` : '';

  const [completedResult, outstandingRows] = await Promise.all([
    query(
      `
        with order_job_totals as (
          select sales_order_id, count(*)::int as total_jobs
          from container_jobs
          group by sales_order_id
        ),
        completed_jobs as (
          select
            cj.id as job_id,
            so.id,
            so.so_number,
            so.customer_name,
            c.sales_name as customer_sales_name,
            so.sales_name,
            so.created_by_name,
            so.price,
            so.total_amount,
            to_jsonb(so)->'line_items' as line_items,
            cj.container_size,
            ${transportRevenueDateSql} as completed_date,
            coalesce(cj.entry_source, 'realtime') as entry_source,
            cj.historical_period,
            greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
          from sales_orders so
          join container_jobs cj on cj.sales_order_id = so.id
          left join customers c on c.archived_at is null
            and (
              c.id = so.customer_id
              or (
                so.customer_id is null
                and lower(btrim(c.name)) = lower(btrim(so.customer_name))
              )
            )
          left join order_job_totals ojt on ojt.sales_order_id = so.id
          where so.status <> 'cancelled'
            and ${transportRevenueJobFilterSql}
            ${sourceWhereSql}
        )
        select *
        from completed_jobs
        where completed_date >= $1::date
          and completed_date < $2::date
        order by completed_date desc, customer_name asc, so_number asc, job_id asc
      `,
      params,
    ),
    getAllCustomerOutstandingRollupRows(),
  ]);

  const rows = buildCustomerPerformanceRows(completedResult.rows, outstandingRows);

  return {
    period: {
      month: period.month,
      year: period.year,
    },
    rows,
    total: rows.length,
    summary: summarizeCustomerPerformanceRows(rows),
  };
}

export async function getLocationPerformanceReport(options = {}) {
  const period = parseRevenuePeriod(options);
  const clauses = [];
  const params = [period.dateFrom, period.dateToExclusive];
  appendEntrySourceFilters(clauses, params, options, 'cj');
  const sourceWhereSql = clauses.length ? `and ${clauses.join(' and ')}` : '';
  const result = await query(
    `
      with order_job_totals as (
        select sales_order_id, count(*)::int as total_jobs
        from container_jobs
        group by sales_order_id
      ),
      completed_jobs as (
        select
          cj.id as job_id,
          so.id,
          so.so_number,
          so.customer_name,
          coalesce(cj.warehouse_location_id, so.warehouse_location_id) as location_id,
          coalesce(eu.name, cj.warehouse_location_name_snapshot, so.warehouse_location_name_snapshot, 'Tanpa Lokasi') as location_name,
          eu.operational_status,
          coalesce(cj.destination_id, so.destination_id, eu.destination_id) as destination_id,
          coalesce(dl.name, nullif(trim(cj.destination), ''), nullif(trim(so.destination), ''), 'Tanpa Tujuan') as destination_name,
          so.price,
          so.total_amount,
          to_jsonb(so)->'line_items' as line_items,
          cj.container_size,
          ${transportRevenueDateSql} as completed_date,
          greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
        from sales_orders so
        join container_jobs cj on cj.sales_order_id = so.id
        left join end_users eu on eu.id = coalesce(cj.warehouse_location_id, so.warehouse_location_id)
        left join destination_locations dl on dl.id = coalesce(cj.destination_id, so.destination_id, eu.destination_id)
        left join order_job_totals ojt on ojt.sales_order_id = so.id
        where so.status <> 'cancelled'
          and ${transportRevenueJobFilterSql}
          ${sourceWhereSql}
      )
      select *
      from completed_jobs
      where completed_date >= $1::date
        and completed_date < $2::date
      order by completed_date desc, location_name asc, so_number asc, job_id asc
    `,
    params,
  );

  const rows = buildLocationPerformanceRows(result.rows);
  return {
    period: { month: period.month, year: period.year },
    rows,
    total: rows.length,
    summary: summarizeLocationPerformanceRows(rows),
  };
}

export async function getMonthlyComparisonReport(options = {}) {
  const year = parseComparisonYear(options);
  const dateFrom = `${year}-01-01`;
  const dateToExclusive = `${year + 1}-01-01`;
  const completedClauses = [];
  const completedParams = [dateFrom, dateToExclusive];
  appendEntrySourceFilters(completedClauses, completedParams, options, 'cj');
  const completedSourceWhereSql = completedClauses.length ? `and ${completedClauses.join(' and ')}` : '';

  const repoClauses = [];
  const repoParams = [dateFrom, dateToExclusive];
  appendEntrySourceFilters(repoClauses, repoParams, options, 'cj');
  const repoSourceWhereSql = repoClauses.length ? `and ${repoClauses.join(' and ')}` : '';

  const [completedResult, repoResult, activeTruckResult, utilizationTrips, repoRevenueRows] = await Promise.all([
    query(
      `
        with order_job_totals as (
          select sales_order_id, count(*)::int as total_jobs
          from container_jobs
          group by sales_order_id
        ),
        completed_jobs as (
          select
            cj.id as job_id,
            so.id,
            so.so_number,
            so.customer_name,
            c.sales_name as customer_sales_name,
            so.sales_name,
            so.created_by_name,
            so.price,
            so.total_amount,
            to_jsonb(so)->'line_items' as line_items,
            cj.container_size,
            cj.execution_source,
            ${transportRevenueDateSql} as completed_date,
            coalesce(cj.repo_stored_at, cj.completed_at) as completed_at,
            ${originalTransportSql('original_vehicle.id', 'cj.vehicle_id')} as vehicle_id,
            ${originalTransportPlateSql("coalesce(nullif(cj.assignment_snapshot->>'plateNumber', ''), v.plate_number)")} as plate_number,
            ${originalTransportUnitCodeSql("coalesce(nullif(cj.assignment_snapshot->>'unitCode', ''), v.unit_code)")} as unit_code,
            greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
          from sales_orders so
          join container_jobs cj on cj.sales_order_id = so.id
          left join customers c on c.archived_at is null
            and (
              c.id = so.customer_id
              or (
                so.customer_id is null
                and lower(btrim(c.name)) = lower(btrim(so.customer_name))
              )
            )
          left join vehicles v on v.id = cj.vehicle_id
          left join order_job_totals ojt on ojt.sales_order_id = so.id
          ${transportRevenueOriginalAssignmentJoinsSql}
          where so.status <> 'cancelled'
            and ${transportRevenueJobFilterSql}
            ${completedSourceWhereSql}
        )
        select *
        from completed_jobs
        where completed_date >= $1::date
          and completed_date < $2::date
        order by completed_date asc, so_number asc, job_id asc
      `,
      completedParams,
    ),
    query(
      `
        with repo_jobs as (
          select
            cj.id,
            ${timestampToJakartaDateSql('cj.repo_stored_at')} as repo_stored_date
          from sales_orders so
          join container_jobs cj on cj.sales_order_id = so.id
          where so.status <> 'cancelled'
            and cj.repo_stored_at is not null
            and coalesce(cj.execution_source, 'internal') = 'internal'
            ${repoSourceWhereSql}
        )
        select *
        from repo_jobs
        where repo_stored_date >= $1::date
          and repo_stored_date < $2::date
        order by repo_stored_date asc, id asc
      `,
      repoParams,
    ),
    query(
      `
        select count(*)::int as total
        from vehicles
        where archived_at is null
          and lower(btrim(coalesce(operational_status, 'Aktif'))) not in ('maintenance', 'maintanance', 'tidak aktif', 'nonaktif', 'inactive', 'archived', 'arsip')
      `,
    ),
    getUtilizationTripRows({ dateFrom, dateTo: `${year}-12-31`,
      entrySource: options.entrySource, historicalPeriod: options.historicalPeriod }),
    getRepoRevenueRows({ dateFrom, dateToExclusive,
      entrySource: normalizeEntrySourceFilter(options.entrySource), historicalPeriod: options.historicalPeriod }),
  ]);

  const activeTruckCount = Number(activeTruckResult.rows[0]?.total || 0);
  const rows = buildMonthlyComparisonRows(completedResult.rows, repoResult.rows, { year, activeTruckCount, utilizationTrips, repoRevenueRows });
  const totalRevenue = rows.reduce((total, row) => total + Number(row.totalRevenue || 0), 0);
  const repoRevenue = rows.reduce((total, row) => total + Number(row.repoRevenue || 0), 0);

  return {
    year,
    rows,
    summary: {
      totalRevenue,
      repoRevenue,
      totalOperationalRevenue: totalRevenue + repoRevenue,
      totalTrips: rows.reduce((total, row) => total + Number(row.totalTrips || 0), 0),
      totalVolume: rows.reduce((total, row) => total + Number(row.totalVolume || 0), 0),
      repoStoredCount: rows.reduce((total, row) => total + Number(row.repoStoredCount || 0), 0),
      activeTruckCount,
    },
  };
}

async function findActiveUtilizationChassisCorrections(options = {}) {
  const dateFrom = String(options.dateFrom || '1900-01-01').trim();
  const dateTo = String(options.dateTo || '2100-12-31').trim();

  const result = await query(
    `
      select c.id,
             c.source_vehicle_id,
             source_vehicle.plate_number as source_plate_number,
             source_vehicle.unit_code as source_unit_code,
             source_vehicle.container_size as source_chassis_size,
             c.target_vehicle_id,
             target_vehicle.plate_number as target_plate_number,
             target_vehicle.unit_code as target_unit_code,
             target_vehicle.container_size as target_chassis_size,
             to_char(c.effective_from, 'YYYY-MM-DD') as effective_from,
             to_char(c.effective_to, 'YYYY-MM-DD') as effective_to,
             c.created_at,
             c.reason,
             c.note
      from utilization_chassis_corrections c
      join vehicles source_vehicle on source_vehicle.id = c.source_vehicle_id
      join vehicles target_vehicle on target_vehicle.id = c.target_vehicle_id
      where c.status = 'active'
        and c.effective_from <= $2::date
        and c.effective_to >= $1::date
      order by c.effective_from asc, c.created_at asc
    `,
    [dateFrom, dateTo],
  );

  return result.rows;
}

export async function getUtilizationTripReport(options = {}) {
  const [trips, corrections] = await Promise.all([
    getUtilizationTripRows(options),
    findActiveUtilizationChassisCorrections(options),
  ]);
  return applyUtilizationChassisCorrectionsToRows(trips, corrections);
}

export async function getOperationReport(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const status = String(options.status || '');
  const applyUtilizationCorrections = String(options.applyUtilizationCorrections || '').toLowerCase();
  const shouldApplyChassisCorrections = status === 'completed'
    && ['1', 'true', 'yes', 'chassis'].includes(applyUtilizationCorrections);
  const isFinishedHistory = status === 'finished';
  const dateColumn = isFinishedHistory
    ? `coalesce(${timestampToJakartaDateSql('cj.completed_at')}, ${timestampToJakartaDateSql('cj.cancelled_at')}, so.trip_date)`
    : status === 'completed'
    ? `coalesce(${timestampToJakartaDateSql('cj.completed_at')}, so.trip_date)`
    : status === 'repo_stored'
      ? `coalesce(${timestampToJakartaDateSql('cj.repo_stored_at')}, so.trip_date)`
      : 'so.trip_date';
  const dateFilter = buildDateWhere(dateColumn, options);
  const clauses = [...dateFilter.clauses, "coalesce(cj.execution_source, 'internal') = 'internal'"];
  const params = [...dateFilter.params];

  if (isFinishedHistory) {
    clauses.push("cj.status in ('completed', 'cancelled')");
  } else if (status) {
    params.push(status);
    clauses.push(`cj.status = $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or so.origin ilike $${params.length}
      or cj.destination ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
    )`);
  }
  appendEntrySourceFilters(clauses, params, options, 'cj');

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const orderBySql = (isFinishedHistory || status === 'completed')
    ? 'order by coalesce(cj.completed_at, cj.cancelled_at) desc nulls last, so.trip_date desc, cj.created_at desc'
    : 'order by so.trip_date desc, cj.created_at desc';
  const [rows, total, summary, chassisCorrections] = await Promise.all([
    query(
      `
        select cj.id, cj.container_number, cj.container_size, cj.container_type,
               cj.status, cj.rpuj_status, cj.spk_number, cj.loading_voucher_number,
               cj.unloading_voucher_number, cj.travel_document_number,
               cj.weighing_document_number, cj.tila_gatepass_document_number,
               cj.driver_id, cj.vehicle_id,
               cj.received_at, cj.running_at, cj.cancelled_at,
               cj.completed_at, cj.updated_at, cj.assignment_snapshot,
               cj.inap_started_at, cj.inap_ended_at, cj.inap_reason, cj.inap_notes, cj.inap_created_by_name,
               cj.repo_location, cj.repo_stored_at, cj.repo_eir_number, cj.repo_reason, cj.repo_notes, cj.repo_container_condition,
               cj.repo_released_driver_id, cj.repo_released_vehicle_id,
               cj.repo_created_by_name, cj.repo_picked_up_at, cj.repo_picked_up_by_name,
               coalesce(cj.entry_source, 'realtime') as entry_source, cj.historical_period, cj.historical_notes,
               so.so_number, so.do_number, so.customer_name, so.so_date, so.trip_date,
               so.sales_name, so.created_by_name,
               so.origin, cj.destination,
               coalesce(cj.vehicle_id, snapshot_vehicle.id) as display_vehicle_id,
               coalesce(nullif(cj.assignment_snapshot->>'plateNumber', ''), v.plate_number, snapshot_vehicle.plate_number) as plate_number,
               coalesce(nullif(cj.assignment_snapshot->>'unitCode', ''), v.unit_code, snapshot_vehicle.unit_code) as unit_code,
               ${utilizationChassisSizeSql} as vehicle_chassis_size,
               ${utilizationChassisSourceSql} as chassis_source
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${utilizationChassisJoinsSql}
        ${whereSql}
        ${orderBySql}
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        select count(*)::int as jobs,
               count(*) filter (where cj.status = 'completed')::int as completed,
               count(*) filter (where cj.status = 'cancelled')::int as cancelled,
               count(*) filter (where cj.status = 'running')::int as running,
               count(*) filter (where cj.status = 'received')::int as received,
               count(*) filter (where cj.status = 'repo_stored')::int as repo_stored
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
    shouldApplyChassisCorrections
      ? findActiveUtilizationChassisCorrections(options)
      : Promise.resolve([]),
  ]);

  const mappedRows = rows.rows.map((row) => ({
      id: row.id,
      soNumber: row.so_number,
      doNumber: row.do_number,
      customer: row.customer_name,
      salesName: row.sales_name || row.created_by_name,
      soDate: row.so_date,
      tripDate: row.trip_date,
      origin: row.origin,
      destination: row.destination,
      containerNumber: row.container_number,
      size: row.container_size,
      type: row.container_type,
      status: row.status,
      rpujStatus: row.rpuj_status,
      spkNumber: row.spk_number,
      loadingVoucher: row.loading_voucher_number,
      tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
      unloadingVoucher: row.unloading_voucher_number,
      travelDocument: row.travel_document_number,
      weighingDocument: row.weighing_document_number,
      driverId: row.driver_id,
      vehicleId: row.display_vehicle_id || row.vehicle_id,
      driver: row.assignment_snapshot?.driver || null,
      unitCode: row.unit_code || row.assignment_snapshot?.unitCode || '',
      plateNumber: row.plate_number || row.assignment_snapshot?.plateNumber || null,
      chassisSize: row.vehicle_chassis_size || '',
      chassisSource: row.chassis_source,
      receivedAt: row.received_at,
      runningAt: row.running_at,
      completedAt: row.completed_at,
      inapStartedAt: row.inap_started_at,
      inapEndedAt: row.inap_ended_at,
      inapReason: row.inap_reason || '',
      inapNotes: row.inap_notes || '',
      inapCreatedByName: row.inap_created_by_name || '',
      cancelledAt: row.cancelled_at,
      updatedAt: row.updated_at,
      repoLocation: row.repo_location || '',
      repoStoredAt: row.repo_stored_at,
      repoEirNumber: row.repo_eir_number || '',
      repoReason: row.repo_reason || '',
      repoNotes: row.repo_notes || '',
      repoContainerCondition: row.repo_container_condition || '',
      repoReleasedDriverId: row.repo_released_driver_id,
      repoReleasedVehicleId: row.repo_released_vehicle_id,
      repoCreatedByName: row.repo_created_by_name || '',
      repoPickedUpAt: row.repo_picked_up_at,
      repoPickedUpByName: row.repo_picked_up_by_name || '',
      entrySource: row.entry_source || 'realtime',
      historicalPeriod: row.historical_period || '',
      historicalNotes: row.historical_notes || '',
    }));

  return {
    rows: shouldApplyChassisCorrections
      ? applyUtilizationChassisCorrectionsToRows(mappedRows, chassisCorrections)
      : mappedRows,
    total: total.rows[0]?.total || 0,
    summary: summary.rows[0] || { jobs: 0, completed: 0, cancelled: 0, running: 0, received: 0, repo_stored: 0 },
  };
}

// Identitas sopir di laporan = container_jobs.driver_id (stabil), BUKAN nama di assignment_snapshot.
// Snapshot nama dibekukan saat assignment, jadi kalau nama master sopir diedit di tengah bulan,
// job lama dan baru membawa nama berbeda untuk sopir yang sama -- dulu ini memecah satu sopir
// jadi dua baris. Label memakai nama master TERKINI (driver_master_name). Job lama tanpa
// driver_id tetap dikelompokkan per nama snapshot seperti sebelumnya (tidak digabung ke sopir
// master mana pun hanya karena namanya sama).
export function buildDriverPerformanceRows(rows = []) {
  const drivers = new Map();
  rows.forEach((row) => {
    const snapshotName = String(row.driver || '').trim();
    const key = row.driver_id ? `id:${row.driver_id}` : `name:${snapshotName}`;
    if (!drivers.has(key)) {
      drivers.set(key, {
        driverId: row.driver_id || null,
        driver: row.driver_id ? (row.driver_master_name || snapshotName) : snapshotName,
        weeklyTrips: 0,
        monthlyTrips: 0,
        totalTrips: 0,
        totalRevenue: 0,
        totalDriverCommission: 0,
        paidDriverCommission: 0,
        unpaidDriverCommission: 0,
      });
    }

    const summary = drivers.get(key);
    const revenue = calculateCompletedJobRevenue(row);
    const driverCommission = calculateDriverCommissionAmount(row);
    const paymentAmount = splitDriverCommissionPaymentAmount(row);
    summary.weeklyTrips += 1;
    summary.monthlyTrips += 1;
    summary.totalTrips += 1;
    summary.totalRevenue += revenue;
    summary.totalDriverCommission += driverCommission;
    summary.paidDriverCommission += paymentAmount.paid;
    summary.unpaidDriverCommission += paymentAmount.unpaid;
  });

  return Array.from(drivers.values())
    .map((row) => ({
      ...row,
      averageRevenuePerTrip: row.totalTrips ? row.totalRevenue / row.totalTrips : 0,
      averageCommissionPerTrip: row.totalTrips ? row.totalDriverCommission / row.totalTrips : 0,
    }))
    .sort((left, right) => {
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.monthlyTrips !== left.monthlyTrips) return right.monthlyTrips - left.monthlyTrips;
      return left.driver.localeCompare(right.driver);
    });
}

export function mergeDriverPerformanceTripCounts(performanceRows = [], tripRows = []) {
  const tripsByDriver = new Map();
  tripRows.forEach((trip) => {
    const key = trip.driverId ? `id:${trip.driverId}` : `name:${trip.driver}`;
    if (!trip.driverId && !trip.driver) return;
    const entry = tripsByDriver.get(key) || { driverId: trip.driverId || null, driver: trip.driver, count: 0 };
    entry.count += 1;
    tripsByDriver.set(key, entry);
  });
  const performanceByDriver = new Map(performanceRows.map((row) => [
    row.driverId ? `id:${row.driverId}` : `name:${row.driver}`, { ...row },
  ]));
  tripsByDriver.forEach((entry, key) => {
    const row = performanceByDriver.get(key) || {
      driverId: entry.driverId, driver: entry.driver, totalRevenue: 0,
      totalDriverCommission: 0, paidDriverCommission: 0, unpaidDriverCommission: 0,
    };
    row.weeklyTrips = entry.count;
    row.monthlyTrips = entry.count;
    row.totalTrips = entry.count;
    row.averageRevenuePerTrip = row.totalRevenue / entry.count;
    row.averageCommissionPerTrip = row.totalDriverCommission / entry.count;
    performanceByDriver.set(key, row);
  });
  performanceByDriver.forEach((row, key) => {
    if (tripsByDriver.has(key)) return;
    row.weeklyTrips = 0;
    row.monthlyTrips = 0;
    row.totalTrips = 0;
    row.averageRevenuePerTrip = 0;
    row.averageCommissionPerTrip = 0;
  });
  return [...performanceByDriver.values()];
}

export function mergeDriverPerformanceRevenue(performanceRows = [], revenueRows = []) {
  const byDriver = new Map(performanceRows.map((row) => [
    row.driverId ? `id:${row.driverId}` : `name:${row.driver}`,
    { ...row, totalRevenue: 0 },
  ]));
  for (const revenueRow of revenueRows) {
    const key = revenueRow.driverId ? `id:${revenueRow.driverId}` : `name:${revenueRow.driver}`;
    const row = byDriver.get(key) || {
      driverId: revenueRow.driverId, driver: revenueRow.driver,
      weeklyTrips: 0, monthlyTrips: 0, totalTrips: 0,
      totalRevenue: 0, totalDriverCommission: 0,
      paidDriverCommission: 0, unpaidDriverCommission: 0,
    };
    row.totalRevenue += revenueRow.totalRevenue;
    byDriver.set(key, row);
  }
  return [...byDriver.values()];
}

export async function getDriverPerformanceReport(options = {}, db = { query }) {
  const month = String(options.month || '').trim();
  const weekFrom = String(options.weekFrom || '').trim();
  const weekTo = String(options.weekTo || '').trim();
  const commissionStatus = String(options.commissionStatus || '').trim();
  const commissionPaymentStatus = String(options.commissionPaymentStatus || options.commission_payment_status || '').trim();
  const params = [];
  const monthFilter = month && month !== 'all' ? month : '';

  const monthCondition = monthFilter
    ? `and to_char(completed_date, 'YYYY-MM') = $${params.push(monthFilter)}`
    : '';
  const weekFromCondition = weekFrom
    ? `and completed_date >= $${params.push(weekFrom)}`
    : '';
  const weekToCondition = weekTo
    ? `and completed_date <= $${params.push(weekTo)}`
    : '';
  const sourceClauses = [];
  appendEntrySourceFilters(sourceClauses, params, options, 'cj');
  const sourceCondition = sourceClauses.length ? `and ${sourceClauses.join(' and ')}` : '';
  const commissionCondition = commissionStatus === 'with_commission'
    ? 'and coalesce(cj.has_driver_commission, false) and coalesce(cj.driver_commission_amount, 0) > 0'
    : commissionStatus === 'without_commission'
      ? 'and not (coalesce(cj.has_driver_commission, false) and coalesce(cj.driver_commission_amount, 0) > 0)'
      : '';
  const commissionPaymentCondition = {
    unsubmitted: 'and coalesce(has_driver_commission, false) and coalesce(driver_commission_amount, 0) > 0 and commission_batch_status is null',
    submitted: "and commission_batch_status = 'submitted'",
    approved: "and commission_batch_status = 'approved' and coalesce(commission_payment_status, 'pending') <> 'paid'",
    paid: "and commission_payment_status = 'paid'",
    unpaid: "and coalesce(has_driver_commission, false) and coalesce(driver_commission_amount, 0) > 0 and coalesce(commission_payment_status, 'pending') <> 'paid'",
  }[commissionPaymentStatus] || '';

  const [rows, revenueRows, months] = await Promise.all([
    db.query(
      `
        with order_job_totals as (
          select sales_order_id, count(*)::int as total_jobs
          from container_jobs
          group by sales_order_id
        ),
        completed_jobs as (
          select cj.id,
                 cj.driver_id,
                 nullif(btrim(d.name), '') as driver_master_name,
                 nullif(cj.assignment_snapshot->>'driver', '') as driver,
                 coalesce(${timestampToJakartaDateSql('cj.completed_at')}, so.trip_date) as completed_date,
                 so.price,
                 so.total_amount,
                 to_jsonb(so)->'line_items' as line_items,
                 cj.container_size,
                 cj.has_driver_commission,
                 cj.driver_commission_amount,
                 dcb.status as commission_batch_status,
                 dcp.status as commission_payment_status,
                 dcp.paid_at as commission_paid_at,
                 greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
          from container_jobs cj
          join sales_orders so on so.id = cj.sales_order_id
          left join order_job_totals ojt on ojt.sales_order_id = so.id
          left join drivers d on d.id = cj.driver_id
          left join driver_commission_items dci on dci.container_job_id = cj.id and dci.voided_at is null
          left join driver_commission_batches dcb on dcb.id = dci.batch_id
          left join driver_commission_payments dcp on dcp.id = dci.payment_id
          where cj.status = 'completed'
            and coalesce(cj.execution_source, 'internal') = 'internal'
            and so.status <> 'cancelled'
            and nullif(cj.assignment_snapshot->>'driver', '') is not null
            ${sourceCondition}
            ${commissionCondition}
        )
        select *
        from completed_jobs cj
        where true ${monthCondition} ${weekFromCondition} ${weekToCondition} ${commissionPaymentCondition}
        order by completed_date desc, driver asc
      `,
      params,
    ),
    db.query(
      `
        with order_job_totals as (
          select sales_order_id, count(*)::int as total_jobs
          from container_jobs
          group by sales_order_id
        ),
        transport_jobs as (
          select cj.id,
                 ${originalTransportSql('coalesce(cj.repo_released_driver_id, repo_history.previous_driver_id, cj.driver_id)', 'cj.driver_id')} as driver_id,
                 ${originalTransportSql("nullif(btrim(original_driver.name), '')", "nullif(btrim(d.name), '')")} as driver_master_name,
                 ${originalTransportDriverSql("nullif(cj.assignment_snapshot->>'driver', '')")} as driver,
                 ${transportRevenueDateSql} as completed_date,
                 so.price, so.total_amount, to_jsonb(so)->'line_items' as line_items,
                 cj.container_size, cj.has_driver_commission, cj.driver_commission_amount,
                 dcb.status as commission_batch_status, dcp.status as commission_payment_status,
                 greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
          from container_jobs cj
          join sales_orders so on so.id = cj.sales_order_id
          left join order_job_totals ojt on ojt.sales_order_id = so.id
          left join drivers d on d.id = cj.driver_id
          ${transportRevenueOriginalAssignmentJoinsSql}
          left join driver_commission_items dci on dci.container_job_id = cj.id and dci.voided_at is null
          left join driver_commission_batches dcb on dcb.id = dci.batch_id
          left join driver_commission_payments dcp on dcp.id = dci.payment_id
          where ${transportRevenueJobFilterSql}
            and coalesce(cj.execution_source, 'internal') = 'internal'
            and so.status <> 'cancelled'
            and ${transportRevenueDateSql} is not null
            and (${originalTransportSql('coalesce(cj.repo_released_driver_id, repo_history.previous_driver_id, cj.driver_id)', 'cj.driver_id')} is not null
              or ${originalTransportDriverSql("nullif(cj.assignment_snapshot->>'driver', '')")} is not null)
            ${sourceCondition}
            ${commissionCondition}
        )
        select * from transport_jobs cj
        where true ${monthCondition} ${weekFromCondition} ${weekToCondition} ${commissionPaymentCondition}
        order by completed_date desc, driver asc
      `,
      params,
    ),
    db.query(`
      select distinct value from (
        select to_char(${transportRevenueDateSql}, 'YYYY-MM') as value
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where ${transportRevenueJobFilterSql}
          and coalesce(cj.execution_source, 'internal') = 'internal'
          and so.status <> 'cancelled'
          and ${transportRevenueDateSql} is not null
        union
        select to_char(coalesce(${timestampToJakartaDateSql('cj.completed_at')}, so.trip_date), 'YYYY-MM') as value
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where cj.status = 'completed'
          and coalesce(cj.execution_source, 'internal') = 'internal'
          and nullif(cj.assignment_snapshot->>'driver', '') is not null
      ) periods
      where value is not null
      order by value desc
    `),
  ]);

  const performanceRows = mergeDriverPerformanceRevenue(
    buildDriverPerformanceRows(rows.rows), buildDriverPerformanceRows(revenueRows.rows),
  );
  // Revenue and commission stay job based; trip counts use physical events.
  const tripRows = await getUtilizationTripRows({
    dateFrom: weekFrom || (monthFilter ? `${monthFilter}-01` : ''),
    dateTo: weekTo || (monthFilter ? `${monthFilter}-${String(daysInMonth(Number(monthFilter.slice(5)), Number(monthFilter.slice(0, 4)))).padStart(2, '0')}` : ''),
    entrySource: options.entrySource,
    historicalPeriod: options.historicalPeriod,
  }, db);
  const physicalPerformanceRows = mergeDriverPerformanceTripCounts(performanceRows, tripRows);

  return {
    rows: physicalPerformanceRows,
    total: physicalPerformanceRows.length,
    summary: {
      totalTrips: physicalPerformanceRows.reduce((total, row) => total + row.totalTrips, 0),
      totalRevenue: physicalPerformanceRows.reduce((total, row) => total + row.totalRevenue, 0),
      totalDriverCommission: physicalPerformanceRows.reduce((total, row) => total + row.totalDriverCommission, 0),
      paidDriverCommission: physicalPerformanceRows.reduce((total, row) => total + row.paidDriverCommission, 0),
      unpaidDriverCommission: physicalPerformanceRows.reduce((total, row) => total + row.unpaidDriverCommission, 0),
      activeDrivers: physicalPerformanceRows.filter((row) => row.totalTrips > 0).length,
    },
    months: months.rows.map((row) => ({
      value: row.value,
      label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
        .format(new Date(`${row.value}-01T00:00:00`)),
    })),
  };
}

function normalizeMonitoringLimit(options = {}) {
  const limit = Math.max(10, Math.min(200, Number(options.limit || 100)));
  return Number.isFinite(limit) ? limit : 100;
}

function mapInputMonitoringRow(row = {}) {
  return {
    id: row.id,
    salesOrderId: row.sales_order_id || row.id,
    containerJobId: row.container_job_id || '',
    internalSoNumber: row.so_number || '',
    accurateSoNumber: row.accurate_so_number || '',
    invoiceNumber: row.invoice_number || '',
    customer: row.customer_name || '-',
    salesName: row.sales_name || row.created_by_name || '-',
    orderDate: row.so_date || row.trip_date || row.created_at,
    tripDate: row.trip_date,
    completedAt: row.completed_at,
    containerNumber: row.container_number || '',
    containerSize: row.container_size || '',
    driverName: row.driver_name || row.assignment_snapshot?.driver || '',
    plateNumber: row.plate_number || row.assignment_snapshot?.plateNumber || '',
    destination: row.destination || '-',
    status: row.status || '',
    rpujStatus: row.rpuj_status || '',
    billingStatus: row.billing_status || '',
    amount: Number(row.total_amount || row.billing_amount || 0),
    quantity: Number(row.quantity || row.container_count || 0),
    missingItems: Array.isArray(row.missing_items) ? row.missing_items.filter(Boolean) : [],
    team: row.team || '',
    ageDays: Number(row.age_days || 0),
    totalCount: Number(row.total_count || 0),
  };
}

function getMonitoringTotal(rows = []) {
  return Number(rows[0]?.totalCount || rows.length || 0);
}

export async function getInputMonitoringReport(options = {}) {
  const limit = normalizeMonitoringLimit(options);
  const activeOrderSql = "so.status <> 'cancelled'";
  const activeJobSql = "cj.status not in ('cancelled', 'repo_stored')";

  const [
    missingSoNumber,
    missingAssignment,
    missingCost,
    missingInvoice,
    missingDocuments,
  ] = await Promise.all([
    // missingSoNumber query di sini sengaja mengecualikan is_vendor_order -- ini satu-satunya
    // sub-query monitoring yang membaca sales_orders langsung tanpa join container_jobs, jadi
    // tanpa filter ini order vendor (yang memang tidak diproses Finance) akan salah ditandai
    // "belum ada nomor SO" (Phase 3). Sub-query lain di bawah sudah otomatis aman karena
    // mensyaratkan container_jobs, yang tidak pernah dibuat untuk order vendor.
    query(
      `
        select so.id, so.so_number, so.accurate_so_number, so.customer_name,
               so.sales_name, so.created_by_name, so.so_date, so.trip_date,
               so.destination, so.status, so.quantity, so.total_amount,
               'Finance' as team,
               greatest(0, current_date - coalesce(so.so_date, so.trip_date, so.created_at::date))::int as age_days,
               count(*) over()::int as total_count
        from sales_orders so
        where ${activeOrderSql}
          and not so.is_vendor_order
          and nullif(btrim(coalesce(so.accurate_so_number, '')), '') is null
        order by coalesce(so.so_date, so.trip_date, so.created_at::date) asc, so.created_at asc
        limit $1
      `,
      [limit],
    ),
    query(
      `
        select cj.id as container_job_id, so.id as sales_order_id, so.so_number,
               so.accurate_so_number, so.customer_name, so.sales_name, so.created_by_name,
               so.trip_date, so.destination, cj.container_number, cj.container_size,
               cj.status, cj.rpuj_status, cj.assignment_snapshot,
               nullif(cj.assignment_snapshot->>'driver', '') as driver_name,
               nullif(cj.assignment_snapshot->>'plateNumber', '') as plate_number,
               array_remove(array[
                 case when cj.driver_id is null and nullif(cj.assignment_snapshot->>'driver', '') is null then 'Sopir' end,
                 case when cj.vehicle_id is null and nullif(cj.assignment_snapshot->>'plateNumber', '') is null then 'Truck' end,
                 case when nullif(btrim(coalesce(cj.container_number, '')), '') is null then 'No Container' end
               ], null) as missing_items,
               'Operational' as team,
               greatest(0, current_date - coalesce(so.trip_date, cj.created_at::date))::int as age_days,
               count(*) over()::int as total_count
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where ${activeOrderSql}
          and ${activeJobSql}
          and coalesce(cj.execution_source, 'internal') = 'internal'
          and (
            (cj.driver_id is null and nullif(cj.assignment_snapshot->>'driver', '') is null)
            or (cj.vehicle_id is null and nullif(cj.assignment_snapshot->>'plateNumber', '') is null)
            or nullif(btrim(coalesce(cj.container_number, '')), '') is null
          )
        order by coalesce(so.trip_date, cj.created_at::date) asc, cj.created_at asc
        limit $1
      `,
      [limit],
    ),
    query(
      `
        select cj.id as container_job_id, so.id as sales_order_id, so.so_number,
               so.accurate_so_number, so.customer_name, so.sales_name, so.created_by_name,
               so.trip_date, so.destination, cj.container_number, cj.container_size,
               cj.status, cj.rpuj_status, cj.assignment_snapshot,
               nullif(cj.assignment_snapshot->>'driver', '') as driver_name,
               nullif(cj.assignment_snapshot->>'plateNumber', '') as plate_number,
               array_remove(array[
                 case when coalesce(cj.rpuj_status, 'pending') = 'pending' then 'Belum diajukan' end,
                 case when coalesce(cj.rpuj_status, 'pending') = 'submitted' then 'Menunggu cek Finance' end,
                 case when coalesce(cj.rpuj_status, 'pending') = 'rejected' then 'Perlu revisi' end
               ], null) as missing_items,
               case when coalesce(cj.rpuj_status, 'pending') = 'submitted' then 'Finance' else 'Operational' end as team,
               greatest(0, current_date - coalesce(cj.running_at::date, so.trip_date, cj.created_at::date))::int as age_days,
               count(*) over()::int as total_count
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        where ${activeOrderSql}
          and ${activeJobSql}
          and coalesce(cj.execution_source, 'internal') = 'internal'
          and coalesce(cj.rpuj_status, 'pending') in ('pending', 'submitted', 'rejected')
        order by coalesce(cj.running_at::date, so.trip_date, cj.created_at::date) asc, cj.created_at asc
        limit $1
      `,
      [limit],
    ),
    query(
      `
        select so.id, so.so_number, so.accurate_so_number, so.invoice_number,
               so.customer_name, so.sales_name, so.created_by_name, so.destination,
               so.status, so.billing_status, so.total_amount,
               max(cj.completed_at) as completed_at,
               count(cj.id)::int as container_count,
               'Finance' as team,
               greatest(0, current_date - coalesce(max(cj.completed_at)::date, so.updated_at::date, so.trip_date))::int as age_days,
               count(*) over()::int as total_count
        from sales_orders so
        join container_jobs cj on cj.sales_order_id = so.id
        where ${activeOrderSql}
          and so.status = 'completed'
          and nullif(btrim(coalesce(so.invoice_number, '')), '') is null
        group by so.id
        order by coalesce(max(cj.completed_at)::date, so.updated_at::date, so.trip_date) asc
        limit $1
      `,
      [limit],
    ),
    query(
      `
        with attachment_flags as (
          select entity_id,
                 bool_or(category = 'eirDocument') as has_eir_file,
                 bool_or(category = 'travelDocumentFile') as has_travel_file,
                 bool_or(category in ('loadingVoucherDocument', 'unloadingVoucherDocument')) as has_loading_file,
                 bool_or(category = 'tilaGatepassDocumentFile') as has_tila_file
          from attachments
          where entity_type = 'container_job'
          group by entity_id
        ),
        document_rows as (
          select cj.id as container_job_id, so.id as sales_order_id, so.so_number,
                 so.accurate_so_number, so.customer_name, so.sales_name, so.created_by_name,
                 so.trip_date, so.destination, cj.container_number, cj.container_size,
                 cj.status, cj.rpuj_status, cj.assignment_snapshot, cj.completed_at,
                 nullif(cj.assignment_snapshot->>'driver', '') as driver_name,
                 nullif(cj.assignment_snapshot->>'plateNumber', '') as plate_number,
                 array_remove(array[
                   case when nullif(btrim(coalesce(cj.eir_number, '')), '') is null and not coalesce(af.has_eir_file, false) then 'EIR' end,
                   case when nullif(btrim(coalesce(cj.travel_document_number, '')), '') is null and not coalesce(af.has_travel_file, false) then 'Surat Jalan' end,
                   case when nullif(btrim(coalesce(cj.loading_voucher_number, cj.unloading_voucher_number, '')), '') is null and not coalesce(af.has_loading_file, false) then 'Bon Muat/Bongkar' end,
                   case when nullif(btrim(coalesce(cj.tila_gatepass_document_number, cj.weighing_document_number, '')), '') is null and not coalesce(af.has_tila_file, false) then 'TILA/Gatepass' end
                 ], null) as missing_items,
                 'Operational' as team,
                 greatest(0, current_date - coalesce(cj.completed_at::date, so.trip_date, cj.created_at::date))::int as age_days
          from container_jobs cj
          join sales_orders so on so.id = cj.sales_order_id
          left join attachment_flags af on af.entity_id = cj.id
          where ${activeOrderSql}
            and cj.status = 'completed'
        )
        select *, count(*) over()::int as total_count
        from document_rows
        where array_length(missing_items, 1) > 0
        order by coalesce(completed_at::date, trip_date) asc
        limit $1
      `,
      [limit],
    ),
  ]);

  const categories = {
    missingSoNumber: missingSoNumber.rows.map(mapInputMonitoringRow),
    missingAssignment: missingAssignment.rows.map(mapInputMonitoringRow),
    missingCost: missingCost.rows.map(mapInputMonitoringRow),
    missingInvoice: missingInvoice.rows.map(mapInputMonitoringRow),
    missingDocuments: missingDocuments.rows.map(mapInputMonitoringRow),
  };

  return {
    generatedAt: new Date().toISOString(),
    limit,
    summary: {
      missingSoNumber: getMonitoringTotal(categories.missingSoNumber),
      missingAssignment: getMonitoringTotal(categories.missingAssignment),
      missingCost: getMonitoringTotal(categories.missingCost),
      missingInvoice: getMonitoringTotal(categories.missingInvoice),
      missingDocuments: getMonitoringTotal(categories.missingDocuments),
    },
    categories,
  };
}

export async function getDocumentReport(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const dateFilter = buildDateWhere('created_at::date', options);
  const clauses = [...dateFilter.clauses];
  const params = [...dateFilter.params];

  if (options.entityType) {
    params.push(options.entityType);
    clauses.push(`entity_type = $${params.length}`);
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total, summary] = await Promise.all([
    query(
      `
        select id, entity_type, entity_id, category, reference_number,
               document_date, file_name, mime_type, file_size, uploaded_by_name, created_at
        from attachments
        ${whereSql}
        order by created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from attachments ${whereSql}`, params),
    query(
      `
        select count(*)::int as documents,
               coalesce(sum(file_size), 0)::bigint as total_size
        from attachments
        ${whereSql}
      `,
      params,
    ),
  ]);

  return {
    rows: rows.rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      category: row.category,
      referenceNumber: row.reference_number,
      documentDate: row.document_date,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size == null ? 0 : Number(row.file_size),
      uploadedByName: row.uploaded_by_name,
      createdAt: row.created_at,
    })),
    total: total.rows[0]?.total || 0,
    summary: {
      documents: summary.rows[0]?.documents || 0,
      totalSize: Number(summary.rows[0]?.total_size || 0),
    },
  };
}
