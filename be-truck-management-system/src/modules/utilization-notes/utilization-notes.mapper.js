export function mapUtilizationNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceLabel: row.resource_label,
    date: row.note_date instanceof Date ? row.note_date.toISOString().slice(0, 10) : String(row.note_date || '').slice(0, 10),
    reasonCode: row.reason_code || '',
    reasonLabel: row.reason_label || '',
    notes: row.notes || '',
    createdBy: row.created_by_name || '',
    updatedBy: row.updated_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
