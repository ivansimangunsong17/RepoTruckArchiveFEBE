import { findHistoricalPeriod, upsertHistoricalPeriod } from './historical-entry.repository.js';

function actorName(actor = {}) {
  return actor.name || actor.email || 'System';
}

export function normalizeHistoricalPeriod(value) {
  const period = String(value || '').trim();
  if (!period) return '';
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;

  const error = new Error('Periode data lama harus memakai format YYYY-MM.');
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  throw error;
}

function normalizePeriodStatus(value) {
  const status = String(value || 'draft').trim().toLowerCase();
  if (status === 'draft' || status === 'locked') return status;

  const error = new Error('Status periode data lama tidak valid.');
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  throw error;
}

export async function getHistoricalPeriod(period) {
  const normalizedPeriod = normalizeHistoricalPeriod(period);
  if (!normalizedPeriod) {
    const error = new Error('Periode data lama wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return await findHistoricalPeriod(normalizedPeriod) || {
    period: normalizedPeriod,
    status: 'draft',
    notes: '',
    lockedBy: '',
    lockedAt: null,
    unlockedBy: '',
    unlockedAt: null,
    updatedBy: '',
    updatedAt: null,
    createdAt: null,
  };
}

export async function saveHistoricalPeriod(period, payload = {}, actor = {}) {
  const normalizedPeriod = normalizeHistoricalPeriod(period);
  const status = normalizePeriodStatus(payload.status);
  if (!normalizedPeriod) {
    const error = new Error('Periode data lama wajib diisi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return upsertHistoricalPeriod({
    period: normalizedPeriod,
    status,
    notes: String(payload.notes || '').trim(),
    actorName: actorName(actor),
  });
}

export async function ensureHistoricalPeriodEditable(period, entityLabel = 'Data lama') {
  const normalizedPeriod = normalizeHistoricalPeriod(period);
  if (!normalizedPeriod) return;

  const current = await findHistoricalPeriod(normalizedPeriod);
  if (!current || current.status !== 'locked') return;

  const error = new Error(`${entityLabel} periode ${normalizedPeriod} sudah dikunci. Buka kunci periode terlebih dahulu untuk mengubah data.`);
  error.statusCode = 409;
  error.code = 'HISTORICAL_PERIOD_LOCKED';
  throw error;
}
