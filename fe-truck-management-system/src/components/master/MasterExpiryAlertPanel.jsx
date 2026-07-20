import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react';
import {
  buildMasterExpiryOverview,
  formatMasterExpiryDate,
  formatMasterExpiryRemaining,
} from '../../utils/masterExpiry';

const SUMMARY_ITEMS = [
  { key: 'expired', label: 'Sudah Lewat' },
  { key: 'critical', label: 'Segera Urus' },
  { key: 'soon', label: 'Mau Habis' },
  { key: 'monitor', label: 'Pantau' },
  { key: 'safe', label: 'Aman' },
  { key: 'missing', label: 'Belum Diisi' },
];

function MasterExpiryAlertPanel({ rows, fields, getIdentity, singular }) {
  const overview = buildMasterExpiryOverview({ rows, fields, getIdentity, singular });
  if (!overview.expiryFields.length || !rows.length) return null;

  const attentionCount = overview.alerts.length;
  const displayedAlerts = overview.alerts.slice(0, 8);
  const hiddenAlertCount = Math.max(0, attentionCount - displayedAlerts.length);
  const hasExpired = overview.counts.expired > 0;

  return (
    <section className={`master-expiry-panel${hasExpired ? ' has-expired' : ''}`} aria-label="Peringatan masa berlaku" aria-live="polite">
      <header className="master-expiry-panel-header">
        <div className="master-expiry-panel-title">
          <span className="master-expiry-panel-icon">
            {attentionCount ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
          </span>
          <div>
            <span>Pengingat Dokumen</span>
            <h2>{attentionCount ? `${attentionCount} tenggat perlu perhatian` : 'Semua tenggat masih aman'}</h2>
            <p>Status dihitung otomatis dari tanggal berlaku dan diperbarui setiap hari.</p>
          </div>
        </div>
        <div className="master-expiry-summary" aria-label="Ringkasan masa berlaku">
          {SUMMARY_ITEMS.map((item) => (
            <div key={item.key} className={`is-${item.key}`}>
              <strong>{overview.counts[item.key]}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </header>

      {displayedAlerts.length ? (
        <div className="master-expiry-alert-list">
          {displayedAlerts.map((entry) => (
            <article key={entry.id} className={`master-expiry-alert-item is-${entry.state.key}`}>
              <div>
                <strong>{entry.identity}</strong>
                <span>{entry.documentLabel}</span>
              </div>
              <div className="master-expiry-alert-status">
                <em>{entry.state.label}</em>
                <small>{formatMasterExpiryDate(entry.date)} · {formatMasterExpiryRemaining(entry.state)}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="master-expiry-safe-message"><CheckCircle2 size={16} /> Tidak ada dokumen yang berakhir dalam 60 hari.</div>
      )}

      {hiddenAlertCount || overview.counts.missing ? (
        <footer className="master-expiry-panel-note">
          <CircleHelp size={14} />
          <span>
            {hiddenAlertCount ? `${hiddenAlertCount} peringatan lain belum ditampilkan. ` : ''}
            {overview.counts.missing ? `${overview.counts.missing} tanggal belum diisi dan tetap bersifat opsional.` : ''}
          </span>
        </footer>
      ) : null}
    </section>
  );
}

export default MasterExpiryAlertPanel;
