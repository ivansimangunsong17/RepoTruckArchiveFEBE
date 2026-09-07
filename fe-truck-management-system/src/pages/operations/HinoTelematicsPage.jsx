import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { ChevronDown, ChevronUp, Link2, RefreshCw, Satellite, Search, Unlink, Wrench, Zap } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import PageHeader from '../../components/common/PageHeader';
import { useFeedback } from '../../hooks/useFeedback';
import { fetchMaster } from '../../services/master-data/masterDataService';
import {
  fetchHinoStatus,
  fetchHinoVehicles,
  fetchLiveHinoVehiclePositions,
  generateHinoToken,
  linkHinoVehicle,
  syncHinoVehiclePositions,
  syncHinoVehicles,
  unlinkHinoVehicle,
} from '../../services/telematics/hinoTelematicsService';
import { formatDateTime } from '../../utils/formatDate';

function formatSyncTime(value) {
  return value ? formatDateTime(value) : '-';
}

// "Hari ini" dicek berdasarkan kalender Asia/Jakarta (WIB), bukan timezone browser/server,
// supaya badge "belum diperbarui hari ini" konsisten untuk semua user di mana pun mereka berada.
function isSameJakartaDay(isoValue, referenceDate = new Date()) {
  if (!isoValue) return false;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return false;
  return formatter.format(parsed) === formatter.format(referenceDate);
}

function getPositionLabel(row) {
  const plate = row.plateNumber || row.hinoPlateNumber || '';
  const unit = row.unitCode || '';
  return [unit, plate].filter(Boolean).join(' - ') || row.displayName || row.vin || row.hinoVehicleId || '-';
}

function getVehicleStatus(row) {
  return String(row.engineStatus || row.ignitionStatus || row.vehicleStatus || '').trim();
}

function filterPositions(rows = [], { query = '', status = '' } = {}) {
  const keyword = query.trim().toLowerCase();
  return rows.filter((row) => {
    const rowStatus = getVehicleStatus(row);
    const matchesStatus = !status || rowStatus === status;
    if (!matchesStatus) return false;
    if (!keyword) return true;
    return [
      row.unitCode,
      row.plateNumber,
      row.hinoPlateNumber,
      row.hinoVehicleId,
      row.vin,
      row.displayName,
      rowStatus,
    ].some((value) => String(value || '').toLowerCase().includes(keyword));
  });
}

function resolveHinoRows(vehicles, positions) {
  const rowsById = new Map();
  vehicles.forEach((item) => {
    if (item.hinoVehicleId) rowsById.set(item.hinoVehicleId, { ...item, sourceType: 'vehicles' });
  });
  positions.forEach((item) => {
    if (!item.hinoVehicleId) return;
    rowsById.set(item.hinoVehicleId, {
      ...(rowsById.get(item.hinoVehicleId) || {}),
      ...item,
      sourceType: rowsById.has(item.hinoVehicleId) ? 'vehicles + posisi' : 'posisi',
    });
  });
  return Array.from(rowsById.values()).sort((a, b) => getPositionLabel(a).localeCompare(getPositionLabel(b)));
}

function StatusCard({ label, value, helper }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="mt-1 block text-lg font-black text-slate-950">{value}</strong>
      {helper ? <p className="mt-1 text-xs font-medium text-slate-500">{helper}</p> : null}
    </div>
  );
}

function isValidCoordinate(row) {
  return Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude));
}

function createPopupContent(row) {
  const content = document.createElement('div');
  content.className = 'grid gap-1 text-xs';

  const title = document.createElement('strong');
  title.className = 'text-sm text-slate-950';
  title.textContent = getPositionLabel(row);
  content.appendChild(title);

  [
    ['HINO ID', row.hinoVehicleId || '-'],
    ['Status', getVehicleStatus(row) || '-'],
    ['Speed', `${row.speedKph ?? 0} km/jam`],
    ['GPS Time', formatSyncTime(row.gpsTime || row.syncedAt)],
  ].forEach(([label, value]) => {
    const line = document.createElement('span');
    line.textContent = `${label}: ${value}`;
    content.appendChild(line);
  });

  return content;
}

