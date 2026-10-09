function isBefore(left, right) {
  if (!left || !right) return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime < rightTime;
}

// Fase timeline detail Container Job. Job Repo punya dua leg: leg awal (Tanggal Jalan, mulai
// perjalanan awal, dititip) dan leg Repo (pickup = mulai movement, selesai movement). Waktu pickup
// Repo tidak pernah ditampilkan sebagai waktu mulai perjalanan awal.
export function buildJobTimelinePhases(job = {}) {
  if (!job?.repoStoredAt) {
    return [
      { key: 'received', label: 'Diterima', value: job?.receivedAt || null, format: 'datetime', done: true },
      { key: 'running', label: 'Mulai', value: job?.runningAt || null, format: 'datetime' },
      { key: 'completed', label: 'Selesai', value: job?.completedAt || null, format: 'datetime' },
    ].map((phase) => ({ ...phase, done: phase.done || Boolean(phase.value) }));
  }

  const repoStartedAt = job.pickupMovement?.startedAt || job.repoPickedUpAt || null;
  const repoCompletedAt = job.pickupMovement?.completedAt
    || (repoStartedAt && job.status === 'completed' ? job.completedAt : null)
    || null;
  return [
    { key: 'tripDate', label: 'Tanggal Jalan', value: job.tripDate || null, format: 'date' },
    { key: 'originalRunning', label: 'Mulai Perjalanan Awal', value: job.runningAt || null, format: 'datetime' },
    { key: 'repoStored', label: 'Container Dititipkan', value: job.repoStoredAt, format: 'datetime' },
    { key: 'repoPickup', label: 'Pickup / Mulai Perjalanan Repo', value: repoStartedAt, format: 'datetime' },
    {
      key: 'repoCompleted',
      label: 'Perjalanan Lanjutan Selesai',
      value: repoCompletedAt,
      format: 'datetime',
      // Data lama dari sebelum validasi ini bisa tercatat selesai sebelum pickup; tandai, jangan disembunyikan.
      warning: isBefore(repoCompletedAt, repoStartedAt) ? 'Lebih awal dari pickup Repo, perlu koreksi' : '',
    },
  ].map((phase) => ({ ...phase, done: Boolean(phase.value) }));
}
