import { useEffect, useState } from 'react';
import { History, Repeat, Search, UserRoundCog, X } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import FilterStatus from '../../components/common/FilterStatus';
import { hasPermission } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { useArchiveData } from '../../hooks/useArchiveData';
import { fetchMaster } from '../../services/master-data/masterDataService';
import {
  fetchFleetAssignmentHistory,
  fetchFleetAssignments,
  updateFleetChassis,
  updateFleetDefaultDriver,
} from '../../services/operations/fleetAssignmentService';
import { formatDateTime } from '../../utils/formatDate';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status Unit' },
  { value: 'Aktif', label: 'Aktif' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Tidak Aktif', label: 'Tidak Aktif' },
];

const SIZE_OPTIONS = [
  { value: '', label: 'Semua Ukuran' },
  { value: '20FT', label: '20FT' },
  { value: '40FT', label: '40FT' },
  { value: 'COMBO', label: 'COMBO' },
];

const CONDITION_OPTIONS = [
  { value: '', label: 'Semua Kondisi' },
  { value: 'complete', label: 'Lengkap' },
  { value: 'no_driver', label: 'Belum ada sopir' },
  { value: 'no_chassis', label: 'Belum ada chassis' },
];

const REASON_MIN_LENGTH = 8;

function ChangeDriverModal({ vehicle, drivers, driversOnActiveTrip, onClose, onSave }) {
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const eligibleDrivers = drivers.filter((driver) => !['Blacklist', 'Cuti', 'Tidak Aktif'].includes(driver.status));
  const reasonValid = reason.trim().length >= REASON_MIN_LENGTH;
  const isOnActiveTrip = Boolean(driverId) && driversOnActiveTrip.includes(driverId);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!driverId) {
      setError('Sopir baru wajib dipilih.');
      return;
    }
    if (!reasonValid) {
      setError(`Alasan wajib diisi minimal ${REASON_MIN_LENGTH} karakter.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ defaultDriverId: driverId, reason: reason.trim(), note: note.trim() });
    } catch (requestError) {
      setError(requestError.message || 'Gagal menyimpan perubahan sopir.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="master-modal-backdrop" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <section className="master-modal w-full max-w-lg" role="dialog" aria-modal="true" aria-labelledby="fleet-change-driver-title" onMouseDown={(event) => event.stopPropagation()}>
        <form className="master-form" onSubmit={handleSubmit}>
          <div className="master-form-heading">
            <div className="min-w-0">
              <span>Assignment Armada</span>
              <h2 id="fleet-change-driver-title">Ganti Sopir - {vehicle.unitCode}</h2>
              <p>Plat {vehicle.plateNumber}</p>
            </div>
            <button className="modal-close-button" disabled={saving} onClick={onClose} type="button" aria-label="Tutup ganti sopir">
              <X size={17} />
            </button>
          </div>

          <div className="grid flex-1 gap-3 overflow-y-auto bg-white px-5 py-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Sopir Saat Ini</span>
              <strong className="text-sm text-slate-900">{vehicle.defaultDriverName || 'Belum ada sopir'}</strong>
            </div>

            <label className="grid gap-1 text-xs font-bold text-slate-700" htmlFor="fleet-change-driver-select">
              Sopir Baru
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-slate-500"
                id="fleet-change-driver-select"
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
              >
                <option value="">Pilih sopir...</option>
                {eligibleDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
              </select>
            </label>

            {isOnActiveTrip ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                Sopir/chassis ini sedang dipakai di ritasi berjalan. Perubahan default hanya berlaku untuk ritasi baru berikutnya.
              </p>
            ) : null}

            <label className="grid gap-1 text-xs font-bold text-slate-700" htmlFor="fleet-change-driver-reason">
              Alasan Perubahan (wajib, minimal {REASON_MIN_LENGTH} karakter)
              <textarea
                className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-slate-500"
                id="fleet-change-driver-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>

            <label className="grid gap-1 text-xs font-bold text-slate-700" htmlFor="fleet-change-driver-note">
              Catatan Tambahan (opsional)
              <textarea
                className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-slate-500"
                id="fleet-change-driver-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>

            {error ? <p className="text-xs font-semibold text-rose-600">{error}</p> : null}
          </div>

          <div className="master-form-actions">
            <button className="secondary-button" disabled={saving} onClick={onClose} type="button">Batal</button>
            <button className="primary-button" disabled={saving || !driverId || !reasonValid} type="submit">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MoveChassisModal({ vehicle, chassisOptions, onClose, onSave }) {
  const [chassisId, setChassisId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const eligibleChassis = chassisOptions.filter((chassis) => !['Tidak Aktif', 'Perlu Perpanjang'].includes(chassis.status));
  const reasonValid = reason.trim().length >= REASON_MIN_LENGTH;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!chassisId) {
      setError('Chassis baru wajib dipilih.');
      return;
    }
    if (!reasonValid) {
      setError(`Alasan wajib diisi minimal ${REASON_MIN_LENGTH} karakter.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ chassisId, reason: reason.trim(), note: note.trim() });
    } catch (requestError) {
      setError(requestError.message || 'Gagal menyimpan perubahan chassis.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="master-modal-backdrop" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <section className="master-modal w-full max-w-lg" role="dialog" aria-modal="true" aria-labelledby="fleet-move-chassis-title" onMouseDown={(event) => event.stopPropagation()}>
        <form className="master-form" onSubmit={handleSubmit}>
          <div className="master-form-heading">
            <div className="min-w-0">
              <span>Assignment Armada</span>
              <h2 id="fleet-move-chassis-title">Pindahkan Chassis - {vehicle.unitCode}</h2>
              <p>Plat {vehicle.plateNumber}</p>
            </div>
            <button className="modal-close-button" disabled={saving} onClick={onClose} type="button" aria-label="Tutup pindah chassis">
              <X size={17} />
            </button>
          </div>

          <div className="grid flex-1 gap-3 overflow-y-auto bg-white px-5 py-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Chassis Saat Ini</span>
              <strong className="text-sm text-slate-900">{vehicle.currentChassisCode || 'Belum ada chassis'}</strong>
            </div>

            <label className="grid gap-1 text-xs font-bold text-slate-700" htmlFor="fleet-move-chassis-select">
              Chassis Baru
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-slate-500"
                id="fleet-move-chassis-select"
                value={chassisId}
                onChange={(event) => setChassisId(event.target.value)}
              >
                <option value="">Pilih chassis...</option>
                {eligibleChassis.map((chassis) => <option key={chassis.id} value={chassis.id}>{chassis.chassisCode} ({chassis.capacity})</option>)}
              </select>
            </label>

            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
              Perubahan chassis hanya berlaku untuk ritasi baru berikutnya, ritasi yang sedang berjalan tidak berubah.
            </p>

            <label className="grid gap-1 text-xs font-bold text-slate-700" htmlFor="fleet-move-chassis-reason">
              Alasan Perubahan (wajib, minimal {REASON_MIN_LENGTH} karakter)
              <textarea
                className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-slate-500"
                id="fleet-move-chassis-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>

            <label className="grid gap-1 text-xs font-bold text-slate-700" htmlFor="fleet-move-chassis-note">
              Catatan Tambahan (opsional)
              <textarea
                className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-slate-500"
                id="fleet-move-chassis-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>

            {error ? <p className="text-xs font-semibold text-rose-600">{error}</p> : null}
          </div>

          <div className="master-form-actions">
            <button className="secondary-button" disabled={saving} onClick={onClose} type="button">Batal</button>
            <button className="primary-button" disabled={saving || !chassisId || !reasonValid} type="submit">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function HistoryModal({ vehicle, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchFleetAssignmentHistory(vehicle.id)
      .then((rows) => {
        if (!cancelled) setHistory(Array.isArray(rows) ? rows : []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || 'Riwayat assignment gagal dimuat.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicle.id]);

  return (
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="master-modal flex max-h-[85vh] w-full max-w-2xl flex-col" role="dialog" aria-modal="true" aria-labelledby="fleet-history-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="master-form-heading">
          <div className="min-w-0">
            <span>Assignment Armada</span>
            <h2 id="fleet-history-title">Riwayat - {vehicle.unitCode}</h2>
            <p>Plat {vehicle.plateNumber}</p>
          </div>
          <button className="modal-close-button" onClick={onClose} type="button" aria-label="Tutup riwayat">
            <X size={17} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4">
          {loading ? <p className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Memuat riwayat...</p> : null}
          {!loading && error ? <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
          {!loading && !error && !history.length ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">Belum ada riwayat perubahan.</p>
          ) : null}
          {!loading && !error && history.length ? (
            <div className="grid gap-2">
              {history.map((item) => (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2" key={item.id}>
                  <strong className="block text-xs text-slate-950">
                    {item.changeType === 'default_driver'
                      ? `Sopir: ${item.previousDriverName || '-'} > ${item.nextDriverName || '-'}`
                      : `Chassis: ${item.previousChassisCode || '-'} > ${item.nextChassisCode || '-'}`}
                  </strong>
                  {item.reason ? <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">{item.reason}</p> : null}
                  {item.note ? <p className="mt-1 text-[11px] text-slate-500">Catatan: {item.note}</p> : null}
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">{item.changedByName || '-'} ({item.changedByRole || '-'}) - {formatDateTime(item.createdAt)}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function FleetAssignmentPage() {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const archive = useArchiveData();
  const [rows, setRows] = useState([]);
  const [driversOnActiveTrip, setDriversOnActiveTrip] = useState([]);
  const [chassisOptions, setChassisOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState('');
  const [listVersion, setListVersion] = useState(0);
  const [changeDriverTarget, setChangeDriverTarget] = useState(null);
  const [moveChassisTarget, setMoveChassisTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);

  const drivers = archive.masters?.drivers || [];
  const canUpdateDriver = hasPermission(user, 'operations.fleet_assignment.driver.update');
  const canUpdateChassis = hasPermission(user, 'operations.fleet_assignment.chassis.update');

  useEffect(() => {
    fetchMaster('kir-chassis')
      .then((result) => setChassisOptions(Array.isArray(result) ? result : []))
      .catch(() => setChassisOptions([]));
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const result = await fetchFleetAssignments({ query, status, size, condition });
        if (!active) return;
        setRows(Array.isArray(result?.rows) ? result.rows : []);
        setDriversOnActiveTrip(Array.isArray(result?.driversOnActiveTrip) ? result.driversOnActiveTrip : []);
      } catch (requestError) {
        if (!active) return;
        setRows([]);
        setError(requestError.message || 'Data assignment armada gagal dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [condition, listVersion, query, size, status]);

  async function handleSaveDriver(payload) {
    const saved = await updateFleetDefaultDriver(changeDriverTarget.id, payload);
    notify({ title: 'Assignment armada diperbarui', message: 'Assignment armada diperbarui. Berlaku untuk ritasi baru berikutnya.' });
    setChangeDriverTarget(null);
    setListVersion((value) => value + 1);
    return saved;
  }

  async function handleSaveChassis(payload) {
    const saved = await updateFleetChassis(moveChassisTarget.id, payload);
    notify({ title: 'Assignment armada diperbarui', message: 'Assignment armada diperbarui. Berlaku untuk ritasi baru berikutnya.' });
    setMoveChassisTarget(null);
    setListVersion((value) => value + 1);
    return saved;
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operational"
        title="Assignment Armada"
        description="Atur sopir default dan chassis terpasang per unit truck. Perubahan di sini hanya berlaku untuk ritasi baru berikutnya, tidak mengubah ritasi yang sedang berjalan atau sudah selesai."
      />

      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari no lambung, plat, sopir, atau chassis..." />
          </label>
          <select aria-label="Filter status unit" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select aria-label="Filter ukuran" value={size} onChange={(event) => setSize(event.target.value)}>
            {SIZE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select aria-label="Filter kondisi" value={condition} onChange={(event) => setCondition(event.target.value)}>
            {CONDITION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <FilterStatus
          total={rows.length}
          filtered={rows.length}
          active={Boolean(query.trim() || status || size || condition)}
          label="unit"
          onReset={() => {
            setQuery('');
            setStatus('');
            setSize('');
            setCondition('');
          }}
        />

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Unit / Head</th>
                <th>Plat</th>
                <th>Size</th>
                <th>Sopir Default</th>
                <th>Chassis Terpasang</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="empty-state">Memuat data assignment armada...</div></td></tr>
              ) : null}
              {!loading && error ? (
                <tr><td colSpan={8}><div className="empty-state">{error}</div></td></tr>
              ) : null}
              {!loading && !error && !rows.length ? (
                <tr><td colSpan={8}><div className="empty-state">Data tidak ditemukan.</div></td></tr>
              ) : null}
              {!loading && !error ? rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{row.unitCode}</td>
                  <td>{row.plateNumber}</td>
                  <td>{row.containerSize}</td>
                  <td>{row.defaultDriverName || <span className="text-slate-400">Belum ada sopir</span>}</td>
                  <td>{row.currentChassisCode || <span className="text-slate-400">Belum ada chassis</span>}</td>
                  <td>{row.status}</td>
                  <td>
                    <div className="table-actions justify-center">
                      {canUpdateDriver ? (
                        <button type="button" onClick={() => setChangeDriverTarget(row)} aria-label={`Ganti sopir ${row.unitCode}`} title="Ganti Sopir">
                          <UserRoundCog size={15} />
                        </button>
                      ) : null}
                      {canUpdateChassis ? (
                        <button type="button" onClick={() => setMoveChassisTarget(row)} aria-label={`Pindahkan chassis ${row.unitCode}`} title="Pindahkan Chassis">
                          <Repeat size={15} />
                        </button>
                      ) : null}
                      <button type="button" onClick={() => setHistoryTarget(row)} aria-label={`Riwayat ${row.unitCode}`} title="Riwayat">
                        <History size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
      </section>

      {changeDriverTarget ? (
        <ChangeDriverModal
          vehicle={changeDriverTarget}
          drivers={drivers}
          driversOnActiveTrip={driversOnActiveTrip}
          onClose={() => setChangeDriverTarget(null)}
          onSave={handleSaveDriver}
        />
      ) : null}
      {moveChassisTarget ? (
        <MoveChassisModal
          vehicle={moveChassisTarget}
          chassisOptions={chassisOptions}
          onClose={() => setMoveChassisTarget(null)}
          onSave={handleSaveChassis}
        />
      ) : null}
      {historyTarget ? (
        <HistoryModal vehicle={historyTarget} onClose={() => setHistoryTarget(null)} />
      ) : null}
    </div>
  );
}

export default FleetAssignmentPage;
