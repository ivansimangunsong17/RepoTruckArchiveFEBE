import { httpClient } from '../api/httpClient';

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, 10);
}

function normalizeUtilizationNote(note) {
  if (!note) return note;
  return {
    ...note,
    resourceId: String(note.resourceId || '').trim(),
    date: normalizeDate(note.date),
    reasonLabel: note.reasonLabel || note.reason || '',
    notes: note.notes || '',
  };
}

export function fetchUtilizationNotes(params = {}) {
  return httpClient.get(`/utilization-notes${buildQuery(params)}`).then((result) => ({
    ...result,
    rows: Array.isArray(result?.rows) ? result.rows.map(normalizeUtilizationNote) : [],
  }));
}

export function saveUtilizationNote(payload) {
  return httpClient.put('/utilization-notes', payload).then(normalizeUtilizationNote);
}

export function deleteUtilizationNote(id) {
  return httpClient.delete(`/utilization-notes/${encodeURIComponent(id)}`);
}
