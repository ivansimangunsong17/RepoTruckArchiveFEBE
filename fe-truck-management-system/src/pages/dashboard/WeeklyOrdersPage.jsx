import { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import WeeklyOrderSummary from '../../components/dashboard/WeeklyOrderSummary';
import { buildOperationalJobs, formatShortDate, isTerminal, todayKey, toDateKey } from '../../data/operationalDashboard';
import { fetchSalesOrders } from '../../services/archive/salesOrderService';
import { fetchDashboardReport } from '../../services/reports/reportService';
import { downloadPdfReport } from '../../utils/simplePdfReport';
import { buildWeeklyOrderDays } from '../../utils/weeklyOrderDays';

const orderTargets = {
  twentyFt: 12,
  eightFt: 8,
};
const targetNote = 'Kebutuhan Order';

function formatShipment(value) {
  const shipmentMap = {
    import: 'Import',
    export: 'Export',
    'domestik inward': 'Domestik Inward',
    'domestik outward': 'Domestik Outward',
    repo_empty: 'Repo Empty',
  };
  return shipmentMap[String(value || '').toLowerCase()] || value || '-';
}

function routeText(job) {
  if (!job?.origin || !job?.destination) return '-';
  return `${job.origin} -> ${job.destination}`;
}

function normalizeWeeklyJob(job) {
  const tripDateKey = toDateKey(job?.tripDateKey || job?.tripDate);
  return {
    ...job,
    tripDate: job?.tripDate || tripDateKey,
    tripDateKey,
  };
}

function mergeWeeklyJobs(...jobGroups) {
  const merged = new Map();
  jobGroups.flat().filter(Boolean).map(normalizeWeeklyJob).forEach((job) => {
    if (!job.tripDateKey) return;
    if (isTerminal(job) || job.tripDateKey < todayKey()) return;
    const key = job.id || `${job.soNumber || '-'}-${job.containerNumber || '-'}-${job.tripDateKey}`;
    merged.set(key, { ...merged.get(key), ...job });
  });
  return Array.from(merged.values());
}

function summarizeSelectedJobs(jobs) {
  const summary = (jobs || []).reduce((result, job) => {
    const size = String(job.size || '').toUpperCase();
    result.customers.add(job.customer || '-');
    result.orders.add(job.soNumber || job.id);
    result.containers += 1;
    result.twentyFt += size === '20FT' ? 1 : 0;
    result.fortyFt += size === '40FT' ? 1 : 0;
    return result;
  }, {
    customers: new Set(),
    orders: new Set(),
    containers: 0,
    twentyFt: 0,
    fortyFt: 0,
  });

  return {
    customerCount: summary.customers.size,
    orderCount: summary.orders.size,
    containers: summary.containers,
    twentyFt: summary.twentyFt,
    fortyFt: summary.fortyFt,
  };
}

function getOrderGap(item) {
  const kurangTwentyFt = Math.max(orderTargets.twentyFt - (item.twentyFt || 0), 0);
  const kurangEightFt = Math.max(orderTargets.eightFt - (item.fortyFt || 0), 0);
  return { kurangTwentyFt, kurangEightFt };
}

function shortageText(item) {
  const gap = getOrderGap(item);
  if (!gap.kurangTwentyFt && !gap.kurangEightFt) return 'Cukup';
  return [
    gap.kurangTwentyFt ? `20 FT x ${gap.kurangTwentyFt}` : null,
    gap.kurangEightFt ? `40FT x ${gap.kurangEightFt}` : null,
  ].filter(Boolean).join(' | ');
}

function reportDateKey(value) {
  return String(value || '').replace(/[^0-9]/g, '') || 'report';
}

function addDays(dateKey, days) {
  const date = new Date(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function WeeklyOrdersPage() {
  const [selectedDay, setSelectedDay] = useState(null);
  const [dashboard, setDashboard] = useState({ upcomingJobs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currentDateKey = todayKey();
  const visibleFutureJobs = dashboard.upcomingJobs;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.allSettled([fetchDashboardReport(), fetchSalesOrders()])
      .then(([dashboardResult, salesOrdersResult]) => {
        if (!active) return;
        const dashboardData = dashboardResult.status === 'fulfilled' ? dashboardResult.value : {};
        const upcomingJobs = Array.isArray(dashboardData.upcomingJobs)
          ? dashboardData.upcomingJobs
          : [];
        const activeJobs = Array.isArray(dashboardData.activeJobs) ? dashboardData.activeJobs : [];
        const salesOrders = salesOrdersResult.status === 'fulfilled' && Array.isArray(salesOrdersResult.value)
          ? salesOrdersResult.value
          : [];
        const salesOrderJobs = buildOperationalJobs(salesOrders, currentDateKey, false);
        const nextJobs = mergeWeeklyJobs(upcomingJobs.length ? upcomingJobs : activeJobs, salesOrderJobs);
        setDashboard({
          upcomingJobs: nextJobs,
        });
        if (dashboardResult.status === 'rejected' && salesOrdersResult.status === 'rejected') {
          setError(dashboardResult.reason?.message || salesOrdersResult.reason?.message || 'Order mingguan gagal dimuat.');
        }
      })
      .catch((requestError) => {
        if (!active) return;
        setDashboard({ upcomingJobs: [] });
        setError(requestError.message || 'Order mingguan gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentDateKey]);

  const days = buildWeeklyOrderDays(visibleFutureJobs, currentDateKey);
  const jobsByDate = useMemo(() => visibleFutureJobs.reduce((result, job) => {
    if (!job?.tripDateKey) return result;
    result[job.tripDateKey] = [...(result[job.tripDateKey] || []), job];
    return result;
  }, {}), [visibleFutureJobs]);
  const selectedJobs = selectedDay ? jobsByDate[selectedDay.dateKey] || [] : [];
  const selectedSummary = summarizeSelectedJobs(selectedJobs);

  function handleDownloadReport() {
    const totalOrders = days.reduce((total, item) => total + item.orderCount, 0);
    const totalTwentyFt = days.reduce((total, item) => total + item.twentyFt, 0);
    const totalFortyFt = days.reduce((total, item) => total + item.fortyFt, 0);
    downloadPdfReport({
      reportLabel: 'Weekly Order Planning',
      title: 'Dashboard Order Mingguan',
      subtitle: `Periode ${formatShortDate(currentDateKey)} - ${formatShortDate(addDays(currentDateKey, 6))}`,
      filename: `dashboard-order-mingguan-${reportDateKey(currentDateKey)}.pdf`,
      meta: [
        { label: 'Total Order', value: totalOrders },
        { label: 'Total 20FT', value: totalTwentyFt },
        { label: 'Total 40FT', value: totalFortyFt },
        { label: 'Target Harian', value: `20FT ${orderTargets.twentyFt} / 40FT ${orderTargets.eightFt}` },
      ],
      columns: [
        { label: 'No', width: 0.45, value: (row) => row.reportNumber, align: 'center' },
        { label: 'Tanggal Jalan', width: 1.4, value: (row) => formatShortDate(row.dateKey), bold: true },
        { label: 'Customer', width: 2.6, value: (row) => (row.customerBreakdown?.length ? row.customerBreakdown.map((item) => `${item.customer}: 20FT ${item.twentyFt}, 40FT ${item.fortyFt}`).join('; ') : '-') },
        { label: '20FT', width: 0.65, value: (row) => row.twentyFt, align: 'center' },
        { label: '40FT', width: 0.65, value: (row) => row.fortyFt, align: 'center' },
        { label: 'Kekurangan / Catatan', width: 1.9, value: (row) => shortageText(row) },
      ],
      rows: days.map((item, index) => ({ ...item, reportNumber: index + 1 })),
    });
  }

  return (
    <div className="page weekly-orders-page">
      <PageHeader
        eyebrow="Order"
        title="Order Mingguan"
        description="Ringkasan jumlah order tujuh hari ke depan berdasarkan tanggal jalan."
      />

      <div className="mb-3 flex justify-end">
        <button
          className="inline-flex min-h-[34px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-black text-slate-900 shadow-sm hover:border-red-700 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={handleDownloadReport}
          disabled={loading || Boolean(error)}
        >
          <Download size={15} /> Download PDF
        </button>
      </div>

      <div className="weekly-orders-summary-wrap">
        <WeeklyOrderSummary jobs={visibleFutureJobs} currentDateKey={currentDateKey} orderTargets={orderTargets} />
      </div>

      {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat order mingguan...</p></div> : null}
      {error ? <div className="archive-inline-state is-error"><h3>Order mingguan gagal dimuat</h3><p>{error}</p></div> : null}

      <section className="panel weekly-orders-panel">
        <div className="panel-header">
          <div>
            <h2>Detail Per Hari</h2>
            <p>Jumlah order 20FT dan 40FT berdasarkan tanggal jalan.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table weekly-orders-table responsive-data-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Tanggal Jalan</th>
                <th>Customer</th>
                <th>20FT</th>
                <th>40FT</th>
                <th>Catatan</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !error && days.map((item, index) => (
                <tr className={item.orderCount ? 'has-order' : 'empty'} key={item.dateKey}>
                  <td><strong>{index + 1}.</strong></td>
                  <td><strong>{formatShortDate(item.dateKey)}</strong></td>
                  <td>
                    <span className="weekly-customer-front" title={item.fullCustomerSummary || item.customerSummary}>
                      {item.customerBreakdown?.length ? (
                        item.customerBreakdown.map((customer) => (
                          <span className="weekly-customer-line" key={customer.customer}>{customer.customer}</span>
                        ))
                      ) : (
                        <span className="weekly-customer-empty">-</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="weekly-size-stack">
                      {item.customerBreakdown?.length ? item.customerBreakdown.map((customer) => (
                        <span key={customer.customer}>{customer.twentyFt}</span>
                      )) : <span>0</span>}
                    </span>
                  </td>
                  <td>
                    <span className="weekly-size-stack">
                      {item.customerBreakdown?.length ? item.customerBreakdown.map((customer) => (
                        <span key={customer.customer}>{customer.fortyFt}</span>
                      )) : <span>0</span>}
                    </span>
                  </td>
                  <td>
                    {shortageText(item) !== 'Cukup' ? (
                      <span className="weekly-target-stack table-note">
                        <span className="weekly-shortage-note">{shortageText(item)}</span>
                        <em>{targetNote}</em>
                      </span>
                    ) : (
                      <span className="weekly-target-stack table-note">
                        <span className="weekly-ok-note">Cukup</span>
                        <em>{targetNote}</em>
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="ops-detail-button weekly-detail-button"
                      type="button"
                      disabled={!item.totalContainers}
                      onClick={() => setSelectedDay(item)}
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedDay ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedDay(null)}>
          <section className="ops-trip-modal weekly-order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-order-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Detail Order Mingguan</span>
                <h2 id="weekly-order-detail-title">{formatShortDate(selectedDay.dateKey)}</h2>
                <p>{selectedDay.orderCount} order, {selectedDay.totalContainers} container dijadwalkan jalan.</p>
              </div>
              <button type="button" onClick={() => setSelectedDay(null)} aria-label="Tutup detail"><X size={19} /></button>
            </header>

            <div className="weekly-order-detail-body">
              {selectedJobs.length ? (
                <>
                  <div className="weekly-customer-summary">
                    <div><span>Customer</span><strong>{selectedSummary.customerCount}</strong></div>
                    <div><span>Order</span><strong>{selectedSummary.orderCount}</strong></div>
                    <div><span>Container</span><strong>{selectedSummary.containers}</strong></div>
                    <div><span>20FT</span><strong>{selectedSummary.twentyFt}</strong></div>
                    <div><span>40FT</span><strong>{selectedSummary.fortyFt}</strong></div>
                  </div>

                  <div className="table-wrap">
                    <table className="data-table weekly-order-detail-table responsive-data-table">
                      <thead>
                        <tr>
                          <th>SO</th>
                          <th>Customer</th>
                          <th>Container</th>
                          <th>Size</th>
                          <th>Jenis</th>
                          <th>Rute</th>
                          <th>Sales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedJobs.map((job) => (
                          <tr key={job.id}>
                            <td data-label="SO"><strong>{job.soNumber || '-'}</strong></td>
                            <td data-label="Customer">{job.customer || '-'}</td>
                            <td data-label="Container">{job.containerNumber || '-'}</td>
                            <td data-label="Size">{job.size || '-'}</td>
                            <td data-label="Jenis">{formatShipment(job.shipment)}</td>
                            <td data-label="Rute" title={routeText(job)}>{routeText(job)}</td>
                            <td data-label="Sales">{job.salesName || job.createdBy || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="role-empty-state">
                  <h3>Belum ada order</h3>
                  <p>Tanggal ini belum memiliki order/container yang dijadwalkan jalan.</p>
                </div>
              )}
            </div>

            <footer>
              <button className="secondary-button" type="button" onClick={() => setSelectedDay(null)}>Tutup</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default WeeklyOrdersPage;
