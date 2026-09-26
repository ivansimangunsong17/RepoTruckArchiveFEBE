import { useEffect, useState } from 'react';
import { Archive, Download, FileText, History, Truck, X } from 'lucide-react';
import { formatShortDate, normalizeSize, todayKey } from '../../data/operationalDashboard';
import { fetchDashboardReport } from '../../services/reports/reportService';
import { formatDateTime } from '../../utils/formatDate';

function formatShipment(value) {
  const shipmentMap = {
    import: 'Import',
    export: 'Export',
    'domestik inward': 'Domestik Inward',
    'domestik outward': 'Domestik Outward',
    repo_empty: 'Repo Empty',
    repo_full: 'Repo Full',
  };
  return shipmentMap[String(value || '').toLowerCase()] || value || '-';
}

function destinationText(job) {
  return job?.destination || '-';
}

function normalizeTruck(truck) {
  return {
    id: truck.id || truck.plateNumber,
    plateNumber: truck.plateNumber,
    unitCode: truck.unitCode,
    status: truck.status || truck.operationalStatus || truck.operational_status || 'Aktif',
    // "capacity" adalah ukuran master truck sendiri (vehicles.container_size) -- TIDAK boleh dipakai
    // sebagai pengganti ukuran chassis yang benar-benar terpasang (chassisSize). Dashboard ini cuma
    // boleh menampilkan ukuran operasional (chassis terpasang), bukan ukuran default master truck.
    capacity: normalizeSize(truck.capacity || truck.containerSize || truck.size || truck.defaultSize || '20FT'),
    chassisCode: truck.chassisCode || truck.chassis_code || truck.kirChassisNumber || truck.kir_chassis_number || '',
    chassisSize: normalizeSize(truck.chassisSize || truck.chassis_size),
    driver: truck.defaultDriver || truck.default_driver_name || truck.defaultDriverName || truck.lastDriver || '-',
    driverFullName: truck.defaultDriverFullName || truck.defaultDriver || truck.default_driver_name || truck.defaultDriverName || truck.lastDriver || '-',
    driverNickname: truck.defaultDriverNickname || truck.default_driver_nickname || '',
  };
}

function getRowDriverIdentity(row) {
  const fullName = row?.job?.driverFullName || row?.job?.driver || row?.truck?.driverFullName || row?.truck?.driver || '-';
  const displayName = row?.job?.driverNickname || row?.truck?.driverNickname || fullName;
  return { displayName, fullName };
}

function isTruckAvailableForDashboard(truck) {
  const status = String(truck?.status || '').trim().toLowerCase();
  return ['aktif', 'siap'].includes(status);
}

function isTruckMaintenance(truck) {
  const status = String(truck?.status || '').trim().toLowerCase();
  return status.includes('maintenance') || status.includes('maintanance');
}

function isActiveDashboardJob(job) {
  return ['received', 'running', 'Belum Jalan', 'Sedang Jalan'].includes(job?.status);
}

function isRepoStoredDashboardJob(job) {
  return Boolean(job?.status === 'repo_stored' || (job?.repoStoredAt && !job?.repoPickedUpAt));
}

function repoConditionLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'loaded') return 'Isi';
  if (normalized === 'empty') return 'Kosong';
  return value || 'Kondisi belum diisi';
}

function formatTruckNumber(unitCode) {
  const value = String(unitCode || '-').trim();
  if (!value || value === '-') return '-';
  return value.replace(/^TRK-?/i, '').replace(/^0+(\d)/, '$1') || value;
}

