import { useEffect, useState } from 'react';
import { FileText, History, Truck, X } from 'lucide-react';
import { formatShortDate, normalizeSize, todayKey } from '../../data/operationalDashboard';
import { fetchDashboardReport } from '../../services/reports/reportService';

function formatShipment(value) {
  const shipmentMap = {
    import: 'Import',
    export: 'Export',
    'domestik inward': 'Domestik Inward',
    'domestik outward': 'Domestik Outward',
  };
  return shipmentMap[String(value || '').toLowerCase()] || value || '-';
}

function destinationText(job) {
  return job?.destination || '-';
}

function normalizeTruck(truck) {
  const chassisSize = normalizeSize(truck.chassisSize || truck.chassis_size);
  return {
    id: truck.id || truck.plateNumber,
    plateNumber: truck.plateNumber,
    unitCode: truck.unitCode,
    capacity: chassisSize || normalizeSize(truck.capacity || truck.containerSize || truck.size || truck.defaultSize || '20FT'),
    chassisCode: truck.chassisCode || truck.chassis_code || truck.kirChassisNumber || truck.kir_chassis_number || '',
    chassisSize,
    driver: truck.defaultDriver || truck.default_driver_name || truck.defaultDriverName || truck.lastDriver || '-',
  };
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

function chassisSizeLabel(truck) {
  return truck?.chassisSize || truck?.capacity || '-';
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
    const left = getTruckSortKey(a.truck.unitCode);
    const right = getTruckSortKey(b.truck.unitCode);
    if (left !== right) return left - right;
    return String(formatTruckNumber(a.truck.unitCode)).localeCompare(String(formatTruckNumber(b.truck.unitCode)), 'id-ID', { numeric: true });
  });
}

function getAvailability(trucks, activeJobs) {
  const summary = {
    '20FT': { total: 0, activePlates: new Set() },
    '40FT': { total: 0, activePlates: new Set() },
  };

  trucks.forEach((truck) => {
    const truckSize = normalizeSize(truck.capacity);
    if (summary[truckSize]) summary[truckSize].total += 1;
  });

  activeJobs.forEach((job) => {
    const plateNumber = job.plateNumber || job.truck;
    if (!plateNumber) return;
    const truck = trucks.find((item) => item.plateNumber === plateNumber);
    const activeSize = normalizeSize(truck?.capacity || job.size);
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


function TodayTruckDashboard() {
  const [selectedRow, setSelectedRow] = useState(null);
  const [dashboard, setDashboard] = useState({ trucks: [], activeJobs: [] });
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
        });
      })
      .catch((requestError) => {
        if (!active) return;
        setDashboard({ trucks: [], activeJobs: [] });
        setError(requestError.message || 'Dashboard gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const sourceTrucks = dashboard.trucks;
  const sourceJobs = dashboard.activeJobs;
  const truckRows = sourceTrucks.map(normalizeTruck);
  const rows = buildTruckRows(truckRows, sourceJobs);
  const availability = getAvailability(truckRows, sourceJobs);

  return (
    <div className="page -mt-1 space-y-2">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="m-0 text-[22px] font-black leading-none text-slate-950">Dashboard Truck Hari Ini</h1>
          </div>
          <p className="m-0 mt-1 text-[12px] font-semibold leading-none text-slate-500">Data truck yang berjalan dan belum selesai.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] shadow-sm">
          <span className="font-extrabold text-slate-500">Tanggal</span>
          <strong className="font-black text-slate-950">{formatShortDate(currentDateKey)}</strong>
        </div>
      </header>
      {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat dashboard truck...</p></div> : null}
      {error ? <div className="archive-inline-state is-error"><h3>Dashboard gagal dimuat</h3><p>{error}</p></div> : null}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-4 py-2 lg:grid-cols-[260px_1fr]" aria-label="Ketersediaan Truck Hari Ini">
          <div className="flex items-center pl-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="block text-[17px] font-black leading-none text-slate-950">Tersedia Saat Ini</span>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {availability.map((item) => (
              <article
                className={`flex min-h-[38px] items-center justify-between gap-3 rounded-lg border px-3 py-1 shadow-[inset_3px_0_0_rgba(16,185,129,0.95)] ${availabilityTone(item) === 'shortage' ? 'shadow-[inset_3px_0_0_rgba(220,38,38,0.95)]' : ''} ${availabilityCardClass(item)}`}
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-[11px]">
            <colgroup>
              <col className="w-[6%]" />
              <col className="w-[16%]" />
              <col className="w-[15%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                <th className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">No</th>
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
              {!loading && !error && rows.map((row) => (
                <tr className="border-t border-slate-200 odd:bg-white even:bg-slate-50/45 hover:bg-red-50/40" key={row.id}>
                  <td className="truncate px-2.5 py-0.5 font-black text-slate-800" data-label="No" title={row.truck.unitCode || '-'}>
                    {formatTruckNumber(row.truck.unitCode)}
                  </td>
                  <td className="px-2.5 py-0.5" data-label="Plat">
                    <div className="flex min-w-0 items-center gap-1.5" title={row.truck.plateNumber || '-'}>
                      <Truck className="shrink-0 text-red-700" size={12} />
                      <strong className="min-w-0 truncate font-black leading-none text-slate-900">{row.truck.plateNumber || '-'}</strong>
                    </div>
                  </td>
                  <td className="truncate px-2.5 py-0.5 text-slate-700" data-label="Nama Sopir" title={row.job?.driver || row.truck.driver || '-'}>{row.job?.driver || row.truck.driver || '-'}</td>
                  <td className="truncate px-2.5 py-0.5 text-slate-700" data-label="No Container" title={row.job?.containerNumber || '-'}>{row.job?.containerNumber || '-'}</td>
                  <td className="truncate px-2.5 py-0.5 text-slate-700" data-label="Jenis Order" title={formatShipment(row.job?.shipment)}>{formatShipment(row.job?.shipment)}</td>
                  <td className="truncate px-2.5 py-0.5 font-bold text-slate-700" data-label="Chassis / Size" title={chassisSizeLabel(row.truck)}>{chassisSizeLabel(row.truck)}</td>
                  <td className="truncate px-2.5 py-0.5 text-slate-700" data-label="Tujuan" title={destinationText(row.job)}>{destinationText(row.job)}</td>
                  <td className="px-2.5 py-0.5 text-center" data-label="Status">
                    <span
                      className={`inline-flex min-h-5 items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-black ${row.job ? 'border-emerald-300 bg-emerald-100 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-500'}`}
                      title={row.job ? 'Assign' : 'Unassign'}
                    >
                      {row.job ? 'Assign' : 'Unassign'}
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
          {!loading && !error && !rows.length ? (
            <div className="role-empty-state">
              <Truck size={28} />
              <h3>Data truck belum tersedia</h3>
              <p>Belum ada truck aktif dari backend API.</p>
            </div>
          ) : null}
        </div>
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
                <div><span>No</span><strong>{selectedRow.truck.unitCode || '-'}</strong></div>
                <div><span>Plat</span><strong>{selectedRow.truck.plateNumber || '-'}</strong></div>
                <div><span>Nama Sopir</span><strong>{selectedRow.job?.driver || selectedRow.truck.driver || '-'}</strong></div>
                <div><span>Status</span><strong>{selectedRow.job ? 'Assign' : 'Unassign'}</strong></div>
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