function HinoVehicleMap({ positions }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const validPositions = useMemo(() => positions.filter(isValidCoordinate), [positions]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    mapRef.current = L.map(containerRef.current, {
      center: [-6.2, 106.8],
      zoom: 9,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);
    markerLayerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current) return;

    markerLayerRef.current.clearLayers();
    const bounds = [];
    validPositions.forEach((row) => {
      const coordinate = [Number(row.latitude), Number(row.longitude)];
      bounds.push(coordinate);
      const marker = L.marker(coordinate, {
        icon: L.divIcon({
          className: 'hino-map-marker',
          html: '<span style="display:block;width:16px;height:16px;border:3px solid white;border-radius:999px;background:#dc171f;box-shadow:0 8px 18px rgba(15,23,42,.25);"></span>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      });
      marker.bindPopup(createPopupContent(row));
      marker.addTo(markerLayerRef.current);
    });

    if (bounds.length) {
      mapRef.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
    } else {
      mapRef.current.setView([-6.2, 106.8], 9);
    }
    window.setTimeout(() => mapRef.current?.invalidateSize(), 100);
  }, [validPositions]);

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="h-[420px] min-h-[320px] w-full" />
      {!validPositions.length ? (
        <div className="border-t border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
          Belum ada posisi dengan latitude/longitude valid.
        </div>
      ) : null}
    </div>
  );
}

function HinoTelematicsPage() {
  const { notify } = useFeedback();
  const [status, setStatus] = useState(null);
  const [hinoVehicles, setHinoVehicles] = useState([]);
  const [positions, setPositions] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [linkSelections, setLinkSelections] = useState({});
  const [mapQuery, setMapQuery] = useState('');
  const [mapStatus, setMapStatus] = useState('');
  const [showAdminTools, setShowAdminTools] = useState(false);

  const hinoRows = useMemo(() => resolveHinoRows(hinoVehicles, positions), [hinoVehicles, positions]);
  const visiblePositions = useMemo(
    () => filterPositions(positions, { query: mapQuery, status: mapStatus }),
    [mapQuery, mapStatus, positions],
  );
  const positionStatuses = useMemo(() => (
    Array.from(new Set(positions.map(getVehicleStatus).filter(Boolean))).sort()
  ), [positions]);
  const linkedCount = hinoRows.filter((row) => row.linkId).length;
  const autoMatchedCount = hinoRows.filter((row) => !row.linkId && row.vehicleId).length;
  const unlinkedCount = hinoRows.length - linkedCount - autoMatchedCount;
  const latestSyncAt = status?.latestPositionsSync?.created_at || null;
  const isSyncedToday = isSameJakartaDay(latestSyncAt);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [statusResult, vehicleResult, positionResult, truckResult] = await Promise.all([
        fetchHinoStatus(),
        fetchHinoVehicles(),
        fetchLiveHinoVehiclePositions(),
        fetchMaster('trucks'),
      ]);
      setStatus(statusResult || null);
      setHinoVehicles(Array.isArray(vehicleResult) ? vehicleResult : []);
      setPositions(Array.isArray(positionResult) ? positionResult : []);
      setTrucks(Array.isArray(truckResult) ? truckResult : []);
    } catch (requestError) {
      setError(requestError.message || 'Data HINO gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function runAction(actionKey, action, successMessage) {
    setWorking(actionKey);
    setError('');
    try {
      const result = await action();
      notify({ title: 'HINO Connect', message: successMessage });
      await loadData();
      return result;
    } catch (requestError) {
      const message = requestError.message || 'Aksi HINO gagal diproses.';
      setError(message);
      notify({ type: 'error', title: 'HINO Connect gagal', message });
      return null;
    } finally {
      setWorking('');
    }
  }

  async function handleLink(row) {
    const vehicleId = linkSelections[row.hinoVehicleId] || row.vehicleId || '';
    await runAction(
      `link-${row.hinoVehicleId}`,
      () => linkHinoVehicle(row.hinoVehicleId, vehicleId),
      'Kendaraan HINO berhasil dihubungkan ke truck Armada.',
    );
  }

  async function handleUnlink(row) {
    await runAction(
      `unlink-${row.hinoVehicleId}`,
      () => unlinkHinoVehicle(row.hinoVehicleId),
      'Hubungan kendaraan HINO berhasil dilepas.',
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operational"
        title="HINO Connect"
        description="Pantau posisi GPS truck Armada. Data dibaca langsung dari cache lokal, tidak menunggu HINO."
      />

      {error ? <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h2>Map Posisi Truck</h2>
            <p>
              Data HINO terakhir diperbarui: <strong>{latestSyncAt ? formatDateTime(latestSyncAt) : 'belum pernah disync'}</strong>
              {latestSyncAt && !isSyncedToday ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                  Data belum diperbarui hari ini
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="secondary-button inline-flex items-center gap-2"
              type="button"
              disabled={Boolean(working)}
              onClick={() => loadData()}
              title="Muat ulang data dari cache lokal (tidak memanggil API HINO)"
            >
              <RefreshCw size={15} /> Refresh
            </button>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              {visiblePositions.filter(isValidCoordinate).length} marker
            </span>
          </div>
        </div>
        <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="search-field">
            <Search size={18} />
            <input value={mapQuery} onChange={(event) => setMapQuery(event.target.value)} placeholder="Cari unit, plat, VIN, atau HINO ID..." />
          </label>
          <select aria-label="Filter status posisi HINO" value={mapStatus} onChange={(event) => setMapStatus(event.target.value)}>
            <option value="">Semua Status</option>
            {positionStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <HinoVehicleMap positions={visiblePositions} />
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h2>Mapping Kendaraan HINO</h2>
            <p>Hubungkan VIN/HINO ID ke truck Armada agar posisi GPS tampil dengan nama unit internal.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>HINO ID / VIN</th>
                <th>Status HINO</th>
                <th>Truck Armada</th>
                <th>Mapping</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6}><div className="empty-state">Memuat data HINO...</div></td></tr> : null}
              {!loading && !hinoRows.length ? <tr><td colSpan={6}><div className="empty-state">Belum ada cache kendaraan HINO. Sync positions dulu jika /vehicles terkena limit.</div></td></tr> : null}
              {!loading ? hinoRows.map((row, index) => (
                <tr key={row.hinoVehicleId}>
                  <td>{index + 1}</td>
                  <td>
                    <strong className="block text-slate-950">{row.vin || row.hinoVehicleId}</strong>
                    <span className="text-xs font-semibold text-slate-500">{row.sourceType || 'cache'} {row.hinoPlateNumber ? `- ${row.hinoPlateNumber}` : ''}</span>
                  </td>
                  <td>{getVehicleStatus(row) || '-'}</td>
                  <td>
                    {row.linkId ? (
                      <span className="font-bold text-emerald-700">{getPositionLabel(row)}</span>
                    ) : (
                      <select
                        aria-label={`Pilih truck untuk ${row.hinoVehicleId}`}
                        className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900"
                        value={linkSelections[row.hinoVehicleId] || row.vehicleId || ''}
                        onChange={(event) => setLinkSelections((current) => ({ ...current, [row.hinoVehicleId]: event.target.value }))}
                      >
                        <option value="">Pilih truck Armada...</option>
                        {trucks.map((truck) => (
                          <option key={truck.id} value={truck.id}>
                            {truck.unitCode || '-'} - {truck.plateNumber || '-'}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${row.linkId ? 'bg-emerald-50 text-emerald-700' : row.vehicleId ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>
                      {row.linkId ? 'Terhubung' : row.vehicleId ? 'Match Otomatis' : 'Belum Terhubung'}
                    </span>
                  </td>
                  <td>
                    {row.linkId ? (
                      <button className="secondary-button inline-flex items-center gap-2" type="button" disabled={Boolean(working)} onClick={() => handleUnlink(row)}>
                        <Unlink size={14} /> Lepas
                      </button>
                    ) : (
                      <button className="primary-button inline-flex items-center gap-2" type="button" disabled={Boolean(working) || !(linkSelections[row.hinoVehicleId] || row.vehicleId)} onClick={() => handleLink(row)}>
                        <Link2 size={14} /> {row.vehicleId ? 'Konfirmasi' : 'Hubungkan'}
                      </button>
                    )}
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <h2>Posisi Terakhir</h2>
            <p>Data ini dibaca dari cache lokal dan siap dipakai untuk Leaflet/map.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Unit</th>
                <th>HINO ID</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Speed</th>
                <th>GPS Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7}><div className="empty-state">Memuat posisi...</div></td></tr> : null}
              {!loading && !visiblePositions.length ? <tr><td colSpan={7}><div className="empty-state">Belum ada cache posisi kendaraan sesuai filter.</div></td></tr> : null}
              {!loading ? visiblePositions.map((row, index) => (
                <tr key={`${row.hinoVehicleId}-${row.syncedAt || index}`}>
                  <td>{index + 1}</td>
                  <td>{getPositionLabel(row)}</td>
                  <td>{row.hinoVehicleId}</td>
                  <td>{row.latitude ?? '-'}</td>
                  <td>{row.longitude ?? '-'}</td>
                  <td>{row.speedKph ?? 0} km/jam</td>
                  <td>{formatSyncTime(row.gpsTime || row.syncedAt)}</td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <button
          className="secondary-button inline-flex items-center gap-2"
          type="button"
          onClick={() => setShowAdminTools((current) => !current)}
          aria-expanded={showAdminTools}
        >
          <Wrench size={15} /> Alat Admin &amp; Troubleshooting
          {showAdminTools ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        <p className="mt-2 text-xs font-medium text-slate-500">
          Generate token dan sync manual HINO hanya untuk kebutuhan troubleshooting Admin/teknis. Operasional harian tidak perlu menyentuh bagian ini -- data map di atas sudah otomatis disync backend setiap hari.
        </p>

        {showAdminTools ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="grid gap-3 md:grid-cols-4">
              <StatusCard
                label="Konfigurasi"
                value={status?.configured ? 'Aktif' : 'Belum lengkap'}
                helper={status?.configured ? 'Credential HINO terbaca backend.' : 'Isi credential HINO di env server.'}
              />
              <StatusCard
                label="Kendaraan HINO"
                value={`${hinoVehicles.length} unit`}
                helper={`Terhubung ${linkedCount}, match otomatis ${autoMatchedCount}, belum ${unlinkedCount}.`}
              />
              <StatusCard
                label="Posisi GPS"
                value={`${positions.length} titik`}
                helper={`Terakhir: ${formatSyncTime(status?.latestPositionsSync?.created_at)}`}
              />
              <StatusCard
                label="Request Hari Ini"
                value={`${(status?.usageToday || []).reduce((total, item) => total + Number(item.requestCount || 0), 0)} call`}
                helper="Dihitung dari log API HINO."
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="secondary-button inline-flex items-center gap-2"
                type="button"
                disabled={Boolean(working)}
                onClick={() => runAction('token', () => generateHinoToken({}), 'Token HINO berhasil dibuat.')}
              >
                <Zap size={15} /> Generate Token
              </button>
              <button
                className="secondary-button inline-flex items-center gap-2"
                type="button"
                disabled={Boolean(working) || status?.vehiclesSyncAvailability?.allowed === false}
                onClick={() => runAction('vehicles', () => syncHinoVehicles({}), 'Daftar kendaraan HINO berhasil disync.')}
                title={status?.vehiclesSyncAvailability?.allowed === false ? `Sync vehicles berikutnya: ${formatSyncTime(status.vehiclesSyncAvailability.nextAllowedAt)}` : 'Sync daftar kendaraan HINO'}
              >
                <Satellite size={15} /> Sync Vehicles
              </button>
              <button
                className="primary-button inline-flex items-center gap-2"
                type="button"
                disabled={Boolean(working) || status?.positionsSyncAvailability?.allowed === false}
                onClick={() => runAction('positions', () => syncHinoVehiclePositions({}), 'Posisi kendaraan HINO berhasil disync.')}
                title={status?.positionsSyncAvailability?.allowed === false ? `Sync posisi berikutnya: ${formatSyncTime(status.positionsSyncAvailability.nextAllowedAt)}` : 'Sync posisi kendaraan HINO'}
              >
                <Satellite size={15} /> Sync Posisi
              </button>
            </div>

            {working ? <p className="mt-3 text-xs font-semibold text-slate-500">Memproses {working}...</p> : null}
            {status?.positionsSyncAvailability?.allowed === false ? (
              <p className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                Sync posisi dikunci sementara untuk menjaga limit HINO. Bisa sync lagi setelah {formatSyncTime(status.positionsSyncAvailability.nextAllowedAt)}.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default HinoTelematicsPage;