function getTruckSortKey(unitCode) {
  const normalized = formatTruckNumber(unitCode);
  const numeric = Number(String(normalized).match(/\d+/)?.[0]);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function getTruckSizeSortKey(truck) {
  const size = normalizeSize(truck?.chassisSize);
  if (size === '20FT') return 0;
  if (size === '40FT') return 1;
  return 2;
}

function chassisSizeLabel(truck) {
  const size = normalizeSize(truck?.chassisSize);
  if (size === '20FT') return '20FT';
  if (size === '40FT') return '40FT';
  return 'Belum Ada Chassis';
}

function documentSummary(job) {
  if (!job) return ['-'];
  const documents = [
    job.spkNumber && `SPK ${job.spkNumber}`,
    job.travelDocument && `Surat Jalan ${job.travelDocument}`,
    job.loadingVoucher && `Bon Muat ${job.loadingVoucher}`,
    (job.tilaGatepassDocument || job.unloadingVoucher || job.weighingDocument)
      && `TILA/Gatepass ${job.tilaGatepassDocument || job.unloadingVoucher || job.weighingDocument}`,
  ].filter(Boolean);
  return documents.length ? documents : ['Belum ada dokumen tercatat'];
}

function historySummary(job) {
  if (!job) return ['Belum ada riwayat perjalanan aktif'];
  return [
    job.receivedAt && `Order diterima ${formatShortDate(job.receivedAt)}`,
    job.runningAt && `Mulai jalan ${formatShortDate(job.runningAt)}`,
    job.completedAt && `Selesai ${formatShortDate(job.completedAt)}`,
  ].filter(Boolean);
}

function buildTruckRows(trucks, jobs) {
  return trucks.map((truck) => {
    const activeJob = jobs.find((job) => job.plateNumber === truck.plateNumber || job.truck === truck.plateNumber);
    return {
      id: `${truck.plateNumber}-${activeJob?.id || 'empty'}`,
      truck,
      job: activeJob || null,
    };
  }).sort((a, b) => {
    const sizeDiff = getTruckSizeSortKey(a.truck) - getTruckSizeSortKey(b.truck);
    if (sizeDiff) return sizeDiff;
    const left = getTruckSortKey(a.truck.unitCode);
    const right = getTruckSortKey(b.truck.unitCode);
    if (left !== right) return left - right;
    return String(formatTruckNumber(a.truck.unitCode)).localeCompare(String(formatTruckNumber(b.truck.unitCode)), 'id-ID', { numeric: true });
  });
}

function getAvailability(trucks, activeJobs) {
  const availableTrucks = trucks.filter(isTruckAvailableForDashboard);
  const summary = {
    '20FT': { total: 0, activePlates: new Set() },
    '40FT': { total: 0, activePlates: new Set() },
  };

  // Hitung berdasarkan ukuran chassis yang BENAR-BENAR terpasang (chassisSize), bukan ukuran
  // default master truck (capacity) -- truck aktif tanpa chassis sengaja tidak masuk bucket manapun.
  availableTrucks.forEach((truck) => {
    const truckSize = normalizeSize(truck.chassisSize);
    if (summary[truckSize]) summary[truckSize].total += 1;
  });

  activeJobs.forEach((job) => {
    const plateNumber = job.plateNumber || job.truck;
    if (!plateNumber) return;
    const truck = availableTrucks.find((item) => item.plateNumber === plateNumber);
    if (!truck) return;
    const activeSize = normalizeSize(truck?.chassisSize);
    if (summary[activeSize]) summary[activeSize].activePlates.add(plateNumber);
  });

  return Object.entries(summary).map(([size, item]) => ({
    size,
    total: item.total,
    active: item.activePlates.size,
    gap: item.total - item.activePlates.size,
  }));
}

function availabilityStatus(item) {
  if (item.gap < 0) return `Kurang ${Math.abs(item.gap)} Truck`;
  return `${Math.max(item.gap, 0)} Unit`;
}

function availabilityTone(item) {
  if (item.gap > 0) return 'available';
  if (item.gap < 0) return 'shortage';
  return 'balanced';
}

function availabilityBadgeLabel(item) {
  if (item.gap > 0) return 'Siap Pakai';
  if (item.gap < 0) return 'Kurang';
  return 'Penuh';
}

function availabilityCardClass(item) {
  if (item.gap < 0) return 'border-red-200 bg-red-50 text-red-800';
  return 'border-emerald-200 bg-white text-slate-950';
}

function availabilityNumberClass(item) {
  if (item.gap < 0) return 'text-red-700';
  return 'text-emerald-700';
}

function reportDateKey(value) {
  return String(value || '').replace(/[^0-9]/g, '') || 'report';
}

function formatReportDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(parsed);
}

