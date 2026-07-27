import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Maximize2, Truck, Users, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import { useArchiveData } from '../../contexts/ArchiveDataContext';
import { SETTINGS_STORAGE_KEY } from '../../services/settings/adapters/localSettingsStore';
import { fetchDriverPerformanceReport, fetchMonthlyRevenueReport, fetchOperationReport } from '../../services/reports/reportService';
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

const DEFAULT_REVENUE_SUMMARY = {
  totalRevenue: 0,
  totalOrders: 0,
  totalContainers: 0,
  totalTrucks: 0,
  totalTrips: 0,
};

const DEFAULT_TARGET_TRIPS_PER_TRUCK_PER_DAY = 1.8;

function readUtilizationTargetTripsPerDay() {
  try {
    const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    const target = Number(savedSettings?.utilizationTargetTripsPerTruckPerDay);
    return Number.isFinite(target) && target > 0 ? target : DEFAULT_TARGET_TRIPS_PER_TRUCK_PER_DAY;
  } catch {
    return DEFAULT_TARGET_TRIPS_PER_TRUCK_PER_DAY;
  }
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

function getDriverName(row = {}) {
  return String(row.driver || row.defaultDriver || row.defaultDriverName || row.name || 'Sopir belum diisi').trim() || 'Sopir belum diisi';
}

function monthKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(month, year) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function buildMonthDays(month, year) {
  const totalDays = daysInMonth(month, year);
  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    return {
      day,
      key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      label: String(day).padStart(2, '0'),
      fullLabel: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
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
      });
    }

    const truck = trucks.get(plateNumber);
    truck.totalTrips += 1;
    truck.revenue += Number(row.revenue || 0);
  });

  return Array.from(trucks.values()).sort((left, right) => {
    if (right.revenue !== left.revenue) return right.revenue - left.revenue;
    if (right.totalTrips !== left.totalTrips) return right.totalTrips - left.totalTrips;
    return left.plateNumber.localeCompare(right.plateNumber);
  });
}

