import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Maximize2, Save, Trash2, Truck, Users, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import { USER_ROLES, hasPermission } from '../../constants/roles';
import { useArchiveData } from '../../contexts/ArchiveDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../hooks/useFeedback';
import { buildHolidayMap, fetchIndonesiaPublicHolidays } from '../../services/reports/holidayService';
import { fetchDriverPerformanceReport, fetchMonthlyRevenueReport, fetchOperationReport } from '../../services/reports/reportService';
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

const DEFAULT_REVENUE_SUMMARY = {
  totalRevenue: 0,
  totalOrders: 0,
  totalContainers: 0,
  totalTrucks: 0,
  totalTrips: 0,
};

const DATA_SOURCE_OPTIONS = [
  { value: 'all', label: 'Semua Data' },
  { value: 'realtime', label: 'Realtime' },
  { value: 'historical', label: 'Data Lama' },
];

const DRIVER_COMMISSION_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Komisi' },
  { value: 'with_commission', label: 'Ada Komisi' },
  { value: 'without_commission', label: 'Tanpa Komisi' },
];

const DRIVER_COMMISSION_PAYMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Status Bayar' },
  { value: 'unsubmitted', label: 'Belum Diajukan' },
  { value: 'submitted', label: 'Menunggu Finance' },
  { value: 'approved', label: 'Approved Belum Paid' },
  { value: 'paid', label: 'Sudah Dibayar' },
  { value: 'unpaid', label: 'Belum Dibayar' },
];

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
  return normalizeTruckSize(row.capacity || row.containerSize || row.container_size || row.size || row.defaultSize || row.chassisSize);
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

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }

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

