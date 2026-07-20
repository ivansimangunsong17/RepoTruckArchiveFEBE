import {
  formatMasterExpiryDate,
  formatMasterExpiryRemaining,
  getMasterExpiryState,
} from '../../utils/masterExpiry';

function MasterExpiryDate({ value, showSafe = true }) {
  const state = getMasterExpiryState(value);
  const showStatus = showSafe || state.key !== 'safe';

  return (
    <div className="master-expiry-date-cell" title={formatMasterExpiryRemaining(state)}>
      <strong>{formatMasterExpiryDate(value)}</strong>
      {showStatus ? <em className={`is-${state.key}`}>{state.label}</em> : null}
    </div>
  );
}

export default MasterExpiryDate;
