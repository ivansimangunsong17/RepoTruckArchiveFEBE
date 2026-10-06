import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BarChart3, ChevronLeft, ChevronRight, Eye, Maximize2, Save, Search, Trash2, Truck, Users, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import { USER_ROLES, hasPermission } from '../../constants/roles';
import { useArchiveData } from '../../contexts/ArchiveDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../hooks/useFeedback';
import { fetchFinanceOutstanding } from '../../services/finance/financeService';
import { buildHolidayMap, fetchIndonesiaPublicHolidays } from '../../services/reports/holidayService';
import {
  fetchCustomerPerformanceReport,
  fetchDriverPerformanceReport,
  fetchMonthlyComparisonReport,
  fetchMonthlyRevenueReport,
  fetchOperationReport,
  fetchSalesPerformanceReport,
} from '../../services/reports/reportService';
import { deleteUtilizationNote, fetchUtilizationNotes, saveUtilizationNote } from '../../services/reports/utilizationNoteService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

const MONTHS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

const WEEKDAYS = [
  { short: 'Min', long: 'Minggu' },
  { short: 'Sen', long: 'Senin' },
  { short: 'Sel', long: 'Selasa' },
  { short: 'Rab', long: 'Rabu' },
  { short: 'Kam', long: 'Kamis' },
  { short: 'Jum', long: 'Jumat' },
  { short: 'Sab', long: 'Sabtu' },
];

function formatPivotDateLabel(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '-';
  return `${day} ${MONTHS[month - 1]?.label?.slice(0, 3) || ''}`.trim();
}

const DEFAULT_REVENUE_SUMMARY = {
  totalRevenue: 0,
  totalOrders: 0,
  totalContainers: 0,
  totalTrucks: 0,
  totalTrips: 0,
};

const DEFAULT_SALES_PERFORMANCE_SUMMARY = {
  totalSales: 0,
  activeSales: 0,
  totalCustomers: 0,
  totalOrders: 0,
  totalVolume: 0,
  totalContainers: 0,
  totalRevenue: 0,
  averageRevenuePerSales: 0,
  averageRevenuePerVolume: 0,
};

const DEFAULT_CUSTOMER_PERFORMANCE_SUMMARY = {
  totalCustomers: 0,
  activeCustomers: 0,
  outstandingCustomers: 0,
  overdueCustomers: 0,
  healthyCustomers: 0,
  totalOrders: 0,
  totalVolume: 0,
  totalContainers: 0,
  totalRevenue: 0,
  totalOutstandingAmount: 0,
  overdueAmount: 0,
  averageRevenuePerCustomer: 0,
  averageRevenuePerVolume: 0,
  collectionRate: 0,
};

const DATA_SOURCE_OPTIONS = [
  { value: 'all', label: 'Semua Data' },
  { value: 'realtime', label: 'Realtime' },
  { value: 'historical', label: 'Data Lama' },
];

const CUSTOMER_PERFORMANCE_PAGE_SIZE = 10;

function utilizationNoteKey(resourceId, date) {
  return `${String(resourceId || '').trim()}|${String(date || '').trim().slice(0, 10)}`;
}

function currentPeriod() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function monthRange(month, year) {
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0);
  const format = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    dateFrom: format(start),
    dateTo: format(end),
  };
}

function getTruckPlate(row = {}) {
  return String(row.plateNumber || row.plate || row.unitCode || 'Truck belum diassign').trim() || 'Truck belum diassign';
}

function getTruckUnitCode(row = {}) {
  return String(row.unitCode || row.unit_code || row.truckCode || row.truckNumber || '').trim();
}

function normalizeTruckSize(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s/g, '');
  if (normalized === '40FT') return '40FT';
  if (normalized === '20FT') return '20FT';
  return '';
}

function getTruckSize(row = {}) {
  if (Object.prototype.hasOwnProperty.call(row, 'chassisSize')) return normalizeTruckSize(row.chassisSize);
  return normalizeTruckSize(
    row.capacity
    || row.chassisSize
    || row.chassis_size
    || row.vehicleChassisSize
    || row.vehicle_chassis_size
    || row.currentChassisSize
    || row.displayChassisSize
    || row.containerSize
    || row.container_size
    || row.size
    || row.defaultSize,
  );
}

function truckSizeSortKey(size) {
  const normalized = normalizeTruckSize(size);
  if (normalized === '20FT') return 0;
  if (normalized === '40FT') return 1;
  return 2;
}

function getTruckId(row = {}) {
  return String(row.vehicleId || row.vehicle_id || row.truckId || row.truck_id || row.id || '').trim();
}

function getCustomerName(row = {}) {
  return String(
    row.customerName
    || row.customer_name
    || row.customer
    || row.clientName
    || row.client_name
    || row.endUserName
    || row.end_user_name
    || row.consigneeName
    || row.consignee_name
    || 'Customer belum diisi',
  ).trim() || 'Customer belum diisi';
}

function formatTruckUnitCode(unitCode) {
  const value = String(unitCode || '').trim();
  if (!value) return '-';
  return value.replace(/^TRK-?/i, '').replace(/^0+(\d)/, '$1') || value;
}

const UTILIZATION_NOTE_ABBREVIATIONS = {
  'TUNGGU DO': 'TD',
  'TGG DO': 'TD',
  'TGGU DO': 'TD',
  'MUAT SIANG': 'MSI',
  'MUAT SORE': 'MSO',
  'MUAT MALAM': 'MML',
  INAP: 'INP',
  'ANTRI BONGKAR': 'AB',
  'BONGKAR DI GUDANG': 'BG',
  'BONGKAR D GUDANG': 'BG',
  'BATAL DO': 'BD',
  TITIP: 'TTP',
  'GANTI DRIVER': 'GD',
  'TUNGGU DRIVER': 'TDR',
  'DRIVER PULANG': 'DP',
  'SAMPAI GUDANG MALAM': 'SGM',
};

function formatUtilizationNoteCode(note = {}) {
  const label = String(note.reasonLabel || note.notes || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!label) return 'CT';
  if (UTILIZATION_NOTE_ABBREVIATIONS[label]) return UTILIZATION_NOTE_ABBREVIATIONS[label];

  const words = label.split(/[^A-Z0-9]+/).filter(Boolean);
  if (!words.length) return 'CT';
  if (words.length === 1) return words[0].slice(0, 3);
  return words.map((word) => word[0]).join('').slice(0, 4);
}

function getDriverName(row = {}) {
  return String(row.driver || row.defaultDriver || row.defaultDriverName || row.name || 'Sopir belum diisi').trim() || 'Sopir belum diisi';
}

// Laporan sopir dikelompokkan per driver_id, bukan per teks nama: nama di snapshot job dibekukan
// saat assignment, jadi sopir yang namanya diedit di tengah bulan akan punya dua nama berbeda.
// Hanya data lama tanpa driver_id yang tetap memakai nama sebagai kunci (tidak pernah digabung
// ke sopir master hanya karena namanya sama).
function driverIdentityKey(driverId, name) {
  return driverId ? `id:${driverId}` : `name:${name}`;
}

function monthKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildCommissionWeekOptions(month, year) {
  const selectedMonth = Number(month);
  const selectedYear = Number(year);
  const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
  const monthEnd = new Date(selectedYear, selectedMonth, 0);
  let weekStart = new Date(monthStart);
  while (weekStart.getDay() !== 4) {
    weekStart = addDays(weekStart, -1);
  }

  const formatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const options = [{ value: 'all', label: 'Semua periode bulan ini' }];
  while (weekStart <= monthEnd) {
    const weekEnd = addDays(weekStart, 6);
    const from = dateKey(weekStart);
    const to = dateKey(weekEnd);
    options.push({
      value: `${from}|${to}`,
      from,
      to,
      label: `${formatter.format(weekStart)} - ${formatter.format(weekEnd)}`,
    });
    weekStart = addDays(weekStart, 7);
  }
  return options;
}

function daysInMonth(month, year) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function addTruckIdentityKeys(map, truck, value) {
  const keys = [
    getTruckId(truck),
    truck.vehicleId,
    truck.vehicle_id,
    getTruckPlate(truck),
    truck.plateNumber,
    truck.plate,
    getTruckUnitCode(truck),
  ].map(normalizeIdentity).filter(Boolean);

  keys.forEach((key) => {
    if (!map.has(key)) map.set(key, value);
  });
}

function normalizeTruckStatus(row = {}) {
  return String(row.status || row.operationalStatus || row.operational_status || 'Aktif').trim().toLowerCase();
}

function isActiveTruck(row = {}) {
  const status = normalizeTruckStatus(row);
  return !['maintenance', 'maintanance', 'tidak aktif', 'nonaktif', 'inactive', 'archived', 'arsip'].includes(status);
}

function isFleetTruck(row = {}) {
  const status = normalizeTruckStatus(row);
  return !['archived', 'arsip'].includes(status);
}

function buildUtilizationPeriod(month, year, baseDate = new Date()) {
  const selectedYear = Number(year);
  const selectedMonth = Number(month);
  const selectedMonthIndex = selectedMonth - 1;
  const currentYear = baseDate.getFullYear();
  const currentMonthIndex = baseDate.getMonth();
  const totalDays = daysInMonth(selectedMonth, selectedYear);
  const startDay = 1;
  let endDay = totalDays;

  if (selectedYear === currentYear && selectedMonthIndex === currentMonthIndex) {
    endDay = Math.max(0, baseDate.getDate() - 1);
  } else if (
    selectedYear > currentYear
    || (selectedYear === currentYear && selectedMonthIndex > currentMonthIndex)
  ) {
    endDay = 0;
  }

  return {
    startDay,
    endDay,
    days: endDay > 0 ? endDay : 0,
    dateFrom: endDay > 0 ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01` : '',
    dateTo: endDay > 0 ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}` : '',
  };
}

function formatUtilizationPeriod(period, activeMonthLabel, year) {
  if (!period.days) return 'Belum ada data utilisasi bulan berjalan';
  return `${period.startDay}-${period.endDay} ${activeMonthLabel} ${year}`;
}

function normalizeHolidayEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { localName: entry, name: entry };
  const localName = String(entry.localName || entry.name || 'Libur Nasional').trim();
  const name = String(entry.name || entry.localName || 'Public Holiday').trim();
  return { localName, name };
}

function getHolidayEntries(holidaysByDate, dateKey) {
  const entries = holidaysByDate?.[dateKey];
  if (!entries) return [];
  return (Array.isArray(entries) ? entries : [entries]).map(normalizeHolidayEntry).filter(Boolean);
}

