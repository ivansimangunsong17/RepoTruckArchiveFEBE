import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { fetchMaster } from '../../services/master-data/masterDataService';
import { correctContainerJobCommissionRecipient } from '../../services/archive/containerJobService';

const REASON_MIN_LENGTH = 8;

// Admin mengoreksi penerima komisi ritasi yang tertahan review. Hanya penerima komisi yang berubah:
// sopir/truck aktual job (termasuk sopir Ambil Titip) tidak disentuh. Rekening diambil backend dari
// Master Sopir; sopir Ambil Titip ditolak backend karena hanya berhak atas UJ Repo.
function CommissionRecipientCorrectionModal({ row, onClose, onCorrected }) {
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchMaster('drivers')
      .then((rows) => {
        if (!cancelled) setDrivers((Array.isArray(rows) ? rows : []).filter((driver) => driver?.id && !driver.archivedAt));
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.message || 'Master sopir gagal dimuat.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedReason = reason.trim();
  const canSave = Boolean(driverId) && trimmedReason.length >= REASON_MIN_LENGTH && !saving;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await correctContainerJobCommissionRecipient(row.containerJobId, { driverId, reason: trimmedReason });
      onCorrected?.();
    } catch (requestError) {
      setError(requestError?.message || 'Penerima komisi gagal dikoreksi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="feedback-dialog-backdrop" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <form
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-recipient-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header>
          <span><UserRound size={21} /></span>
          <div>
            <h2 id="commission-recipient-title">Koreksi penerima komisi</h2>
            <p>
              {row.accurateSoNumber || row.soNumber || '-'} / {row.containerNumber || '-'}. Hanya penerima komisi yang diubah;
              sopir dan truck aktual job tidak berubah.
            </p>
          </div>
        </header>
        <div className="grid gap-3 px-5 pb-4 text-sm">
          <label className="grid gap-1 font-semibold text-slate-700">
            Sopir penerima komisi
            <select value={driverId} onChange={(event) => setDriverId(event.target.value)} disabled={saving}>
              <option value="">Pilih sopir</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-semibold text-slate-700">
            Alasan koreksi
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Contoh: sopir penitip terverifikasi dari SPK dan EIR titip"
            />
          </label>
          {error ? <p className="text-xs font-semibold text-rose-700" role="alert">{error}</p> : null}
        </div>
        <footer>
          <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Batal</button>
          <button className="primary-button" type="submit" disabled={!canSave}>{saving ? 'Menyimpan...' : 'Simpan koreksi'}</button>
        </footer>
      </form>
    </div>
  );
}

export default CommissionRecipientCorrectionModal;
