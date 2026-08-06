import { actorHasPermission } from '../../utils/permissions.js';

export const HISTORICAL_ENTRY_PERMISSION = 'historical_entry.manage';

function hasOwnInput(payload, key) {
  return Boolean(payload && Object.prototype.hasOwnProperty.call(payload, key));
}

function normalizeText(value) {
  return String(value || '').trim();
}

export function isHistoricalEntrySource(value) {
  return normalizeText(value).toLowerCase() === 'historical';
}

export function payloadRequestsHistoricalEntry(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (isHistoricalEntrySource(payload.entrySource) || isHistoricalEntrySource(payload.entry_source)) return true;
  if (hasOwnInput(payload, 'historicalPeriod') && normalizeText(payload.historicalPeriod)) return true;
  if (hasOwnInput(payload, 'historical_period') && normalizeText(payload.historical_period)) return true;
  if (hasOwnInput(payload, 'historicalNotes') && normalizeText(payload.historicalNotes)) return true;
  if (hasOwnInput(payload, 'historical_notes') && normalizeText(payload.historical_notes)) return true;
  return (Array.isArray(payload.containers) ? payload.containers : []).some(payloadRequestsHistoricalEntry);
}

export function recordIsHistorical(record = {}) {
  const source = record || {};
  return isHistoricalEntrySource(source.entrySource) || isHistoricalEntrySource(source.entry_source);
}

export function ensureCanManageHistoricalEntry(actor, { payload, currentRecord = null, entityLabel = 'data historis' } = {}) {
  if (!payloadRequestsHistoricalEntry(payload) && !recordIsHistorical(currentRecord)) return;
  if (actorHasPermission(actor, HISTORICAL_ENTRY_PERMISSION)) return;

  const error = new Error(`${entityLabel} hanya dapat diinput atau diubah oleh Admin.`);
  error.statusCode = 403;
  error.code = 'HISTORICAL_ENTRY_ADMIN_ONLY';
  throw error;
}
