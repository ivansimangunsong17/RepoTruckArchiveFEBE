import { useEffect, useState } from 'react';
import { fetchContainerJobAssignmentHistory } from '../../services/archive/containerJobService';
import { formatDateTime } from '../../utils/formatDate';

export const changeSourceLabel = {
  admin_correction: 'Koreksi Admin',
  operational: 'Operational',
  repo_pickup: 'Ambil Titip',
  repo_combo_pickup: 'Ambil Titip Combo 2x20',
};

function AssignmentHistorySection({ containerJobId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!containerJobId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchContainerJobAssignmentHistory(containerJobId)
      .then((rows) => {
        if (!cancelled) setHistory(Array.isArray(rows) ? rows : []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.message || 'Riwayat assignment gagal dimuat.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [containerJobId]);

  if (!containerJobId) return null;

  return (
    <div className="form-section">
      <h3>Riwayat Assignment</h3>
      {loading ? (
        <p className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Memuat riwayat assignment...</p>
      ) : error ? (
        <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>
      ) : !history.length ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">Belum ada riwayat perubahan.</p>
      ) : (
        <div className="grid gap-1.5">
          {history.map((item) => {
            const driverChanged = item.previousDriverName !== item.nextDriverName;
            const truckChanged = item.previousPlateNumber !== item.nextPlateNumber;
            return (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-950">
                    {driverChanged ? (
                      <strong className="block">Sopir: {item.previousDriverName || '-'} {'>'} {item.nextDriverName || '-'}</strong>
                    ) : null}
                    {truckChanged ? (
                      <strong className="block">Truck: {item.previousPlateNumber || '-'} {'>'} {item.nextPlateNumber || '-'}</strong>
                    ) : null}
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      item.changeSource === 'admin_correction' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {changeSourceLabel[item.changeSource] || item.changeSource}
                  </span>
                </div>
                {item.reason ? <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">{item.reason}</p> : null}
                {item.note ? <p className="mt-1 text-[11px] text-slate-500">Catatan: {item.note}</p> : null}
                <p className="mt-1 text-[10px] font-semibold text-slate-400">{item.changedByName || '-'} - {formatDateTime(item.createdAt)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AssignmentHistorySection;
