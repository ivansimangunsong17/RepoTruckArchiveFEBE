import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Truck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import StatCard from '../../components/dashboard/StatCard';
import { useFeedback } from '../../hooks/useFeedback';
import { useAuth } from '../../hooks/useAuth';
import { hasPermission } from '../../constants/roles';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import FilterStatus from '../../components/common/FilterStatus';
import {
  buildReportExcelHtml,
  downloadExcel,
  getOperationalReportHeaders,
  getSalesReportHeaders,
  mapOperationalReportRow,
  mapSalesReportRow,
} from '../../utils/reportCsv';
import {
  fetchDriverPerformanceReport,
  fetchOperationReport,
  fetchSalesOrderReport,
} from '../../services/reports/reportService';

const PAGE_SIZE = 5;
const REPORT_PAGE_SIZE = 500;

function todayKey() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function monthRange(monthValue) {
  if (!monthValue || monthValue === 'all') return { from: '', to: '' };
  const [year, month] = String(monthValue).split('-').map(Number);
  if (!year || !month) return { from: '', to: '' };
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const normalize = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { from: normalize(start), to: normalize(end) };
}

function buildContainerPlaceholders(quantity = 0) {
  return Array.from({ length: Math.max(0, Number(quantity || 0)) }, (_, index) => ({ id: `container-${index}` }));
}

function normalizeSalesRow(row = {}) {
  const quantity = Number(row.quantity || 0);
  const containers = Array.isArray(row.containers) ? row.containers : buildContainerPlaceholders(quantity);
  return {
    ...row,
    soDate: row.soDate || row.tripDate || row.createdAt,
    receivedAt: row.receivedAt || row.createdAt,
    customer: row.customer || row.customerName || '-',
    salesName: row.salesName || row.createdBy || '-',
    containers,
    quantity,
    totalAmount: Number(row.totalAmount || 0),
  };
}

function normalizeOperationRow(row = {}) {
  return {
    ...row,
    customer: row.customer || row.customerName || '-',
    size: row.size || row.containerSize || '-',
    type: row.type || row.containerType || '-',
    receivedAt: row.receivedAt || row.tripDate || row.createdAt,
    updatedAt: row.updatedAt || row.completedAt || row.runningAt || row.receivedAt,
  };
}

function mergeUnitPerformanceRows(weeklyRows = [], monthlyRows = []) {
  const units = new Map();

  const ensureUnit = (row) => {
    const unitKey = row.plateNumber || row.vehicleId || row.plate || 'Unit belum diassign';
    if (!units.has(unitKey)) {
      units.set(unitKey, {
        unit: row.plateNumber || row.plate || 'Unit belum diassign',
        driver: row.driver || '-',
        weeklyTrips: 0,
        monthlyTrips: 0,
        totalTrips: 0,
      });
    }
    const unit = units.get(unitKey);
    if (row.driver && row.driver !== '-') unit.driver = row.driver;
    return unit;
  };

  weeklyRows.forEach((row) => {
    const unit = ensureUnit(row);
    unit.weeklyTrips += 1;
  });

  monthlyRows.forEach((row) => {
    const unit = ensureUnit(row);
    unit.monthlyTrips += 1;
  });

  units.forEach((unit) => {
    unit.totalTrips = Math.max(unit.weeklyTrips, unit.monthlyTrips);
  });

  return Array.from(units.values()).sort((left, right) => {
    if (right.monthlyTrips !== left.monthlyTrips) return right.monthlyTrips - left.monthlyTrips;
    if (right.weeklyTrips !== left.weeklyTrips) return right.weeklyTrips - left.weeklyTrips;
    return left.unit.localeCompare(right.unit);
  });
}

function containerLabel(job) {
  return job?.containerNumber || 'Container belum diisi';
}

function normalizeStatus(value) {
  return value === 'all' ? '' : value;
}

function getContainerCount(order = {}) {
  if (Array.isArray(order.containers)) return order.containers.length;
  return Number(order.quantity || 0);
}

