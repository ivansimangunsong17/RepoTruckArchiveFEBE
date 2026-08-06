import { query } from '../../db/client.js';

function mapHistoricalPeriod(row = {}) {
  if (!row) return null;
  return {
    period: row.period,
    status: row.status || 'draft',
    notes: row.notes || '',
    lockedBy: row.locked_by_name || '',
    lockedAt: row.locked_at,
    unlockedBy: row.unlocked_by_name || '',
    unlockedAt: row.unlocked_at,
    updatedBy: row.updated_by_name || '',
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export async function findHistoricalPeriod(period) {
  const result = await query(
    'select * from historical_entry_periods where period = $1',
    [period],
  );
  return mapHistoricalPeriod(result.rows[0]);
}

export async function upsertHistoricalPeriod({ period, status = 'draft', notes = '', actorName = '' }) {
  const result = await query(
    `
      insert into historical_entry_periods (
        period, status, notes, locked_by_name, locked_at,
        unlocked_by_name, unlocked_at, updated_by_name, updated_at
      )
      values (
        $1, $2, $3,
        case when $2 = 'locked' then $4 else null end,
        case when $2 = 'locked' then now() else null end,
        case when $2 = 'draft' then $4 else null end,
        case when $2 = 'draft' then now() else null end,
        $4, now()
      )
      on conflict (period) do update set
        status = excluded.status,
        notes = excluded.notes,
        locked_by_name = case when excluded.status = 'locked' then excluded.updated_by_name else historical_entry_periods.locked_by_name end,
        locked_at = case when excluded.status = 'locked' then now() else historical_entry_periods.locked_at end,
        unlocked_by_name = case when excluded.status = 'draft' then excluded.updated_by_name else historical_entry_periods.unlocked_by_name end,
        unlocked_at = case when excluded.status = 'draft' then now() else historical_entry_periods.unlocked_at end,
        updated_by_name = excluded.updated_by_name,
        updated_at = now()
      returning *
    `,
    [period, status, notes, actorName],
  );
  return mapHistoricalPeriod(result.rows[0]);
}
