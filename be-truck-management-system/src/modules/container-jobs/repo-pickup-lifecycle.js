// Lock the movement before changing a linked job. Concurrent combo completions
// must serialize on the same row so the last job sees the first one's status.
export function requirePhysicalRepoPickup(payload = {}, now = new Date()) {
  if (payload.pickupConfirmed !== true) {
    const error = new Error('Konfirmasi pickup fisik wajib sebelum perjalanan Repo dimulai.');
    error.code = 'REPO_PICKUP_CONFIRMATION_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  return now.toISOString();
}

export async function lockRepoPickupMovementForJob(client, jobId) {
  const result = await client.query(`
    select cpm.id, cpm.status
    from container_pickup_items cpi
    join container_pickup_movements cpm on cpm.id = cpi.movement_id
    where cpi.container_job_id = $1
    order by case when cpm.status = 'cancelled' then 1 else 0 end,
      cpm.created_at desc
    limit 1
    for update of cpm
  `, [jobId]);
  return result.rows[0] || null;
}

export async function reconcileRepoPickupMovement(client, movement) {
  if (!movement || movement.status !== 'running') return movement;
  const result = await client.query(`
    select count(*)::int as total,
      count(*) filter (where cj.status = 'completed')::int as completed,
      count(*) filter (where cj.status = 'cancelled')::int as cancelled,
      max(cj.completed_at) as last_completed_at
    from container_pickup_items cpi
    join container_jobs cj on cj.id = cpi.container_job_id
    where cpi.movement_id = $1
  `, [movement.id]);
  const { total, completed, cancelled, last_completed_at: lastCompletedAt } = result.rows[0] || {};
  if (!total) return movement;
  let nextStatus = '';
  if (cancelled === total) nextStatus = 'cancelled';
  else if (completed > 0 && completed + cancelled === total) nextStatus = 'completed';
  if (!nextStatus) return movement;
  const updated = await client.query(`
    update container_pickup_movements
    set status = $2,
      completed_at = case when $2 = 'completed' then coalesce($3::timestamptz, now()) else null end,
      updated_at = now()
    where id = $1 and status = 'running'
    returning id, status, completed_at
  `, [movement.id, nextStatus, lastCompletedAt || null]);
  return updated.rows[0] || movement;
}
