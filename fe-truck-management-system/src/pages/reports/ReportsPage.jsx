import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Truck, Users } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { useArchiveData } from '../../contexts/ArchiveDataContext';
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
const TARGET_TRIPS_PER_TRUCK_PER_DAY = 1.8;

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
  return String(row.driver || row.name || 'Sopir belum diisi').trim() || 'Sopir belum diisi';
}

function monthKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(month, year) {
  return new Date(Number(year), Number(month), 0).getDate();
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

function SummaryToggleCard({ icon: Icon, label, value, helper, secondaryLabel, secondaryValue, expanded, onClick, tone = 'slate' }) {
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

function ReportsPage() {
  const archive = useArchiveData();
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
  const [selectedReport, setSelectedReport] = useState('revenue');
  const yearOptions = useMemo(() => {
    const baseYear = currentPeriod().year;
    return Array.from({ length: 7 }, (_, index) => baseYear - 3 + index);
  }, []);
  const activeMonthLabel = MONTHS.find((item) => Number(item.value) === Number(month))?.label || '-';

  useEffect(() => {
    let active = true;
    const range = monthRange(month, year);

    setRevenueLoading(true);
    setUtilizationLoading(true);
    setDriverPerformanceLoading(true);
    setRevenueError('');
    setUtilizationError('');
    setDriverPerformanceError('');

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
    ]).then(([revenueResult, utilizationResult, driverPerformanceResult]) => {
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
    }).finally(() => {
      if (!active) return;
      setRevenueLoading(false);
      setUtilizationLoading(false);
      setDriverPerformanceLoading(false);
    });

    return () => {
      active = false;
    };
  }, [month, year]);

  const masterTruckRows = archive.masters?.trucks;
  const masterDriverRows = archive.masters?.drivers;
  const revenueTruckRows = useMemo(() => buildRevenueTruckRows(masterTruckRows || [], revenueRows), [masterTruckRows, revenueRows]);
  const averageRevenuePerTruck = revenueTruckRows.length ? revenueSummary.totalRevenue / revenueTruckRows.length : 0;
  const utilizationSourceRows = utilizationRows.length ? utilizationRows : revenueRows;
  const utilizationTruckRows = useMemo(() => buildUtilizationTruckRows(masterTruckRows || [], utilizationSourceRows), [masterTruckRows, utilizationSourceRows]);
  const activeDays = daysInMonth(month, year);
  const utilizationTargetPerTruck = activeDays * TARGET_TRIPS_PER_TRUCK_PER_DAY;
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
  const driverRows = useMemo(() => buildDriverPerformanceRows(masterDriverRows || [], driverPerformanceRows), [masterDriverRows, driverPerformanceRows]);
  const driverSummary = useMemo(() => ({
    totalTrips: driverRows.reduce((total, driver) => total + driver.totalTrips, 0),
    activeDrivers: driverRows.filter((driver) => driver.totalTrips > 0).length,
    totalDrivers: driverRows.length,
  }), [driverRows]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Laporan"
        title="Revenue Report"
        description="Ringkasan revenue dan detail revenue per truck pada periode yang dipilih."
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

      <section className="mb-4 grid gap-3 lg:grid-cols-3">
        <SummaryToggleCard
          icon={BarChart3}
          label="Total Revenue"
          value={formatCurrency(revenueSummary.totalRevenue)}
          helper="Akumulasi revenue periode ini"
          secondaryLabel="AVG Revenue/Truck"
          secondaryValue={formatCurrency(averageRevenuePerTruck)}
          tone="emerald"
          expanded={selectedReport === 'revenue'}
          onClick={() => setSelectedReport('revenue')}
        />
        <SummaryToggleCard
          icon={Truck}
          label="Utilization Report"
          value={`${utilizationSummary.totalTrips} Trip`}
          helper={`Target ${formatDecimal(utilizationSummary.totalTargetTrips)} trip dari ${utilizationSummary.totalTrucks} truck`}
          secondaryLabel="Utilisasi"
          secondaryValue={`${utilizationPercent.toFixed(1)}%`}
          tone="sky"
          expanded={selectedReport === 'utilization'}
          onClick={() => setSelectedReport('utilization')}
        />
        <SummaryToggleCard
          icon={Users}
          label="Driver Performance"
          value={`${driverSummary.totalTrips} Trip`}
          helper={`${driverSummary.activeDrivers} sopir menjalankan trip`}
          secondaryLabel="Total Sopir"
          secondaryValue={`${driverSummary.totalDrivers} Sopir`}
          tone="amber"
          expanded={selectedReport === 'driver'}
          onClick={() => setSelectedReport('driver')}
        />
      </section>

      {selectedReport === 'revenue' ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-bold text-slate-950">Detail Revenue Truck</h2>
            <p className="text-xs text-slate-500">Semua data truck beserta jumlah trip dan revenue pada periode yang dipilih.</p>
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
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-bold text-slate-950">Utilisasi Truck</h2>
            <p className="text-xs text-slate-500">Daftar trip selesai per truck pada periode yang dipilih.</p>
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
