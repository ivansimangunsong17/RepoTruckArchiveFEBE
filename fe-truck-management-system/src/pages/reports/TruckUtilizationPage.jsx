import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Truck } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { formatDateTime } from '../../utils/formatDate';
import { fetchOperationReport } from '../../services/reports/reportService';

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

const DATA_SOURCE_OPTIONS = [
  { value: 'all', label: 'Semua Data' },
  { value: 'realtime', label: 'Realtime' },
  { value: 'historical', label: 'Data Lama' },
];

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

function monthKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function normalizeSize(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '');
}

function getTruckUnitCode(row = {}) {
  return String(row.unitCode || row.unit_code || row.truckCode || row.truckNumber || '').trim();
}

function formatTruckUnitCode(unitCode) {
  const value = String(unitCode || '').trim();
  if (!value) return '-';
  return value.replace(/^TRK-?/i, '').replace(/^0+(\d)/, '$1') || value;
}

function buildTruckUtilization(rows = []) {
  const trucks = new Map();

  rows.forEach((job) => {
    const plateNumber = job.plateNumber || 'Truck belum diassign';
    if (!trucks.has(plateNumber)) {
      trucks.set(plateNumber, {
        plateNumber,
        unitCode: getTruckUnitCode(job),
        driver: job.driver || '-',
        completedTrips: 0,
        qty20ft: 0,
        qty40ft: 0,
        lastCompletedAt: '',
      });
    }

    const truck = trucks.get(plateNumber);
    if (!truck.unitCode) truck.unitCode = getTruckUnitCode(job);
    truck.completedTrips += 1;
    if (job.driver) truck.driver = job.driver;
    if (normalizeSize(job.size) === '40FT') truck.qty40ft += 1;
    else truck.qty20ft += 1;
    if (!truck.lastCompletedAt || new Date(job.completedAt || 0) > new Date(truck.lastCompletedAt || 0)) {
      truck.lastCompletedAt = job.completedAt || job.updatedAt || '';
    }
  });

  return Array.from(trucks.values()).sort((left, right) => {
    if (right.completedTrips !== left.completedTrips) return right.completedTrips - left.completedTrips;
    return left.plateNumber.localeCompare(right.plateNumber);
  });
}

function MetricCard({ icon: Icon, label, value, tone = 'sky' }) {
  const toneClass = {
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  }[tone] || 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase text-slate-500">{label}</span>
          <strong className="block text-xl font-bold leading-tight text-slate-950">{value}</strong>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md border ${toneClass}`}>
          <Icon size={16} />
        </div>
      </div>
    </div>
  );
}

function TruckUtilizationPage() {
  const initialPeriod = useMemo(() => currentPeriod(), []);
  const [month, setMonth] = useState(initialPeriod.month);
  const [year, setYear] = useState(initialPeriod.year);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState('all');

  const yearOptions = useMemo(() => {
    const baseYear = currentPeriod().year;
    return Array.from({ length: 7 }, (_, index) => baseYear - 3 + index);
  }, []);

  const activeMonthLabel = MONTHS.find((item) => Number(item.value) === Number(month))?.label || '-';
  const activePeriodKey = monthKey(month, year);
  const utilizationRows = useMemo(() => buildTruckUtilization(rows), [rows]);
  const totalTrips = utilizationRows.reduce((total, truck) => total + truck.completedTrips, 0);

  useEffect(() => {
    let active = true;
    const range = monthRange(month, year);

    setLoading(true);
    setError('');
    fetchOperationReport({
      page: 1,
      pageSize: 100,
      status: 'completed',
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      ...(dataSource === 'historical' ? { entrySource: 'historical', historicalPeriod: activePeriodKey } : {}),
      ...(dataSource === 'realtime' ? { entrySource: 'realtime' } : {}),
    })
      .then((result) => {
        if (!active) return;
        setRows(Array.isArray(result?.rows) ? result.rows : []);
      })
      .catch((requestError) => {
        if (!active) return;
        setRows([]);
        setError(requestError.message || 'Data truck utilisasi gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activePeriodKey, dataSource, month, year]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Monitoring"
        title="Truck Utilisasi"
        description="Ringkasan sederhana trip selesai per truck."
      />

      <section className="mb-4 rounded-md border border-amber-200 bg-amber-50/60 p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_14rem] md:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
            Bulan
            <select
              className="h-9 rounded-md border border-amber-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {MONTHS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
            Tahun
            <select
              className="h-9 rounded-md border border-amber-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {yearOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
            Sumber Data
            <select
              className="h-9 rounded-md border border-amber-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
              value={dataSource}
              onChange={(event) => setDataSource(event.target.value)}
            >
              {DATA_SOURCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-600 sm:min-w-56">
            <span className="block text-[11px] font-semibold uppercase text-amber-700">Periode aktif</span>
            <strong className="text-sm text-slate-950">{activeMonthLabel} {year}</strong>
          </div>
        </div>
      </section>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <MetricCard icon={Truck} label="Truck Terpakai" value={String(utilizationRows.length)} tone="sky" />
        <MetricCard icon={CheckCircle2} label="Trip Selesai" value={String(totalTrips)} tone="emerald" />
        <MetricCard icon={CalendarDays} label="Periode" value={`${activeMonthLabel} ${year}`} tone="amber" />
      </div>

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-sky-100 bg-sky-50/70 px-3 py-2.5">
          <h2 className="text-sm font-bold text-slate-950">Data Utilisasi Truck</h2>
          <p className="text-xs text-sky-700">Diurutkan dari trip selesai terbanyak.</p>
        </div>

        {loading ? <div className="p-4 text-sm text-slate-500">Memuat truck utilisasi...</div> : null}
        {!loading && error ? <div className="p-4 text-sm text-red-600">{error}</div> : null}

        {!loading && !error && utilizationRows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-900 text-[11px] uppercase text-white">
                <tr>
                  <th className="px-3 py-2 font-bold">Truck</th>
                  <th className="px-3 py-2 font-bold">No Lambung</th>
                  <th className="px-3 py-2 font-bold">Driver Terakhir</th>
                  <th className="px-3 py-2 text-right font-bold">Trip Selesai</th>
                  <th className="px-3 py-2 text-right font-bold">20FT</th>
                  <th className="px-3 py-2 text-right font-bold">40FT</th>
                  <th className="px-3 py-2 font-bold">Terakhir Selesai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {utilizationRows.map((truck) => (
                  <tr key={truck.plateNumber} className="text-slate-700 odd:bg-white even:bg-slate-50/70">
                    <td className="px-3 py-2 font-semibold text-slate-950">{truck.plateNumber}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{formatTruckUnitCode(truck.unitCode)}</td>
                    <td className="px-3 py-2">{truck.driver}</td>
                    <td className="px-3 py-2 text-right"><span className="inline-flex min-w-8 justify-center rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{truck.completedTrips}</span></td>
                    <td className="px-3 py-2 text-right">{truck.qty20ft}</td>
                    <td className="px-3 py-2 text-right">{truck.qty40ft}</td>
                    <td className="px-3 py-2">{formatDateTime(truck.lastCompletedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && !utilizationRows.length ? (
          <div className="p-6 text-center">
            <h3 className="text-sm font-bold text-slate-900">Belum ada trip selesai</h3>
            <p className="mt-1 text-xs text-slate-500">Tidak ada utilisasi truck pada {activeMonthLabel} {year}.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default TruckUtilizationPage;
