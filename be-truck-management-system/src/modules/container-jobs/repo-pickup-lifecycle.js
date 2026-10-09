// Lock the movement before changing a linked job. Concurrent combo completions
// must serialize on the same row so the last job sees the first one's status.
export function requirePhysicalRepoPickup(payload = {}) {
  if (payload.pickupConfirmed !== true) {
    const error = new Error('Konfirmasi pickup fisik wajib sebelum perjalanan Repo dimulai.');
    error.code = 'REPO_PICKUP_CONFIRMATION_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  const value = payload.repoPickedUpAt;
  const pickedUp = toValidDate(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || !pickedUp) {
    const error = new Error('Tanggal dan jam pickup Repo aktual wajib diisi.');
    error.code = 'REPO_PICKUP_ACTUAL_TIME_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  return pickedUp.toISOString();
}

function toValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Batas bawah waktu selesai job: waktu mulai perjalanan awal (running_at), dan untuk job yang
// sudah di-pickup dari Repo juga waktu pickup (repo_picked_up_at) serta mulai movement
// (started_at). Yang dipakai adalah batas paling akhir (terkuat).
export function resolveCompletionLowerBound({ runningAt, repoStoredAt, repoPickedUpAt, movementStartedAt } = {}) {
  return [
    ['running', runningAt],
    ['repo_stored', repoStoredAt],
    ['repo_pickup', repoPickedUpAt],
    ['repo_movement', movementStartedAt],
  ]
    .map(([source, value]) => ({ source, at: toValidDate(value) }))
    .filter((bound) => bound.at)
    .reduce((strongest, bound) => (!strongest || bound.at > strongest.at ? bound : strongest), null);
}

export function isOperationalTimestampChanged(next, previous) {
  const nextAt = toValidDate(next);
  const previousAt = toValidDate(previous);
  if (nextAt && previousAt) return nextAt.getTime() !== previousAt.getTime();
  return !([next, previous].every((value) => value === null || value === undefined || value === ''));
}

export function assertOperationalTimeline({ runningAt, repoStoredAt, repoPickedUpAt, completedAt } = {}, existing = {}, { forceChanged = [] } = {}) {
  const events = [
    ['runningAt', 'mulai perjalanan', runningAt],
    ['repoStoredAt', 'dititipkan', repoStoredAt],
    ['repoPickedUpAt', 'pickup Repo', repoPickedUpAt],
    ['completedAt', 'selesai', completedAt],
  ].map(([key, label, value]) => ({
    label,
    value,
    at: toValidDate(value),
    changed: forceChanged.includes(key) || isOperationalTimestampChanged(value, existing[key]),
  }));
  for (let laterIndex = 0; laterIndex < events.length; laterIndex += 1) {
    const later = events[laterIndex];
    if (later.changed && !later.at && later.value != null && later.value !== '') {
      const error = new Error(`Tanggal dan jam ${later.label} tidak valid.`);
      error.code = 'CONTAINER_JOB_ACTUAL_TIME_INVALID';
      error.statusCode = 400;
      throw error;
    }
    if (!later.at) continue;
    for (let earlierIndex = 0; earlierIndex < laterIndex; earlierIndex += 1) {
      const earlier = events[earlierIndex];
      if (earlier.at && earlier.at > later.at && (earlier.changed || later.changed)) {
        const error = new Error(`Waktu ${later.label} tidak boleh lebih awal dari ${earlier.label}.`);
        error.code = 'CONTAINER_JOB_TIMELINE_INVALID';
        error.statusCode = 409;
        throw error;
      }
    }
  }
}

function formatWib(date) {
  return `${new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)} WIB`;
}

// Tolak waktu selesai yang lebih awal dari batas bawahnya. Tidak pernah menggeser/mengarang
// waktu: pemanggil wajib mengirim waktu selesai yang valid.
export function assertCompletionNotBeforeStart(completedAt, bounds = {}) {
  const completed = toValidDate(completedAt);
  const bound = resolveCompletionLowerBound(bounds);
  if (!completed || !bound || completed >= bound.at) return;
  const message = bound.source === 'running'
    ? 'Pekerjaan belum dapat diselesaikan. Waktu selesai tidak boleh lebih awal dari waktu mulai.'
    : bound.source === 'repo_stored'
      ? 'Pekerjaan belum dapat diselesaikan. Waktu selesai tidak boleh lebih awal dari waktu titip Repo.'
    : `Pekerjaan belum dapat diselesaikan. Waktu selesai tidak boleh lebih awal dari pickup Repo (${formatWib(bound.at)}).`;
  const error = new Error(message);
  error.code = 'CONTAINER_JOB_COMPLETION_INVALID_TIME';
  error.statusCode = 409;
  error.details = { lowerBound: bound.at.toISOString(), lowerBoundSource: bound.source, completedAt: completed.toISOString() };
  throw error;
}

export async function lockRepoPickupMovementForJob(client, jobId) {
  const result = await client.query(`
    select cpm.id, cpm.status, cpm.started_at
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

// Lifecycle movement Repo yang masih running, dihitung ulang setiap kali job terkait berubah:
// - masih ada job non-terminal -> tetap running;
// - semua job terminal (completed/cancelled) dan perjalanan fisik sudah dimulai (started_at
//   terisi) -> completed, walau semua job-nya cancelled: trip Repo-nya sudah terjadi;
// - cancelled hanya untuk movement lama yang belum pernah dimulai (started_at kosong) dan
//   semua job-nya cancelled.
// started_at dibaca dari baris movement sendiri, bukan dari objek pemanggil.
// completed_at movement diambil dari waktu selesai job terakhir yang VALID (>= started_at), sehingga
// completed_at movement tidak pernah lebih awal dari started_at; tanpa waktu valid dipakai now()
// seperti sebelumnya (mis. semua job cancelled setelah pickup).
export async function reconcileRepoPickupMovement(client, movement) {
  if (!movement || movement.status !== 'running') return movement;
  const result = await client.query(`
    select count(*)::int as total,
      count(*) filter (where cj.status = 'completed')::int as completed,
      count(*) filter (where cj.status = 'cancelled')::int as cancelled,
      max(cj.completed_at) filter (
        where cj.status = 'completed'
          and (cpm.started_at is null or cj.completed_at >= cpm.started_at)
      ) as last_completed_at,
      bool_or(cpm.started_at is not null) as started
    from container_pickup_items cpi
    join container_pickup_movements cpm on cpm.id = cpi.movement_id
    join container_jobs cj on cj.id = cpi.container_job_id
    where cpi.movement_id = $1
  `, [movement.id]);
  const {
    total, completed, cancelled, last_completed_at: lastCompletedAt, started,
  } = result.rows[0] || {};
  if (!total || completed + cancelled !== total) return movement;
  const nextStatus = started || completed > 0 ? 'completed' : 'cancelled';
  const updated = await client.query(`
    update container_pickup_movements
    set status = $2,
      completed_at = case when $2 = 'completed' then coalesce($3::timestamptz, now()) else null end,
      updated_at = now()
    where id = $1 and status = 'running'
      and ($2 <> 'completed' or started_at is null or coalesce($3::timestamptz, now()) >= started_at)
    returning id, status, completed_at
  `, [movement.id, nextStatus, lastCompletedAt || null]);
  if (!updated.rows[0] && nextStatus === 'completed') {
    const current = await client.query('select status from container_pickup_movements where id = $1', [movement.id]);
    if (current.rows[0]?.status === 'running') {
      // Hanya terjadi bila waktu selesai < started_at; batalkan transaksi daripada menyimpan timeline terbalik.
      const error = new Error('Movement Repo tidak dapat diselesaikan sebelum waktu pickup Repo.');
      error.code = 'REPO_MOVEMENT_COMPLETION_BEFORE_START';
      error.statusCode = 409;
      throw error;
    }
  }
  return updated.rows[0] || movement;
}