function buildUtilizationTruckRows(masterTrucks = [], rows = []) {
  const trucks = new Map();

  masterTrucks.forEach((truck) => {
    const plateNumber = getTruckPlate(truck);
    if (!trucks.has(plateNumber)) {
      trucks.set(plateNumber, {
        plateNumber,
        totalTrips: 0,
        lastCompletedAt: '',
      });
    }
  });

  rows.forEach((row) => {
    const plateNumber = getTruckPlate(row);
    if (!trucks.has(plateNumber)) {
      trucks.set(plateNumber, {
        plateNumber,
        totalTrips: 0,
        lastCompletedAt: '',
      });
    }

    const truck = trucks.get(plateNumber);
    truck.totalTrips += 1;

    const completedAt = row.completedDate || row.completedAt || row.updatedAt || '';
    if (completedAt && (!truck.lastCompletedAt || new Date(completedAt) > new Date(truck.lastCompletedAt))) {
      truck.lastCompletedAt = completedAt;
    }
  });

  return Array.from(trucks.values()).sort((left, right) => {
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
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
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

export function buildMonthlyUtilizationPivot(masterTrucks = [], rows = [], month, year) {
  const days = buildMonthDays(month, year);
  const dayKeys = new Set(days.map((day) => day.key));
  const trucks = new Map();

  masterTrucks.forEach((truck) => {
    const plateNumber = getTruckPlate(truck);
    if (!trucks.has(plateNumber)) {
      trucks.set(plateNumber, {
        plateNumber,
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
        plateNumber,
        driver: getDriverName(row),
        cells: days.reduce((cells, day) => ({ ...cells, [day.key]: { count: 0, labels: [] } }), {}),
        totalTrips: 0,
      });
    }

    const truck = trucks.get(plateNumber);
    const cell = truck.cells[dateKey];
    cell.count += 1;
    const label = compactCellLabel(row);
    if (label && !cell.labels.includes(label)) cell.labels.push(label);
    if (row.driver) truck.driver = getDriverName(row);
    truck.totalTrips += 1;
  });

  const rowsByTruck = Array.from(trucks.values()).sort((left, right) => {
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

export function buildDriverPerformanceRows(masterDrivers = [], performanceRows = []) {
  const drivers = new Map();

  masterDrivers.forEach((driver) => {
    const name = getDriverName(driver);
    if (!drivers.has(name)) {
      drivers.set(name, {
        driver: name,
        totalTrips: 0,
      });
    }
  });

  performanceRows.forEach((row) => {
    const name = getDriverName(row);
    if (!drivers.has(name)) {
      drivers.set(name, {
        driver: name,
        totalTrips: 0,
      });
    }

    drivers.get(name).totalTrips = Number(row.monthlyTrips ?? row.totalTrips ?? 0);
  });

  return Array.from(drivers.values()).sort((left, right) => {
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
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
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

function normalizeReportTab(tab) {
  if (tab === 'utilization' || tab === 'driver' || tab === 'revenue' || tab === 'repo') return tab;
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

  return {
    title: 'Revenue Report',
    description: 'Ringkasan revenue dan detail revenue per truck pada periode yang dipilih.',
  };
}

function PivotCell({ cell }) {
  if (!cell?.count) return <span className="text-[8px] text-slate-300">-</span>;

  const title = cell.labels?.length
    ? `${cell.count} trip - ${cell.labels.join(', ')}`
    : `${cell.count} trip`;

  return (
    <span
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-sky-100 px-1 text-[9px] font-black leading-none text-sky-900"
      title={title}
    >
      {cell.count}
    </span>
  );
}

export function MonthlyUtilizationModal({
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

  const modal = (
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-hidden bg-slate-950/45 px-3 py-6" role="presentation" onMouseDown={onClose}>
      <section className="flex max-h-[calc(100vh-3rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="monthly-utilization-title" onMouseDown={(event) => event.stopPropagation()}>
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
            <table className="min-w-max border-collapse text-[9px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="sticky left-0 top-0 z-30 min-w-[112px] border border-slate-200 bg-slate-100 px-1.5 py-1 text-left font-black">
                    Row Labels
                  </th>
                  {pivot.days.map((day) => (
                    <th
                      key={day.key}
                      className="sticky top-0 z-20 min-w-[38px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black"
                      title={day.fullLabel}
                    >
                      {day.label}
                    </th>
                  ))}
                  <th className="sticky right-0 top-0 z-30 min-w-[48px] border border-slate-200 bg-slate-100 px-1 py-1 text-center font-black">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {pivot.rows.map((truck) => (
                  <tr key={truck.plateNumber} className="odd:bg-white even:bg-slate-50/80">
                    <th className="sticky left-0 z-10 border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1.5 py-0.5 text-left font-black text-slate-900 shadow-[inset_0_-1px_0_#94a3b8]">
                      <span className="block truncate">{truck.plateNumber}</span>
                    </th>
                    {pivot.days.map((day) => (
                      <td key={day.key} className="h-6 max-w-[38px] border-x border-slate-200 border-b border-b-slate-400 px-0.5 py-0 text-center align-middle shadow-[inset_0_-1px_0_#94a3b8]">
                        <PivotCell cell={truck.cells[day.key]} />
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 border-x border-slate-200 border-b border-b-slate-400 bg-inherit px-1 py-0.5 text-center font-black text-slate-950 shadow-[inset_0_-1px_0_#94a3b8]">
                      {truck.totalTrips}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white">
                  <th className="sticky bottom-0 left-0 z-30 border border-slate-700 bg-slate-900 px-1.5 py-1 text-left font-black">
                    Grand Total
                  </th>
                  {pivot.days.map((day) => (
                    <td key={day.key} className="sticky bottom-0 z-20 border border-slate-700 bg-slate-900 px-1 py-1 text-center font-black">
                      {pivot.totalsByDay[day.key] || ''}
                    </td>
                  ))}
                  <td className="sticky bottom-0 right-0 z-30 border border-slate-700 bg-slate-900 px-1 py-1 text-center font-black">
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
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

function ReportsPage() {
  const archive = useArchiveData();
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
  const [selectedReport, setSelectedReport] = useState(() => normalizeReportTab(searchParams.get('tab')));
  const [utilizationModalOpen, setUtilizationModalOpen] = useState(false);
  const utilizationTargetTripsPerDay = readUtilizationTargetTripsPerDay();
  const yearOptions = useMemo(() => {
    const baseYear = currentPeriod().year;
    return Array.from({ length: 7 }, (_, index) => baseYear - 3 + index);
  }, []);
  const activeMonthLabel = MONTHS.find((item) => Number(item.value) === Number(month))?.label || '-';

  useEffect(() => {
    setSelectedReport(normalizeReportTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    if (selectedReport !== 'utilization') setUtilizationModalOpen(false);
  }, [selectedReport]);

  function selectReport(report) {
    const normalized = normalizeReportTab(report);
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
      fetchMonthlyRevenueReport({ month, year }),
      loadUtilizationRows(),
      fetchDriverPerformanceReport({ month: monthKey(month, year) }),
      fetchOperationReport({
        page: 1,
        pageSize: 100,
        status: 'repo_stored',
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
  }, [month, year]);

  const masterTruckRows = archive.masters?.trucks;
  const masterDriverRows = archive.masters?.drivers;
  const revenueTruckRows = useMemo(() => buildRevenueTruckRows(masterTruckRows || [], revenueRows), [masterTruckRows, revenueRows]);
  const averageRevenuePerTrip = revenueSummary.totalTrips ? revenueSummary.totalRevenue / revenueSummary.totalTrips : 0;
  const utilizationSourceRows = utilizationRows.length ? utilizationRows : revenueRows;
  const utilizationTruckRows = useMemo(() => buildUtilizationTruckRows(masterTruckRows || [], utilizationSourceRows), [masterTruckRows, utilizationSourceRows]);
  const activeDays = daysInMonth(month, year);
  const utilizationTargetPerTruck = activeDays * utilizationTargetTripsPerDay;
  const utilizationRowsWithTarget = useMemo(() => utilizationTruckRows.map((truck) => ({
    ...truck,
    targetTrips: utilizationTargetPerTruck,
    utilizationPercent: utilizationTargetPerTruck ? (truck.totalTrips / utilizationTargetPerTruck) * 100 : 0,
  })), [utilizationTargetPerTruck, utilizationTruckRows]);
  const utilizationSummary = useMemo(() => ({
    totalTrips: utilizationSourceRows.length || revenueSummary.totalTrips,
    totalTrucks: utilizationRowsWithTarget.length,
    utilizedTrucks: utilizationRowsWithTarget.filter((truck) => truck.totalTrips > 0).length,
    totalTargetTrips: utilizationRowsWithTarget.reduce((total, truck) => total + truck.targetTrips, 0),
  }), [utilizationSourceRows.length, revenueSummary.totalTrips, utilizationRowsWithTarget]);
  const utilizationPercent = utilizationSummary.totalTargetTrips
    ? (utilizationSummary.totalTrips / utilizationSummary.totalTargetTrips) * 100
    : 0;
  const utilizationPivot = useMemo(
    () => buildMonthlyUtilizationPivot(masterTruckRows || [], utilizationSourceRows, month, year),
    [masterTruckRows, month, utilizationSourceRows, year],
  );
  const driverRows = useMemo(() => buildDriverPerformanceRows(masterDriverRows || [], driverPerformanceRows), [masterDriverRows, driverPerformanceRows]);
  const driverSummary = useMemo(() => ({
    totalTrips: driverRows.reduce((total, driver) => total + driver.totalTrips, 0),
    activeDrivers: driverRows.filter((driver) => driver.totalTrips > 0).length,
    totalDrivers: driverRows.length,
    averageTripsPerActiveDriver: driverRows.filter((driver) => driver.totalTrips > 0).length
      ? driverRows.reduce((total, driver) => total + driver.totalTrips, 0) / driverRows.filter((driver) => driver.totalTrips > 0).length
      : 0,
  }), [driverRows]);
  const repoMonitoringRows = useMemo(() => buildRepoMonitoringRows(repoRows), [repoRows]);
  const reportHeader = getReportHeader(selectedReport);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Laporan"
        title={reportHeader.title}
        description={reportHeader.description}
      />

      <section className="mb-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:min-w-56">
            <span className="block text-[11px] font-semibold uppercase text-slate-500">Periode aktif</span>
            <strong className="text-sm text-slate-900">{activeMonthLabel} {year}</strong>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
        <SummaryToggleCard
          icon={Truck}
          label="Utilization Report"
          value={`${utilizationSummary.totalTrips} Trip`}
          helper={`Target ${formatDecimal(utilizationSummary.totalTargetTrips)} trip dari ${utilizationSummary.totalTrucks} truck`}
          secondaryLabel="Utilisasi"
          secondaryValue={`${utilizationPercent.toFixed(1)}%`}
          tertiaryLabel="Target Harian"
          tertiaryValue={`${formatDecimal(utilizationTargetTripsPerDay)} Trip/Truck`}
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
          tertiaryLabel="Total Sopir"
          tertiaryValue={`${driverSummary.totalDrivers} Sopir`}
          tone="amber"
          expanded={selectedReport === 'driver'}
          onClick={() => selectReport('driver')}
        />
      </section>

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
                { label: 'Jumlah Trip', align: 'right' },
                { label: 'Revenue', align: 'right' },
              ]}
              rows={revenueTruckRows}
              rowRenderer={(truck, index) => (
                <tr key={truck.plateNumber} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                  <td className="w-16 px-3 py-2 font-semibold text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950">{truck.plateNumber}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex min-w-8 justify-center rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                      {truck.totalTrips}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-950">{formatCurrency(truck.revenue)}</td>
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
              <p className="text-xs text-slate-500">Ringkasan jumlah trip per truck pada periode yang dipilih.</p>
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

          {!utilizationLoading && !utilizationError && utilizationTruckRows.length ? (
            <DetailTable
              columns={[
                { label: 'No' },
                { label: 'Plat' },
                { label: 'Jumlah Trip', align: 'right' },
                { label: 'Target Trip', align: 'right' },
                { label: 'Utilisasi', align: 'right' },
                { label: 'Terakhir Selesai' },
              ]}
              rows={utilizationRowsWithTarget}
              rowRenderer={(truck, index) => (
                <tr key={truck.plateNumber} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                  <td className="w-16 px-3 py-2 font-semibold text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950">{truck.plateNumber}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex min-w-8 justify-center rounded-md bg-sky-50 px-2 py-0.5 font-bold text-sky-700">
                      {truck.totalTrips}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatDecimal(truck.targetTrips)}</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-950">{truck.utilizationPercent.toFixed(1)}%</td>
                  <td className="px-3 py-2">{formatDate(truck.lastCompletedAt)}</td>
                </tr>
              )}
            />
          ) : null}

          {!utilizationLoading && !utilizationError && !utilizationTruckRows.length ? (
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
                  <td className="w-16 px-3 py-2 font-semibold text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2">
                    <strong className="block text-slate-950">{row.soNumber || '-'}</strong>
                    <span className="text-[11px] text-slate-500">{row.containerNumber || 'Container belum diisi'} - {row.size || '-'}</span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.customer || '-'}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950">{row.repoLocation || '-'}</td>
                  <td className="px-3 py-2">{row.repoContainerCondition === 'loaded' ? 'Isi' : row.repoContainerCondition === 'empty' ? 'Kosong' : '-'}</td>
                  <td className="px-3 py-2">{formatDate(row.storedDate)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-flex min-w-14 justify-center rounded-md px-2 py-0.5 font-bold ${
                      row.ageDays >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {row.ageDays} hari
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.repoCreatedByName || '-'}</td>
                  <td className="max-w-xs px-3 py-2">
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
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-bold text-slate-950">Performa Sopir</h2>
            <p className="text-xs text-slate-500">Jumlah trip setiap sopir pada periode yang dipilih.</p>
          </div>

          {driverPerformanceLoading ? <div className="p-4 text-sm text-slate-500">Memuat laporan performa sopir...</div> : null}
          {!driverPerformanceLoading && driverPerformanceError ? <div className="p-4 text-sm text-red-600">{driverPerformanceError}</div> : null}

          {!driverPerformanceLoading && !driverPerformanceError && driverRows.length ? (
            <DetailTable
              columns={[
                { label: 'No' },
                { label: 'Sopir' },
                { label: 'Jumlah Trip', align: 'right' },
              ]}
              rows={driverRows}
              rowRenderer={(driver, index) => (
                <tr key={driver.driver} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                  <td className="w-16 px-3 py-2 font-semibold text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-950">{driver.driver}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex min-w-8 justify-center rounded-md bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                      {driver.totalTrips}
                    </span>
                  </td>
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
    </div>
  );
}

export default ReportsPage;
