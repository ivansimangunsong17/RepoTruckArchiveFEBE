import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, PackageCheck } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { fetchMonthlyRevenueReport } from '../../services/reports/reportService';

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

function currentPeriod() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function SummaryCard({ icon: Icon, label, value, helper }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase text-slate-500">{label}</span>
          <strong className="mt-0.5 block text-xl font-bold leading-tight text-slate-950">{value}</strong>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Icon size={16} />
        </div>
      </div>
      <small className="mt-1 block text-xs text-slate-500">{helper}</small>
    </div>
  );
}

function ReportsPage() {
  const initialPeriod = useMemo(() => currentPeriod(), []);
  const [month, setMonth] = useState(initialPeriod.month);
  const [year, setYear] = useState(initialPeriod.year);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalOrders: 0, totalContainers: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const yearOptions = useMemo(() => {
    const baseYear = currentPeriod().year;
    return Array.from({ length: 7 }, (_, index) => baseYear - 3 + index);
  }, []);

  const activeMonthLabel = MONTHS.find((item) => Number(item.value) === Number(month))?.label || '-';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    fetchMonthlyRevenueReport({ month, year })
      .then((result) => {
        if (!active) return;
        setRows(Array.isArray(result?.rows) ? result.rows : []);
        setSummary({
          totalRevenue: Number(result?.summary?.totalRevenue || 0),
          totalOrders: Number(result?.summary?.totalOrders || 0),
          totalContainers: Number(result?.summary?.totalContainers || 0),
        });
      })
      .catch((requestError) => {
        if (!active) return;
        setRows([]);
        setSummary({ totalRevenue: 0, totalOrders: 0, totalContainers: 0 });
        setError(requestError.message || 'Laporan revenue gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [month, year]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Laporan"
        title="Revenue Bulanan"
        description="Ringkasan revenue dari Sales Order yang sudah selesai."
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

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <SummaryCard icon={BarChart3} label="Total Revenue" value={formatCurrency(summary.totalRevenue)} helper="SO selesai pada periode ini" />
        <SummaryCard icon={CalendarDays} label="SO Selesai" value={String(summary.totalOrders)} helper="Jumlah Sales Order" />
        <SummaryCard icon={PackageCheck} label="Container" value={String(summary.totalContainers)} helper="Total container selesai" />
      </div>

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Tabel Revenue</h2>
            <p className="text-xs text-slate-500">Hanya menampilkan pekerjaan dengan status selesai.</p>
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-slate-500">Memuat laporan revenue...</div>
        ) : null}

        {!loading && error ? (
          <div className="p-4 text-sm text-red-600">{error}</div>
        ) : null}

        {!loading && !error && rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-bold">Tanggal Selesai</th>
                  <th className="px-3 py-2 font-bold">No SO</th>
                  <th className="px-3 py-2 font-bold">Customer</th>
                  <th className="px-3 py-2 font-bold">Tujuan</th>
                  <th className="px-3 py-2 font-bold">Container</th>
                  <th className="px-3 py-2 text-right font-bold">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="text-slate-700">
                    <td className="px-3 py-2">{formatDate(row.completedDate)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-950">{row.soNumber}</td>
                    <td className="px-3 py-2">{row.customer}</td>
                    <td className="px-3 py-2">{row.destination || '-'}</td>
                    <td className="px-3 py-2">{row.container}</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-950">{formatCurrency(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && !rows.length ? (
          <div className="p-6 text-center">
            <h3 className="text-sm font-bold text-slate-900">Belum ada revenue selesai</h3>
            <p className="mt-1 text-xs text-slate-500">Tidak ada Sales Order selesai pada {activeMonthLabel} {year}.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default ReportsPage;