function buildMonthDays(month, year, holidaysByDate = {}) {
  const totalDays = daysInMonth(month, year);
  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const date = new Date(Number(year), Number(month) - 1, day);
    const weekday = WEEKDAYS[date.getDay()] || WEEKDAYS[0];
    const holidays = getHolidayEntries(holidaysByDate, key);
    const isSunday = date.getDay() === 0;
    const isRedDate = isSunday || holidays.length > 0;
    const holidayLabel = holidays.map((holiday) => holiday.localName).join(', ');
    return {
      day,
      key,
      label: String(day).padStart(2, '0'),
      weekdayLabel: weekday.long,
      weekdayShort: weekday.short,
      isSunday,
      isRedDate,
      holidays,
      holidayLabel,
      fullLabel: [
        `${weekday.long}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        holidayLabel,
      ].filter(Boolean).join(' - '),
    };
  });
}

function formatDecimal(value) {
  return Number(value || 0).toLocaleString('id-ID', {
    maximumFractionDigits: 1,
  });
}

function buildRevenueTruckRows(masterTrucks = [], revenueRows = []) {
  const trucks = new Map();

  masterTrucks.forEach((truck) => {
    const plateNumber = getTruckPlate(truck);
    if (!trucks.has(plateNumber)) {
      trucks.set(plateNumber, {
        plateNumber,
        totalTrips: 0,
        revenue: 0,
        realtimeTrips: 0,
        historicalTrips: 0,
      });
    }
  });

  revenueRows.forEach((row) => {
    const plateNumber = getTruckPlate(row);
    if (!trucks.has(plateNumber)) {
      trucks.set(plateNumber, {
        plateNumber,
        totalTrips: 0,
        revenue: 0,
        realtimeTrips: 0,
        historicalTrips: 0,
      });
    }

    const truck = trucks.get(plateNumber);
    const source = row.entrySource === 'historical' ? 'historical' : 'realtime';
    truck.totalTrips += 1;
    truck.revenue += Number(row.revenue || 0);
    if (source === 'historical') truck.historicalTrips += 1;
    else truck.realtimeTrips += 1;
  });

  return Array.from(trucks.values()).map((truck) => ({
    ...truck,
    sourceLabel: truck.historicalTrips && truck.realtimeTrips
      ? `Realtime ${truck.realtimeTrips} / Data Lama ${truck.historicalTrips}`
      : truck.historicalTrips
        ? 'Data Lama'
        : truck.totalTrips
          ? 'Realtime'
          : '-',
  })).sort((left, right) => {
    if (right.revenue !== left.revenue) return right.revenue - left.revenue;
    if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
    return left.plateNumber.localeCompare(right.plateNumber);
  });
}

function toDateKey(value) {
  if (!value) return '';

  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;

  const localDateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/);
  if (localDateTime) return `${localDateTime[1]}-${localDateTime[2]}-${localDateTime[3]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function getUtilizationDateKey(row = {}) {
  return toDateKey(row.completedDate || row.completedAt || row.tripDate || row.updatedAt);
}

function uniqueUtilizationTrips(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (row.status === 'cancelled' || row.executionSource === 'vendor') return false;
    const id = row.jobId || row.id;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getTripStartDateTime(row = {}) {
  return row.runningAt || row.running_at || row.startedAt || row.started_at || '';
}

function getTripEndDateTime(row = {}) {
  return row.completedAt || row.completed_at || row.completedDate || row.completed_date || '';
}

function getConfirmedInapDateKeys(row = {}, dayKeys = new Set()) {
  const hasInapHistory = Boolean(row.inapStartedAt || row.inap_started_at || row.inapReason || row.inap_reason);
  if (!hasInapHistory) return [];

  const startValue = row.inapStartedAt || row.inap_started_at || getTripStartDateTime(row);
  const endValue = row.inapEndedAt || row.inap_ended_at || getTripEndDateTime(row) || startValue;
  const startKey = toDateKey(startValue);
  const endKey = toDateKey(endValue);
  if (!startKey) return [];
  if (!endKey || startKey === endKey) return (!dayKeys.size || dayKeys.has(startKey)) ? [startKey] : [];
  if (startKey > endKey) return [];

  const dates = [];
  let current = new Date(`${startKey}T00:00:00`);
  const endBoundary = new Date(`${endKey}T00:00:00`);

  while (current < endBoundary) {
    const key = dateKey(current);
    if (!dayKeys.size || dayKeys.has(key)) dates.push(key);
    current = addDays(current, 1);
  }

  return dates;
}

function createInapNote(row = {}) {
  const destination = compactCellLabel(row);
  return {
    reasonLabel: 'INAP',
    notes: [row.inapReason || row.inap_reason || 'Ritasi ditandai inap oleh Operational', destination].filter(Boolean).join(' - '),
    isOperationalInap: true,
  };
}

function compactCellLabel(row = {}) {
  const destination = String(row.destination || '').trim();
  const origin = String(row.origin || '').trim();
  const status = String(row.status || '').replace(/_/g, ' ').trim();
  const label = destination || origin || status || '';
  return label.toUpperCase();
}

function getUtilizationTruckKey(row = {}, activeTruckLookup = new Map()) {
  const keys = [
    getTruckId(row),
    row.vehicleId,
    row.vehicle_id,
    getTruckPlate(row),
    row.plateNumber,
    row.plate,
    getTruckUnitCode(row),
  ].map(normalizeIdentity).filter(Boolean);

  return keys.map((key) => activeTruckLookup.get(key)).find(Boolean) || '';
}

function filterUtilizationRowsByTrucks(masterTrucks = [], rows = []) {
  const lookup = new Map();
  masterTrucks.forEach((truck) => {
    const id = getTruckId(truck) || getTruckPlate(truck);
    addTruckIdentityKeys(lookup, truck, id);
  });
  return rows.filter((row) => Boolean(getUtilizationTruckKey(row, lookup)));
}

function previousDateKeyValue(value) {
  const key = String(value || '').slice(0, 10);
  if (!key) return '';
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function createPivotCells(days, period = {}) {
  return days.reduce((cells, day) => {
    const inactive = Boolean(
      (period.activeFrom && day.key < period.activeFrom)
      || (period.activeTo && day.key > period.activeTo)
      || (period.inactiveFrom && day.key >= period.inactiveFrom && day.key <= period.inactiveTo),
    );
    return {
      ...cells,
      [day.key]: {
        count: 0,
        labels: [],
        corrections: [],
        autoNote: null,
        inactive,
        transition: period.transitionDate === day.key ? period.transition : null,
      },
    };
  }, {});
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildTruckDayUtilizationSummary(masterTrucks = [], rows = [], month, year, baseDate = new Date(), options = {}) {
  const period = buildUtilizationPeriod(month, year, baseDate);
  const includeUnavailable = options.includeUnavailable === true;
  const activeTrucks = (masterTrucks || [])
    .filter(includeUnavailable ? isFleetTruck : isActiveTruck)
    .map((truck) => ({
      id: getTruckId(truck) || getTruckPlate(truck),
      plateNumber: getTruckPlate(truck),
      unitCode: getTruckUnitCode(truck),
      totalTrips: 0,
      activeTruckDays: 0,
      targetTruckDays: period.days,
      utilizationPercent: 0,
      lastCompletedAt: '',
    }));
  const activeTruckLookup = new Map();
  const rowsByTruck = new Map();

  activeTrucks.forEach((truck) => {
    rowsByTruck.set(truck.id, truck);
    addTruckIdentityKeys(activeTruckLookup, truck, truck.id);
  });

  const truckDayKeys = new Set();

  uniqueUtilizationTrips(rows).forEach((row) => {
    if (String(row.status || '').trim().toLowerCase() === 'cancelled') return;

    const dateKey = getUtilizationDateKey(row);
    if (!period.days || !dateKey || dateKey < period.dateFrom || dateKey > period.dateTo) return;

    const truckKey = getUtilizationTruckKey(row, activeTruckLookup);
    if (!truckKey) return;

    const truck = rowsByTruck.get(truckKey);
    if (!truck) return;

    truck.totalTrips += 1;
    const completedAt = row.completedDate || row.completedAt || row.updatedAt || row.tripDate || '';
    if (completedAt && (!truck.lastCompletedAt || new Date(completedAt) > new Date(truck.lastCompletedAt))) {
      truck.lastCompletedAt = completedAt;
    }
    truckDayKeys.add(`${truckKey}|${dateKey}`);
  });

  truckDayKeys.forEach((key) => {
    const truckKey = key.split('|')[0];
    const truck = rowsByTruck.get(truckKey);
    if (truck) truck.activeTruckDays += 1;
  });

  const utilizationRows = Array.from(rowsByTruck.values())
    .map((truck) => ({
      ...truck,
      utilizationPercent: truck.targetTruckDays ? (truck.totalTrips / truck.targetTruckDays) * 100 : 0,
    }))
    .sort((left, right) => {
      if (right.utilizationPercent !== left.utilizationPercent) return right.utilizationPercent - left.utilizationPercent;
      if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
      if (right.activeTruckDays !== left.activeTruckDays) return right.activeTruckDays - left.activeTruckDays;
      return left.plateNumber.localeCompare(right.plateNumber);
    });

  const activeTruckCount = rowsByTruck.size;
  const potentialTruckDays = activeTruckCount * period.days;
  const realizedTruckDays = truckDayKeys.size;
  const totalTrips = utilizationRows.reduce((total, truck) => total + truck.totalTrips, 0);

  return {
    period,
    rows: utilizationRows,
    totalTrips,
    activeTruckCount,
    realizedTruckDays,
    potentialTruckDays,
    utilizationPercent: potentialTruckDays ? (totalTrips / potentialTruckDays) * 100 : 0,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildMonthlyUtilizationPivot(masterTrucks = [], rows = [], month, year, holidaysByDate = {}) {
  const days = buildMonthDays(month, year, holidaysByDate);
  const dayKeys = new Set(days.map((day) => day.key));
  const trucks = new Map();
  const masterByPlate = new Map(masterTrucks.map((truck) => [normalizeIdentity(getTruckPlate(truck)), truck]));
  const unitKey = (row) => normalizeIdentity(row.vehicleId || row.vehicle_id || row.truckId
    || masterByPlate.get(normalizeIdentity(getTruckPlate(row)))?.id || getTruckPlate(row));
  const periodRows = uniqueUtilizationTrips(rows).filter((row) => dayKeys.has(getUtilizationDateKey(row)));
  const unitsWithTrips = new Set(periodRows.map(unitKey));
  const transitionsByPlate = new Map();

  periodRows.forEach((row) => {
    const correction = row.utilizationChassisCorrection;
    if (!correction) return;

    const plateNumber = getTruckPlate(row);
    const sourceSize = normalizeTruckSize(correction.sourceChassisSize || row.originalChassisSize || row.size || getTruckSize(row));
    const targetSize = normalizeTruckSize(correction.targetChassisSize || row.chassisSize || getTruckSize(row));
    const effectiveFrom = String(correction.effectiveFrom || '').slice(0, 10);
    if (!plateNumber || !sourceSize || !targetSize || !effectiveFrom || transitionsByPlate.has(plateNumber)) return;

    transitionsByPlate.set(plateNumber, {
      id: correction.id || `${plateNumber}-${effectiveFrom}-${sourceSize}-${targetSize}`,
      plateNumber,
      vehicleId: row.vehicleId || row.vehicle_id,
      unitCode: getTruckUnitCode(row),
      sourceSize,
      targetSize,
      effectiveFrom,
      effectiveTo: String(correction.effectiveTo || '').slice(0, 10),
      oldActiveFrom: days[0]?.key || '',
      oldActiveTo: previousDateKeyValue(effectiveFrom),
      newActiveFrom: effectiveFrom,
      newActiveTo: String(correction.effectiveTo || days[days.length - 1]?.key || '').slice(0, 10),
      reason: correction.reason || '',
      note: correction.note || '',
    });
  });

  const transitionByRowKey = (plateNumber, phase) => {
    const transition = transitionsByPlate.get(plateNumber);
    if (!transition) return null;
    return {
      transition,
      key: `${unitKey({ plateNumber, vehicleId: transition.vehicleId })}|${phase === 'after' ? transition.targetSize : transition.sourceSize}`,
    };
  };

  const addTruckRow = (source, options = {}) => {
    const plateNumber = getTruckPlate(source);
    const phase = options.phase || 'normal';
    const size = options.size ?? getTruckSize(source);
    const rowKey = options.key || `${unitKey(source)}|${size || 'unknown'}`;

    if (trucks.has(rowKey)) return trucks.get(rowKey);

    const transition = options.transition || null;
    const row = {
      id: source.vehicleId || source.vehicle_id || masterByPlate.get(normalizeIdentity(plateNumber))?.id || plateNumber,
      rowKey,
      plateNumber,
      unitCode: getTruckUnitCode(source) || getTruckUnitCode(masterByPlate.get(normalizeIdentity(plateNumber)) || {}),
      size,
      driver: getDriverName(source),
      segmentPhase: phase,
      segmentBadge: options.segmentBadge || '',
      isDuplicateUnit: Boolean(options.isDuplicateUnit),
      activeFrom: options.activeFrom || '',
      activeTo: options.activeTo || '',
      transition,
      cells: createPivotCells(days, {
        activeFrom: options.activeFrom || '',
        activeTo: phase === 'before' ? '' : options.activeTo || '',
        inactiveFrom: phase === 'before' ? transition?.newActiveFrom : '',
        inactiveTo: phase === 'before' ? transition?.newActiveTo : '',
        transitionDate: transition?.effectiveFrom || '',
        transition,
      }),
      totalTrips: 0,
    };
    trucks.set(rowKey, row);
    return row;
  };

  const getTruckRowForDate = (row, targetDateKey) => {
    const plateNumber = getTruckPlate(row);
    const transition = transitionsByPlate.get(plateNumber);
    const hasHistoricalSize = Object.prototype.hasOwnProperty.call(row, 'chassisSize');
    const size = hasHistoricalSize ? getTruckSize(row)
      : getTruckSize(row) || getTruckSize(masterByPlate.get(normalizeIdentity(plateNumber)) || {});

    if (transition && ((targetDateKey < transition.newActiveFrom && size === transition.sourceSize)
      || (targetDateKey >= transition.newActiveFrom && targetDateKey <= transition.newActiveTo && size === transition.targetSize))) {
      const phase = targetDateKey >= transition.newActiveFrom ? 'after' : 'before';
      const transitionRow = transitionByRowKey(plateNumber, phase);
      return trucks.get(transitionRow.key) || addTruckRow(row, {
        key: transitionRow.key,
        phase,
        size: phase === 'after' ? transition.targetSize : transition.sourceSize,
        segmentBadge: phase === 'after'
          ? `Mulai ${formatPivotDateLabel(transition.newActiveFrom)}`
          : `s.d. ${formatPivotDateLabel(transition.oldActiveTo)}`,
        isDuplicateUnit: true,
        activeFrom: phase === 'after' ? transition.newActiveFrom : '',
        activeTo: phase === 'after' ? transition.newActiveTo : transition.oldActiveTo,
        transition,
      });
    }

    const truck = addTruckRow(row, { size });
    if (truck.transition && targetDateKey > truck.transition.newActiveTo) truck.segmentBadge = `Chassis ${size || '-'}`;
    return truck;
  };

  masterTrucks.forEach((truck) => {
    const plateNumber = getTruckPlate(truck);
    const transition = transitionsByPlate.get(plateNumber);
    if (transition) {
      addTruckRow(truck, {
        key: transitionByRowKey(plateNumber, 'before').key,
        phase: 'before',
        size: transition.sourceSize || getTruckSize(truck),
        segmentBadge: `s.d. ${formatPivotDateLabel(transition.oldActiveTo)}`,
        isDuplicateUnit: true,
        activeTo: transition.oldActiveTo,
        transition,
      });
      addTruckRow(truck, {
        key: transitionByRowKey(plateNumber, 'after').key,
        phase: 'after',
        size: transition.targetSize || getTruckSize(truck),
        segmentBadge: `Mulai ${formatPivotDateLabel(transition.newActiveFrom)}`,
        isDuplicateUnit: true,
        activeFrom: transition.newActiveFrom,
        activeTo: transition.newActiveTo,
        transition,
      });
      return;
    }

    if (!unitsWithTrips.has(unitKey(truck))) addTruckRow(truck);
  });

  periodRows.forEach((row) => {
    const dateKey = getUtilizationDateKey(row);
    if (!dayKeys.has(dateKey)) return;

    const plateNumber = getTruckPlate(row);
    const transition = transitionsByPlate.get(plateNumber);
    const truck = getTruckRowForDate(row, dateKey);

    if (!truck.unitCode) truck.unitCode = getTruckUnitCode(row);
    const cell = truck.cells[dateKey];
    if (cell?.inactive) cell.inactive = false;
    cell.count += 1;
    const label = compactCellLabel(row);
    if (label && !cell.labels.includes(label)) cell.labels.push(label);
    if (row.utilizationChassisCorrection) {
      cell.correctedCount = Number(cell.correctedCount || 0) + 1;
      cell.corrections.push({
        jobId: row.id || '',
        sourcePlateNumber: row.utilizationChassisCorrection.sourcePlateNumber || row.originalPlateNumber || '',
        targetPlateNumber: row.utilizationChassisCorrection.targetPlateNumber || row.plateNumber || '',
        effectiveFrom: row.utilizationChassisCorrection.effectiveFrom || '',
        effectiveTo: row.utilizationChassisCorrection.effectiveTo || '',
        reason: row.utilizationChassisCorrection.reason || '',
        sourceChassisSize: row.utilizationChassisCorrection.sourceChassisSize || row.originalChassisSize || '',
        targetChassisSize: row.utilizationChassisCorrection.targetChassisSize || row.chassisSize || '',
        oldActiveTo: transition?.oldActiveTo || '',
        newActiveFrom: transition?.newActiveFrom || '',
        note: row.utilizationChassisCorrection.note || '',
      });
    }
    if (row.driver) truck.driver = getDriverName(row);
    truck.totalTrips += 1;

    getConfirmedInapDateKeys(row, dayKeys).forEach((autoDateKey) => {
      const autoTruck = getTruckRowForDate(row, autoDateKey);
      if (!autoTruck.unitCode) autoTruck.unitCode = getTruckUnitCode(row);
      if (row.driver) autoTruck.driver = getDriverName(row);

      const autoCell = autoTruck.cells[autoDateKey];
      if (!autoCell) return;
      autoCell.inactive = false;
      autoCell.autoNote = autoCell.autoNote || createInapNote(row);
    });
  });

  const rowsByTruck = Array.from(trucks.values()).sort((left, right) => {
    const sizeDiff = truckSizeSortKey(left.size) - truckSizeSortKey(right.size);
    if (sizeDiff !== 0) return sizeDiff;
    if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
    return left.plateNumber.localeCompare(right.plateNumber);
  });

  const configurations = new Map();
  rowsByTruck.forEach((row) => configurations.set(row.id, (configurations.get(row.id) || 0) + 1));
  rowsByTruck.forEach((row) => {
    row.isDuplicateUnit = configurations.get(row.id) > 1;
    if (row.isDuplicateUnit && !row.segmentBadge) row.segmentBadge = `Chassis ${row.size || '-'}`;
  });

  return {
    days,
    rows: rowsByTruck,
    transitions: Array.from(transitionsByPlate.values()),
    totalsByDay: days.reduce((totals, day) => ({
      ...totals,
      [day.key]: rowsByTruck.reduce((total, truck) => total + truck.cells[day.key].count, 0),
    }), {}),
    grandTotal: rowsByTruck.reduce((total, truck) => total + truck.totalTrips, 0),
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildMonthlyCustomerTruckPivot(rows = [], month, year, holidaysByDate = {}, masterTrucks = []) {
  const days = buildMonthDays(month, year, holidaysByDate);
  const dayKeys = new Set(days.map((day) => day.key));
  const customers = new Map();

  uniqueUtilizationTrips(rows).forEach((row) => {
    if (String(row.status || '').trim().toLowerCase() === 'cancelled') return;

    const dateKey = getUtilizationDateKey(row);
    if (!dayKeys.has(dateKey)) return;

    const customerName = getCustomerName(row);
    const customerKey = normalizeIdentity(row.customerId || row.customer_id || customerName) || customerName;
    const plateNumber = getTruckPlate(row);
    const identity = normalizeIdentity(row.vehicleId || row.vehicle_id || row.truckId || plateNumber);
    const truckKey = `${identity}|${getTruckSize(row) || 'unknown'}`;

    if (!customers.has(customerKey)) {
      customers.set(customerKey, {
        key: customerKey,
        customerName,
        rowsByTruck: new Map(),
        totalsByDay: days.reduce((totals, day) => ({ ...totals, [day.key]: 0 }), {}),
        grandTotal: 0,
      });
    }

    const customer = customers.get(customerKey);
    if (!customer.rowsByTruck.has(truckKey)) {
      customer.rowsByTruck.set(truckKey, {
        id: row.vehicleId || row.vehicle_id || row.truckId || plateNumber,
        rowKey: `${customerKey}|${truckKey}`,
        plateNumber,
        unitCode: getTruckUnitCode(row),
        size: getTruckSize(row),
        driver: getDriverName(row),
        cells: createPivotCells(days),
        totalTrips: 0,
      });
    }

    const truck = customer.rowsByTruck.get(truckKey);
    if (!truck.unitCode) truck.unitCode = getTruckUnitCode(row);
    if (!truck.size) truck.size = getTruckSize(row);
    if (row.driver) truck.driver = getDriverName(row);

    const cell = truck.cells[dateKey];
    cell.count += 1;
    const label = compactCellLabel(row);
    if (label && !cell.labels.includes(label)) cell.labels.push(label);

    truck.totalTrips += 1;
    customer.totalsByDay[dateKey] += 1;
    customer.grandTotal += 1;
  });

  customers.forEach((customer) => {
    const existingPlates = new Set(
      Array.from(customer.rowsByTruck.values()).map((truck) => normalizeIdentity(truck.plateNumber)),
    );

    masterTrucks.forEach((truck) => {
      const plateNumber = getTruckPlate(truck);
      const normalizedPlate = normalizeIdentity(plateNumber);
      if (!plateNumber || existingPlates.has(normalizedPlate)) return;

      const truckKey = normalizeIdentity(getTruckId(truck) || plateNumber) || plateNumber;
      customer.rowsByTruck.set(`master|${truckKey}`, {
        id: getTruckId(truck) || plateNumber,
        rowKey: `${customer.key}|master|${truckKey}`,
        plateNumber,
        unitCode: getTruckUnitCode(truck),
        size: getTruckSize(truck),
        driver: getDriverName(truck),
        cells: createPivotCells(days),
        totalTrips: 0,
      });
      existingPlates.add(normalizedPlate);
    });
  });

  const customerRows = Array.from(customers.values()).map((customer) => ({
    key: customer.key,
    customerName: customer.customerName,
    rows: Array.from(customer.rowsByTruck.values()).sort((left, right) => {
      const sizeDiff = truckSizeSortKey(left.size) - truckSizeSortKey(right.size);
      if (sizeDiff !== 0) return sizeDiff;
      if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
      return left.plateNumber.localeCompare(right.plateNumber);
    }),
    totalsByDay: customer.totalsByDay,
    grandTotal: customer.grandTotal,
    unitCount: new Set(Array.from(customer.rowsByTruck.values()).map((truck) => truck.id)).size,
  })).sort((left, right) => {
    if (right.grandTotal !== left.grandTotal) return right.grandTotal - left.grandTotal;
    return left.customerName.localeCompare(right.customerName);
  });

  return {
    days,
    customers: customerRows,
    grandTotal: customerRows.reduce((total, customer) => total + customer.grandTotal, 0),
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildMonthlyDriverUtilizationPivot(masterDrivers = [], rows = [], month, year, holidaysByDate = {}) {
  const days = buildMonthDays(month, year, holidaysByDate);
  const dayKeys = new Set(days.map((day) => day.key));
  const drivers = new Map();

  masterDrivers.forEach((driver) => {
    const name = getDriverName(driver);
    const key = driverIdentityKey(driver.id, name);
    if (!drivers.has(key)) {
      drivers.set(key, {
        driverId: driver.id || null,
        driver: name,
        fromMaster: true,
        cells: days.reduce((cells, day) => ({ ...cells, [day.key]: { count: 0, labels: [] } }), {}),
        totalTrips: 0,
      });
    }
  });

  rows.forEach((row) => {
    if (String(row.status || '').trim().toLowerCase() === 'cancelled') return;

    const dateKey = getUtilizationDateKey(row);
    if (!dayKeys.has(dateKey)) return;

    const name = getDriverName(row);
    const key = driverIdentityKey(row.driverId, name);
    if (!drivers.has(key)) {
      drivers.set(key, {
        driverId: row.driverId || null,
        driver: name,
        fromMaster: false,
        latestDateKey: dateKey,
        cells: days.reduce((cells, day) => ({ ...cells, [day.key]: { count: 0, labels: [] } }), {}),
        totalTrips: 0,
      });
    }

    const driver = drivers.get(key);
    // Sopir yang tidak ada di daftar master (mis. sudah diarsipkan) memakai nama snapshot terbaru.
    if (!driver.fromMaster && dateKey >= (driver.latestDateKey || '')) {
      driver.driver = name;
      driver.latestDateKey = dateKey;
    }
    const cell = driver.cells[dateKey];
    cell.count += 1;
    const label = compactCellLabel(row);
    if (label && !cell.labels.includes(label)) cell.labels.push(label);
    driver.totalTrips += 1;
  });

  // Sopir master tanpa ritasi pada bulan ini tidak ditampilkan; totalnya 0 jadi total tidak berubah.
  const rowsByDriver = Array.from(drivers.values())
    .filter((driver) => driver.totalTrips > 0)
    .sort((left, right) => {
      if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
      return left.driver.localeCompare(right.driver);
    });

  return {
    days,
    rows: rowsByDriver,
    totalsByDay: days.reduce((totals, day) => ({
      ...totals,
      [day.key]: rowsByDriver.reduce((total, driver) => total + driver.cells[day.key].count, 0),
    }), {}),
    grandTotal: rowsByDriver.reduce((total, driver) => total + driver.totalTrips, 0),
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildDriverPerformanceRows(masterDrivers = [], performanceRows = []) {
  const drivers = new Map();

  masterDrivers.forEach((driver) => {
    const name = getDriverName(driver);
    const key = driverIdentityKey(driver.id, name);
    if (!drivers.has(key)) {
      drivers.set(key, {
        driverId: driver.id || null,
        driver: name,
        totalTrips: 0,
        totalRevenue: 0,
        totalDriverCommission: 0,
        paidDriverCommission: 0,
        unpaidDriverCommission: 0,
        averageRevenuePerTrip: 0,
        averageCommissionPerTrip: 0,
      });
    }
  });

  performanceRows.forEach((row) => {
    const name = getDriverName(row);
    const key = driverIdentityKey(row.driverId, name);
    if (!drivers.has(key)) {
      drivers.set(key, {
        driverId: row.driverId || null,
        driver: name,
        totalTrips: 0,
        totalRevenue: 0,
        totalDriverCommission: 0,
        paidDriverCommission: 0,
        unpaidDriverCommission: 0,
        averageRevenuePerTrip: 0,
        averageCommissionPerTrip: 0,
      });
    }

    const driver = drivers.get(key);
    driver.totalTrips = Number(row.monthlyTrips ?? row.totalTrips ?? 0);
    driver.totalRevenue = Number(row.totalRevenue || 0);
    driver.totalDriverCommission = Number(row.totalDriverCommission || 0);
    driver.paidDriverCommission = Number(row.paidDriverCommission || 0);
    driver.unpaidDriverCommission = Number(row.unpaidDriverCommission || 0);
    driver.averageRevenuePerTrip = Number(row.averageRevenuePerTrip || (driver.totalTrips ? driver.totalRevenue / driver.totalTrips : 0));
    driver.averageCommissionPerTrip = Number(row.averageCommissionPerTrip || (driver.totalTrips ? driver.totalDriverCommission / driver.totalTrips : 0));
  });

  // Hanya sopir yang punya trip pada periode terpilih yang ditampilkan.
  return Array.from(drivers.values())
    .filter((driver) => driver.totalTrips > 0)
    .sort((left, right) => {
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
      return left.driver.localeCompare(right.driver);
    });
}

function repoStoredDate(row = {}) {
  return row.repoStoredAt || row.updatedAt || row.tripDate || '';
}

function repoAgeDays(value, baseDate = new Date()) {
  const storedAt = new Date(value);
  if (!value || Number.isNaN(storedAt.getTime())) return 0;
  const start = new Date(storedAt.getFullYear(), storedAt.getMonth(), storedAt.getDate());
  const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  return Math.max(0, Math.floor((base - start) / 86400000));
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildRepoMonitoringRows(rows = [], baseDate = new Date()) {
  return rows
    .filter((row) => row?.status === 'repo_stored')
    .map((row) => ({
      ...row,
      storedDate: repoStoredDate(row),
      ageDays: repoAgeDays(repoStoredDate(row), baseDate),
    }))
    .sort((left, right) => {
      if (right.ageDays !== left.ageDays) return right.ageDays - left.ageDays;
      return String(left.containerNumber || '').localeCompare(String(right.containerNumber || ''));
    });
}

function SummaryToggleCard({
  icon: Icon,
  label,
  value,
  helper,
  secondaryLabel,
  secondaryValue,
  tertiaryLabel,
  tertiaryValue,
  expanded,
  onClick,
  onOpenStatistics,
  tone = 'slate',
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-600',
    emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50/80 text-amber-700',
    sky: 'border-sky-200 bg-sky-50/80 text-sky-700',
    rose: 'border-rose-200 bg-rose-50/80 text-rose-700',
  }[tone] || 'border-slate-200 bg-slate-50 text-slate-600';
  const activeClass = {
    slate: 'border-slate-400 bg-white text-slate-800 ring-1 ring-slate-200',
    emerald: 'border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200',
    amber: 'border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-200',
    sky: 'border-sky-400 bg-sky-50 text-sky-900 ring-1 ring-sky-200',
    rose: 'border-rose-400 bg-rose-50 text-rose-900 ring-1 ring-rose-200',
  }[tone] || 'border-slate-300 bg-slate-100 text-slate-800';
  return (
    <article
      className={`flex min-h-[14rem] w-full flex-col justify-between gap-3 rounded-md border p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md ${
        expanded ? activeClass : `${toneClass} hover:border-slate-300 hover:shadow-md`
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={expanded}
        className="flex w-full flex-1 cursor-pointer appearance-none items-start justify-between gap-4 border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-normal text-slate-500">{label}</span>
          <strong className="mt-1 block text-2xl font-semibold leading-tight text-slate-900">{value}</strong>
          <small className="mt-1 block text-xs text-slate-500">{helper}</small>
          {secondaryLabel ? (
            <span className="mt-3 flex flex-col gap-0.5 border-t border-white/70 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{secondaryLabel}</span>
              <strong className="text-base font-semibold leading-snug text-slate-900">{secondaryValue}</strong>
            </span>
          ) : null}
          {tertiaryLabel ? (
            <span className="mt-2 flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{tertiaryLabel}</span>
              <strong className="text-base font-semibold leading-snug text-slate-900">{tertiaryValue}</strong>
            </span>
          ) : null}
        </span>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${toneClass}`}>
          <Icon size={17} />
        </span>
      </button>
      {onOpenStatistics ? (
        <button
          type="button"
          className="inline-flex h-8 w-fit appearance-none items-center justify-center gap-1.5 self-end rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          onClick={onOpenStatistics}
        >
          <BarChart3 size={13} />
          Lihat Statistik
        </button>
      ) : null}
    </article>
  );
}

function MonthlyComparisonModal({ open, onClose, rows, selectedReport, year, loading, error }) {
  if (!open) return null;

  const config = MONTHLY_COMPARISON_CONFIG[selectedReport];
  if (!config) return null;

  const modal = (
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-hidden bg-slate-950/45 px-3 py-6" role="presentation" onMouseDown={onClose}>
      <section
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monthly-comparison-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Statistik Bulanan</span>
            <h2 id="monthly-comparison-modal-title" className="mt-0.5 text-base font-black text-slate-950">{config.title}</h2>
          </div>
          <button
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100"
            type="button"
            onClick={onClose}
            aria-label="Tutup statistik bulanan"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <MonthlyComparisonChart
            error={error}
            loading={loading}
            rows={rows}
            selectedReport={selectedReport}
            year={year}
          />
        </div>
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <button className="secondary-button" type="button" onClick={onClose}>Tutup</button>
        </div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

function DetailTable({ columns, rows, rowRenderer }) {
  return (
    <div className="report-detail-table-wrap overflow-x-auto">
      <table className="report-detail-table responsive-data-table min-w-full text-left text-xs">
        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.label} className={`px-3 py-2 font-bold ${column.align === 'right' ? 'text-right' : ''}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => rowRenderer(row, index))}
        </tbody>
      </table>
    </div>
  );
}

function OutstandingBucketCell({ amount, label, agingBucket, toneClassName, customer, onOpenDetail }) {
  if (!(amount > 0)) {
    return <td className={`px-3 py-2 text-right font-semibold ${toneClassName}`} data-label={label}>-</td>;
  }
  return (
    <td className={`px-3 py-2 text-right font-semibold ${toneClassName}`} data-label={label}>
      <span className="inline-flex items-center justify-end gap-1.5">
        {formatCurrency(amount)}
        <button
          type="button"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-current opacity-60 hover:opacity-100"
          onClick={() => onOpenDetail(customer, label, agingBucket)}
          title={`Lihat rincian SO ${customer} - ${label}`}
          aria-label={`Detail outstanding ${label} ${customer}`}
        >
          <Eye size={9} />
        </button>
      </span>
    </td>
  );
}

function OutstandingBucketDetailModal({ detail, rows, loading, error, onClose }) {
  if (!detail) return null;

  const totalAmount = rows.reduce((total, row) => total + Number(row.outstandingAmount || 0), 0);

  const modal = (
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-hidden bg-slate-950/45 px-3 py-6" role="presentation" onMouseDown={onClose}>
      <section
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="outstanding-bucket-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Rincian SO Outstanding &middot; {detail.bucketLabel}</span>
            <h2 id="outstanding-bucket-detail-title" className="mt-0.5 truncate text-sm font-black text-slate-950">{detail.customer}</h2>
          </div>
          <button className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Tutup rincian outstanding">
            <X size={16} />
          </button>
        </header>

        <div className="border-b border-slate-100 bg-white px-4 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Total {detail.bucketLabel}</span>
          <strong className="ml-2 text-base font-black text-slate-950">{formatCurrency(totalAmount)}</strong>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? <p className="text-sm font-semibold text-slate-500">Memuat rincian SO...</p> : null}
          {!loading && error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
          {!loading && !error && !rows.length ? (
            <p className="text-sm font-semibold text-slate-500">Tidak ada SO outstanding pada klasifikasi ini.</p>
          ) : null}
          {!loading && !error && rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">No. SO</th>
                    <th className="px-3 py-2">No. Invoice</th>
                    <th className="px-3 py-2 text-right">Tagihan</th>
                    <th className="px-3 py-2 text-right">Dibayar</th>
                    <th className="px-3 py-2 text-right">Outstanding</th>
                    <th className="px-3 py-2">Jatuh Tempo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="text-slate-700 hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-black text-slate-950">{row.soNumber}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{row.invoiceNumber || '-'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatCurrency(row.billingAmount)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatCurrency(row.totalPaid)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-700">{formatCurrency(row.outstandingAmount)}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{row.dueDate ? formatDate(row.dueDate) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <button className="secondary-button" type="button" onClick={onClose}>Tutup</button>
        </div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

function normalizeReportTab(tab, { revenueOnly = false } = {}) {
  if (revenueOnly) return 'revenue';
  if (tab === 'utilization' || tab === 'driver' || tab === 'revenue' || tab === 'sales' || tab === 'customer' || tab === 'repo' || tab === 'master') return tab;
  return 'revenue';
}

function getReportHeader(selectedReport) {
  if (selectedReport === 'utilization') {
    return {
      title: 'Utilisasi Bulanan',
      description: 'Rekap harian per unit truck dalam format pivot bulanan.',
    };
  }

  if (selectedReport === 'driver') {
    return {
      title: 'Driver Performance',
      description: 'Ringkasan performa sopir pada periode yang dipilih.',
    };
  }

  if (selectedReport === 'sales') {
    return {
      title: 'Sales Performance',
      description: 'Ringkasan customer, volume, dan revenue per sales pada periode yang dipilih.',
    };
  }

  if (selectedReport === 'customer') {
    return {
      title: 'Customer Performance',
      description: 'Ringkasan volume, revenue, outstanding, dan kesehatan pembayaran per customer.',
    };
  }

  if (selectedReport === 'repo') {
    return {
      title: 'Container Titip',
      description: 'Monitoring container yang sedang dititipkan di depo penitipan.',
    };
  }

  if (selectedReport === 'master') {
    return {
      title: 'Master Data Report',
      description: 'Ringkasan read-only data customer, armada, sopir, chassis, depo, terminal, dan lokasi tujuan.',
    };
  }

  return {
    title: 'Revenue Report',
    description: 'Ringkasan revenue dan detail revenue per truck pada periode yang dipilih.',
  };
}

function getMasterStatus(row = {}) {
  return String(row.status || row.contract || row.operationalStatus || row.operational_status || '').trim();
}

function isActiveMasterRow(row = {}) {
  const status = getMasterStatus(row).toLowerCase();
  return !['tidak aktif', 'nonaktif', 'inactive', 'blacklist', 'archived', 'arsip'].includes(status);
}

function getDriverDisplayName(row = {}) {
  return String(row.nickname || row.name || '-').trim() || '-';
}

function formatMasterValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

const MONTHLY_COMPARISON_CONFIG = {
  revenue: {
    title: 'Perbandingan Revenue Bulanan',
    description: 'Total revenue invoice per bulan.',
    metricKey: 'totalRevenue',
    valueType: 'currency',
    toneClassName: 'bg-emerald-500',
  },
  utilization: {
    title: 'Perbandingan Utilisasi Bulanan',
    description: 'Persentase pemakaian truck per bulan.',
    metricKey: 'utilizationPercent',
    valueType: 'percent',
    toneClassName: 'bg-sky-500',
  },
  customer: {
    title: 'Perbandingan Customer Bulanan',
    description: 'Total revenue customer per bulan.',
    metricKey: 'totalRevenue',
    valueType: 'currency',
    toneClassName: 'bg-rose-500',
  },
  sales: {
    title: 'Perbandingan Sales Bulanan',
    description: 'Total revenue sales per bulan.',
    metricKey: 'totalRevenue',
    valueType: 'currency',
    toneClassName: 'bg-slate-700',
  },
  repo: {
    title: 'Perbandingan Container Titip Bulanan',
    description: 'Jumlah container yang masuk titip per bulan.',
    metricKey: 'repoStoredCount',
    valueType: 'count',
    toneClassName: 'bg-blue-500',
  },
};

function formatMonthlyComparisonValue(value, type) {
  const number = Number(value || 0);
  if (type === 'currency') return formatCurrency(number);
  if (type === 'percent') return `${number.toFixed(1)}%`;
  return `${number.toLocaleString('id-ID')} container`;
}

function formatMonthlyCount(value, suffix) {
  return `${formatDecimal(value)} ${suffix}`;
}

function hasMonthlyComparisonActivity(row = {}) {
  return Number(row.totalRevenue || 0) > 0
    || Number(row.totalTrips || 0) > 0
    || Number(row.totalVolume || 0) > 0
    || Number(row.totalCustomers || 0) > 0
    || Number(row.activeSales || 0) > 0
    || Number(row.repoStoredCount || 0) > 0;
}

function getMonthlyComparisonDetailLines(row = {}, selectedReport) {
  if (selectedReport === 'utilization') {
    return [
      formatMonthlyCount(row.totalTrips, 'trip'),
      `${formatMonthlyCount(row.activeTruckCount, 'truck')} x ${formatMonthlyCount(row.utilizationDays, 'hari')}`,
      `${formatMonthlyCount(row.totalTrips, 'trip')} / ${formatMonthlyCount(row.potentialTruckDays, 'truck-day')}`,
    ];
  }

  if (selectedReport === 'customer') {
    return [
      formatMonthlyCount(row.totalTrips, 'trip'),
      formatMonthlyCount(row.totalCustomers, 'customer'),
      row.totalTrips ? `${formatCurrency(Number(row.totalRevenue || 0) / Number(row.totalTrips || 1))} / trip` : 'Rp 0 / trip',
    ];
  }

  if (selectedReport === 'sales') {
    return [
      formatMonthlyCount(row.totalVolume, 'volume'),
      formatMonthlyCount(row.activeSales, 'sales aktif'),
      row.activeSales ? `${formatCurrency(Number(row.totalRevenue || 0) / Number(row.activeSales || 1))} / sales` : 'Rp 0 / sales',
    ];
  }

  if (selectedReport === 'repo') {
    return [
      formatMonthlyCount(row.repoStoredCount, 'container'),
      formatMonthlyCount(row.totalTrips, 'trip selesai'),
    ];
  }

  return [
    formatMonthlyCount(row.totalTrips, 'trip'),
    formatMonthlyCount(row.totalVolume, 'volume'),
    row.totalTrips ? `${formatCurrency(Number(row.totalRevenue || 0) / Number(row.totalTrips || 1))} / trip` : 'Rp 0 / trip',
  ];
}

function buildMonthlyComparisonSummary(rows = [], selectedReport, config = {}) {
  const activeRows = rows.filter(hasMonthlyComparisonActivity);
  const totalRevenue = rows.reduce((total, row) => total + Number(row.totalRevenue || 0), 0);
  const totalTrips = rows.reduce((total, row) => total + Number(row.totalTrips || 0), 0);
  const totalVolume = rows.reduce((total, row) => total + Number(row.totalVolume || 0), 0);
  const maxActiveTruckCount = rows.length ? Math.max(...rows.map((row) => Number(row.activeTruckCount || 0)), 0) : 0;
  const averageValue = activeRows.length
    ? activeRows.reduce((total, row) => total + Number(row?.[config.metricKey] || 0), 0) / activeRows.length
    : 0;
  const peakRow = rows.reduce((peak, row) => (Number(row?.[config.metricKey] || 0) > Number(peak?.[config.metricKey] || 0) ? row : peak), null);

  if (selectedReport === 'utilization') {
    return [
      { label: 'Total Trip', value: formatMonthlyCount(totalTrips, 'trip') },
      { label: 'Rata-rata Utilisasi', value: `${averageValue.toFixed(1)}%` },
      { label: 'Truck Aktif', value: formatMonthlyCount(maxActiveTruckCount, 'unit') },
      { label: 'Tertinggi', value: peakRow && Number(peakRow.utilizationPercent || 0) > 0 ? `${peakRow.label} - ${peakRow.utilizationPercent.toFixed(1)}%` : '-' },
    ];
  }

  if (selectedReport === 'customer') {
    return [
      { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
      { label: 'Total Trip', value: formatMonthlyCount(totalTrips, 'trip') },
      { label: 'Customer Terbanyak', value: formatDecimal(rows.length ? Math.max(...rows.map((row) => Number(row.totalCustomers || 0)), 0) : 0) },
      { label: 'Tertinggi', value: peakRow && Number(peakRow.totalRevenue || 0) > 0 ? `${peakRow.label} - ${formatCurrency(peakRow.totalRevenue)}` : '-' },
    ];
  }

  if (selectedReport === 'sales') {
    return [
      { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
      { label: 'Total Volume', value: formatMonthlyCount(totalVolume, 'volume') },
      { label: 'Sales Aktif Terbanyak', value: formatDecimal(rows.length ? Math.max(...rows.map((row) => Number(row.activeSales || 0)), 0) : 0) },
      { label: 'Tertinggi', value: peakRow && Number(peakRow.totalRevenue || 0) > 0 ? `${peakRow.label} - ${formatCurrency(peakRow.totalRevenue)}` : '-' },
    ];
  }

  if (selectedReport === 'repo') {
    const totalRepoStored = rows.reduce((total, row) => total + Number(row.repoStoredCount || 0), 0);
    return [
      { label: 'Total Titip', value: formatMonthlyCount(totalRepoStored, 'container') },
      { label: 'Bulan Aktif', value: formatMonthlyCount(activeRows.length, 'bulan') },
      { label: 'Rata-rata', value: activeRows.length ? formatMonthlyCount(totalRepoStored / activeRows.length, 'container') : '0 container' },
      { label: 'Tertinggi', value: peakRow && Number(peakRow.repoStoredCount || 0) > 0 ? `${peakRow.label} - ${formatMonthlyCount(peakRow.repoStoredCount, 'container')}` : '-' },
    ];
  }

  return [
    { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
    { label: 'Total Trip', value: formatMonthlyCount(totalTrips, 'trip') },
    { label: 'Rata-rata / Trip', value: totalTrips ? formatCurrency(totalRevenue / totalTrips) : 'Rp 0' },
    { label: 'Tertinggi', value: peakRow && Number(peakRow.totalRevenue || 0) > 0 ? `${peakRow.label} - ${formatCurrency(peakRow.totalRevenue)}` : '-' },
  ];
}

function MonthlyComparisonChart({ rows = [], selectedReport, year, loading = false, error = '' }) {
  const config = MONTHLY_COMPARISON_CONFIG[selectedReport];
  if (!config) return null;

  const chartRows = rows.map((row) => ({
    ...row,
    value: Number(row?.[config.metricKey] || 0),
  }));
  const maxValue = Math.max(...chartRows.map((row) => row.value), 0);
  const peakRow = chartRows.reduce((peak, row) => (row.value > Number(peak?.value || 0) ? row : peak), null);
  const summaryItems = buildMonthlyComparisonSummary(chartRows, selectedReport, config);

  return (
    <section className="mb-4 rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-950">{config.title}</h2>
          <p className="text-xs text-slate-500">{config.description} Tahun {year}.</p>
        </div>
        {peakRow && maxValue > 0 ? (
          <div className="rounded-md bg-slate-50 px-2.5 py-1 text-right">
            <span className="block text-[10px] font-black uppercase text-slate-400">Tertinggi</span>
            <strong className="block text-xs font-black text-slate-900">{peakRow.label} - {formatMonthlyComparisonValue(peakRow.value, config.valueType)}</strong>
          </div>
        ) : null}
      </div>
      {loading ? (
        <div className="px-3 py-8 text-sm font-semibold text-slate-500">Memuat grafik perbandingan bulanan...</div>
      ) : error ? (
        <div className="px-3 py-4 text-sm font-semibold text-red-600">{error}</div>
      ) : (
        <div className="px-3 py-4">
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            {summaryItems.map((item) => (
              <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="block text-[10px] font-black uppercase text-slate-400">{item.label}</span>
                <strong className="mt-0.5 block truncate text-sm font-black text-slate-950" title={item.value}>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-12 items-end gap-2">
            {chartRows.map((row) => {
              const height = maxValue ? Math.max(6, (row.value / maxValue) * 100) : 0;
              const detailLines = getMonthlyComparisonDetailLines(row, selectedReport);
              return (
                <div className="grid gap-2" key={row.monthKey || row.label}>
                  <div className="flex h-40 items-end rounded-md bg-slate-50 px-1.5 py-1.5">
                    <div
                      aria-label={`${row.label} ${formatMonthlyComparisonValue(row.value, config.valueType)}`}
                      className={`w-full rounded-t ${config.toneClassName} transition-all`}
                      style={{ height: `${height}%` }}
                      title={`${row.label}: ${formatMonthlyComparisonValue(row.value, config.valueType)}`}
                    />
                  </div>
                  <div className="text-center">
                    <strong className="block text-[11px] font-black text-slate-700">{row.label}</strong>
                    <span className="block truncate text-[10px] font-black text-slate-700" title={formatMonthlyComparisonValue(row.value, config.valueType)}>
                      {formatMonthlyComparisonValue(row.value, config.valueType)}
                    </span>
                    {detailLines.slice(0, 2).map((line) => (
                      <span key={line} className="block truncate text-[9px] font-semibold text-slate-500" title={line}>{line}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}
    </section>
  );
}

function buildMasterReportSections(masters = {}) {
  return [
    {
      key: 'customers',
      title: 'Customer',
      rows: masters.customers || [],
      columns: [
        { label: 'Customer', value: (row) => row.name },
        { label: 'PIC', value: (row) => row.pic },
        { label: 'Sales', value: (row) => row.salesName },
        { label: 'Kontrak', value: (row) => row.contract },
        { label: 'Telepon', value: (row) => row.phone },
      ],
    },
    {
      key: 'end-users',
      title: 'Lokasi',
      rows: masters['end-users'] || [],
      columns: [
        { label: 'Nama Lokasi', value: (row) => row.name },
        { label: 'Alamat', value: (row) => row.address },
        { label: 'Status', value: (row) => row.status },
      ],
    },
    {
      key: 'trucks',
      title: 'Truck',
      rows: masters.trucks || [],
      columns: [
        { label: 'No Lambung', value: (row) => formatTruckUnitCode(row.unitCode) },
        { label: 'Plat', value: (row) => row.plateNumber },
        { label: 'Ukuran', value: (row) => row.capacity },
        { label: 'Sopir Default', value: (row) => row.defaultDriver },
        { label: 'Status', value: (row) => row.status },
      ],
    },
    {
      key: 'drivers',
      title: 'Sopir',
      rows: masters.drivers || [],
      columns: [
        { label: 'Nama Panggilan', value: (row) => getDriverDisplayName(row) },
        { label: 'Nama Lengkap', value: (row) => row.name },
        { label: 'SIM', value: (row) => row.licenseType },
        { label: 'Masa SIM', value: (row) => formatDate(row.licenseExpiry) },
        { label: 'Status', value: (row) => row.status },
      ],
    },
    {
      key: 'kir-chassis',
      title: 'Chassis',
      rows: masters['kir-chassis'] || [],
      columns: [
        { label: 'Kode Chassis', value: (row) => row.chassisCode },
        { label: 'Plat', value: (row) => row.plateNumber },
        { label: 'Ukuran', value: (row) => row.capacity },
        { label: 'No KIR', value: (row) => row.kirNumber },
        { label: 'Status', value: (row) => row.status },
      ],
    },
    {
      key: 'depots',
      title: 'Depo',
      rows: masters.depots || [],
      columns: [
        { label: 'Depo', value: (row) => row.name },
        { label: 'Perusahaan', value: (row) => row.companyName },
        { label: 'Kode', value: (row) => row.code },
        { label: 'Tipe', value: (row) => row.depotType },
        { label: 'Status', value: (row) => row.status },
      ],
    },
    {
      key: 'terminals',
      title: 'Terminal',
      rows: masters.terminals || [],
      columns: [
        { label: 'Terminal', value: (row) => row.name },
        { label: 'Kode', value: (row) => row.code },
        { label: 'Area', value: (row) => row.portArea },
        { label: 'Status', value: (row) => row.status },
      ],
    },
    {
      key: 'destinations',
      title: 'Lokasi Tujuan',
      rows: masters.destinations || [],
      columns: [
        { label: 'Lokasi', value: (row) => row.name },
        { label: 'Area', value: (row) => row.area },
        { label: 'UJ 20FT', value: (row) => row.uj20ft == null ? '-' : formatCurrency(row.uj20ft) },
        { label: 'UJ 40FT', value: (row) => row.uj40ft == null ? '-' : formatCurrency(row.uj40ft) },
        { label: 'Komisi Sopir', value: (row) => Number(row.driverCommissionAmount || 0) > 0 ? formatCurrency(row.driverCommissionAmount) : '-' },
        { label: 'Status', value: (row) => row.status },
      ],
    },
  ];
}

function MasterReportSection({ section }) {
  const activeCount = section.rows.filter(isActiveMasterRow).length;

  return (
    <article className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{section.title}</h3>
          <p className="text-xs text-slate-500">{activeCount} aktif dari {section.rows.length} data</p>
        </div>
        <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-slate-800 shadow-sm">{section.rows.length}</span>
      </div>
      {section.rows.length ? (
        <div className="master-report-table-wrap max-h-80 overflow-auto">
          <table className="master-report-table responsive-data-table min-w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white text-[11px] uppercase text-slate-500 shadow-sm">
              <tr>
                <th className="w-12 px-3 py-2 font-bold">No</th>
                {section.columns.map((column) => (
                  <th key={column.label} className="px-3 py-2 font-bold">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {section.rows.map((row, index) => (
                <tr key={row.id || `${section.key}-${index}`} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                  <td className="px-3 py-2 font-semibold text-slate-500" data-label="No">{index + 1}</td>
                  {section.columns.map((column) => (
                    <td key={column.label} className="px-3 py-2 font-semibold text-slate-800" data-label={column.label}>
                      {formatMasterValue(column.value(row))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 text-center text-sm text-slate-500">Belum ada data {section.title.toLowerCase()}.</div>
      )}
    </article>
  );
}

function PivotCell({ cell, note, canEditNote = false, onOpenNote, onOpenCorrection }) {
  const hasCount = Boolean(cell?.count);
  const hasNote = Boolean(note?.reasonLabel || note?.notes);
  const corrections = Array.isArray(cell?.corrections) ? cell.corrections : [];
  const hasCorrection = corrections.length > 0;
  const hasTransition = Boolean(cell?.transition);
  const isInactive = Boolean(cell?.inactive);
  const correctionTitle = corrections.map((correction) => [
    `Koreksi chassis: ${correction.sourcePlateNumber || '-'} -> ${correction.targetPlateNumber || '-'}`,
    correction.reason ? `Alasan: ${correction.reason}` : '',
  ].filter(Boolean).join(' | ')).join('\n');
  const title = [
    hasCount
      ? cell.labels?.length
        ? `${cell.count} trip - ${cell.labels.join(', ')}`
        : `${cell.count} trip`
      : 'Tidak ada trip',
    hasNote ? `Catatan: ${note.reasonLabel}${note.notes ? ` - ${note.notes}` : ''}` : '',
    hasTransition ? `Tanggal pergantian chassis: ${cell.transition.effectiveFrom}` : '',
    correctionTitle,
  ].filter(Boolean).join('\n');

  const content = hasCount ? (
    <span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-sky-100 px-1 text-[9px] font-black leading-none text-sky-900" title={title}>
      {cell.count}
      {hasCorrection ? (
        <span className="absolute -right-1 -top-1 text-[8px] font-black leading-none text-rose-600" aria-label="Ada koreksi chassis">
          ↔
        </span>
      ) : null}
    </span>
  ) : hasTransition ? (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm text-[12px] font-black leading-none text-orange-500" title={title}>
      •
    </span>
  ) : hasNote ? (
    <span className="inline-flex h-4 min-w-6 items-center justify-center rounded-sm bg-amber-100 px-1 text-[7px] font-black leading-none text-amber-800">
      {formatUtilizationNoteCode(note)}
    </span>
  ) : isInactive ? (
    <span className="inline-flex h-4 min-w-5 items-center justify-center rounded-sm bg-slate-100 text-[8px] font-black leading-none text-slate-400" title={title}>
      -
    </span>
  ) : (
    <span className="text-[8px] text-slate-300">-</span>
  );

  if (!hasNote && !canEditNote && !hasCorrection && !hasTransition) return content;

  return (
    <button
      type="button"
      className={`group relative inline-grid min-h-5 min-w-7 place-items-center rounded-sm border-0 bg-transparent px-0.5 shadow-none outline-none ${hasNote ? 'ring-1 ring-amber-300' : canEditNote ? 'hover:bg-amber-50 focus-visible:ring-1 focus-visible:ring-amber-300' : ''}`}
      title={title}
      onClick={hasCorrection || hasTransition ? onOpenCorrection : onOpenNote}
    >
      {content}
      {!hasNote && canEditNote ? (
        <span className="pointer-events-none absolute inset-0 hidden place-items-center text-[9px] font-black text-amber-700 group-hover:grid group-focus-visible:grid" aria-hidden="true">
          +
        </span>
      ) : null}
      {hasNote ? <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> : null}
      {hasTransition ? <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden="true" /> : null}
    </button>
  );
}

function effectiveUtilizationNote(manualNote, cell = {}) {
  const autoNote = cell?.autoNote;
  if (!autoNote) return manualNote;
  if (!manualNote?.reasonLabel && !manualNote?.notes) return autoNote;

  return {
    ...autoNote,
    notes: [
      autoNote.notes,
      `Catatan manual: ${manualNote.reasonLabel || '-'}${manualNote.notes ? ` - ${manualNote.notes}` : ''}`,
    ].filter(Boolean).join(' | '),
  };
}

function UtilizationNoteModal({
  target,
  suggestions = [],
  canEdit = false,
  saving = false,
  onClose,
  onSave,
  onDelete,
}) {
  const [reasonLabel, setReasonLabel] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setReasonLabel(target?.note?.reasonLabel || '');
    setNotes(target?.note?.notes || '');
  }, [target]);

  if (!target) return null;

  const datalistId = `utilization-note-reasons-${target.resourceId}-${target.date}`;
  const hasExistingNote = Boolean(target.note?.id);
  const readonly = !canEdit;

  function submit(event) {
    event.preventDefault();
    if (readonly) return;
    onSave({
      resourceType: 'truck',
      resourceId: target.resourceId,
      resourceLabel: target.resourceLabel,
      date: target.date,
      reasonLabel,
      notes,
    });
  }

  return (
    <div className="utilization-note-backdrop fixed inset-0 z-[260] grid place-items-center bg-slate-950/35 px-3 py-5" role="presentation" onMouseDown={onClose}>
      <form className="utilization-note-modal w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase text-amber-700">Catatan Utilisasi</span>
            <h3 className="mt-0.5 text-sm font-black text-slate-950">{target.resourceLabel}</h3>
            <p className="text-xs text-slate-500">{formatDate(target.date)} {target.cell?.count ? `- ${target.cell.count} trip` : '- Tidak ada trip'}</p>
          </div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded border border-slate-300 bg-white text-slate-600" onClick={onClose} aria-label="Tutup catatan utilisasi">
            <X size={15} />
          </button>
        </header>
        <div className="grid gap-3 px-4 py-3">
          <label className="grid gap-1.5 text-xs font-black text-slate-700">
            Alasan / Catatan Cepat
            <input
              className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100"
              list={datalistId}
              value={reasonLabel}
              onChange={(event) => setReasonLabel(event.target.value)}
              placeholder="Contoh: MUAT SORE, TGG DO, INAP"
              disabled={readonly || saving}
            />
            <datalist id={datalistId}>
              {suggestions.map((item) => <option key={item.label || item} value={item.label || item} />)}
            </datalist>
          </label>
          <label className="grid gap-1.5 text-xs font-black text-slate-700">
            Catatan Tambahan
            <textarea
              className="min-h-20 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opsional, isi detail lokasi/nama customer jika perlu."
              disabled={readonly || saving}
              maxLength={1000}
            />
          </label>
          {readonly ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Mode lihat saja. Catatan hanya bisa diisi oleh Operational/Admin.
            </div>
          ) : null}
          {hasExistingNote ? (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Terakhir disimpan oleh {target.note.updatedBy || target.note.createdBy || '-'}.
            </div>
          ) : null}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-between">
          <div>
            {canEdit && hasExistingNote ? (
              <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700" disabled={saving} onClick={() => onDelete(target.note)}>
                <Trash2 size={15} /> Hapus
              </button>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-black text-slate-700" disabled={saving} onClick={onClose}>Tutup</button>
            {canEdit ? (
              <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-3 text-xs font-black text-white disabled:opacity-60" disabled={saving || !reasonLabel.trim()}>
                <Save size={15} /> {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            ) : null}
          </div>
        </footer>
      </form>
    </div>
  );
}

function buildPivotDisplayRows(rows = []) {
  const items = [];
  let currentSize = '';

  rows.forEach((truck, index) => {
    const size = getTruckSize(truck) || 'Ukuran Belum Diisi';
    if (size !== currentSize) {
      currentSize = size;
      items.push({ type: 'group', id: `group-${size}`, size });
    }
    items.push({ type: 'truck', id: truck.rowKey || truck.plateNumber, truck, number: index + 1 });
  });

  return items;
}

function UtilizationChassisCorrectionModal({ correction, onClose }) {
  if (!correction) return null;

  const sourceSize = correction.sourceChassisSize || correction.sourceSize || '-';
  const targetSize = correction.targetChassisSize || correction.targetSize || '-';
  const oldActiveTo = correction.oldActiveTo || previousDateKeyValue(correction.effectiveFrom) || '-';
  const newActiveFrom = correction.newActiveFrom || correction.effectiveFrom || '-';

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/50 px-3" role="presentation" onMouseDown={onClose}>
      <section
        className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chassis-correction-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-amber-50 px-4 py-3">
          <div>
            <span className="text-[10px] font-black uppercase text-amber-700">Pertukaran Chassis</span>
            <h3 id="chassis-correction-title" className="mt-0.5 text-base font-black text-slate-950">
              {correction.plateNumber || correction.sourcePlateNumber || '-'}
            </h3>
          </div>
          <button type="button" className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100" onClick={onClose} aria-label="Tutup detail pertukaran chassis">
            <X size={16} />
          </button>
        </header>
        <div className="grid gap-3 p-4 text-sm">
          <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <div>
              <span className="block text-[10px] font-black uppercase text-slate-500">Tanggal Perubahan</span>
              <strong className="text-slate-950">{correction.effectiveFrom || '-'}</strong>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase text-slate-500">Arah Perpindahan</span>
              <strong className="text-slate-950">{sourceSize} → {targetSize}</strong>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase text-slate-500">Periode Aktif Lama</span>
              <strong className="text-slate-950">01 sampai {oldActiveTo}</strong>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase text-slate-500">Periode Aktif Baru</span>
              <strong className="text-slate-950">{newActiveFrom} sampai {correction.effectiveTo || '-'}</strong>
            </div>
          </div>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900">
            Unit yang sama bisa muncul dua kali karena histori utilisasi mengikuti ukuran chassis aktif pada tanggal tersebut. Ini bukan duplikasi data ritasi.
          </p>
          {correction.reason || correction.note ? (
            <div className="rounded-md border border-slate-200 p-3 text-xs text-slate-700">
              {correction.reason ? <p><strong>Alasan:</strong> {correction.reason}</p> : null}
              {correction.note ? <p className="mt-1"><strong>Catatan:</strong> {correction.note}</p> : null}
            </div>
          ) : null}
        </div>
        <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button type="button" className="secondary-button" onClick={onClose}>Tutup</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export function MonthlyUtilizationModal({
  open,
  onClose,
  pivot,
  activeMonthLabel,
  year,
  reportLabel = '',
  reportMode = 'active',
  onReportModeChange,
  utilizationNotesByKey = new Map(),
  utilizationNoteSuggestions = [],
  canEditNotes = false,
  noteSaving = false,
  onSaveNote,
  onDeleteNote,
}) {
  const [noteTarget, setNoteTarget] = useState(null);
  const [correctionTarget, setCorrectionTarget] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) setNoteTarget(null);
  }, [open]);

  if (!open) return null;

  const displayRows = buildPivotDisplayRows(pivot.rows, pivot.transitions);
  const uniqueUnitCount = new Set(pivot.rows.map((row) => row.plateNumber).filter(Boolean)).size;
  const transitionSummaries = (pivot.transitions || []).map((transition) => {
    const relatedRows = pivot.rows.filter((row) => row.transition?.id === transition.id);
    return {
      ...transition,
      beforeTrips: relatedRows.find((row) => row.segmentPhase === 'before')?.totalTrips || 0,
      afterTrips: relatedRows.find((row) => row.segmentPhase === 'after')?.totalTrips || 0,
    };
  });
  const stickyNoWidth = 34;
  const truckLeftOffset = stickyNoWidth;

  const modal = (
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-hidden bg-slate-950/45 px-3 py-6" role="presentation" onMouseDown={onClose}>
      <section className="monthly-utilization-modal flex max-h-[calc(100vh-3rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="monthly-utilization-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="block text-[9px] font-black uppercase text-sky-700">{reportLabel || 'Utilisasi Bulanan'}</span>
            <h2 id="monthly-utilization-title" className="mt-0.5 text-sm font-black leading-tight text-slate-950">
              Pivot Utilisasi Truck {activeMonthLabel} {year}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              className="h-8 min-w-[220px] rounded border border-sky-300 bg-white px-2 text-[11px] font-bold text-slate-900 outline-none focus:border-sky-500"
              value={reportMode}
              onChange={(event) => onReportModeChange?.(event.target.value)}
              aria-label="Basis laporan utilisasi"
            >
              <option value="active">Utilisasi Unit Aktif</option>
              <option value="fleet">Utilisasi Seluruh Armada</option>
            </select>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {uniqueUnitCount} Unit
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {pivot.grandTotal} Trip
            </span>
            {pivot.transitions?.length ? (
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">
                {pivot.transitions.length} Pertukaran Chassis
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              aria-label="Tutup utilisasi bulanan"
              title="Tutup"
            >
              <X size={15} />
            </button>
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600">
          <span><span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-sky-100 px-1 text-[9px] font-black text-sky-900">1</span> angka biru = trip</span>
          <span><span className="text-sm font-black text-orange-500">•</span> titik orange = tanggal pergantian chassis</span>
          <span><span className="inline-flex h-4 min-w-5 items-center justify-center rounded-sm bg-slate-100 text-[8px] font-black text-slate-400">-</span> strip abu-abu = tidak aktif di group tersebut</span>
          <span><span className="rounded bg-rose-100 px-1.5 py-0.5 text-[8px] font-black text-rose-700">DUP</span> unit muncul di group lain karena pindah chassis</span>
        </div>

        {transitionSummaries.length ? (
          <div className="grid gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 sm:grid-cols-2 xl:grid-cols-3">
            {transitionSummaries.map((transition) => (
              <button
                key={transition.id}
                type="button"
                className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-left shadow-sm hover:border-amber-400 hover:bg-amber-50"
                onClick={() => setCorrectionTarget(transition)}
              >
                <span className="grid h-8 w-8 place-items-center rounded-md bg-amber-100 text-amber-800">
                  <Truck size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-black text-slate-950">{transition.plateNumber}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-slate-600">
                    <span>{transition.sourceSize}</span>
                    <ArrowRight size={11} className="text-amber-600" />
                    <span>{transition.targetSize}</span>
                    <span className="text-slate-400">mulai {formatPivotDateLabel(transition.effectiveFrom)}</span>
                  </span>
                </span>
                <span className="text-right text-[9px] font-bold text-slate-500">
                  <span className="block">{transition.beforeTrips} trip sebelumnya</span>
                  <span className="block text-amber-800">{transition.afterTrips} trip sesudahnya</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {pivot.rows.length ? (
          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <table className="w-full min-w-max border-collapse text-[9px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="sticky left-0 top-0 z-30 min-w-[34px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black">
                    NO
                  </th>
                  <th className="sticky top-0 z-30 min-w-[180px] border border-slate-200 bg-slate-100 px-2 py-1 text-left font-black" style={{ left: truckLeftOffset }}>
                    <span className="grid w-[164px] grid-cols-[116px_40px] items-center gap-2">
                      <span>Truck</span>
                      <span className="text-center text-[8px]">Lambung</span>
                    </span>
                  </th>
                  {pivot.days.map((day) => (
                    <th
                      key={day.key}
                      className={`sticky top-0 z-20 min-w-[38px] border px-1 py-1 text-center font-black leading-tight ${
                        day.isRedDate
                          ? 'border-red-200 bg-red-100 text-red-700'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                      title={day.isRedDate ? `${day.fullLabel} - tanggal merah` : day.fullLabel}
                    >
                      <span className={`block text-[7px] font-black ${day.isRedDate ? 'text-red-600' : 'text-slate-500'}`}>{day.weekdayShort}</span>
                      <span className="block">{day.label}</span>
                    </th>
                  ))}
                  <th className="sticky right-0 top-0 z-30 min-w-[48px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((item) => {
                  if (item.type === 'group') {
                    return (
                      <tr key={item.id} className="bg-sky-100 text-sky-950">
                        <th colSpan={2} className="sticky left-0 z-20 border-y border-sky-300 bg-sky-100 px-1.5 py-1 text-left font-black tracking-normal">
                          {item.size}
                        </th>
                        {pivot.days.map((day) => (
                          <td key={day.key} className="border-y border-sky-300 bg-sky-100 px-1 py-1" />
                        ))}
                        <td className="sticky right-0 z-20 border-y border-sky-300 bg-sky-100 px-1 py-1" />
                      </tr>
                    );
                  }

                  const { truck } = item;
                  return (
                    <tr key={truck.rowKey || truck.plateNumber} className="group odd:bg-white even:bg-slate-50/80 transition-colors duration-150 ease-out hover:bg-sky-50/90">
                      <td className="sticky left-0 z-10 min-w-[34px] border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-700 shadow-[inset_0_-1px_0_#94a3b8] transition-colors duration-150 ease-out group-hover:bg-sky-50">
                        {item.number}
                      </td>
                      <th className="sticky z-10 min-w-[180px] border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-2 py-1 text-left font-black text-slate-900 shadow-[inset_0_-1px_0_#94a3b8] transition-colors duration-150 ease-out group-hover:bg-sky-50" style={{ left: truckLeftOffset }}>
                        <span className="grid w-[164px] grid-cols-[116px_40px] items-center gap-2">
                          <span className="block min-w-0" title={`${truck.plateNumber}${truck.segmentBadge ? ` - ${truck.segmentBadge}` : ''}`}>
                            {truck.plateNumber}
                            {truck.isDuplicateUnit ? (
                              <span className="ml-1 rounded bg-rose-100 px-1 text-[7px] font-black text-rose-700">DUP</span>
                            ) : null}
                            {truck.segmentBadge ? (
                              <span className="mt-0.5 block truncate text-[7px] font-black text-amber-700">{truck.segmentBadge}</span>
                            ) : null}
                          </span>
                          <span className="inline-flex h-4 min-w-5 justify-self-center items-center justify-center rounded bg-slate-200 px-1 text-[8px] font-black leading-none text-slate-700" title="No Lambung">
                            {formatTruckUnitCode(truck.unitCode)}
                          </span>
                        </span>
                      </th>
                      {pivot.days.map((day) => {
                        const cell = truck.cells[day.key];
                        const manualNote = utilizationNotesByKey.get(utilizationNoteKey(truck.id || truck.plateNumber, day.key));
                        return (
                          <td
                            key={day.key}
                            className={`h-6 max-w-[38px] border-x border-b border-b-slate-400 px-0.5 py-0 text-center align-middle shadow-[inset_0_-1px_0_#94a3b8] ${
                              day.isRedDate
                                ? 'border-x-red-200 bg-red-50/80 transition-colors duration-150 ease-out group-hover:bg-rose-50'
                                : 'border-x-slate-200 transition-colors duration-150 ease-out group-hover:bg-sky-50'
                            }`}
                          >
                            <PivotCell
                              cell={cell}
                              note={effectiveUtilizationNote(manualNote, cell)}
                              canEditNote={canEditNotes}
                              onOpenNote={() => setNoteTarget({
                                resourceId: truck.id || truck.plateNumber,
                                resourceLabel: truck.plateNumber,
                                date: day.key,
                                cell,
                                note: manualNote,
                              })}
                              onOpenCorrection={() => setCorrectionTarget({
                                ...(truck.transition || {}),
                                ...(cell?.corrections?.[0] || {}),
                                plateNumber: truck.plateNumber,
                                sourceSize: truck.transition?.sourceSize || cell?.corrections?.[0]?.sourceChassisSize,
                                targetSize: truck.transition?.targetSize || cell?.corrections?.[0]?.targetChassisSize,
                              })}
                            />
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-950 shadow-[inset_0_-1px_0_#94a3b8] transition-colors duration-150 ease-out group-hover:bg-sky-50">
                        {truck.totalTrips}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 text-slate-950">
                  <th colSpan={2} className="sticky bottom-0 left-0 z-30 border border-slate-400 bg-slate-200 px-1.5 py-1 text-left font-black">
                    Grand Total
                  </th>
                  {pivot.days.map((day) => (
                    <td
                      key={day.key}
                      className={`sticky bottom-0 z-20 border px-1 py-1 text-center font-black ${
                        day.isRedDate ? 'border-red-300 bg-red-100 text-red-800' : 'border-slate-400 bg-slate-200 text-slate-950'
                      }`}
                    >
                      {pivot.totalsByDay[day.key] || ''}
                    </td>
                  ))}
                  <td className="sticky bottom-0 right-0 z-30 border border-slate-400 bg-slate-200 px-1 py-1 text-center font-black text-slate-950">
                    {pivot.grandTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Belum ada trip selesai</h3>
              <p className="mt-1 text-xs text-slate-500">Tidak ada utilisasi truck pada {activeMonthLabel} {year}.</p>
            </div>
          </div>
        )}
        <UtilizationNoteModal
          target={noteTarget}
          suggestions={utilizationNoteSuggestions}
          canEdit={canEditNotes}
          saving={noteSaving}
          onClose={() => setNoteTarget(null)}
          onSave={async (payload) => {
            await onSaveNote?.(payload);
            setNoteTarget(null);
          }}
          onDelete={async (note) => {
            await onDeleteNote?.(note);
            setNoteTarget(null);
          }}
        />
        <UtilizationChassisCorrectionModal
          correction={correctionTarget}
          onClose={() => setCorrectionTarget(null)}
        />
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

export function CustomerMonthlyUtilizationModal({
  open,
  onClose,
  pivot,
  activeMonthLabel,
  year,
}) {
  const [selectedCustomerKey, setSelectedCustomerKey] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const customers = pivot?.customers || [];
    setSelectedCustomerKey((current) => {
      if (customers.some((customer) => customer.key === current)) return current;
      return customers[0]?.key || '';
    });
  }, [open, pivot]);

  useEffect(() => {
    if (!open) return;
    const selected = (pivot?.customers || []).find((customer) => customer.key === selectedCustomerKey);
    if (selected) setCustomerSearch(`${selected.customerName} - ${selected.grandTotal} trip`);
  }, [open, pivot, selectedCustomerKey]);

  if (!open) return null;

  const customers = pivot?.customers || [];
  const selectedCustomer = customers.find((customer) => customer.key === selectedCustomerKey) || customers[0] || null;
  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const matchingCustomers = customers.filter((customer) => (
    `${customer.customerName} ${customer.grandTotal} trip`.toLowerCase().includes(normalizedCustomerSearch)
  ));
  const displayRows = selectedCustomer ? buildPivotDisplayRows(selectedCustomer.rows, []) : [];
  const stickyNoWidth = 34;
  const truckLeftOffset = stickyNoWidth;

  const modal = (
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-hidden bg-slate-950/45 px-3 py-6" role="presentation" onMouseDown={onClose}>
      <section className="monthly-utilization-modal flex max-h-[calc(100vh-3rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="customer-monthly-utilization-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="block text-[9px] font-black uppercase text-sky-700">Utilisasi Customer</span>
            <h2 id="customer-monthly-utilization-title" className="mt-0.5 text-sm font-black leading-tight text-slate-950">
              Truck per Customer {activeMonthLabel} {year}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-[280px] max-w-[440px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2 text-slate-400" size={14} />
              <input
                type="search"
                className="h-9 w-full rounded border border-sky-300 bg-white pl-8 pr-2 text-xs font-bold text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                value={customerSearch}
                onChange={(event) => {
                  setCustomerSearch(event.target.value);
                  setCustomerSearchOpen(true);
                }}
                onFocus={(event) => {
                  event.target.select();
                  setCustomerSearchOpen(true);
                }}
                onBlur={() => window.setTimeout(() => setCustomerSearchOpen(false), 150)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setCustomerSearchOpen(false);
                  if (event.key === 'Enter' && matchingCustomers[0]) {
                    event.preventDefault();
                    setSelectedCustomerKey(matchingCustomers[0].key);
                    setCustomerSearchOpen(false);
                  }
                }}
                placeholder="Ketik nama customer..."
                aria-label="Cari customer"
                autoComplete="off"
              />
              {customerSearchOpen ? (
                <div className="absolute right-0 top-10 z-50 max-h-72 w-full min-w-[360px] overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-xl" role="listbox">
                  {matchingCustomers.length ? matchingCustomers.map((customer) => (
                    <button
                      key={customer.key}
                      type="button"
                      role="option"
                      aria-selected={customer.key === selectedCustomer?.key}
                      className={`block w-full px-3 py-2 text-left text-xs hover:bg-sky-50 ${customer.key === selectedCustomer?.key ? 'bg-sky-100 font-black text-sky-900' : 'font-semibold text-slate-800'}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setSelectedCustomerKey(customer.key);
                        setCustomerSearchOpen(false);
                      }}
                    >
                      {customer.customerName} - {customer.grandTotal} trip
                    </button>
                  )) : (
                    <p className="px-3 py-3 text-xs text-slate-500">Customer tidak ditemukan.</p>
                  )}
                </div>
              ) : null}
            </div>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {customers.length} Customer
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {selectedCustomer?.unitCount || 0} Unit
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {selectedCustomer?.grandTotal || 0} Trip
            </span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              aria-label="Tutup utilisasi customer"
              title="Tutup"
            >
              <X size={15} />
            </button>
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600">
          <span><span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-sky-100 px-1 text-[9px] font-black text-sky-900">1</span> angka biru = trip customer tersebut</span>
          <span><span className="text-[8px] text-slate-300">-</span> tidak ada trip customer tersebut pada tanggal itu</span>
        </div>

        {selectedCustomer?.rows.length ? (
          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <table className="w-full min-w-max border-collapse text-[9px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="sticky left-0 top-0 z-30 min-w-[34px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black">
                    NO
                  </th>
                  <th className="sticky top-0 z-30 min-w-[180px] border border-slate-200 bg-slate-100 px-2 py-1 text-left font-black" style={{ left: truckLeftOffset }}>
                    <span className="grid w-[164px] grid-cols-[116px_40px] items-center gap-2">
                      <span>Truck</span>
                      <span className="text-center text-[8px]">Lambung</span>
                    </span>
                  </th>
                  {pivot.days.map((day) => (
                    <th
                      key={day.key}
                      className={`sticky top-0 z-20 min-w-[38px] border px-1 py-1 text-center font-black leading-tight ${
                        day.isRedDate
                          ? 'border-red-200 bg-red-100 text-red-700'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                      title={day.isRedDate ? `${day.fullLabel} - tanggal merah` : day.fullLabel}
                    >
                      <span className={`block text-[7px] font-black ${day.isRedDate ? 'text-red-600' : 'text-slate-500'}`}>{day.weekdayShort}</span>
                      <span className="block">{day.label}</span>
                    </th>
                  ))}
                  <th className="sticky right-0 top-0 z-30 min-w-[48px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((item) => {
                  if (item.type === 'group') {
                    return (
                      <tr key={item.id} className="bg-sky-100 text-sky-950">
                        <th colSpan={2} className="sticky left-0 z-20 border-y border-sky-300 bg-sky-100 px-1.5 py-1 text-left font-black tracking-normal">
                          {item.size}
                        </th>
                        {pivot.days.map((day) => (
                          <td key={day.key} className="border-y border-sky-300 bg-sky-100 px-1 py-1" />
                        ))}
                        <td className="sticky right-0 z-20 border-y border-sky-300 bg-sky-100 px-1 py-1" />
                      </tr>
                    );
                  }

                  const { truck } = item;
                  return (
                    <tr key={truck.rowKey || truck.plateNumber} className="group odd:bg-white even:bg-slate-50/80 transition-colors duration-150 ease-out hover:bg-sky-50/90">
                      <td className="sticky left-0 z-10 min-w-[34px] border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-700 shadow-[inset_0_-1px_0_#94a3b8] transition-colors duration-150 ease-out group-hover:bg-sky-50">
                        {item.number}
                      </td>
                      <th className="sticky z-10 min-w-[130px] border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1.5 py-0.5 text-left font-black text-slate-900 shadow-[inset_0_-1px_0_#94a3b8] transition-colors duration-150 ease-out group-hover:bg-sky-50" style={{ left: truckLeftOffset }}>
                        <span className="grid w-[116px] grid-cols-[74px_34px] items-center gap-2">
                          <span className="block min-w-0 truncate" title={truck.plateNumber}>{truck.plateNumber}</span>
                          <span className="inline-flex h-4 min-w-5 items-center justify-center justify-self-center rounded bg-slate-200 px-1 text-[8px] font-black leading-none text-slate-700" title="No Lambung">
                            {formatTruckUnitCode(truck.unitCode)}
                          </span>
                        </span>
                      </th>
                      {pivot.days.map((day) => (
                        <td
                          key={day.key}
                          className={`h-6 max-w-[38px] border-x border-b border-b-slate-400 px-0.5 py-0 text-center align-middle shadow-[inset_0_-1px_0_#94a3b8] ${
                            day.isRedDate
                              ? 'border-x-red-200 bg-red-50/80 transition-colors duration-150 ease-out group-hover:bg-rose-50'
                              : 'border-x-slate-200 transition-colors duration-150 ease-out group-hover:bg-sky-50'
                          }`}
                        >
                          <PivotCell cell={truck.cells[day.key]} />
                        </td>
                      ))}
                      <td className="sticky right-0 z-10 border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-950 shadow-[inset_0_-1px_0_#94a3b8] transition-colors duration-150 ease-out group-hover:bg-sky-50">
                        {truck.totalTrips}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 text-slate-950">
                  <th colSpan={2} className="sticky bottom-0 left-0 z-30 border border-slate-400 bg-slate-200 px-1.5 py-1 text-left font-black">
                    Total {selectedCustomer.customerName}
                  </th>
                  {pivot.days.map((day) => (
                    <td
                      key={day.key}
                      className={`sticky bottom-0 z-20 border px-1 py-1 text-center font-black ${
                        day.isRedDate ? 'border-red-300 bg-red-100 text-red-800' : 'border-slate-400 bg-slate-200 text-slate-950'
                      }`}
                    >
                      {selectedCustomer.totalsByDay[day.key] || ''}
                    </td>
                  ))}
                  <td className="sticky bottom-0 right-0 z-30 border border-slate-400 bg-slate-200 px-1 py-1 text-center font-black text-slate-950">
                    {selectedCustomer.grandTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Belum ada trip selesai</h3>
              <p className="mt-1 text-xs text-slate-500">Tidak ada truck customer pada {activeMonthLabel} {year}.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

export function DriverMonthlyUtilizationModal({
  open,
  onClose,
  pivot,
  activeMonthLabel,
  year,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const stickyNoWidth = 34;
  const driverLeftOffset = stickyNoWidth;

  const modal = (
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-hidden bg-slate-950/45 px-3 py-6" role="presentation" onMouseDown={onClose}>
      <section className="monthly-utilization-modal driver-monthly-utilization-modal flex max-h-[calc(100vh-3rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="driver-monthly-utilization-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="block text-[9px] font-black uppercase text-amber-700">Utilisasi Bulanan Sopir</span>
            <h2 id="driver-monthly-utilization-title" className="mt-0.5 text-sm font-black leading-tight text-slate-950">
              Pivot Utilisasi Sopir {activeMonthLabel} {year}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {pivot.rows.length} Sopir
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {pivot.grandTotal} Trip
            </span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              aria-label="Tutup utilisasi bulanan sopir"
              title="Tutup"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {pivot.rows.length ? (
          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <table className="w-full min-w-max border-collapse text-[9px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="sticky left-0 top-0 z-30 min-w-[34px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black">
                    NO
                  </th>
                  <th className="sticky top-0 z-30 min-w-[150px] border border-slate-200 bg-slate-100 px-1.5 py-1 text-left font-black" style={{ left: driverLeftOffset }}>
                    Sopir
                  </th>
                  {pivot.days.map((day) => (
                    <th
                      key={day.key}
                      className={`sticky top-0 z-20 min-w-[38px] border px-1 py-1 text-center font-black leading-tight ${
                        day.isRedDate
                          ? 'border-red-200 bg-red-100 text-red-700'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                      title={day.isRedDate ? `${day.fullLabel} - tanggal merah` : day.fullLabel}
                    >
                      <span className={`block text-[7px] font-black ${day.isRedDate ? 'text-red-600' : 'text-slate-500'}`}>{day.weekdayShort}</span>
                      <span className="block">{day.label}</span>
                    </th>
                  ))}
                  <th className="sticky right-0 top-0 z-30 min-w-[48px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {pivot.rows.map((driver, index) => (
                  <tr key={driver.driverId || driver.driver} className="odd:bg-white even:bg-slate-50/80">
                    <td className="sticky left-0 z-10 min-w-[34px] border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-700 shadow-[inset_0_-1px_0_#94a3b8]">
                      {index + 1}
                    </td>
                    <th className="sticky z-10 min-w-[150px] border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1.5 py-0.5 text-left font-black text-slate-900 shadow-[inset_0_-1px_0_#94a3b8]" style={{ left: driverLeftOffset }}>
                      <span className="block max-w-[136px] truncate" title={driver.driver}>{driver.driver}</span>
                    </th>
                    {pivot.days.map((day) => (
                      <td
                        key={day.key}
                        className={`h-6 max-w-[38px] border-x border-b border-b-slate-400 px-0.5 py-0 text-center align-middle shadow-[inset_0_-1px_0_#94a3b8] ${
                          day.isRedDate ? 'border-x-red-200 bg-red-50/80' : 'border-x-slate-200'
                        }`}
                      >
                        <PivotCell cell={driver.cells[day.key]} />
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-950 shadow-[inset_0_-1px_0_#94a3b8]">
                      {driver.totalTrips}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 text-slate-950">
                  <th colSpan={2} className="sticky bottom-0 left-0 z-30 border border-slate-400 bg-slate-200 px-1.5 py-1 text-left font-black">
                    Grand Total
                  </th>
                  {pivot.days.map((day) => (
                    <td
                      key={day.key}
                      className={`sticky bottom-0 z-20 border px-1 py-1 text-center font-black ${
                        day.isRedDate ? 'border-red-300 bg-red-100 text-red-800' : 'border-slate-400 bg-slate-200 text-slate-950'
                      }`}
                    >
                      {pivot.totalsByDay[day.key] || ''}
                    </td>
                  ))}
                  <td className="sticky bottom-0 right-0 z-30 border border-slate-400 bg-slate-200 px-1 py-1 text-center font-black text-slate-950">
                    {pivot.grandTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Belum ada trip selesai</h3>
              <p className="mt-1 text-xs text-slate-500">Tidak ada utilisasi sopir pada {activeMonthLabel} {year}.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

function ReportsPage() {
  const archive = useArchiveData();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const isFinanceOnly = user?.role === USER_ROLES.FINANCE;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPeriod = useMemo(() => currentPeriod(), []);
  const [month, setMonth] = useState(initialPeriod.month);
  const [year, setYear] = useState(initialPeriod.year);
  const [revenueRows, setRevenueRows] = useState([]);
  const [revenueSummary, setRevenueSummary] = useState(DEFAULT_REVENUE_SUMMARY);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [revenueError, setRevenueError] = useState('');
  const [salesPerformanceRows, setSalesPerformanceRows] = useState([]);
  const [salesPerformanceSummary, setSalesPerformanceSummary] = useState(DEFAULT_SALES_PERFORMANCE_SUMMARY);
  const [salesPerformanceLoading, setSalesPerformanceLoading] = useState(true);
  const [salesPerformanceError, setSalesPerformanceError] = useState('');
  const [customerPerformanceRows, setCustomerPerformanceRows] = useState([]);
  const [customerPerformanceSummary, setCustomerPerformanceSummary] = useState(DEFAULT_CUSTOMER_PERFORMANCE_SUMMARY);
  const [customerPerformanceLoading, setCustomerPerformanceLoading] = useState(true);
  const [customerPerformanceError, setCustomerPerformanceError] = useState('');
  const [monthlyComparisonRows, setMonthlyComparisonRows] = useState([]);
  const [monthlyComparisonLoading, setMonthlyComparisonLoading] = useState(true);
  const [monthlyComparisonError, setMonthlyComparisonError] = useState('');
  const [utilizationRows, setUtilizationRows] = useState([]);
  const [utilizationLoading, setUtilizationLoading] = useState(true);
  const [utilizationError, setUtilizationError] = useState('');
  const [driverPerformanceRows, setDriverPerformanceRows] = useState([]);
  const [driverPerformanceLoading, setDriverPerformanceLoading] = useState(true);
  const [driverPerformanceError, setDriverPerformanceError] = useState('');
  const [repoRows, setRepoRows] = useState([]);
  const [repoLoading, setRepoLoading] = useState(true);
  const [repoError, setRepoError] = useState('');
  const [publicHolidays, setPublicHolidays] = useState([]);
  const [selectedReport, setSelectedReport] = useState(() => normalizeReportTab(searchParams.get('tab'), { revenueOnly: isFinanceOnly }));
  const [statisticsModalReport, setStatisticsModalReport] = useState(null);
  // Revenue di tabel Customer Performance selalu mengikuti bulan/periode yang sedang dipilih,
  // sedangkan Outstanding menampilkan sisa piutang riil saat ini yang bisa berasal dari invoice
  // beberapa bulan sebelumnya -- keduanya dipisah jadi tampilan sendiri-sendiri supaya tidak
  // tercampur seolah-olah satu periode yang sama.
  const [customerDetailView, setCustomerDetailView] = useState('revenue');
  // Tab Outstanding punya filter umur piutang sendiri (customer yang piutangnya sudah menunggak
  // MINIMAL N hari) -- terpisah dari filter Bulan/Tahun di atas karena Outstanding memang bukan
  // konsep per-bulan. null = tampilkan semua umur piutang, tanpa ambang batas.
  const [outstandingMinOverdueDays, setOutstandingMinOverdueDays] = useState(null);
  const [customerPerformancePage, setCustomerPerformancePage] = useState(1);
  // Drill-down SO per bucket umur piutang: dibuka lewat tombol kecil di samping nominal tiap
  // kolom bucket pada tab Outstanding.
  const [outstandingBucketDetail, setOutstandingBucketDetail] = useState(null);
  const [outstandingBucketRows, setOutstandingBucketRows] = useState([]);
  const [outstandingBucketLoading, setOutstandingBucketLoading] = useState(false);
  const [outstandingBucketError, setOutstandingBucketError] = useState('');
  const [dataSource, setDataSource] = useState('all');
  const [utilizationTableMode, setUtilizationTableMode] = useState('active');
  const [utilizationPivotMode, setUtilizationPivotMode] = useState('');
  const [customerUtilizationModalOpen, setCustomerUtilizationModalOpen] = useState(false);
  const [driverUtilizationModalOpen, setDriverUtilizationModalOpen] = useState(false);
  const [utilizationNotes, setUtilizationNotes] = useState([]);
  const [utilizationNoteSuggestions, setUtilizationNoteSuggestions] = useState([]);
  const [utilizationNoteSaving, setUtilizationNoteSaving] = useState(false);
  const yearOptions = useMemo(() => {
    const baseYear = currentPeriod().year;
    return Array.from({ length: 7 }, (_, index) => baseYear - 3 + index);
  }, []);
  const activeMonthLabel = MONTHS.find((item) => Number(item.value) === Number(month))?.label || '-';
  const activePeriodKey = monthKey(month, year);
  const canEditUtilizationNotes = user?.role === USER_ROLES.ADMIN || hasPermission(user, 'operations.update');
  const reportSourceParams = useMemo(() => {
    if (dataSource === 'historical') return { entrySource: 'historical', historicalPeriod: activePeriodKey };
    if (dataSource === 'realtime') return { entrySource: 'realtime' };
    return {};
  }, [activePeriodKey, dataSource]);
  const yearlyComparisonSourceParams = useMemo(() => {
    if (dataSource === 'historical') return { entrySource: 'historical' };
    if (dataSource === 'realtime') return { entrySource: 'realtime' };
    return {};
  }, [dataSource]);

  useEffect(() => {
    setSelectedReport(normalizeReportTab(searchParams.get('tab'), { revenueOnly: isFinanceOnly }));
  }, [searchParams, isFinanceOnly]);

  useEffect(() => {
    if (selectedReport !== 'utilization') setUtilizationPivotMode('');
    if (selectedReport !== 'utilization') setCustomerUtilizationModalOpen(false);
    if (selectedReport !== 'driver') setDriverUtilizationModalOpen(false);
  }, [selectedReport]);

  useEffect(() => {
    setCustomerPerformancePage(1);
  }, [activePeriodKey, customerDetailView, dataSource, outstandingMinOverdueDays, selectedReport]);

  useEffect(() => {
    let active = true;
    fetchIndonesiaPublicHolidays(year)
      .then((holidays) => {
        if (active) setPublicHolidays(Array.isArray(holidays) ? holidays : []);
      })
      .catch(() => {
        if (active) setPublicHolidays([]);
      });

    return () => {
      active = false;
    };
  }, [year]);

  useEffect(() => {
    let active = true;
    fetchUtilizationNotes({ resourceType: 'truck', period: activePeriodKey })
      .then((result) => {
        if (!active) return;
        setUtilizationNotes(Array.isArray(result?.rows) ? result.rows : []);
        setUtilizationNoteSuggestions(Array.isArray(result?.suggestions) ? result.suggestions : []);
      })
      .catch(() => {
        if (!active) return;
        setUtilizationNotes([]);
        setUtilizationNoteSuggestions([]);
      });

    return () => {
      active = false;
    };
  }, [activePeriodKey]);

  useEffect(() => {
    let active = true;
    setMonthlyComparisonLoading(true);
    setMonthlyComparisonError('');

    fetchMonthlyComparisonReport({ year, ...yearlyComparisonSourceParams })
      .then((result) => {
        if (!active) return;
        setMonthlyComparisonRows(Array.isArray(result?.rows) ? result.rows : []);
      })
      .catch((requestError) => {
        if (!active) return;
        setMonthlyComparisonRows([]);
        setMonthlyComparisonError(requestError.message || 'Grafik perbandingan bulanan gagal dimuat.');
      })
      .finally(() => {
        if (active) setMonthlyComparisonLoading(false);
      });

    return () => {
      active = false;
    };
  }, [year, yearlyComparisonSourceParams]);

  function selectReport(report) {
    const normalized = normalizeReportTab(report, { revenueOnly: isFinanceOnly });
    setSelectedReport(normalized);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (normalized === 'revenue') nextParams.delete('tab');
      else nextParams.set('tab', normalized);
      return nextParams;
    }, { replace: true });
  }

  useEffect(() => {
    let active = true;
    const range = monthRange(month, year);

    setRevenueLoading(true);
    setSalesPerformanceLoading(true);
    setCustomerPerformanceLoading(true);
    setUtilizationLoading(true);
    setDriverPerformanceLoading(true);
    setRepoLoading(true);
    setRevenueError('');
    setSalesPerformanceError('');
    setCustomerPerformanceError('');
    setUtilizationError('');
    setDriverPerformanceError('');
    setRepoError('');

    async function loadUtilizationRows() {
      const pageSize = 100;
      const collected = [];
      let page = 1;
      let total = Number.POSITIVE_INFINITY;

      while (collected.length < total) {
        const result = await fetchOperationReport({
          page,
          pageSize,
          status: 'completed',
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          applyUtilizationCorrections: 'chassis',
          ...reportSourceParams,
        });
        const rows = Array.isArray(result?.rows) ? result.rows : [];
        collected.push(...rows);
        total = Number(result?.total || rows.length || 0);
        if (!rows.length || rows.length < pageSize) break;
        page += 1;
      }

      return collected;
    }

    Promise.allSettled([
      fetchMonthlyRevenueReport({ month, year, ...reportSourceParams }),
      isFinanceOnly ? Promise.resolve(null) : fetchSalesPerformanceReport({ month, year, ...reportSourceParams }),
      isFinanceOnly ? Promise.resolve(null) : fetchCustomerPerformanceReport({ month, year, ...reportSourceParams }),
      isFinanceOnly ? Promise.resolve([]) : loadUtilizationRows(),
      isFinanceOnly ? Promise.resolve(null) : fetchDriverPerformanceReport({
        month: activePeriodKey,
        ...reportSourceParams,
      }),
      isFinanceOnly ? Promise.resolve(null) : fetchOperationReport({
        page: 1,
        pageSize: 100,
        status: 'repo_stored',
        ...reportSourceParams,
      }),
    ]).then(([revenueResult, salesPerformanceResult, customerPerformanceResult, utilizationResult, driverPerformanceResult, repoResult]) => {
      if (!active) return;

      if (revenueResult.status === 'fulfilled') {
        const result = revenueResult.value;
        setRevenueRows(Array.isArray(result?.rows) ? result.rows : []);
        setRevenueSummary({
          totalRevenue: Number(result?.summary?.totalRevenue || 0),
          totalOrders: Number(result?.summary?.totalOrders || 0),
          totalContainers: Number(result?.summary?.totalContainers || 0),
          totalTrucks: Number(result?.summary?.totalTrucks || 0),
          totalTrips: Number(result?.summary?.totalTrips || 0),
        });
      } else {
        setRevenueRows([]);
        setRevenueSummary(DEFAULT_REVENUE_SUMMARY);
        setRevenueError(revenueResult.reason?.message || 'Laporan revenue gagal dimuat.');
      }

      if (salesPerformanceResult.status === 'fulfilled') {
        const result = salesPerformanceResult.value;
        setSalesPerformanceRows(Array.isArray(result?.rows) ? result.rows : []);
        setSalesPerformanceSummary({
          totalSales: Number(result?.summary?.totalSales || 0),
          activeSales: Number(result?.summary?.activeSales || 0),
          totalCustomers: Number(result?.summary?.totalCustomers || 0),
          totalOrders: Number(result?.summary?.totalOrders || 0),
          totalVolume: Number(result?.summary?.totalVolume || 0),
          totalContainers: Number(result?.summary?.totalContainers || 0),
          totalRevenue: Number(result?.summary?.totalRevenue || 0),
          averageRevenuePerSales: Number(result?.summary?.averageRevenuePerSales || 0),
          averageRevenuePerVolume: Number(result?.summary?.averageRevenuePerVolume || 0),
        });
      } else {
        setSalesPerformanceRows([]);
        setSalesPerformanceSummary(DEFAULT_SALES_PERFORMANCE_SUMMARY);
        setSalesPerformanceError(salesPerformanceResult.reason?.message || 'Laporan performa sales gagal dimuat.');
      }

      if (customerPerformanceResult.status === 'fulfilled') {
        const result = customerPerformanceResult.value;
        setCustomerPerformanceRows(Array.isArray(result?.rows) ? result.rows : []);
        setCustomerPerformanceSummary({
          totalCustomers: Number(result?.summary?.totalCustomers || 0),
          activeCustomers: Number(result?.summary?.activeCustomers || 0),
          outstandingCustomers: Number(result?.summary?.outstandingCustomers || 0),
          overdueCustomers: Number(result?.summary?.overdueCustomers || 0),
          healthyCustomers: Number(result?.summary?.healthyCustomers || 0),
          totalOrders: Number(result?.summary?.totalOrders || 0),
          totalVolume: Number(result?.summary?.totalVolume || 0),
          totalContainers: Number(result?.summary?.totalContainers || 0),
          totalRevenue: Number(result?.summary?.totalRevenue || 0),
          totalOutstandingAmount: Number(result?.summary?.totalOutstandingAmount || 0),
          overdueAmount: Number(result?.summary?.overdueAmount || 0),
          averageRevenuePerCustomer: Number(result?.summary?.averageRevenuePerCustomer || 0),
          averageRevenuePerVolume: Number(result?.summary?.averageRevenuePerVolume || 0),
          collectionRate: Number(result?.summary?.collectionRate || 0),
        });
      } else {
        setCustomerPerformanceRows([]);
        setCustomerPerformanceSummary(DEFAULT_CUSTOMER_PERFORMANCE_SUMMARY);
        setCustomerPerformanceError(customerPerformanceResult.reason?.message || 'Laporan performa customer gagal dimuat.');
      }

      if (utilizationResult.status === 'fulfilled') {
        setUtilizationRows(Array.isArray(utilizationResult.value) ? utilizationResult.value : []);
      } else {
        setUtilizationRows([]);
        setUtilizationError(utilizationResult.reason?.message || 'Laporan utilisasi gagal dimuat.');
      }

      if (driverPerformanceResult.status === 'fulfilled') {
        setDriverPerformanceRows(Array.isArray(driverPerformanceResult.value?.rows) ? driverPerformanceResult.value.rows : []);
      } else {
        setDriverPerformanceRows([]);
        setDriverPerformanceError(driverPerformanceResult.reason?.message || 'Laporan performa sopir gagal dimuat.');
      }

      if (repoResult.status === 'fulfilled') {
        setRepoRows(Array.isArray(repoResult.value?.rows) ? repoResult.value.rows : []);
      } else {
        setRepoRows([]);
        setRepoError(repoResult.reason?.message || 'Laporan titipan repo gagal dimuat.');
      }
    }).finally(() => {
      if (!active) return;
      setRevenueLoading(false);
      setSalesPerformanceLoading(false);
      setCustomerPerformanceLoading(false);
      setUtilizationLoading(false);
      setDriverPerformanceLoading(false);
      setRepoLoading(false);
    });

    return () => {
      active = false;
    };
  }, [activePeriodKey, isFinanceOnly, month, reportSourceParams, year]);

  const masterTruckRows = archive.masters?.trucks;
  const masterDriverRows = archive.masters?.drivers;
  const revenueTruckRows = useMemo(() => buildRevenueTruckRows(masterTruckRows || [], revenueRows), [masterTruckRows, revenueRows]);
  const averageRevenuePerTrip = revenueSummary.totalTrips ? revenueSummary.totalRevenue / revenueSummary.totalTrips : 0;
  const averageRevenuePerSales = salesPerformanceSummary.activeSales
    ? salesPerformanceSummary.totalRevenue / salesPerformanceSummary.activeSales
    : 0;
  const averageRevenuePerCustomer = customerPerformanceSummary.activeCustomers
    ? customerPerformanceSummary.totalRevenue / customerPerformanceSummary.activeCustomers
    : 0;
  const customerCollectionPercent = Number(customerPerformanceSummary.collectionRate || 0) * 100;
  const utilizationSourceRows = utilizationRows.length ? utilizationRows : revenueRows;
  const holidaysByDate = useMemo(() => buildHolidayMap(publicHolidays), [publicHolidays]);
  const utilizationSummary = useMemo(
    () => buildTruckDayUtilizationSummary(masterTruckRows || [], utilizationSourceRows, month, year),
    [masterTruckRows, month, utilizationSourceRows, year],
  );
  const fleetUtilizationSummary = useMemo(
    () => buildTruckDayUtilizationSummary(
      masterTruckRows || [],
      utilizationSourceRows,
      month,
      year,
      new Date(),
      { includeUnavailable: true },
    ),
    [masterTruckRows, month, utilizationSourceRows, year],
  );
  const averageUsedTrucksPerDay = utilizationSummary.period.days
    ? utilizationSummary.realizedTruckDays / utilizationSummary.period.days
    : 0;
  const utilizationPeriodLabel = formatUtilizationPeriod(utilizationSummary.period, activeMonthLabel, year);
  const utilizationRowsWithTarget = utilizationTableMode === 'fleet'
    ? fleetUtilizationSummary.rows
    : utilizationSummary.rows;
  const activeUtilizationPivot = useMemo(() => {
    const trucks = (masterTruckRows || []).filter(isActiveTruck);
    return buildMonthlyUtilizationPivot(
      trucks,
      filterUtilizationRowsByTrucks(trucks, utilizationSourceRows),
      month,
      year,
      holidaysByDate,
    );
  }, [holidaysByDate, masterTruckRows, month, utilizationSourceRows, year]);
  const fleetUtilizationPivot = useMemo(() => {
    const trucks = (masterTruckRows || []).filter(isFleetTruck);
    return buildMonthlyUtilizationPivot(
      trucks,
      filterUtilizationRowsByTrucks(trucks, utilizationSourceRows),
      month,
      year,
      holidaysByDate,
    );
  }, [holidaysByDate, masterTruckRows, month, utilizationSourceRows, year]);
  const customerUtilizationPivot = useMemo(
    () => buildMonthlyCustomerTruckPivot(utilizationSourceRows, month, year, holidaysByDate, masterTruckRows || []),
    [holidaysByDate, masterTruckRows, month, utilizationSourceRows, year],
  );
  const utilizationNotesByKey = useMemo(() => {
    const map = new Map();
    utilizationNotes.forEach((note) => {
      map.set(utilizationNoteKey(note.resourceId, note.date), note);
    });
    return map;
  }, [utilizationNotes]);
  const driverUtilizationPivot = useMemo(
    () => buildMonthlyDriverUtilizationPivot(masterDriverRows || [], utilizationSourceRows, month, year, holidaysByDate),
    [holidaysByDate, masterDriverRows, month, utilizationSourceRows, year],
  );
  const driverRows = useMemo(
    () => buildDriverPerformanceRows(masterDriverRows || [], driverPerformanceRows),
    [masterDriverRows, driverPerformanceRows],
  );
  const driverSummary = useMemo(() => ({
    totalTrips: driverRows.reduce((total, driver) => total + driver.totalTrips, 0),
    totalDriverCommission: driverRows.reduce((total, driver) => total + Number(driver.totalDriverCommission || 0), 0),
    paidDriverCommission: driverRows.reduce((total, driver) => total + Number(driver.paidDriverCommission || 0), 0),
    unpaidDriverCommission: driverRows.reduce((total, driver) => total + Number(driver.unpaidDriverCommission || 0), 0),
    activeDrivers: driverRows.filter((driver) => driver.totalTrips > 0).length,
    totalDrivers: driverRows.length,
    averageTripsPerActiveDriver: driverRows.filter((driver) => driver.totalTrips > 0).length
      ? driverRows.reduce((total, driver) => total + driver.totalTrips, 0) / driverRows.filter((driver) => driver.totalTrips > 0).length
      : 0,
  }), [driverRows]);
  const repoMonitoringRows = useMemo(() => buildRepoMonitoringRows(repoRows), [repoRows]);
  const masterReportSections = useMemo(() => buildMasterReportSections(archive.masters || {}), [archive.masters]);
  const reportHeader = getReportHeader(selectedReport);

  async function handleSaveUtilizationNote(payload) {
    try {
      setUtilizationNoteSaving(true);
      const saved = await saveUtilizationNote(payload);
      setUtilizationNotes((current) => {
        const key = utilizationNoteKey(saved.resourceId, saved.date);
        const withoutCurrent = current.filter((note) => utilizationNoteKey(note.resourceId, note.date) !== key);
        return [...withoutCurrent, saved];
      });
      setUtilizationNoteSuggestions((current) => {
        const label = String(saved.reasonLabel || '').trim();
        if (!label) return current;
        const withoutCurrent = current.filter((item) => String(item.label || '').toUpperCase() !== label.toUpperCase());
        return [{ label, usageCount: 1 }, ...withoutCurrent].slice(0, 20);
      });
      notify({ title: 'Catatan utilisasi disimpan', message: `${saved.resourceLabel} ${formatDate(saved.date)}: ${saved.reasonLabel}` });
      return saved;
    } catch (requestError) {
      notify({ type: 'error', title: 'Catatan gagal disimpan', message: requestError.message });
      throw requestError;
    } finally {
      setUtilizationNoteSaving(false);
    }
  }

  async function handleDeleteUtilizationNote(note) {
    if (!note?.id) return;
    try {
      setUtilizationNoteSaving(true);
      await deleteUtilizationNote(note.id);
      setUtilizationNotes((current) => current.filter((item) => item.id !== note.id));
      notify({ title: 'Catatan utilisasi dihapus', message: `${note.resourceLabel} ${formatDate(note.date)}` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Catatan gagal dihapus', message: requestError.message });
      throw requestError;
    } finally {
      setUtilizationNoteSaving(false);
    }
  }

  // Filter umur piutang di tab Outstanding dilakukan di sisi frontend -- datanya sudah lengkap
  // sekali fetch (tidak dipaginasi backend), jadi tidak perlu bolak-balik ke server tiap ganti
  // ambang batas.
  const customerPerformanceBaseRows = customerDetailView === 'outstanding' && outstandingMinOverdueDays
    ? customerPerformanceRows.filter((row) => Number(row.oldestOverdueDays || 0) >= outstandingMinOverdueDays)
    : customerPerformanceRows;
  // Backend mengurutkan rows berdasarkan outstanding terbesar dulu (relevan untuk tab Outstanding),
  // jadi tab Revenue perlu diurutkan ulang di sini supaya customer dengan revenue terbanyak tampil
  // di baris paling atas.
  const visibleCustomerPerformanceRows = customerDetailView === 'revenue'
    ? [...customerPerformanceBaseRows].sort((left, right) => Number(right.totalRevenue || 0) - Number(left.totalRevenue || 0))
    : customerPerformanceBaseRows;
  const customerPerformanceTotalPages = Math.max(1, Math.ceil(visibleCustomerPerformanceRows.length / CUSTOMER_PERFORMANCE_PAGE_SIZE));
  const safeCustomerPerformancePage = Math.min(customerPerformancePage, customerPerformanceTotalPages);
  const customerPerformanceStartIndex = visibleCustomerPerformanceRows.length
    ? (safeCustomerPerformancePage - 1) * CUSTOMER_PERFORMANCE_PAGE_SIZE
    : 0;
  const customerPerformanceEndIndex = Math.min(customerPerformanceStartIndex + CUSTOMER_PERFORMANCE_PAGE_SIZE, visibleCustomerPerformanceRows.length);
  const paginatedCustomerPerformanceRows = visibleCustomerPerformanceRows.slice(customerPerformanceStartIndex, customerPerformanceEndIndex);

  function openOutstandingBucketDetail(customer, bucketLabel, agingBucket) {
    setOutstandingBucketDetail({ customer, bucketLabel, agingBucket });
    setOutstandingBucketRows([]);
    setOutstandingBucketError('');
    setOutstandingBucketLoading(true);
    fetchFinanceOutstanding({ query: customer, agingBucket, pageSize: 100 })
      .then((result) => setOutstandingBucketRows((result?.rows || []).filter((row) => row.customer === customer)))
      .catch((err) => setOutstandingBucketError(err.message || 'Rincian SO gagal dimuat.'))
      .finally(() => setOutstandingBucketLoading(false));
  }

  function closeOutstandingBucketDetail() {
    setOutstandingBucketDetail(null);
    setOutstandingBucketRows([]);
    setOutstandingBucketError('');
  }

  return (
    <div className="page reports-page">
      <PageHeader
        eyebrow="Laporan"
        title={reportHeader.title}
        description={reportHeader.description}
      />

      {selectedReport !== 'master' ? (
      <section className="mb-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_14rem] md:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
            Bulan
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {MONTHS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
            Tahun
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {yearOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
            Sumber Data
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
              value={dataSource}
              onChange={(event) => setDataSource(event.target.value)}
            >
              {DATA_SOURCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:min-w-56">
            <span className="block text-[11px] font-semibold uppercase text-slate-500">Periode aktif</span>
            <strong className="text-sm text-slate-900">{activeMonthLabel} {year}</strong>
          </div>
        </div>
      </section>
      ) : (
      <section className="mb-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <span className="block text-[11px] font-semibold uppercase text-slate-500">Mode Viewer</span>
        <strong className="text-sm text-slate-900">Master data ditampilkan sebagai laporan read-only tanpa tombol input, edit, atau hapus.</strong>
      </section>
      )}

      <section className={`mb-4 grid gap-3 ${isFinanceOnly ? '' : 'md:grid-cols-2 xl:grid-cols-5'}`}>
        <SummaryToggleCard
          icon={BarChart3}
          label="Revenue Performance"
          value={formatCurrency(revenueSummary.totalRevenue)}
          helper="Tidak termasuk reimbursement / jasa lainnya"
          secondaryLabel="AVG Revenue/Trip"
          secondaryValue={formatCurrency(averageRevenuePerTrip)}
          tone="emerald"
          expanded={selectedReport === 'revenue'}
          onClick={() => selectReport('revenue')}
          onOpenStatistics={() => setStatisticsModalReport('revenue')}
        />
        {!isFinanceOnly ? (
          <>
            <SummaryToggleCard
              icon={Truck}
              label="Utilisasi Unit Aktif"
              value={`${utilizationSummary.utilizationPercent.toFixed(1)}%`}
              helper={utilizationSummary.period.days ? `Periode ${utilizationPeriodLabel}` : utilizationPeriodLabel}
              secondaryLabel="AVG Truck Terpakai/Hari"
              secondaryValue={`${formatDecimal(averageUsedTrucksPerDay)} / ${utilizationSummary.activeTruckCount} truck`}
              tertiaryLabel="Utilisasi Seluruh Armada"
              tertiaryValue={`${fleetUtilizationSummary.utilizationPercent.toFixed(1)}% / ${fleetUtilizationSummary.activeTruckCount} unit`}
              tone="sky"
              expanded={selectedReport === 'utilization'}
              onClick={() => selectReport('utilization')}
              onOpenStatistics={() => setStatisticsModalReport('utilization')}
            />
            <SummaryToggleCard
              icon={Users}
              label="Driver Performance"
              value={`${driverSummary.totalTrips} Trip`}
              helper={`${driverSummary.activeDrivers} sopir menjalankan trip`}
              secondaryLabel="Rata-rata Trip/Sopir"
              secondaryValue={`${formatDecimal(driverSummary.averageTripsPerActiveDriver)} Trip`}
              tertiaryLabel="Komisi Sopir"
              tertiaryValue={formatCurrency(driverSummary.totalDriverCommission)}
              tone="amber"
              expanded={selectedReport === 'driver'}
              onClick={() => selectReport('driver')}
            />
            <SummaryToggleCard
              icon={Users}
              label="Customer Performance"
              value={formatCurrency(customerPerformanceSummary.totalRevenue)}
              helper={`${customerPerformanceSummary.activeCustomers} aktif / ${customerPerformanceSummary.outstandingCustomers} outstanding`}
              secondaryLabel="AVG Revenue/Customer"
              secondaryValue={formatCurrency(averageRevenuePerCustomer)}
              tertiaryLabel="Collection"
              tertiaryValue={`${customerCollectionPercent.toFixed(1)}%`}
              tone="rose"
              expanded={selectedReport === 'customer'}
              onClick={() => selectReport('customer')}
              onOpenStatistics={() => setStatisticsModalReport('customer')}
            />
            <SummaryToggleCard
              icon={Users}
              label="Sales Performance"
              value={formatCurrency(salesPerformanceSummary.totalRevenue)}
              helper={`${salesPerformanceSummary.totalCustomers} customer / ${salesPerformanceSummary.totalVolume} volume`}
              secondaryLabel="AVG Revenue/Sales"
              secondaryValue={formatCurrency(averageRevenuePerSales)}
              tertiaryLabel="Sales Aktif"
              tertiaryValue={`${salesPerformanceSummary.activeSales} Sales`}
              tone="slate"
              expanded={selectedReport === 'sales'}
              onClick={() => selectReport('sales')}
              onOpenStatistics={() => setStatisticsModalReport('sales')}
            />
          </>
        ) : null}
      </section>

      <MonthlyComparisonModal
        error={monthlyComparisonError}
        loading={monthlyComparisonLoading}
        onClose={() => setStatisticsModalReport(null)}
        open={Boolean(statisticsModalReport)}
        rows={monthlyComparisonRows}
        selectedReport={statisticsModalReport}
        year={year}
      />

      {selectedReport === 'master' ? (
        <section className="grid gap-3 xl:grid-cols-2">
          {archive.loading ? <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm xl:col-span-2">Memuat laporan master data...</div> : null}
          {archive.error ? <div className="rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-700 shadow-sm xl:col-span-2">{archive.error}</div> : null}
          {!archive.loading && masterReportSections.map((section) => (
            <MasterReportSection key={section.key} section={section} />
          ))}
        </section>
      ) : null}

      {selectedReport === 'revenue' ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-bold text-slate-950">Detail Revenue Truck</h2>
          </div>

          {revenueLoading ? <div className="p-4 text-sm text-slate-500">Memuat laporan revenue...</div> : null}
          {!revenueLoading && revenueError ? <div className="p-4 text-sm text-red-600">{revenueError}</div> : null}

          {!revenueLoading && !revenueError && revenueTruckRows.length ? (
            <DetailTable
              columns={[
                { label: 'No' },
                { label: 'Plat' },
                { label: 'Sumber' },
                { label: 'Jumlah Trip', align: 'right' },
                { label: 'Revenue', align: 'right' },
              ]}
              rows={revenueTruckRows}
              rowRenderer={(truck, index) => (
                <tr key={truck.plateNumber} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                  <td className="w-16 px-3 py-2 font-semibold text-slate-500" data-label="No">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950" data-label="Plat">{truck.plateNumber}</td>
                  <td className="px-3 py-2 text-slate-600" data-label="Sumber">{truck.sourceLabel}</td>
                  <td className="px-3 py-2 text-right" data-label="Jumlah Trip">
                    <span className="inline-flex min-w-8 justify-center rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                      {truck.totalTrips}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-950" data-label="Revenue">{formatCurrency(truck.revenue)}</td>
                </tr>
              )}
            />
          ) : null}

          {!revenueLoading && !revenueError && !revenueTruckRows.length ? (
            <div className="p-6 text-center">
              <h3 className="text-sm font-bold text-slate-900">Belum ada data truck</h3>
              <p className="mt-1 text-xs text-slate-500">Data truck belum tersedia pada {activeMonthLabel} {year}.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedReport === 'sales' ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-bold text-slate-950">Detail Sales Performance</h2>
            <p className="text-xs text-slate-500">Customer unik, volume completed container, dan revenue jasa angkut berdasarkan Sales di master customer.</p>
          </div>

          {salesPerformanceLoading ? <div className="p-4 text-sm text-slate-500">Memuat laporan performa sales...</div> : null}
          {!salesPerformanceLoading && salesPerformanceError ? <div className="p-4 text-sm text-red-600">{salesPerformanceError}</div> : null}

          {!salesPerformanceLoading && !salesPerformanceError && salesPerformanceRows.length ? (
            <DetailTable
              columns={[
                { label: 'No' },
                { label: 'Sales' },
                { label: 'Customer', align: 'right' },
                { label: 'Volume', align: 'right' },
                { label: '40FT', align: 'right' },
                { label: '20FT', align: 'right' },
                { label: 'Revenue', align: 'right' },
              ]}
              rows={salesPerformanceRows}
              rowRenderer={(sales, index) => {
                const topCustomers = (sales.customers || [])
                  .slice(0, 3)
                  .map((customer) => `${customer.customer} (${customer.volume})`)
                  .join(', ');
                return (
                  <tr key={sales.salesName || index} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                    <td className="w-16 px-3 py-2 font-semibold text-slate-500" data-label="No">{index + 1}</td>
                    <td className="px-3 py-2" data-label="Sales">
                      <strong className="block text-slate-950">{sales.salesName || 'Tanpa Sales'}</strong>
                      <span className="text-[11px] text-slate-500">{topCustomers || 'Belum ada customer'}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800" data-label="Customer">{sales.customerCount || 0}</td>
                    <td className="px-3 py-2 text-right" data-label="Volume">
                      <span className="inline-flex min-w-8 justify-center rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                        {sales.totalVolume || 0}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800" data-label="40FT">{sales.container40ft || 0}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800" data-label="20FT">{sales.container20ft || 0}</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-950" data-label="Revenue">{formatCurrency(sales.totalRevenue)}</td>
                  </tr>
                );
              }}
            />
          ) : null}

          {!salesPerformanceLoading && !salesPerformanceError && !salesPerformanceRows.length ? (
            <div className="p-6 text-center">
              <h3 className="text-sm font-bold text-slate-900">Belum ada data sales</h3>
              <p className="mt-1 text-xs text-slate-500">Belum ada completed container untuk Sales Performance pada {activeMonthLabel} {year}.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedReport === 'customer' ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-bold text-slate-950">Detail Customer Performance</h2>
            <p className="text-xs text-slate-500">
              {customerDetailView === 'revenue'
                ? `Volume dan revenue customer pada periode ${activeMonthLabel} ${year}.`
                : outstandingMinOverdueDays
                  ? `Customer dengan piutang yang sudah menunggak minimal ${outstandingMinOverdueDays} hari -- bisa berasal dari invoice beberapa bulan sebelumnya, bukan cuma periode yang sedang dipilih.`
                  : 'Sisa outstanding customer saat ini -- bisa berasal dari invoice beberapa bulan sebelumnya, bukan cuma periode yang sedang dipilih.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/70 p-1">
                <button
                  type="button"
                  className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${customerDetailView === 'revenue' ? 'border-slate-200 bg-white text-slate-950 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
                  onClick={() => setCustomerDetailView('revenue')}
                >
                  Revenue
                </button>
                <button
                  type="button"
                  className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${customerDetailView === 'outstanding' ? 'border-slate-200 bg-white text-slate-950 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
                  onClick={() => setCustomerDetailView('outstanding')}
                >
                  Outstanding
                </button>
              </div>
              {customerDetailView === 'outstanding' ? (
                <div className="inline-flex items-center gap-2 border-l border-slate-200 pl-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Umur Piutang</span>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/70 p-1">
                    <button
                      type="button"
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-bold transition ${outstandingMinOverdueDays === null ? 'border-slate-200 bg-white text-slate-950 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
                      onClick={() => setOutstandingMinOverdueDays(null)}
                    >
                      Semua
                    </button>
                    {[14, 30, 60].map((days) => (
                      <button
                        key={days}
                        type="button"
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-bold transition ${outstandingMinOverdueDays === days ? 'border-slate-200 bg-white text-slate-950 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
                        onClick={() => setOutstandingMinOverdueDays(days)}
                        title={`Minimal menunggak ${days} hari`}
                      >
                        {days}+ Hari
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {customerPerformanceLoading ? <div className="p-4 text-sm text-slate-500">Memuat laporan performa customer...</div> : null}
          {!customerPerformanceLoading && customerPerformanceError ? <div className="p-4 text-sm text-red-600">{customerPerformanceError}</div> : null}

          {!customerPerformanceLoading && !customerPerformanceError && visibleCustomerPerformanceRows.length ? (
            <>
              <DetailTable
                columns={
                  customerDetailView === 'revenue'
                    ? [
                        { label: 'No' },
                        { label: 'Customer' },
                        { label: 'Volume', align: 'right' },
                        { label: '20FT', align: 'right' },
                        { label: '40FT', align: 'right' },
                        { label: 'SO Selesai', align: 'right' },
                        { label: 'Revenue', align: 'right' },
                        { label: 'Last Order' },
                      ]
                    : [
                        { label: 'No' },
                        { label: 'Customer' },
                        { label: 'Total Outstanding', align: 'right' },
                        { label: 'Current', align: 'right' },
                        { label: '1-15 Hari', align: 'right' },
                        { label: '16-30 Hari', align: 'right' },
                        { label: '31-60 Hari', align: 'right' },
                        { label: '>60 Hari', align: 'right' },
                        { label: 'Collection', align: 'right' },
                      ]
                }
                rows={paginatedCustomerPerformanceRows}
                rowRenderer={(customer, index) => {
                  const salesNames = Array.isArray(customer.salesNames) && customer.salesNames.length
                    ? customer.salesNames.slice(0, 3).join(', ')
                    : 'Tanpa sales periode ini';
                  const rowNumber = customerPerformanceStartIndex + index + 1;
                  const collectionPercent = Number(customer.collectionPercent || 0);
                  const overdue1To15Amount = Number(customer.overdue1To15Amount || 0);
                  const overdue16To30Amount = Number(customer.overdue16To30Amount || Math.max(Number(customer.overdue1To30Amount || 0) - overdue1To15Amount, 0));
                  const legacy60PlusAmount = Number(customer.overdue61To90Amount || 0) + Number(customer.overdue90PlusAmount || 0);
                  const overdue60PlusAmount = Number(customer.overdue60PlusAmount || 0) || legacy60PlusAmount;
                  return (
                    <tr key={customer.customer || index} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                      <td className="w-16 px-3 py-2 font-semibold text-slate-500" data-label="No">{rowNumber}</td>
                      <td className="px-3 py-2" data-label="Customer">
                        <strong className="block text-slate-950">{customer.customer || 'Tanpa Customer'}</strong>
                        <span className="text-[11px] text-slate-500">{salesNames}</span>
                      </td>
                      {customerDetailView === 'revenue' ? (
                        <>
                          <td className="px-3 py-2 text-right" data-label="Volume">
                            <span className="inline-flex min-w-8 justify-center rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                              {customer.totalVolume || 0}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800" data-label="20FT">{customer.container20ft || 0}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800" data-label="40FT">{customer.container40ft || 0}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800" data-label="SO Selesai">{customer.completedOrders || 0}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-950" data-label="Revenue">{formatCurrency(customer.totalRevenue)}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700" data-label="Last Order">{formatDate(customer.lastOrderDate)}</td>
                        </>
                      ) : (
                        <>
                          <OutstandingBucketCell
                            amount={customer.totalOutstandingAmount}
                            label="Total Outstanding"
                            agingBucket=""
                            toneClassName="font-bold text-slate-950"
                            customer={customer.customer}
                            onOpenDetail={openOutstandingBucketDetail}
                          />
                          <OutstandingBucketCell
                            amount={customer.currentAmount}
                            label="Current"
                            agingBucket="current"
                            toneClassName="text-emerald-700"
                            customer={customer.customer}
                            onOpenDetail={openOutstandingBucketDetail}
                          />
                          <OutstandingBucketCell
                            amount={overdue1To15Amount}
                            label="1-15 Hari"
                            agingBucket="overdue_1_15"
                            toneClassName="text-amber-700"
                            customer={customer.customer}
                            onOpenDetail={openOutstandingBucketDetail}
                          />
                          <OutstandingBucketCell
                            amount={overdue16To30Amount}
                            label="16-30 Hari"
                            agingBucket="overdue_16_30"
                            toneClassName="text-orange-700"
                            customer={customer.customer}
                            onOpenDetail={openOutstandingBucketDetail}
                          />
                          <OutstandingBucketCell
                            amount={customer.overdue31To60Amount}
                            label="31-60 Hari"
                            agingBucket="overdue_31_60"
                            toneClassName="text-orange-700"
                            customer={customer.customer}
                            onOpenDetail={openOutstandingBucketDetail}
                          />
                          <OutstandingBucketCell
                            amount={overdue60PlusAmount}
                            label=">60 Hari"
                            agingBucket="overdue_60_plus"
                            toneClassName="font-bold text-rose-800"
                            customer={customer.customer}
                            onOpenDetail={openOutstandingBucketDetail}
                          />
                          <td className="px-3 py-2 text-right font-semibold text-slate-800" data-label="Collection">{collectionPercent.toFixed(1)}%</td>
                        </>
                      )}
                    </tr>
                  );
                }}
              />
              <div className="flex flex-col gap-2 border-t border-slate-100 px-3 py-3 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
                <span>
                  Menampilkan {customerPerformanceStartIndex + 1}-{customerPerformanceEndIndex} dari {visibleCustomerPerformanceRows.length} customer
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setCustomerPerformancePage((current) => Math.max(1, current - 1))}
                    disabled={safeCustomerPerformancePage <= 1}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Sebelumnya
                  </button>
                  <span className="min-w-24 text-center font-semibold text-slate-600">
                    {safeCustomerPerformancePage} / {customerPerformanceTotalPages}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setCustomerPerformancePage((current) => Math.min(customerPerformanceTotalPages, current + 1))}
                    disabled={safeCustomerPerformancePage >= customerPerformanceTotalPages}
                  >
                    Berikutnya
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {!customerPerformanceLoading && !customerPerformanceError && !visibleCustomerPerformanceRows.length ? (
            <div className="p-6 text-center">
              <h3 className="text-sm font-bold text-slate-900">Belum ada data customer</h3>
              <p className="mt-1 text-xs text-slate-500">
                {customerDetailView === 'revenue'
                  ? `Belum ada completed container atau outstanding customer pada ${activeMonthLabel} ${year}.`
                  : outstandingMinOverdueDays
                    ? `Tidak ada customer dengan piutang menunggak minimal ${outstandingMinOverdueDays} hari.`
                    : 'Belum ada customer dengan outstanding saat ini.'}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <OutstandingBucketDetailModal
        detail={outstandingBucketDetail}
        rows={outstandingBucketRows}
        loading={outstandingBucketLoading}
        error={outstandingBucketError}
        onClose={closeOutstandingBucketDetail}
      />

      {selectedReport === 'utilization' ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-950">Utilisasi Truck</h2>
              <p className="text-xs text-slate-500">
                {utilizationSummary.period.days
                  ? utilizationTableMode === 'fleet'
                    ? `Periode ${utilizationPeriodLabel}. Menampilkan ${fleetUtilizationSummary.activeTruckCount} unit, termasuk maintenance dan tidak aktif.`
                    : `Periode ${utilizationPeriodLabel}. Menampilkan ${utilizationSummary.activeTruckCount} unit aktif.`
                  : utilizationPeriodLabel}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 min-w-[210px] rounded-md border border-sky-300 bg-white px-3 text-xs font-black text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                value={utilizationTableMode}
                onChange={(event) => setUtilizationTableMode(event.target.value)}
                aria-label="Pilih basis tabel utilisasi"
              >
                <option value="active">Tabel Asset Aktif</option>
                <option value="fleet">Tabel Semua Asset</option>
              </select>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800 hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setCustomerUtilizationModalOpen(true)}
                disabled={utilizationLoading || Boolean(utilizationError) || !customerUtilizationPivot.customers.length}
              >
                <Users size={15} />
                View Per Customer
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800 hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setUtilizationPivotMode(utilizationTableMode)}
                disabled={utilizationLoading || Boolean(utilizationError)}
              >
                <Maximize2 size={15} />
                Lihat Pivot Bulanan
              </button>
            </div>
          </div>

          <div className="grid border-b border-slate-200 bg-white sm:grid-cols-2">
            <div className="border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
              <p className="text-[11px] font-bold uppercase text-sky-700">Utilisasi Unit Aktif</p>
              <div className="mt-1 flex items-baseline gap-2">
                <strong className="text-xl text-slate-950">{utilizationSummary.utilizationPercent.toFixed(1)}%</strong>
                <span className="text-xs text-slate-500">{utilizationSummary.activeTruckCount} unit aktif</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Maintenance dan unit tidak aktif tidak masuk perhitungan.</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-bold uppercase text-amber-700">Utilisasi Seluruh Armada</p>
              <div className="mt-1 flex items-baseline gap-2">
                <strong className="text-xl text-slate-950">{fleetUtilizationSummary.utilizationPercent.toFixed(1)}%</strong>
                <span className="text-xs text-slate-500">{fleetUtilizationSummary.activeTruckCount} total unit</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Termasuk unit maintenance dan tidak aktif; unit arsip tidak dihitung.</p>
            </div>
          </div>

          {utilizationLoading ? <div className="p-4 text-sm text-slate-500">Memuat laporan utilisasi...</div> : null}
          {!utilizationLoading && utilizationError ? <div className="p-4 text-sm text-red-600">{utilizationError}</div> : null}

          {!utilizationLoading && !utilizationError && utilizationRowsWithTarget.length ? (
            <DetailTable
              columns={[
                { label: 'No' },
                { label: 'Plat' },
                { label: 'No Lambung' },
                { label: 'Jumlah Trip', align: 'right' },
                { label: 'Hari Periode', align: 'right' },
                { label: 'Utilisasi Truck', align: 'right' },
                { label: 'Terakhir Selesai' },
              ]}
              rows={utilizationRowsWithTarget}
              rowRenderer={(truck, index) => (
                <tr key={truck.plateNumber} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                  <td className="w-16 px-3 py-2 font-semibold text-slate-500" data-label="No">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950" data-label="Plat">{truck.plateNumber}</td>
                  <td className="px-3 py-2 font-semibold text-slate-700" data-label="No Lambung">{formatTruckUnitCode(truck.unitCode)}</td>
                  <td className="px-3 py-2 text-right" data-label="Jumlah Trip">
                    <span className="inline-flex min-w-8 justify-center rounded-md bg-sky-50 px-2 py-0.5 font-bold text-sky-700">
                      {truck.totalTrips}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700" data-label="Hari Periode">{truck.targetTruckDays}</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-950" data-label="Utilisasi Truck">{truck.utilizationPercent.toFixed(1)}%</td>
                  <td className="px-3 py-2" data-label="Terakhir Selesai">{formatDate(truck.lastCompletedAt)}</td>
                </tr>
              )}
            />
          ) : null}

          {!utilizationLoading && !utilizationError && !utilizationRowsWithTarget.length ? (
            <div className="p-6 text-center">
              <h3 className="text-sm font-bold text-slate-900">Belum ada trip selesai</h3>
              <p className="mt-1 text-xs text-slate-500">Tidak ada utilisasi truck pada {activeMonthLabel} {year}.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <MonthlyUtilizationModal
        open={Boolean(utilizationPivotMode)}
        onClose={() => setUtilizationPivotMode('')}
        pivot={utilizationPivotMode === 'fleet' ? fleetUtilizationPivot : activeUtilizationPivot}
        activeMonthLabel={activeMonthLabel}
        year={year}
        reportLabel={utilizationPivotMode === 'fleet' ? 'Utilisasi Seluruh Armada' : 'Utilisasi Unit Aktif'}
        reportMode={utilizationPivotMode || 'active'}
        onReportModeChange={setUtilizationPivotMode}
        utilizationNotesByKey={utilizationNotesByKey}
        utilizationNoteSuggestions={utilizationNoteSuggestions}
        canEditNotes={canEditUtilizationNotes}
        noteSaving={utilizationNoteSaving}
        onSaveNote={handleSaveUtilizationNote}
        onDeleteNote={handleDeleteUtilizationNote}
      />

      <CustomerMonthlyUtilizationModal
        open={customerUtilizationModalOpen}
        onClose={() => setCustomerUtilizationModalOpen(false)}
        pivot={customerUtilizationPivot}
        activeMonthLabel={activeMonthLabel}
        year={year}
      />

      {selectedReport === 'repo' ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-bold text-slate-950">Monitoring Container Titip</h2>
          </div>

          {repoLoading ? <div className="p-4 text-sm text-slate-500">Memuat titipan repo...</div> : null}
          {!repoLoading && repoError ? <div className="p-4 text-sm text-red-600">{repoError}</div> : null}

          {!repoLoading && !repoError && repoMonitoringRows.length ? (
            <DetailTable
              columns={[
                { label: 'No' },
                { label: 'SO / Container' },
                { label: 'Customer' },
                { label: 'Depo Penitipan' },
                { label: 'Kondisi' },
                { label: 'Tanggal Titip' },
                { label: 'Usia', align: 'right' },
                { label: 'Dicatat Oleh' },
                { label: 'Alasan' },
              ]}
              rows={repoMonitoringRows}
              rowRenderer={(row, index) => (
                <tr key={row.id || `${row.soNumber}-${row.containerNumber}`} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                  <td className="w-16 px-3 py-2 font-semibold text-slate-500" data-label="No">{index + 1}</td>
                  <td className="px-3 py-2" data-label="SO / Container">
                    <strong className="block text-slate-950">{row.soNumber || '-'}</strong>
                    <span className="text-[11px] text-slate-500">{row.containerNumber || 'Container belum diisi'} - {row.size || '-'}</span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-800" data-label="Customer">{row.customer || '-'}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950" data-label="Depo Penitipan">{row.repoLocation || '-'}</td>
                  <td className="px-3 py-2" data-label="Kondisi">{row.repoContainerCondition === 'loaded' ? 'Isi' : row.repoContainerCondition === 'empty' ? 'Kosong' : '-'}</td>
                  <td className="px-3 py-2" data-label="Tanggal Titip">{formatDate(row.storedDate)}</td>
                  <td className="px-3 py-2 text-right" data-label="Usia">
                    <span className={`inline-flex min-w-14 justify-center rounded-md px-2 py-0.5 font-bold ${
                      row.ageDays >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {row.ageDays} hari
                    </span>
                  </td>
                  <td className="px-3 py-2" data-label="Dicatat Oleh">{row.repoCreatedByName || '-'}</td>
                  <td className="max-w-xs px-3 py-2" data-label="Alasan">
                    <span className="line-clamp-2">{row.repoReason || row.repoNotes || '-'}</span>
                  </td>
                </tr>
              )}
            />
          ) : null}

          {!repoLoading && !repoError && !repoMonitoringRows.length ? (
            <div className="p-6 text-center">
              <h3 className="text-sm font-bold text-slate-900">Belum ada container titip</h3>
              <p className="mt-1 text-xs text-slate-500">Tidak ada container yang sedang dititipkan.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedReport === 'driver' ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-950">Performa Sopir</h2>
              <p className="text-xs text-slate-500">Jumlah trip dan revenue perusahaan yang tercatat untuk sopir.</p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-800 hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setDriverUtilizationModalOpen(true)}
              disabled={driverPerformanceLoading || utilizationLoading || Boolean(driverPerformanceError || utilizationError)}
            >
              <Maximize2 size={15} />
              Lihat Utilisasi Bulanan
            </button>
          </div>

          {driverPerformanceLoading ? <div className="p-4 text-sm text-slate-500">Memuat laporan performa sopir...</div> : null}
          {!driverPerformanceLoading && driverPerformanceError ? <div className="p-4 text-sm text-red-600">{driverPerformanceError}</div> : null}

          {!driverPerformanceLoading && !driverPerformanceError && driverRows.length ? (
            <DetailTable
              columns={[
                { label: 'No' },
                { label: 'Sopir' },
                { label: 'Jumlah Trip', align: 'right' },
                { label: 'Total Revenue', align: 'right' },
              ]}
              rows={driverRows}
              rowRenderer={(driver, index) => (
                <tr key={driver.driverId || driver.driver} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                  <td className="w-16 px-3 py-2 font-semibold text-slate-500" data-label="No">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950" data-label="Sopir">{driver.driver}</td>
                  <td className="px-3 py-2 text-right" data-label="Jumlah Trip">
                    <span className="inline-flex min-w-8 justify-center rounded-md bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                      {driver.totalTrips}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-950" data-label="Total Revenue">{formatCurrency(driver.totalRevenue)}</td>
                </tr>
              )}
            />
          ) : null}

          {!driverPerformanceLoading && !driverPerformanceError && !driverRows.length ? (
            <div className="p-6 text-center">
              <h3 className="text-sm font-bold text-slate-900">Belum ada data sopir</h3>
              <p className="mt-1 text-xs text-slate-500">Data sopir belum tersedia pada {activeMonthLabel} {year}.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <DriverMonthlyUtilizationModal
        open={driverUtilizationModalOpen}
        onClose={() => setDriverUtilizationModalOpen(false)}
        pivot={driverUtilizationPivot}
        activeMonthLabel={activeMonthLabel}
        year={year}
      />
    </div>
  );
}

export default ReportsPage;
