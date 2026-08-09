import { isDatabaseEnabled, query } from '../../db/client.js';
import { mapUtilizationNote } from './utilization-notes.mapper.js';

const memoryNotes = new Map();

function memoryKey(note) {
  return `${note.resourceType}|${note.resourceId}|${note.date}`;
}

function toMemoryRow(note) {
  return {
    id: note.id || `note-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    resource_type: note.resourceType,
    resource_id: note.resourceId,
    resource_label: note.resourceLabel,
    note_date: note.date,
    reason_code: note.reasonCode || '',
    reason_label: note.reasonLabel,
    notes: note.notes || '',
    created_by_name: note.createdBy || '',
    updated_by_name: note.updatedBy || '',
    created_at: note.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function listUtilizationNotes({ resourceType, dateFrom, dateTo }) {
  if (isDatabaseEnabled) {
    const result = await query(
      `
        select *
        from utilization_notes
        where resource_type = $1
          and note_date between $2::date and $3::date
        order by note_date asc, resource_label asc
      `,
      [resourceType, dateFrom, dateTo],
    );
    return result.rows.map(mapUtilizationNote);
  }

  return Array.from(memoryNotes.values())
    .map(mapUtilizationNote)
    .filter((note) => note.resourceType === resourceType && note.date >= dateFrom && note.date <= dateTo)
    .sort((left, right) => left.date.localeCompare(right.date) || left.resourceLabel.localeCompare(right.resourceLabel));
}

export async function listUtilizationReasonSuggestions(resourceType) {
  if (isDatabaseEnabled) {
    const result = await query(
      `
        select reason_label, count(*)::int as usage_count, max(updated_at) as last_used_at
        from utilization_notes
        where resource_type = $1
          and nullif(btrim(reason_label), '') is not null
        group by reason_label
        order by usage_count desc, last_used_at desc, reason_label asc
        limit 20
      `,
      [resourceType],
    );
    return result.rows.map((row) => ({
      label: row.reason_label,
      usageCount: Number(row.usage_count || 0),
      lastUsedAt: row.last_used_at,
    }));
  }

  const counts = new Map();
  Array.from(memoryNotes.values()).forEach((row) => {
    if (row.resource_type !== resourceType || !row.reason_label) return;
    const current = counts.get(row.reason_label) || { label: row.reason_label, usageCount: 0, lastUsedAt: '' };
    current.usageCount += 1;
    current.lastUsedAt = row.updated_at;
    counts.set(row.reason_label, current);
  });
  return Array.from(counts.values())
    .sort((left, right) => right.usageCount - left.usageCount || String(right.lastUsedAt).localeCompare(String(left.lastUsedAt)))
    .slice(0, 20);
}

export async function upsertUtilizationNote(note) {
  if (isDatabaseEnabled) {
    const result = await query(
      `
        insert into utilization_notes (
          resource_type, resource_id, resource_label, note_date,
          reason_code, reason_label, notes, created_by_name, updated_by_name
        )
        values ($1, $2, $3, $4::date, $5, $6, $7, $8, $8)
        on conflict (resource_type, resource_id, note_date) do update
        set resource_label = excluded.resource_label,
            reason_code = excluded.reason_code,
            reason_label = excluded.reason_label,
            notes = excluded.notes,
            updated_by_name = excluded.updated_by_name,
            updated_at = now()
        returning *
      `,
      [
        note.resourceType,
        note.resourceId,
        note.resourceLabel,
        note.date,
        note.reasonCode || null,
        note.reasonLabel,
        note.notes || null,
        note.actorName || 'System',
      ],
    );
    return mapUtilizationNote(result.rows[0]);
  }

  const key = memoryKey(note);
  const existing = memoryNotes.get(key);
  const row = toMemoryRow({
    ...note,
    id: existing?.id,
    createdBy: existing?.created_by_name || note.actorName || 'System',
    updatedBy: note.actorName || 'System',
    createdAt: existing?.created_at,
  });
  memoryNotes.set(key, row);
  return mapUtilizationNote(row);
}

export async function deleteUtilizationNote(id) {
  if (isDatabaseEnabled) {
    const result = await query('delete from utilization_notes where id = $1 returning *', [id]);
    return mapUtilizationNote(result.rows[0]);
  }

  for (const [key, row] of memoryNotes.entries()) {
    if (row.id === id) {
      memoryNotes.delete(key);
      return mapUtilizationNote(row);
    }
  }
  return null;
}