// eslint-disable-next-line react-refresh/only-export-components
export function buildTruckDayUtilizationSummary(masterTrucks = [], rows = [], month, year, baseDate = new Date()) {
  const period = buildUtilizationPeriod(month, year, baseDate);
  const activeTrucks = (masterTrucks || [])
    .filter(isActiveTruck)
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

  rows.forEach((row) => {
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

  const activeTruckCount = activeTrucks.length;
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

  masterTrucks.forEach((truck) => {
    const plateNumber = getTruckPlate(truck);
    if (!trucks.has(plateNumber)) {
      trucks.set(plateNumber, {
        id: getTruckId(truck) || plateNumber,
        plateNumber,
        unitCode: getTruckUnitCode(truck),
        size: getTruckSize(truck),
        driver: getDriverName(truck),
        cells: days.reduce((cells, day) => ({ ...cells, [day.key]: { count: 0, labels: [] } }), {}),
        totalTrips: 0,
      });
    }
  });

  rows.forEach((row) => {
    const dateKey = getUtilizationDateKey(row);
    if (!dayKeys.has(dateKey)) return;

    const plateNumber = getTruckPlate(row);
    if (!trucks.has(plateNumber)) {
      trucks.set(plateNumber, {
        id: getTruckId(row) || plateNumber,
        plateNumber,
        unitCode: getTruckUnitCode(row),
        size: getTruckSize(row),
        driver: getDriverName(row),
        cells: days.reduce((cells, day) => ({ ...cells, [day.key]: { count: 0, labels: [] } }), {}),
        totalTrips: 0,
      });
    }

    const truck = trucks.get(plateNumber);
    if (!truck.unitCode) truck.unitCode = getTruckUnitCode(row);
    if (!truck.size) truck.size = getTruckSize(row);
    const cell = truck.cells[dateKey];
    cell.count += 1;
    const label = compactCellLabel(row);
    if (label && !cell.labels.includes(label)) cell.labels.push(label);
    if (row.driver) truck.driver = getDriverName(row);
    truck.totalTrips += 1;
  });

  const rowsByTruck = Array.from(trucks.values()).sort((left, right) => {
    const sizeDiff = truckSizeSortKey(left.size) - truckSizeSortKey(right.size);
    if (sizeDiff !== 0) return sizeDiff;
    if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
    return left.plateNumber.localeCompare(right.plateNumber);
  });

  return {
    days,
    rows: rowsByTruck,
    totalsByDay: days.reduce((totals, day) => ({
      ...totals,
      [day.key]: rowsByTruck.reduce((total, truck) => total + truck.cells[day.key].count, 0),
    }), {}),
    grandTotal: rowsByTruck.reduce((total, truck) => total + truck.totalTrips, 0),
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildMonthlyDriverUtilizationPivot(masterDrivers = [], rows = [], month, year, holidaysByDate = {}) {
  const days = buildMonthDays(month, year, holidaysByDate);
  const dayKeys = new Set(days.map((day) => day.key));
  const drivers = new Map();

  masterDrivers.forEach((driver) => {
    const name = getDriverName(driver);
    if (!drivers.has(name)) {
      drivers.set(name, {
        driver: name,
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
    if (!drivers.has(name)) {
      drivers.set(name, {
        driver: name,
        cells: days.reduce((cells, day) => ({ ...cells, [day.key]: { count: 0, labels: [] } }), {}),
        totalTrips: 0,
      });
    }

    const driver = drivers.get(name);
    const cell = driver.cells[dateKey];
    cell.count += 1;
    const label = compactCellLabel(row);
    if (label && !cell.labels.includes(label)) cell.labels.push(label);
    driver.totalTrips += 1;
  });

  const rowsByDriver = Array.from(drivers.values()).sort((left, right) => {
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
    if (!drivers.has(name)) {
      drivers.set(name, {
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
    if (!drivers.has(name)) {
      drivers.set(name, {
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

    const driver = drivers.get(name);
    driver.totalTrips = Number(row.monthlyTrips ?? row.totalTrips ?? 0);
    driver.totalRevenue = Number(row.totalRevenue || 0);
    driver.totalDriverCommission = Number(row.totalDriverCommission || 0);
    driver.paidDriverCommission = Number(row.paidDriverCommission || 0);
    driver.unpaidDriverCommission = Number(row.unpaidDriverCommission || 0);
    driver.averageRevenuePerTrip = Number(row.averageRevenuePerTrip || (driver.totalTrips ? driver.totalRevenue / driver.totalTrips : 0));
    driver.averageCommissionPerTrip = Number(row.averageCommissionPerTrip || (driver.totalTrips ? driver.totalDriverCommission / driver.totalTrips : 0));
  });

  return Array.from(drivers.values()).sort((left, right) => {
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
  tone = 'slate',
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
  }[tone] || 'border-slate-200 bg-slate-50 text-slate-600';
  const activeClass = {
    slate: 'border-slate-300 bg-slate-100 text-slate-800',
    emerald: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    amber: 'border-amber-300 bg-amber-100 text-amber-900',
    sky: 'border-sky-300 bg-sky-100 text-sky-900',
  }[tone] || 'border-slate-300 bg-slate-100 text-slate-800';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={expanded}
      className={`flex w-full cursor-pointer items-start justify-between gap-4 rounded-md border p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${
        expanded ? activeClass : `${toneClass} hover:border-slate-300 hover:shadow-md`
      }`}
    >
      <div className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-normal text-slate-500">{label}</span>
        <strong className="mt-1 block text-2xl font-semibold leading-tight text-slate-900">{value}</strong>
        <small className="mt-1 block text-xs text-slate-500">{helper}</small>
        {secondaryLabel ? (
          <span className="mt-3 grid max-w-md gap-1 border-t border-white/70 pt-3 sm:grid-cols-[auto_1fr] sm:items-baseline sm:gap-x-3">
            <span className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{secondaryLabel}</span>
            <strong className="text-base font-semibold text-slate-900">{secondaryValue}</strong>
          </span>
        ) : null}
        {tertiaryLabel ? (
          <span className="mt-1 grid max-w-md gap-1 sm:grid-cols-[auto_1fr] sm:items-baseline sm:gap-x-3">
            <span className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{tertiaryLabel}</span>
            <strong className="text-base font-semibold text-slate-900">{tertiaryValue}</strong>
          </span>
        ) : null}
      </div>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${toneClass}`}>
        <Icon size={17} />
      </div>
    </button>
  );
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

function normalizeReportTab(tab, { revenueOnly = false } = {}) {
  if (revenueOnly) return 'revenue';
  if (tab === 'utilization' || tab === 'driver' || tab === 'revenue' || tab === 'repo' || tab === 'master') return tab;
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
      title: 'End User',
      rows: masters['end-users'] || [],
      columns: [
        { label: 'End User', value: (row) => row.name },
        { label: 'Kode', value: (row) => row.code },
        { label: 'PIC', value: (row) => row.pic },
        { label: 'Kontak', value: (row) => row.phone },
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

function PivotCell({ cell, note, canEditNote = false, onOpenNote }) {
  const hasCount = Boolean(cell?.count);
  const hasNote = Boolean(note?.reasonLabel || note?.notes);
  const title = [
    hasCount
      ? cell.labels?.length
        ? `${cell.count} trip - ${cell.labels.join(', ')}`
        : `${cell.count} trip`
      : 'Tidak ada trip',
    hasNote ? `Catatan: ${note.reasonLabel}${note.notes ? ` - ${note.notes}` : ''}` : '',
  ].filter(Boolean).join('\n');

  const content = hasCount ? (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-sky-100 px-1 text-[9px] font-black leading-none text-sky-900">
      {cell.count}
    </span>
  ) : hasNote ? (
    <span className="inline-flex h-4 min-w-6 items-center justify-center rounded-sm bg-amber-100 px-1 text-[7px] font-black leading-none text-amber-800">
      {formatUtilizationNoteCode(note)}
    </span>
  ) : (
    <span className="text-[8px] text-slate-300">-</span>
  );

  if (!hasNote && !canEditNote) return content;

  return (
    <button
      type="button"
      className={`group relative inline-grid min-h-5 min-w-7 place-items-center rounded-sm border-0 bg-transparent px-0.5 shadow-none outline-none ${hasNote ? 'ring-1 ring-amber-300' : canEditNote ? 'hover:bg-amber-50 focus-visible:ring-1 focus-visible:ring-amber-300' : ''}`}
      title={title}
      onClick={onOpenNote}
    >
      {content}
      {!hasNote && canEditNote ? (
        <span className="pointer-events-none absolute inset-0 hidden place-items-center text-[9px] font-black text-amber-700 group-hover:grid group-focus-visible:grid" aria-hidden="true">
          +
        </span>
      ) : null}
      {hasNote ? <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> : null}
    </button>
  );
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
    items.push({ type: 'truck', id: truck.plateNumber, truck, number: index + 1 });
  });

  return items;
}

export function MonthlyUtilizationModal({
  open,
  onClose,
  pivot,
  activeMonthLabel,
  year,
  utilizationNotesByKey = new Map(),
  utilizationNoteSuggestions = [],
  canEditNotes = false,
  noteSaving = false,
  onSaveNote,
  onDeleteNote,
}) {
  const [noteTarget, setNoteTarget] = useState(null);

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

  const displayRows = buildPivotDisplayRows(pivot.rows);
  const stickyNoWidth = 34;
  const truckLeftOffset = stickyNoWidth;

  const modal = (
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-hidden bg-slate-950/45 px-3 py-6" role="presentation" onMouseDown={onClose}>
      <section className="monthly-utilization-modal flex max-h-[calc(100vh-3rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="monthly-utilization-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="block text-[9px] font-black uppercase text-sky-700">Utilisasi Bulanan</span>
            <h2 id="monthly-utilization-title" className="mt-0.5 text-sm font-black leading-tight text-slate-950">
              Pivot Utilisasi Truck {activeMonthLabel} {year}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {pivot.rows.length} Unit
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">
              {pivot.grandTotal} Trip
            </span>
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

        {pivot.rows.length ? (
          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <table className="w-full min-w-max border-collapse text-[9px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="sticky left-0 top-0 z-30 min-w-[34px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black">
                    NO
                  </th>
                  <th className="sticky top-0 z-30 min-w-[130px] border border-slate-200 bg-slate-100 px-1.5 py-1 text-left font-black" style={{ left: truckLeftOffset }}>
                    <span className="grid w-[116px] grid-cols-[74px_34px] items-center gap-2">
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
                    <tr key={truck.plateNumber} className="odd:bg-white even:bg-slate-50/80">
                      <td className="sticky left-0 z-10 min-w-[34px] border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-700 shadow-[inset_0_-1px_0_#94a3b8]">
                        {item.number}
                      </td>
                      <th className="sticky z-10 min-w-[130px] border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1.5 py-0.5 text-left font-black text-slate-900 shadow-[inset_0_-1px_0_#94a3b8]" style={{ left: truckLeftOffset }}>
                        <span className="grid w-[116px] grid-cols-[74px_34px] items-center gap-2">
                          <span className="block min-w-0 truncate" title={truck.plateNumber}>{truck.plateNumber}</span>
                          <span className="inline-flex h-4 min-w-5 justify-self-center items-center justify-center rounded bg-slate-200 px-1 text-[8px] font-black leading-none text-slate-700" title="No Lambung">
                            {formatTruckUnitCode(truck.unitCode)}
                          </span>
                        </span>
                      </th>
                      {pivot.days.map((day) => (
                        <td
                          key={day.key}
                          className={`h-6 max-w-[38px] border-x border-b border-b-slate-400 px-0.5 py-0 text-center align-middle shadow-[inset_0_-1px_0_#94a3b8] ${
                            day.isRedDate ? 'border-x-red-200 bg-red-50/80' : 'border-x-slate-200'
                          }`}
                        >
                          <PivotCell
                            cell={truck.cells[day.key]}
                            note={utilizationNotesByKey.get(utilizationNoteKey(truck.id || truck.plateNumber, day.key))}
                            canEditNote={canEditNotes}
                            onOpenNote={() => setNoteTarget({
                              resourceId: truck.id || truck.plateNumber,
                              resourceLabel: truck.plateNumber,
                              date: day.key,
                              cell: truck.cells[day.key],
                              note: utilizationNotesByKey.get(utilizationNoteKey(truck.id || truck.plateNumber, day.key)),
                            })}
                          />
                        </td>
                      ))}
                      <td className="sticky right-0 z-10 border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-950 shadow-[inset_0_-1px_0_#94a3b8]">
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
                  <tr key={driver.driver} className="odd:bg-white even:bg-slate-50/80">
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
  const [dataSource, setDataSource] = useState('all');
  const [driverCommissionFilter, setDriverCommissionFilter] = useState('all');
  const [driverCommissionPaymentFilter, setDriverCommissionPaymentFilter] = useState('all');
  const [driverCommissionPeriod, setDriverCommissionPeriod] = useState('all');
  const [utilizationModalOpen, setUtilizationModalOpen] = useState(false);
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
  const driverCommissionPeriodOptions = useMemo(() => buildCommissionWeekOptions(month, year), [month, year]);
  const selectedDriverCommissionPeriod = driverCommissionPeriodOptions.find((option) => option.value === driverCommissionPeriod) || driverCommissionPeriodOptions[0];
  const canEditUtilizationNotes = user?.role === USER_ROLES.ADMIN || hasPermission(user, 'operations.update');
  const reportSourceParams = useMemo(() => {
    if (dataSource === 'historical') return { entrySource: 'historical', historicalPeriod: activePeriodKey };
    if (dataSource === 'realtime') return { entrySource: 'realtime' };
    return {};
  }, [activePeriodKey, dataSource]);

  useEffect(() => {
    setSelectedReport(normalizeReportTab(searchParams.get('tab'), { revenueOnly: isFinanceOnly }));
  }, [searchParams, isFinanceOnly]);

  useEffect(() => {
    if (selectedReport !== 'utilization') setUtilizationModalOpen(false);
    if (selectedReport !== 'driver') setDriverUtilizationModalOpen(false);
  }, [selectedReport]);

  useEffect(() => {
    if (!driverCommissionPeriodOptions.some((option) => option.value === driverCommissionPeriod)) {
      setDriverCommissionPeriod('all');
    }
  }, [driverCommissionPeriod, driverCommissionPeriodOptions]);

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
    setUtilizationLoading(true);
    setDriverPerformanceLoading(true);
    setRepoLoading(true);
    setRevenueError('');
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
      isFinanceOnly ? Promise.resolve([]) : loadUtilizationRows(),
      isFinanceOnly ? Promise.resolve(null) : fetchDriverPerformanceReport({
        month: selectedDriverCommissionPeriod?.from ? 'all' : activePeriodKey,
        ...(driverCommissionFilter !== 'all' ? { commissionStatus: driverCommissionFilter } : {}),
        ...(driverCommissionPaymentFilter !== 'all' ? { commissionPaymentStatus: driverCommissionPaymentFilter } : {}),
        ...(selectedDriverCommissionPeriod?.from ? {
          weekFrom: selectedDriverCommissionPeriod.from,
          weekTo: selectedDriverCommissionPeriod.to,
        } : {}),
        ...reportSourceParams,
      }),
      isFinanceOnly ? Promise.resolve(null) : fetchOperationReport({
        page: 1,
        pageSize: 100,
        status: 'repo_stored',
        ...reportSourceParams,
      }),
    ]).then(([revenueResult, utilizationResult, driverPerformanceResult, repoResult]) => {
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
      setUtilizationLoading(false);
      setDriverPerformanceLoading(false);
      setRepoLoading(false);
    });

    return () => {
      active = false;
    };
  }, [activePeriodKey, driverCommissionFilter, driverCommissionPaymentFilter, isFinanceOnly, month, reportSourceParams, selectedDriverCommissionPeriod, year]);

  const masterTruckRows = archive.masters?.trucks;
  const masterDriverRows = archive.masters?.drivers;
  const revenueTruckRows = useMemo(() => buildRevenueTruckRows(masterTruckRows || [], revenueRows), [masterTruckRows, revenueRows]);
  const averageRevenuePerTrip = revenueSummary.totalTrips ? revenueSummary.totalRevenue / revenueSummary.totalTrips : 0;
  const utilizationSourceRows = utilizationRows.length ? utilizationRows : revenueRows;
  const holidaysByDate = useMemo(() => buildHolidayMap(publicHolidays), [publicHolidays]);
  const utilizationSummary = useMemo(
    () => buildTruckDayUtilizationSummary(masterTruckRows || [], utilizationSourceRows, month, year),
    [masterTruckRows, month, utilizationSourceRows, year],
  );
  const averageUsedTrucksPerDay = utilizationSummary.period.days
    ? utilizationSummary.realizedTruckDays / utilizationSummary.period.days
    : 0;
  const utilizationPeriodLabel = formatUtilizationPeriod(utilizationSummary.period, activeMonthLabel, year);
  const utilizationRowsWithTarget = utilizationSummary.rows;
  const utilizationPivot = useMemo(
    () => buildMonthlyUtilizationPivot(masterTruckRows || [], utilizationSourceRows, month, year, holidaysByDate),
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
  const driverRows = useMemo(() => {
    const rows = buildDriverPerformanceRows(masterDriverRows || [], driverPerformanceRows);
    if (driverCommissionFilter === 'with_commission') {
      return rows.filter((driver) => Number(driver.totalDriverCommission || 0) > 0);
    }
    if (driverCommissionFilter === 'without_commission') {
      return rows.filter((driver) => Number(driver.totalTrips || 0) > 0 && Number(driver.totalDriverCommission || 0) <= 0);
    }
    if (driverCommissionPaymentFilter !== 'all') {
      return rows.filter((driver) => Number(driver.totalTrips || 0) > 0);
    }
    return rows;
  }, [driverCommissionFilter, driverCommissionPaymentFilter, masterDriverRows, driverPerformanceRows]);
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
        {selectedReport === 'driver' ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              Status Komisi
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                value={driverCommissionFilter}
                onChange={(event) => setDriverCommissionFilter(event.target.value)}
              >
                {DRIVER_COMMISSION_FILTER_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              Status Pembayaran
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                value={driverCommissionPaymentFilter}
                onChange={(event) => setDriverCommissionPaymentFilter(event.target.value)}
              >
                {DRIVER_COMMISSION_PAYMENT_FILTER_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              Periode Komisi Kamis-Rabu
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                value={driverCommissionPeriod}
                onChange={(event) => setDriverCommissionPeriod(event.target.value)}
              >
                {driverCommissionPeriodOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
        ) : null}
      </section>
      ) : (
      <section className="mb-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <span className="block text-[11px] font-semibold uppercase text-slate-500">Mode Viewer</span>
        <strong className="text-sm text-slate-900">Master data ditampilkan sebagai laporan read-only tanpa tombol input, edit, atau hapus.</strong>
      </section>
      )}

      <section className={`mb-4 grid gap-3 ${isFinanceOnly ? '' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        <SummaryToggleCard
          icon={BarChart3}
          label="Revenue Jasa Angkut"
          value={formatCurrency(revenueSummary.totalRevenue)}
          helper="Tidak termasuk reimbursement / jasa lainnya"
          secondaryLabel="AVG Revenue/Trip"
          secondaryValue={formatCurrency(averageRevenuePerTrip)}
          tone="emerald"
          expanded={selectedReport === 'revenue'}
          onClick={() => selectReport('revenue')}
        />
        {!isFinanceOnly ? (
          <>
            <SummaryToggleCard
              icon={Truck}
              label="Utilization Report"
              value={`${utilizationSummary.utilizationPercent.toFixed(1)}%`}
              helper={utilizationSummary.period.days ? `Periode ${utilizationPeriodLabel}` : utilizationPeriodLabel}
              secondaryLabel="AVG Terpakai"
              secondaryValue={`${formatDecimal(averageUsedTrucksPerDay)} / ${utilizationSummary.activeTruckCount} truck per hari`}
              tertiaryLabel="Truck Aktif"
              tertiaryValue={`${utilizationSummary.activeTruckCount} Unit`}
              tone="sky"
              expanded={selectedReport === 'utilization'}
              onClick={() => selectReport('utilization')}
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
          </>
        ) : null}
      </section>

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

      {selectedReport === 'utilization' ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-950">Utilisasi Truck</h2>
              <p className="text-xs text-slate-500">
                {utilizationSummary.period.days
                  ? `Periode ${utilizationPeriodLabel}. Rata-rata ${formatDecimal(averageUsedTrucksPerDay)} dari ${utilizationSummary.activeTruckCount} truck aktif terpakai per hari.`
                  : utilizationPeriodLabel}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800 hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setUtilizationModalOpen(true)}
              disabled={utilizationLoading || Boolean(utilizationError)}
            >
              <Maximize2 size={15} />
              Lihat Utilisasi Bulanan
            </button>
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
        open={utilizationModalOpen}
        onClose={() => setUtilizationModalOpen(false)}
        pivot={utilizationPivot}
        activeMonthLabel={activeMonthLabel}
        year={year}
        utilizationNotesByKey={utilizationNotesByKey}
        utilizationNoteSuggestions={utilizationNoteSuggestions}
        canEditNotes={canEditUtilizationNotes}
        noteSaving={utilizationNoteSaving}
        onSaveNote={handleSaveUtilizationNote}
        onDeleteNote={handleDeleteUtilizationNote}
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
                <tr key={driver.driver} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
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