function ReportsPage() {
  const location = useLocation();
  const [activeReport, setActiveReport] = useState(
    location.pathname === '/driver-performance'
      ? 'driver-performance'
      : location.pathname === '/unit-performance'
        ? 'unit-performance'
        : 'sales',
  );
  const [query, setQuery] = useState('');
  const [customer, setCustomer] = useState('all');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [performanceMonth, setPerformanceMonth] = useState(() => todayKey().slice(0, 7));
  const [performanceWeekFrom, setPerformanceWeekFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
  const [performanceWeekTo, setPerformanceWeekTo] = useState(() => todayKey());
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [reportTotal, setReportTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [driverPerformanceRows, setDriverPerformanceRows] = useState([]);
  const [unitPerformanceRows, setUnitPerformanceRows] = useState([]);
  const [performanceMonthOptions, setPerformanceMonthOptions] = useState([]);
  const { notify } = useFeedback();
  const { user } = useAuth();
  const canViewCommercial = hasPermission(user, 'commercial.read');
  const canExportReport = hasPermission(user, 'reports.export');
  const isDriverPerformanceRoute = location.pathname === '/driver-performance';
  const isUnitPerformanceRoute = location.pathname === '/unit-performance';
  const isDriverPerformanceView = activeReport === 'driver-performance';
  const isUnitPerformanceView = activeReport === 'unit-performance';

  const customers = useMemo(() => [...new Set(rows.map((row) => row.customer).filter(Boolean))], [rows]);

  useEffect(() => {
    if (isDriverPerformanceRoute) {
      setActiveReport('driver-performance');
      return;
    }
    if (isUnitPerformanceRoute) {
      setActiveReport('unit-performance');
      return;
    }
    setActiveReport((value) => (value === 'driver-performance' || value === 'unit-performance' ? 'sales' : value));
  }, [isDriverPerformanceRoute, isUnitPerformanceRoute]);

  useEffect(() => {
    setPage(1);
  }, [activeReport, customer, dateFrom, dateTo, query, status]);

  useEffect(() => {
    setStatus('all');
  }, [activeReport]);

  useEffect(() => {
    if (isDriverPerformanceView || isUnitPerformanceView) return undefined;
    let active = true;
    const params = {
      page: 1,
      pageSize: REPORT_PAGE_SIZE,
      query: query.trim(),
      dateFrom,
      dateTo,
    };
    if (activeReport === 'sales') {
      params.status = normalizeStatus(status);
      if (customer !== 'all') params.customer = customer;
    } else {
      params.status = activeReport === 'archive' ? 'completed' : normalizeStatus(status);
    }

    setLoading(true);
    setError('');
    const request = activeReport === 'sales'
      ? fetchSalesOrderReport(params)
      : fetchOperationReport(params);

    request
      .then((result) => {
        if (!active) return;
        const resultRows = Array.isArray(result?.rows) ? result.rows : [];
        const nextRows = activeReport === 'sales'
          ? resultRows.map(normalizeSalesRow)
          : resultRows.map(normalizeOperationRow);
        setRows(nextRows);
        setSummary(result?.summary || {});
        setReportTotal(Number(result?.total) || nextRows.length);
      })
      .catch((requestError) => {
        if (!active) return;
        setRows([]);
        setSummary({});
        setReportTotal(0);
        setError(requestError.message || 'Laporan gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeReport, customer, dateFrom, dateTo, isDriverPerformanceView, isUnitPerformanceView, query, status]);

  useEffect(() => {
    if (!isDriverPerformanceView) return undefined;
    let active = true;
    setLoading(true);
    setError('');

    fetchDriverPerformanceReport({
      month: performanceMonth,
      weekFrom: performanceWeekFrom,
      weekTo: performanceWeekTo,
    })
      .then((result) => {
        if (!active) return;
        setDriverPerformanceRows(Array.isArray(result?.rows) ? result.rows : []);
        setPerformanceMonthOptions(Array.isArray(result?.months) ? result.months : []);
      })
      .catch((requestError) => {
        if (!active) return;
        setDriverPerformanceRows([]);
        setError(requestError.message || 'Resume driver gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isDriverPerformanceView, performanceMonth, performanceWeekFrom, performanceWeekTo]);

  useEffect(() => {
    if (!isUnitPerformanceView) return undefined;
    let active = true;
    setLoading(true);
    setError('');

    const weeklyParams = {
      page: 1,
      pageSize: REPORT_PAGE_SIZE,
      status: 'completed',
      dateFrom: performanceWeekFrom,
      dateTo: performanceWeekTo,
    };
    const monthlyRange = monthRange(performanceMonth);
    const monthlyParams = {
      page: 1,
      pageSize: REPORT_PAGE_SIZE,
      status: 'completed',
      dateFrom: monthlyRange.from,
      dateTo: monthlyRange.to,
    };

    Promise.all([
      fetchOperationReport(weeklyParams),
      fetchOperationReport(monthlyRange.from && monthlyRange.to ? monthlyParams : weeklyParams),
    ])
      .then(([weeklyResult, monthlyResult]) => {
        if (!active) return;
        const weeklyRows = Array.isArray(weeklyResult?.rows) ? weeklyResult.rows.map(normalizeOperationRow) : [];
        const monthlyRows = Array.isArray(monthlyResult?.rows) ? monthlyResult.rows.map(normalizeOperationRow) : [];
        setUnitPerformanceRows(mergeUnitPerformanceRows(weeklyRows, monthlyRows));
        if (!performanceMonthOptions.length) {
          const monthValues = new Set(
            [...weeklyRows, ...monthlyRows]
              .map((row) => String(row.completedAt || row.updatedAt || row.receivedAt || '').slice(0, 7))
              .filter(Boolean),
          );
          setPerformanceMonthOptions(Array.from(monthValues)
            .sort()
            .reverse()
            .map((value) => ({ value, label: value })));
        }
      })
      .catch((requestError) => {
        if (!active) return;
        setUnitPerformanceRows([]);
        setError(requestError.message || 'Resume unit gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isUnitPerformanceView, performanceMonth, performanceWeekFrom, performanceWeekTo, performanceMonthOptions.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalValue = activeReport === 'sales'
    ? Number(summary.revenue || rows.reduce((total, order) => total + (order.totalAmount || 0), 0))
    : 0;
  const totalContainers = activeReport === 'sales'
    ? Number(summary.containers || rows.reduce((total, order) => total + Number(order.quantity || order.containers?.length || 0), 0))
    : rows.length;
  const completedJobs = activeReport === 'operational'
    ? Number(summary.completed || rows.filter((job) => job.status === 'completed').length)
    : rows.filter((job) => job.status === 'completed').length;
  const totalWeeklyTrips = driverPerformanceRows.reduce((total, driver) => total + Number(driver.weeklyTrips || 0), 0);
  const totalMonthlyTrips = driverPerformanceRows.reduce((total, driver) => total + Number(driver.monthlyTrips || 0), 0);
  const topDriver = driverPerformanceRows[0] || null;
  const totalUnitWeeklyTrips = unitPerformanceRows.reduce((total, unit) => total + Number(unit.weeklyTrips || 0), 0);
  const totalUnitMonthlyTrips = unitPerformanceRows.reduce((total, unit) => total + Number(unit.monthlyTrips || 0), 0);
  const topUnit = unitPerformanceRows[0] || null;
  const activePerformanceMonthLabel = performanceMonth === 'all'
    ? 'Semua bulan'
    : performanceMonthOptions.find((item) => item.value === performanceMonth)?.label || performanceMonth;
  const hasActiveFilters = Boolean(query.trim() || customer !== 'all' || status !== 'all' || dateFrom || dateTo);

  function resetPerformanceFilters() {
    setPerformanceMonth(todayKey().slice(0, 7));
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 6);
    setPerformanceWeekFrom(new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
    setPerformanceWeekTo(new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  }

  const handleExport = () => {
    const title = activeReport === 'sales' ? 'ATMS Sales Order Report' : activeReport === 'archive' ? 'ATMS Archive Perjalanan' : 'ATMS Operational Report';
    const headers = activeReport === 'sales'
      ? getSalesReportHeaders(canViewCommercial)
      : getOperationalReportHeaders();
    const values = rows.map((row, index) => activeReport === 'sales'
      ? mapSalesReportRow(row, index, canViewCommercial)
      : mapOperationalReportRow(row, index));
    const today = new Date().toISOString().slice(0, 10);
    const reportPayload = {
      title,
      filters: [
        ['Jenis Report', activeReport === 'sales' ? 'Sales Report' : activeReport === 'archive' ? 'Archive Perjalanan' : 'Operational Report'],
        ['Kata Kunci', query.trim() || 'Semua'],
        ['Customer', customer === 'all' ? 'Semua Customer' : customer],
        ['Status', status === 'all' ? 'Semua Status' : status],
        ['Tanggal Dari', dateFrom || 'Awal'],
        ['Tanggal Sampai', dateTo || 'Akhir'],
        ['Jumlah Data', rows.length],
      ],
      headers,
      rows: values,
    };
    const excel = buildReportExcelHtml(reportPayload);
    downloadExcel(`ATMS-${activeReport}-report-${today}.xls`, excel);
    notify({
      title: 'Laporan berhasil diekspor',
      message: `${activeReport === 'sales' ? 'Sales Report' : activeReport === 'archive' ? 'Archive Perjalanan' : 'Operational Report'} memuat ${rows.length} data.`,
      type: 'info',
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={isDriverPerformanceRoute ? 'Driver Performance' : isUnitPerformanceRoute ? 'Unit Performance' : 'Management Report'}
        title={isDriverPerformanceRoute ? 'Performa Driver' : isUnitPerformanceRoute ? 'Performa Unit' : 'Laporan'}
        description={isDriverPerformanceRoute ? 'Tinjau produktivitas driver berdasarkan trip selesai dari backend API.' : isUnitPerformanceRoute ? 'Tinjau produktivitas unit/truck berdasarkan trip selesai dari backend API.' : 'Tinjau ringkasan Sales Order dan pekerjaan Operational dari backend API.'}
        actions={canExportReport ? (
          <button className="primary-button" type="button" onClick={handleExport} disabled={loading || isDriverPerformanceView || isUnitPerformanceView}>
            <Download size={17} /> Export Laporan
          </button>
        ) : null}
      />

      {!isDriverPerformanceRoute && !isUnitPerformanceRoute ? (
        <div className="report-tabs" role="tablist" aria-label="Jenis laporan">
          <button className={activeReport === 'sales' ? 'active' : ''} type="button" role="tab" aria-selected={activeReport === 'sales'} onClick={() => setActiveReport('sales')}>Sales Report</button>
          <button className={activeReport === 'operational' ? 'active' : ''} type="button" role="tab" aria-selected={activeReport === 'operational'} onClick={() => setActiveReport('operational')}>Operational Report</button>
          <button className={activeReport === 'archive' ? 'active' : ''} type="button" role="tab" aria-selected={activeReport === 'archive'} onClick={() => setActiveReport('archive')}>Archive Perjalanan</button>
        </div>
      ) : null}

      {isDriverPerformanceView ? (
        <section className="panel report-panel driver-performance-panel">
          <div className="panel-header compact">
            <div>
              <h2>Resume Performa Driver</h2>
              <p>Ringkasan trip selesai berdasarkan bulan dan rentang tanggal.</p>
            </div>
          </div>
          <div className="driver-performance-toolbar">
            <div className="driver-performance-controls">
              <label className="report-date-field">
                <span>Bulan</span>
                <select value={performanceMonth} onChange={(event) => setPerformanceMonth(event.target.value)}>
                  <option value="all">Semua Bulan</option>
                  {performanceMonthOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="report-date-field">
                <span>Minggu Dari</span>
                <input type="date" value={performanceWeekFrom} onChange={(event) => setPerformanceWeekFrom(event.target.value)} />
              </label>
              <label className="report-date-field">
                <span>Minggu Sampai</span>
                <input type="date" value={performanceWeekTo} onChange={(event) => setPerformanceWeekTo(event.target.value)} />
              </label>
            </div>
            <div className="driver-performance-actions">
              <div className="driver-performance-period">
                <span>Periode aktif</span>
                <strong>{activePerformanceMonthLabel}</strong>
                <small>{performanceWeekFrom || '-'} sampai {performanceWeekTo || '-'}</small>
              </div>
              <button type="button" className="secondary-button" onClick={resetPerformanceFilters}>Reset Filter</button>
            </div>
          </div>
          <div className="stats-grid compact-dashboard-stats">
            <StatCard title="Driver Tercatat" value={String(driverPerformanceRows.length)} detail="Berdasarkan trip selesai" icon={Truck} />
            <StatCard title="Trip Mingguan" value={String(totalWeeklyTrips)} detail="Sesuai rentang tanggal" icon={BarChart3} />
            <StatCard title="Trip Bulanan" value={String(totalMonthlyTrips)} detail="Sesuai bulan terpilih" icon={CheckCircle2} />
            <StatCard title="Driver Teratas" value={topDriver?.driver || '-'} detail={`${topDriver?.monthlyTrips || 0} trip bulan ini`} icon={BarChart3} />
          </div>
          {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat resume driver...</p></div> : null}
          {error ? <div className="archive-inline-state is-error"><h3>Resume driver gagal dimuat</h3><p>{error}</p></div> : null}
          {!loading && !error && driverPerformanceRows.length ? (
            <div className="table-wrap">
              <table className="data-table report-table responsive-data-table">
                <thead><tr><th>Driver</th><th>Trip Mingguan</th><th>Trip Bulanan</th><th>Total Trip</th></tr></thead>
                <tbody>
                  {driverPerformanceRows.slice(0, 8).map((driver) => (
                    <tr key={driver.driver}>
                      <td data-label="Driver"><strong>{driver.driver}</strong></td>
                      <td data-label="Trip Mingguan">{driver.weeklyTrips}</td>
                      <td data-label="Trip Bulanan">{driver.monthlyTrips}</td>
                      <td data-label="Total Trip">{driver.totalTrips}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!loading && !error && !driverPerformanceRows.length ? (
            <div className="role-empty-state"><Truck size={28} /><h3>Resume driver belum tersedia</h3><p>Belum ada trip selesai yang bisa dirangkum.</p></div>
          ) : null}
        </section>
      ) : null}

      {isUnitPerformanceView ? (
        <section className="panel report-panel driver-performance-panel">
          <div className="panel-header compact">
            <div>
              <h2>Resume Performa Unit</h2>
              <p>Ringkasan trip selesai per unit/truck berdasarkan bulan dan rentang tanggal.</p>
            </div>
          </div>
          <div className="driver-performance-toolbar">
            <div className="driver-performance-controls">
              <label className="report-date-field">
                <span>Bulan</span>
                <select value={performanceMonth} onChange={(event) => setPerformanceMonth(event.target.value)}>
                  <option value="all">Semua Bulan</option>
                  {performanceMonthOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="report-date-field">
                <span>Minggu Dari</span>
                <input type="date" value={performanceWeekFrom} onChange={(event) => setPerformanceWeekFrom(event.target.value)} />
              </label>
              <label className="report-date-field">
                <span>Minggu Sampai</span>
                <input type="date" value={performanceWeekTo} onChange={(event) => setPerformanceWeekTo(event.target.value)} />
              </label>
            </div>
            <div className="driver-performance-actions">
              <div className="driver-performance-period">
                <span>Periode aktif</span>
                <strong>{activePerformanceMonthLabel}</strong>
                <small>{performanceWeekFrom || '-'} sampai {performanceWeekTo || '-'}</small>
              </div>
              <button type="button" className="secondary-button" onClick={resetPerformanceFilters}>Reset Filter</button>
            </div>
          </div>
          <div className="stats-grid compact-dashboard-stats">
            <StatCard title="Unit Tercatat" value={String(unitPerformanceRows.length)} detail="Berdasarkan trip selesai" icon={Truck} />
            <StatCard title="Trip Mingguan" value={String(totalUnitWeeklyTrips)} detail="Sesuai rentang tanggal" icon={BarChart3} />
            <StatCard title="Trip Bulanan" value={String(totalUnitMonthlyTrips)} detail="Sesuai bulan terpilih" icon={CheckCircle2} />
            <StatCard title="Unit Teratas" value={topUnit?.unit || '-'} detail={`${topUnit?.monthlyTrips || 0} trip bulan ini`} icon={BarChart3} />
          </div>
          {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat resume unit...</p></div> : null}
          {error ? <div className="archive-inline-state is-error"><h3>Resume unit gagal dimuat</h3><p>{error}</p></div> : null}
          {!loading && !error && unitPerformanceRows.length ? (
            <div className="table-wrap">
              <table className="data-table report-table responsive-data-table">
                <thead><tr><th>Unit</th><th>Driver Terakhir</th><th>Trip Mingguan</th><th>Trip Bulanan</th><th>Total Trip</th></tr></thead>
                <tbody>
                  {unitPerformanceRows.slice(0, 8).map((unit) => (
                    <tr key={unit.unit}>
                      <td data-label="Unit"><strong>{unit.unit}</strong></td>
                      <td data-label="Driver Terakhir">{unit.driver}</td>
                      <td data-label="Trip Mingguan">{unit.weeklyTrips}</td>
                      <td data-label="Trip Bulanan">{unit.monthlyTrips}</td>
                      <td data-label="Total Trip">{unit.totalTrips}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!loading && !error && !unitPerformanceRows.length ? (
            <div className="role-empty-state"><Truck size={28} /><h3>Resume unit belum tersedia</h3><p>Belum ada trip selesai yang bisa dirangkum per unit.</p></div>
          ) : null}
        </section>
      ) : null}

      {!isDriverPerformanceView && !isUnitPerformanceView && activeReport === 'sales' ? (
        <div className="stats-grid compact-dashboard-stats">
          <StatCard title="Total Sales Order" value={String(summary.orders || rows.length)} detail="Sesuai filter aktif" icon={BarChart3} />
          <StatCard title="Total Container" value={String(totalContainers)} detail="Seluruh order" icon={Truck} />
          <StatCard title="Order Selesai" value={String(rows.filter((row) => row.status === 'completed').length)} detail="Sudah ditutup" icon={CheckCircle2} />
          {canViewCommercial ? <StatCard title="Nilai Pekerjaan" value={formatCurrency(totalValue)} detail="Sesuai hasil filter" icon={BarChart3} /> : <StatCard title="Akses Komersial" value="Tertutup" detail="Nilai hanya untuk Admin/Sales" icon={BarChart3} />}
        </div>
      ) : !isDriverPerformanceView && !isUnitPerformanceView && activeReport === 'archive' ? (
        <div className="stats-grid compact-dashboard-stats">
          <StatCard title="Perjalanan Selesai" value={String(rows.length)} detail="Sudah masuk archive" icon={CheckCircle2} />
          <StatCard title="20FT" value={String(rows.filter((row) => String(row.size).toUpperCase() === '20FT').length)} detail="Container selesai" icon={Truck} />
          <StatCard title="40FT" value={String(rows.filter((row) => String(row.size).toUpperCase() === '40FT').length)} detail="Container selesai" icon={Truck} />
          <StatCard title="Customer" value={String(new Set(rows.map((row) => row.customer)).size)} detail="Customer terlayani" icon={BarChart3} />
        </div>
      ) : !isDriverPerformanceView && !isUnitPerformanceView ? (
        <div className="stats-grid compact-dashboard-stats">
          <StatCard title="Total Container Job" value={String(summary.jobs || rows.length)} detail="Sesuai filter aktif" icon={Truck} />
          <StatCard title="Menunggu" value={String(summary.received || rows.filter((row) => row.status === 'received').length)} detail="Belum diproses" icon={BarChart3} />
          <StatCard title="Sedang Jalan" value={String(summary.running || rows.filter((row) => row.status === 'running').length)} detail="Dalam perjalanan" icon={Truck} />
          <StatCard title="Selesai" value={String(completedJobs)} detail="Seluruh pekerjaan" icon={CheckCircle2} />
        </div>
      ) : null}

      {isDriverPerformanceView || isUnitPerformanceView ? null : (
        <section className="panel report-panel">
          <div className="panel-header">
            <div>
              <h2>{activeReport === 'sales' ? 'Data Sales Order' : activeReport === 'archive' ? 'Archive Perjalanan' : 'Data Pekerjaan Operational'}</h2>
              <p>Gunakan filter untuk mempersempit hasil laporan.</p>
            </div>
          </div>

          <div className="report-filters">
            <label className="search-field">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activeReport === 'sales' ? 'Cari nomor SO, DO, atau customer...' : 'Cari SO, container, driver, atau truck...'} />
            </label>
            <label className="report-date-field"><span>Dari</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label className="report-date-field"><span>Sampai</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
            <select aria-label="Filter customer" value={customer} onChange={(event) => setCustomer(event.target.value)} disabled={activeReport !== 'sales'}>
              <option value="all">Semua Customer</option>
              {customers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)} disabled={activeReport === 'archive'}>
              <option value="all">Semua Status</option>
              {activeReport === 'sales' ? (
                <>
                  <option value="waiting_operational">Belum Jalan</option>
                  <option value="running">Sedang Jalan</option>
                  <option value="completed">Selesai</option>
                  <option value="cancelled">Batal</option>
                </>
              ) : (
                <>
                  <option value="received">Belum Jalan</option>
                  <option value="running">Sedang Jalan</option>
                  <option value="completed">Selesai</option>
                </>
              )}
            </select>
          </div>
          <FilterStatus
            total={reportTotal}
            filtered={rows.length}
            active={hasActiveFilters}
            label="data laporan"
            onReset={() => {
              setQuery('');
              setCustomer('all');
              setStatus('all');
              setDateFrom('');
              setDateTo('');
            }}
          />

          {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat laporan...</p></div> : null}
          {error ? <div className="archive-inline-state is-error"><h3>Laporan gagal dimuat</h3><p>{error}</p></div> : null}

          {!loading && !error && paginatedRows.length ? (
            <div className="table-wrap">
              {activeReport === 'sales' ? (
                <table className="data-table report-table responsive-data-table">
                  <thead><tr><th>Sales Order</th><th>Customer</th><th>Tanggal</th><th>Rute</th><th>Container</th>{canViewCommercial ? <th>Nilai</th> : null}<th>Status</th></tr></thead>
                  <tbody>
                    {paginatedRows.map((order) => (
                      <tr key={order.id}>
                        <td data-label="Sales Order"><div className="cell-main"><strong>{order.soNumber}</strong><span>{order.doNumber}</span></div></td>
                        <td data-label="Customer"><div className="cell-main"><strong>{order.customer}</strong><span>{order.salesName}</span></div></td>
                        <td data-label="Tanggal">{formatDate(order.soDate)}</td>
                        <td data-label="Rute">{order.origin}{' -> '}{order.destination}</td>
                        <td data-label="Container">{getContainerCount(order)}</td>
                        {canViewCommercial ? <td data-label="Nilai"><strong>{formatCurrency(order.totalAmount)}</strong></td> : null}
                        <td data-label="Status"><StatusBadge status={order.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="data-table report-table responsive-data-table">
                  <thead><tr><th>{activeReport === 'archive' ? 'SO' : 'Container Job'}</th><th>Customer</th><th>Container</th><th>Rute</th><th>Driver / Truck</th><th>{activeReport === 'archive' ? 'Selesai' : 'Diterima'}</th><th>Status</th></tr></thead>
                  <tbody>
                    {paginatedRows.map((job) => (
                      <tr key={job.id}>
                        <td data-label={activeReport === 'archive' ? 'SO' : 'Container Job'}><div className="cell-main"><strong>{activeReport === 'archive' ? job.soNumber : containerLabel(job)}</strong><span>{activeReport === 'archive' ? job.doNumber || '-' : job.soNumber}</span></div></td>
                        <td data-label="Customer">{job.customer}</td>
                        <td data-label="Container"><div className="cell-main"><strong>{containerLabel(job)}</strong><span>{job.size || '-'}</span></div></td>
                        <td data-label="Rute">{job.origin}{' -> '}{job.destination}</td>
                        <td data-label="Driver / Truck"><div className="cell-main"><strong>{job.driver || '-'}</strong><span>{job.plateNumber || '-'}</span></div></td>
                        <td data-label={activeReport === 'archive' ? 'Selesai' : 'Diterima'}>{activeReport === 'archive' ? formatDateTime(job.completedAt) : formatDateTime(job.receivedAt)}</td>
                        <td data-label="Status"><StatusBadge status={job.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
          {!loading && !error && !paginatedRows.length ? (
            <div className="role-empty-state"><Search size={28} /><h3>Data tidak ditemukan</h3><p>Ubah kata kunci atau filter untuk menampilkan data laporan lainnya.</p></div>
          ) : null}

          <div className="master-pagination">
            <span>Menampilkan {paginatedRows.length} dari {rows.length} data</span>
            <div>
              <button type="button" aria-label="Halaman sebelumnya" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={15} /></button>
              <strong>Halaman {currentPage} dari {totalPages}</strong>
              <button type="button" aria-label="Halaman berikutnya" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight size={15} /></button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default ReportsPage;
