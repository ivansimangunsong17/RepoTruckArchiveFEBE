import {
  deleteUtilizationNote,
  listUtilizationNotes,
  listUtilizationReasonSuggestions,
  upsertUtilizationNote,
} from './utilization-notes.repository.js';

const DEFAULT_REASON_SUGGESTIONS = [
  'MUAT SORE',
  'MUAT SIANG',
  'MUAT MALAM',
  'TGG DO',
  'TUNGGU DO',
  'INAP',
  'ANTRI BONGKAR',
  'BONGKAR DI GUDANG',
  'BATAL DO',
  'TITIP',
  'GANTI DRIVER',
  'TUNGGU DRIVER',
  'DRIVER PULANG',
  'SAMPAI GUDANG MALAM',
];

function normalizeResourceType(value) {
  const normalized = String(value || 'truck').trim().toLowerCase();
  return normalized === 'driver' ? 'driver' : 'truck';
}

function normalizeDate(value) {
  const date = String(value || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const error = new Error('Tanggal catatan utilisasi tidak valid.');
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  throw error;
}

function monthRange(period) {
  const normalized = String(period || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
    const error = new Error('Periode catatan utilisasi harus memakai format YYYY-MM.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const [year, month] = normalized.split('-').map(Number);
  const lastDate = new Date(year, month, 0).getDate();
  return {
    dateFrom: `${normalized}-01`,
    dateTo: `${normalized}-${String(lastDate).padStart(2, '0')}`,
  };
}

function normalizeText(value, { required = false, label = 'Nilai' } = {}) {
  const normalized = String(value || '').trim();
  if (required && !normalized) {
    const error = new Error(`${label} wajib diisi.`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return normalized;
}

function reasonCodeFromLabel(label) {
  return String(label || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function actorName(actor = {}) {
  return actor.name || actor.email || 'System';
}

export async function getUtilizationNotes(query = {}) {
  const resourceType = normalizeResourceType(query.resourceType);
  const { dateFrom, dateTo } = monthRange(query.period);
  const [notes, dynamicSuggestions] = await Promise.all([
    listUtilizationNotes({ resourceType, dateFrom, dateTo }),
    listUtilizationReasonSuggestions(resourceType),
  ]);
  const suggestionsByLabel = new Map();
  [...dynamicSuggestions, ...DEFAULT_REASON_SUGGESTIONS.map((label) => ({ label, usageCount: 0 }))].forEach((item) => {
    const label = normalizeText(item.label);
    if (!label || suggestionsByLabel.has(label.toUpperCase())) return;
    suggestionsByLabel.set(label.toUpperCase(), {
      label,
      usageCount: Number(item.usageCount || 0),
      lastUsedAt: item.lastUsedAt || null,
    });
  });

  return {
    rows: notes,
    suggestions: Array.from(suggestionsByLabel.values()).slice(0, 20),
  };
}

export async function saveUtilizationNote(payload = {}, actor = {}) {
  const resourceType = normalizeResourceType(payload.resourceType);
  const date = normalizeDate(payload.date);
  const resourceId = normalizeText(payload.resourceId, { required: true, label: 'Resource catatan' });
  const resourceLabel = normalizeText(payload.resourceLabel || resourceId, { required: true, label: 'Label resource' });
  const reasonLabel = normalizeText(payload.reasonLabel || payload.reason, { required: true, label: 'Alasan catatan' }).toUpperCase();
  const notes = normalizeText(payload.notes).slice(0, 1000);

  return upsertUtilizationNote({
    resourceType,
    resourceId,
    resourceLabel,
    date,
    reasonCode: normalizeText(payload.reasonCode) || reasonCodeFromLabel(reasonLabel),
    reasonLabel,
    notes,
    actorName: actorName(actor),
  });
}

export async function removeUtilizationNote(id) {
  const normalizedId = normalizeText(id, { required: true, label: 'ID catatan' });
  const deleted = await deleteUtilizationNote(normalizedId);
  if (deleted) return deleted;

  const error = new Error('Catatan utilisasi tidak ditemukan.');
  error.statusCode = 404;
  error.code = 'UTILIZATION_NOTE_NOT_FOUND';
  throw error;
}