function normalizeReportText(value) {
  return String(value || '-').trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizeReportStatus(status) {
  if (status === 'completed') return 'SELESAI';
  if (status === 'running') return 'SEDANG JALAN';
  if (status === 'inap') return 'INAP';
  if (status === 'repo_stored') return 'CONTAINER TITIP';
  if (status === 'cancelled') return 'BATAL';
  return 'BELUM JALAN';
}

function normalizeReportSize(value) {
  const size = normalizeSize(value);
  if (size === '20FT') return '20';
  if (size === '40FT') return '40';
  return size ? size.replace('FT', '') : '-';
}

function reportDriverPlateLabel(row) {
  const driver = normalizeReportText(getRowDriverIdentity(row).displayName || row?.truck?.plateNumber);
  const plate = normalizeReportText(row?.job?.plateNumber || row?.job?.truck || row?.truck?.plateNumber);
  if (!plate || plate === '-' || plate === driver) return driver;
  return `${driver} / ${plate}`;
}

function reportGroupKey(job) {
  const orderIdentity = job?.orderId || job?.salesOrderId || job?.soNumber || job?.salesOrderNumber;
  if (orderIdentity) return `order:${orderIdentity}`;
  return [
    'fallback',
    job?.shipment || '',
    job?.customer || '',
    job?.destination || '',
  ].join('|');
}

function buildProgressReportSections(rows = [], reportDate) {
  const assignedRows = rows.filter((row) => row.job);
  const groups = new Map();
  assignedRows.forEach((row) => {
    const key = reportGroupKey(row.job);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const orderSections = Array.from(groups.values()).map((items) => {
    const first = items[0]?.job || {};
    const completedItems = items.filter((item) => item.job?.status === 'completed');
    const runningItems = items.filter((item) => ['running', 'repo_stored', 'inap'].includes(item.job?.status));
    const waitingItems = items.filter((item) => !['completed', 'running', 'repo_stored', 'inap'].includes(item.job?.status));
    const vendorItems = items.filter((item) => item.job?.executionSource === 'vendor');
    const internalItems = items.filter((item) => item.job?.executionSource !== 'vendor');
    const actionableItems = items.filter((item) => item.job?.status !== 'completed');
    const assignedItems = actionableItems.filter((item) => reportDriverPlateLabel(item) !== '-');
    const unassignedItems = actionableItems.filter((item) => reportDriverPlateLabel(item) === '-');
    const sizeCounts = items.reduce((accumulator, item) => {
      const size = normalizeReportSize(item.job?.size || item.job?.containerSize || item.truck?.chassisSize);
      accumulator[size] = (accumulator[size] || 0) + 1;
      return accumulator;
    }, {});
    const orderedSizes = ['20', '40'].filter((size) => sizeCounts[size]).concat(
      Object.keys(sizeCounts).filter((size) => !['20', '40'].includes(size)).sort(),
    );
    const party = orderedSizes.map((size) => `${sizeCounts[size]}X${size}`).join(' + ');
    return {
      title: [
        normalizeReportText(formatShipment(first.shipment)),
        normalizeReportText(first.customer || first.salesName || first.soNumber),
        normalizeReportText(first.destination),
      ].filter((part) => part && part !== '-').join(' '),
      subtitle: [first.soNumber ? `SO ${normalizeReportText(first.soNumber)}` : '', party].filter(Boolean).join(' - '),
      metrics: [
        { label: 'SELESAI', value: completedItems.length, color: '#047857' },
        { label: 'BERJALAN', value: runningItems.length, color: '#334155' },
        { label: 'BELUM JALAN', value: waitingItems.length, color: '#334155' },
        { label: 'TOTAL RITASI', value: items.length, color: '#0f172a' },
      ],
      summary: `PELAKSANAAN: ${internalItems.length} UNIT SENDIRI | ${vendorItems.length} VENDOR`,
      numbered: true,
      lines: assignedItems.map((item) => `${reportDriverPlateLabel(item)} - ${normalizeReportStatus(item.job?.status)}`),
      footer: unassignedItems.length ? `BELUM JALAN: ${unassignedItems.length} RITASI` : '',
    };
  });
  const waitingRows = rows.filter((row) => !row.job && !isTruckMaintenance(row.truck));
  const maintenanceRows = rows.filter((row) => isTruckMaintenance(row.truck));
  const sections = orderSections.length
    ? [...orderSections]
    : [{ title: `BELUM ADA ORDER TGL ${formatReportDate(reportDate)}`, lines: ['BELUM ADA ORDER BERJALAN'] }];
  if (waitingRows.length) {
    sections.push({
      title: 'DI GARASI / TUNGGU ORDER',
      lines: waitingRows.map((row) => `${reportDriverPlateLabel(row)} - TUNGGU ORDER`),
    });
  }
  if (maintenanceRows.length) {
    sections.push({
      title: 'UNIT MAINTENANCE',
      lines: maintenanceRows.map((row) => `${normalizeReportText(row.truck.plateNumber || row.truck.unitCode)} - MAINTENANCE`),
    });
  }
  return sections;
}

function wrapCanvasText(context, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function downloadProgressReportPng({ sections, reportDate, lastUpdateLabel }) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak mendukung export gambar.');
  const width = 1080;
  const padding = 48;
  const contentWidth = width - padding * 2;
  const sectionGap = 22;
  const lineHeight = 30;
  const wrappedSections = sections.map((section) => {
    context.font = '900 25px Arial';
    const titleLines = wrapCanvasText(context, section.title, contentWidth);
    context.font = '800 20px Arial';
    const subtitleLines = section.subtitle ? wrapCanvasText(context, section.subtitle, contentWidth) : [];
    context.font = '600 21px Arial';
    const summaryLines = section.summary ? wrapCanvasText(context, section.summary, contentWidth) : [];
    const bodyLines = (section.lines || []).flatMap((line, index) => (
      wrapCanvasText(context, section.numbered ? `${index + 1}. ${line}` : line, contentWidth)
    ));
    const footerLines = section.footer ? wrapCanvasText(context, section.footer, contentWidth) : [];
    return { ...section, titleLines, subtitleLines, summaryLines, bodyLines, footerLines, metricHeight: section.metrics?.length ? 54 : 0 };
  });
  const height = Math.max(480, padding * 2 + 78 + wrappedSections.reduce((total, section) => (
    total + 10 + section.titleLines.length * 34
      + section.subtitleLines.length * 28
      + section.summaryLines.length * lineHeight
      + section.metricHeight
      + section.bodyLines.length * lineHeight
      + section.footerLines.length * lineHeight
      + sectionGap
  ), 0));
  canvas.width = width;
  canvas.height = height;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#b91c1c';
  context.fillRect(0, 0, width, 10);
  let y = padding;
  context.fillStyle = '#111827';
  context.font = '900 34px Arial';
  context.fillText('REPORT PROGRESS ORDER', padding, y);
  y += 36;
  context.fillStyle = '#64748b';
  context.font = '700 18px Arial';
  context.fillText(`Tanggal ${formatReportDate(reportDate)} - Last Update ${lastUpdateLabel}`, padding, y);
  y += 34;

  wrappedSections.forEach((section) => {
    y += 10;
    context.fillStyle = '#b91c1c';
    context.font = '900 25px Arial';
    section.titleLines.forEach((line) => {
      context.fillText(line, padding, y);
      y += 34;
    });
    context.fillStyle = '#475569';
    context.font = '800 20px Arial';
    section.subtitleLines.forEach((line) => {
      context.fillText(line, padding, y);
      y += 28;
    });
    if (section.metrics?.length) {
      const metricGap = 8;
      const metricWidth = (contentWidth - metricGap * (section.metrics.length - 1)) / section.metrics.length;
      section.metrics.forEach((metric, index) => {
        const metricX = padding + index * (metricWidth + metricGap);
        if (metric.background) {
          context.fillStyle = metric.background;
          context.fillRect(metricX, y, metricWidth, 40);
        }
        context.fillStyle = metric.color;
        context.font = '800 17px Arial';
        context.fillText(`${metric.value} ${metric.label}`, metricX, y + 22);
      });
      y += 54;
    }
    context.fillStyle = '#475569';
    context.font = '700 21px Arial';
    section.summaryLines.forEach((line) => {
      context.fillText(line, padding, y);
      y += lineHeight;
    });
    context.fillStyle = '#111827';
    context.font = '600 21px Arial';
    section.bodyLines.forEach((line) => {
      context.fillText(line, padding, y);
      y += lineHeight;
    });
    context.fillStyle = '#b45309';
    context.font = '700 21px Arial';
    section.footerLines.forEach((line) => {
      context.fillText(line, padding, y);
      y += lineHeight;
    });
    y += sectionGap;
  });

  const link = document.createElement('a');
  link.download = `progress-unit-${reportDateKey(reportDate)}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function rowStatusLabel(row) {
  if (isTruckMaintenance(row.truck)) return 'Maintenance';
  return row.job ? 'Assign' : 'Unassign';
}

function rowStatusClass(row) {
  if (isTruckMaintenance(row.truck)) return 'border-amber-300 bg-amber-100 text-amber-800';
  if (row.job) return 'border-emerald-300 bg-emerald-100 text-emerald-700';
  return 'border-slate-300 bg-slate-100 text-slate-500';
}

function getLastOperationalUpdate(jobs = []) {
  const latest = jobs
    .map((job) => job.updatedAt || job.runningAt || job.receivedAt || '')
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return latest ? latest.toISOString() : '';
}

function formatRunningDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(parsed);
}

function TodayTruckDashboard() {
  const [selectedRow, setSelectedRow] = useState(null);
  const [dashboard, setDashboard] = useState({ trucks: [], activeJobs: [], progressJobs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currentDateKey = todayKey();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    fetchDashboardReport()
      .then((result) => {
        if (!active) return;
        setDashboard({
          trucks: Array.isArray(result.trucks) ? result.trucks : [],
          activeJobs: Array.isArray(result.activeJobs) ? result.activeJobs : [],
          progressJobs: Array.isArray(result.progressJobs) ? result.progressJobs : [],
        });
      })
      .catch((requestError) => {
        if (!active) return;
        setDashboard({ trucks: [], activeJobs: [], progressJobs: [] });
        setError(requestError.message || 'Order berjalan gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const sourceTrucks = dashboard.trucks;
  const sourceRepoJobs = dashboard.activeJobs.filter(isRepoStoredDashboardJob);
  const sourceJobs = dashboard.activeJobs.filter(isActiveDashboardJob);
  const truckRows = sourceTrucks.map(normalizeTruck);
  const rows = buildTruckRows(truckRows, sourceJobs);
  const availability = getAvailability(truckRows, sourceJobs);
  const lastOperationalUpdate = getLastOperationalUpdate(dashboard.activeJobs);
  const lastOperationalUpdateLabel = formatDateTime(lastOperationalUpdate);

  function handleDownloadReport() {
    const reportRows = dashboard.progressJobs.length
      ? dashboard.progressJobs.map((job) => ({
        job,
        truck: {
          plateNumber: job.plateNumber,
          defaultDriver: job.driver,
          defaultDriverFullName: job.driverFullName,
          defaultDriverNickname: job.driverNickname,
        },
      }))
      : rows;
    downloadProgressReportPng({
      sections: buildProgressReportSections(reportRows, currentDateKey),
      reportDate: currentDateKey,
      lastUpdateLabel: lastOperationalUpdateLabel,
    });
  }

  return (
    <div className="page today-truck-live-page -mt-1 space-y-2">
      <header className="today-live-page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="m-0 text-[22px] font-black leading-none text-slate-950">Order Berjalan Hari Ini</h1>
          </div>
          <p className="m-0 mt-1 text-[12px] font-semibold leading-none text-slate-500">{formatRunningDate(currentDateKey)}</p>
        </div>
        <div className="today-live-actions flex flex-col items-start gap-1.5 sm:items-end">
          <button
            className="inline-flex min-h-[34px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-black text-slate-900 shadow-sm hover:border-red-700 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={handleDownloadReport}
            disabled={loading || Boolean(error)}
          >
            <Download size={15} /> Download Report
          </button>
          <p className="m-0 text-[12px] font-semibold leading-none text-slate-500">Last Update: {lastOperationalUpdateLabel}</p>
        </div>
      </header>
      {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat dashboard truck...</p></div> : null}
      {error ? <div className="archive-inline-state is-error"><h3>Order berjalan gagal dimuat</h3><p>{error}</p></div> : null}
      {!loading && !error && sourceRepoJobs.length ? (
        <section
          aria-label="Notifikasi container titip"
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-amber-700 ring-1 ring-amber-200">
              <Archive size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="m-0 text-sm font-black leading-tight">{sourceRepoJobs.length} container sedang dititipkan</h2>
              <p className="m-0 mt-1 text-xs font-semibold leading-snug text-amber-800">
                Pantau container titip di repo. Truck dan sopirnya sudah bisa dipakai untuk pekerjaan lain.
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap justify-start gap-1.5 sm:justify-end">
            {sourceRepoJobs.slice(0, 4).map((job) => (
              <span
                className="max-w-full rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-900 shadow-sm"
                key={job.id}
                title={`${job.containerNumber || '-'} - ${job.repoLocation || 'Lokasi belum diisi'}`}
              >
                {job.containerNumber || job.soNumber || '-'} - {job.repoLocation || 'Lokasi belum diisi'} - {repoConditionLabel(job.repoContainerCondition)}
              </span>
            ))}
            {sourceRepoJobs.length > 4 ? (
              <span className="rounded-md border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900">
                +{sourceRepoJobs.length - 4} lainnya
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
      <section className="today-live-panel overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="today-live-availability grid items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:grid-cols-[260px_1fr]" aria-label="Ketersediaan Truck Hari Ini">
          <div className="flex items-center pl-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="block text-[17px] font-black leading-none text-slate-950">Tersedia Saat Ini</span>
            </div>
          </div>
          <div className="today-live-availability-cards grid gap-2 md:grid-cols-2">
            {availability.map((item) => (
              <article
                className={`today-live-availability-card flex min-h-[38px] items-center justify-between gap-3 rounded-lg border px-3 py-1 shadow-[inset_3px_0_0_rgba(16,185,129,0.95)] ${availabilityTone(item) === 'shortage' ? 'shadow-[inset_3px_0_0_rgba(220,38,38,0.95)]' : ''} ${availabilityCardClass(item)}`}
                key={item.size}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-700">{availabilityBadgeLabel(item)}</span>
                  <strong className="text-[20px] font-black leading-none text-slate-950">{item.size}</strong>
                </div>
                <span className={`whitespace-nowrap text-[16px] font-black leading-none ${availabilityNumberClass(item)}`}>{availabilityStatus(item)}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="today-live-table-wrap overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-[11px]">
            <colgroup>
              <col className="w-[5%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                <th className="px-2.5 py-1 text-center text-[10px] font-black uppercase text-slate-500">No</th>
                <th className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">No Lambung</th>
                <th className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Plat</th>
                <th className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Nama Sopir</th>
                <th className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">No Container</th>
                <th className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Jenis Order</th>
                <th className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Chassis / Size</th>
                <th className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Tujuan</th>
                <th className="px-2.5 py-1 text-center text-[10px] font-black uppercase text-slate-500">Status</th>
                <th className="px-2.5 py-1 text-center text-[10px] font-black uppercase text-slate-500">Detail</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !error && rows.map((row, index) => (
                <tr className={`border-t border-slate-200 odd:bg-white even:bg-slate-50/45 hover:bg-red-50/40 ${isTruckMaintenance(row.truck) ? '!bg-amber-50/70' : ''}`} key={row.id}>
                  <td className="px-2.5 py-0.5 text-center font-black text-slate-800" data-label="No">
                    {index + 1}
                  </td>
                  <td className="truncate px-2.5 py-0.5 font-black text-slate-800" data-label="No Lambung" title={row.truck.unitCode || '-'}>
                    {formatTruckNumber(row.truck.unitCode)}
                  </td>
                  <td className="px-2.5 py-0.5" data-label="Plat">
                    <div className="flex min-w-0 items-center gap-1.5" title={row.truck.plateNumber || '-'}>
                      <Truck className={`shrink-0 ${isTruckMaintenance(row.truck) ? 'text-amber-700' : 'text-red-700'}`} size={12} />
                      <strong className="min-w-0 truncate font-black leading-none text-slate-900">{row.truck.plateNumber || '-'}</strong>
                      {isTruckMaintenance(row.truck) ? <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[9px] font-black uppercase text-amber-800">Maint</span> : null}
                    </div>
                  </td>
                  <td className="truncate px-2.5 py-0.5 text-slate-700" data-label="Nama Sopir" title={getRowDriverIdentity(row).fullName}>{getRowDriverIdentity(row).displayName}</td>
                  <td className="truncate px-2.5 py-0.5 text-slate-700" data-label="No Container" title={row.job?.containerNumber || '-'}>{row.job?.containerNumber || '-'}</td>
                  <td className="truncate px-2.5 py-0.5 text-slate-700" data-label="Jenis Order" title={formatShipment(row.job?.shipment)}>{formatShipment(row.job?.shipment)}</td>
                  <td className="truncate px-2.5 py-0.5 font-bold text-slate-700" data-label="Chassis / Size" title={chassisSizeLabel(row.truck)}>{chassisSizeLabel(row.truck)}</td>
                  <td className="truncate px-2.5 py-0.5 text-slate-700" data-label="Tujuan" title={destinationText(row.job)}>{destinationText(row.job)}</td>
                  <td className="px-2.5 py-0.5 text-center" data-label="Status">
                    <span
                      className={`inline-flex min-h-5 items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-black ${rowStatusClass(row)}`}
                      title={rowStatusLabel(row)}
                    >
                      {rowStatusLabel(row)}
                    </span>
                  </td>
                  <td className="px-2.5 py-0.5 text-center" data-label="Detail">
                    <button className="rounded border border-slate-300 bg-white px-2 py-0 text-[10px] font-black text-slate-950 shadow-sm hover:border-red-700 hover:text-red-700" type="button" onClick={() => setSelectedRow(row)}>
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="today-live-mobile-list" aria-label="Daftar truck mobile">
          {!loading && !error && rows.map((row, index) => (
            <article
              className={`today-live-mobile-card ${row.job ? 'is-assigned' : 'is-unassigned'} ${isTruckMaintenance(row.truck) ? 'is-maintenance' : ''}`.trim()}
              key={`mobile-${row.id}`}
            >
              <div className="today-live-mobile-head">
                <span className="today-live-mobile-index">{index + 1}</span>
                <div className="today-live-mobile-title">
                  <strong>{row.truck.plateNumber || '-'}</strong>
                  <small>{formatTruckNumber(row.truck.unitCode)} - {chassisSizeLabel(row.truck)}</small>
                </div>
                <span className={`today-live-mobile-status ${rowStatusClass(row)}`}>
                  {rowStatusLabel(row)}
                </span>
              </div>
              <div className="today-live-mobile-grid">
                <div>
                  <span>Sopir</span>
                  <strong title={getRowDriverIdentity(row).fullName}>{getRowDriverIdentity(row).displayName}</strong>
                </div>
                <div>
                  <span>Container</span>
                  <strong>{row.job?.containerNumber || '-'}</strong>
                </div>
                <div>
                  <span>Order</span>
                  <strong>{formatShipment(row.job?.shipment)}</strong>
                </div>
                <div>
                  <span>Tujuan</span>
                  <strong>{destinationText(row.job)}</strong>
                </div>
              </div>
              <button className="today-live-mobile-detail" type="button" onClick={() => setSelectedRow(row)}>
                Detail
              </button>
            </article>
          ))}
        </div>
        {!loading && !error && !rows.length ? (
          <div className="role-empty-state">
            <Truck size={28} />
            <h3>Data truck belum tersedia</h3>
            <p>Belum ada truck aktif dari backend API.</p>
          </div>
        ) : null}
      </section>

      {selectedRow ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedRow(null)}>
          <section className="ops-trip-modal today-truck-modal" role="dialog" aria-modal="true" aria-labelledby="today-truck-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Detail Truck Hari Ini</span>
                <h2 id="today-truck-detail-title">{selectedRow.truck.plateNumber || '-'}</h2>
                <p>{selectedRow.job ? destinationText(selectedRow.job) : 'Belum ada muatan aktif'}</p>
              </div>
              <button type="button" onClick={() => setSelectedRow(null)} aria-label="Tutup detail"><X size={19} /></button>
            </header>

            <div className="today-truck-detail-body">
              <div className="today-truck-detail-grid">
                <div><span>No Lambung</span><strong>{selectedRow.truck.unitCode || '-'}</strong></div>
                <div><span>Plat</span><strong>{selectedRow.truck.plateNumber || '-'}</strong></div>
                <div><span>Nama Sopir</span><strong title={getRowDriverIdentity(selectedRow).fullName}>{getRowDriverIdentity(selectedRow).displayName}</strong></div>
                <div><span>Status</span><strong>{rowStatusLabel(selectedRow)}</strong></div>
                <div><span>Nomor SO</span><strong>{selectedRow.job?.soNumber || '-'}</strong></div>
                <div><span>Customer</span><strong>{selectedRow.job?.customer || '-'}</strong></div>
                <div><span>Sales/PIC</span><strong>{selectedRow.job?.salesName || selectedRow.job?.createdBy || '-'}</strong></div>
                <div><span>No Container</span><strong>{selectedRow.job?.containerNumber || '-'}</strong></div>
                <div><span>Jenis Orderan</span><strong>{formatShipment(selectedRow.job?.shipment)}</strong></div>
                <div><span>Chassis / Size</span><strong>{chassisSizeLabel(selectedRow.truck)}</strong></div>
                <div><span>Tujuan</span><strong>{destinationText(selectedRow.job)}</strong></div>
                <div><span>Tanggal Jalan</span><strong>{selectedRow.job ? formatShortDate(selectedRow.job.tripDate) : '-'}</strong></div>
              </div>

              <div className="today-truck-detail-columns">
                <article>
                  <h3><FileText size={16} /> Dokumen</h3>
                  {documentSummary(selectedRow.job).map((item) => <p key={item}>{item}</p>)}
                </article>
                <article>
                  <h3><History size={16} /> Riwayat</h3>
                  {historySummary(selectedRow.job).map((item) => <p key={item}>{item}</p>)}
                </article>
              </div>
            </div>

            <footer>
              <button className="secondary-button" type="button" onClick={() => setSelectedRow(null)}>Tutup</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default TodayTruckDashboard;
