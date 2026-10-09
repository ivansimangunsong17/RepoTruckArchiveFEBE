import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCompletionNotBeforeStart,
  assertOperationalTimeline,
  isOperationalTimestampChanged,
  lockRepoPickupMovementForJob,
  reconcileRepoPickupMovement,
  requirePhysicalRepoPickup,
  resolveCompletionLowerBound,
} from './repo-pickup-lifecycle.js';

function lifecycleClient(jobStatuses, initialStatus = 'running', { started = true, startedAt = '2026-10-07T08:00:00.000Z', nowIso = '2026-10-07T12:00:00.000Z' } = {}) {
  const movement = {
    id: 'movement-1',
    status: initialStatus,
    started_at: started ? startedAt : null,
    completed_at: null,
  };
  const jobs = jobStatuses.map((status, index) => ({ id: `job-${index + 1}`, status }));
  let updates = 0;
  const client = {
    async query(sql, params) {
      if (sql.includes('for update of cpm')) {
        assert.ok(jobs.some((job) => job.id === params[0]));
        return { rows: [{ ...movement }] };
      }
      if (sql.includes('count(*) filter')) {
        // Meniru filter SQL: hanya waktu selesai job yang >= started_at movement yang dipakai.
        assert.match(sql, /cj\.completed_at >= cpm\.started_at/);
        const validCompletions = jobs
          .filter((job) => job.status === 'completed')
          .map((job) => job.completed_at || '2026-10-07T10:00:00.000Z')
          .filter((value) => !movement.started_at || new Date(value) >= new Date(movement.started_at))
          .sort();
        return { rows: [{
          total: jobs.length,
          completed: jobs.filter((job) => job.status === 'completed').length,
          cancelled: jobs.filter((job) => job.status === 'cancelled').length,
          last_completed_at: validCompletions.at(-1) || null,
          started: movement.started_at !== null,
        }] };
      }
      if (sql.includes('update container_pickup_movements')) {
        assert.equal(params[0], movement.id);
        if (movement.status !== 'running') return { rows: [] };
        const nextCompletedAt = params[2] || nowIso;
        if (params[1] === 'completed' && movement.started_at && new Date(nextCompletedAt) < new Date(movement.started_at)) return { rows: [] };
        movement.status = params[1];
        movement.completed_at = movement.status === 'completed' ? nextCompletedAt : null;
        updates += 1;
        return { rows: [{ ...movement }] };
      }
      if (sql.includes('select status from container_pickup_movements')) return { rows: [{ status: movement.status }] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return { client, jobs, movement, get updates() { return updates; } };
}

test('single pickup requires physical confirmation and the actual entered time', () => {
  assert.throws(() => requirePhysicalRepoPickup({}), { code: 'REPO_PICKUP_CONFIRMATION_REQUIRED' });
  assert.throws(() => requirePhysicalRepoPickup({ pickupConfirmed: true }), { code: 'REPO_PICKUP_ACTUAL_TIME_REQUIRED' });
  assert.equal(requirePhysicalRepoPickup({
    pickupConfirmed: true,
    repoPickedUpAt: '2026-10-09T08:36:00.000Z',
  }), '2026-10-09T08:36:00.000Z');
});

test('actual timeline accepts backdated events and rejects reversed Repo events', () => {
  const normal = { runningAt: '2026-09-23T03:00:00.000Z', completedAt: '2026-09-25T03:00:00.000Z' };
  assert.doesNotThrow(() => assertOperationalTimeline(normal));
  const repo = { ...normal, repoStoredAt: '2026-09-25T03:00:00.000Z', repoPickedUpAt: '2026-10-09T08:36:00.000Z', completedAt: '2026-10-09T08:41:00.000Z' };
  assert.doesNotThrow(() => assertOperationalTimeline(repo));
  assert.throws(() => assertOperationalTimeline({ ...repo, completedAt: '2026-09-29T03:00:00.000Z' }), { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
  assert.throws(() => assertOperationalTimeline({ ...repo, runningAt: '2026-09-26T03:00:00.000Z' }), { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
  assert.throws(() => assertOperationalTimeline({ ...repo, repoPickedUpAt: '2026-09-24T08:36:00.000Z' }), { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
});

test('new inverted running and Repo stored dates are rejected', () => {
  assert.throws(() => assertOperationalTimeline({
    runningAt: '2026-09-25T03:00:00.000Z', repoStoredAt: '2026-09-23T03:00:00.000Z',
  }), { code: 'CONTAINER_JOB_TIMELINE_INVALID', statusCode: 409 });
});

test('unchanged historical dates survive updates and valid new pickup and completion', () => {
  const old = { runningAt: '2026-09-25T03:00:00.000Z', repoStoredAt: '2026-09-23T03:00:00.000Z' };
  assert.doesNotThrow(() => assertOperationalTimeline(old, old));
  // Same instant submitted with a different offset is not a semantic change.
  assert.doesNotThrow(() => assertOperationalTimeline({ ...old, runningAt: '2026-09-25T10:00:00+07:00' }, old));
  assert.equal(isOperationalTimestampChanged('2026-09-25T10:00:00+07:00', old.runningAt), false);
  const pickedUp = { ...old, repoPickedUpAt: '2026-10-09T08:36:00.000Z' };
  assert.doesNotThrow(() => assertOperationalTimeline(pickedUp, old));
  assert.doesNotThrow(() => assertOperationalTimeline({ ...pickedUp, completedAt: '2026-10-09T08:41:00.000Z' }, old));
  assert.doesNotThrow(() => assertCompletionNotBeforeStart('2026-10-09T08:41:00.000Z', {
    ...pickedUp, movementStartedAt: pickedUp.repoPickedUpAt,
  }));
});

test('new normal and Repo timelines remain strict from the beginning', () => {
  const normal = { runningAt: '2026-09-25T03:00:00.000Z', completedAt: '2026-09-25T04:00:00.000Z' };
  assert.doesNotThrow(() => assertOperationalTimeline(normal));
  assert.throws(() => assertOperationalTimeline({ ...normal, completedAt: '2026-09-25T02:00:00.000Z' }),
    { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
  assert.throws(() => assertOperationalTimeline({ ...normal, repoStoredAt: '2026-09-23T03:00:00.000Z' }),
    { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
});

test('old picked-up and completed dates are tolerated unchanged; new completion uses strongest bound', () => {
  const old = {
    runningAt: '2026-09-29T03:00:00.000Z',
    repoStoredAt: '2026-09-23T03:00:00.000Z',
    repoPickedUpAt: '2026-09-25T03:00:00.000Z',
  };
  assert.doesNotThrow(() => assertOperationalTimeline(old, old));
  assert.doesNotThrow(() => assertOperationalTimeline({ ...old, completedAt: '2026-10-09T08:41:00.000Z' }, old));
  assert.throws(() => assertOperationalTimeline({ ...old, completedAt: '2026-09-26T03:00:00.000Z' }, old),
    { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
  const completedOld = { ...old, completedAt: '2026-09-26T03:00:00.000Z' };
  assert.doesNotThrow(() => assertOperationalTimeline(completedOld, completedOld));
  assert.throws(() => assertOperationalTimeline({ ...completedOld, completedAt: '2026-09-27T03:00:00.000Z' }, completedOld),
    { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
});

test('legacy pickup must follow the later of running and stored, including a 1ms inversion', () => {
  const old = { runningAt: '2026-09-23T11:00:00.000Z', repoStoredAt: '2026-09-23T10:00:00.000Z' };
  assert.throws(() => assertOperationalTimeline({ ...old, repoPickedUpAt: '2026-09-23T10:30:00.000Z' }, old),
    { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
  const millisecondOld = { runningAt: '2026-09-23T10:00:00.001Z', repoStoredAt: '2026-09-23T10:00:00.000Z' };
  assert.doesNotThrow(() => assertOperationalTimeline(millisecondOld, millisecondOld));
  assert.doesNotThrow(() => assertOperationalTimeline({ ...millisecondOld, repoPickedUpAt: millisecondOld.runningAt }, millisecondOld));
  assert.throws(() => assertOperationalTimeline({ ...millisecondOld, repoPickedUpAt: millisecondOld.repoStoredAt }, millisecondOld),
    { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
});

test('changing either date ends the historical inversion exception', () => {
  const old = { runningAt: '2026-09-25T03:00:00.000Z', repoStoredAt: '2026-09-23T03:00:00.000Z' };
  assert.doesNotThrow(() => assertOperationalTimeline({ ...old, repoStoredAt: '2026-09-26T03:00:00.000Z' }, old));
  assert.throws(() => assertOperationalTimeline({ ...old, repoStoredAt: '2026-09-24T03:00:00.000Z' }, old),
    { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
  assert.throws(() => assertOperationalTimeline({ ...old, runningAt: '2026-09-27T03:00:00.000Z' }, old),
    { code: 'CONTAINER_JOB_TIMELINE_INVALID' });
});

test('single Repo stays running until its linked job completes, then completes once', async () => {
  const state = lifecycleClient(['running']);
  let locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'running');
  state.jobs[0].status = 'completed';
  locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'completed');
  assert.equal(state.movement.completed_at, '2026-10-07T10:00:00.000Z');
  locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'completed');
  assert.equal(state.updates, 1);
});

test('combo first completion remains running; second completion closes one movement', async () => {
  const state = lifecycleClient(['completed', 'running']);
  let locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'running');
  state.jobs[1].status = 'completed';
  locked = await lockRepoPickupMovementForJob(state.client, state.jobs[1].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'completed');
  assert.equal(state.updates, 1);
});

// Movement yang sudah dimulai (pickup fisik terkonfirmasi, started_at terisi).
for (const { jobs, expected } of [
  { jobs: ['completed', 'completed'], expected: 'completed' },
  { jobs: ['completed', 'cancelled'], expected: 'completed' },
  { jobs: ['cancelled', 'cancelled'], expected: 'completed' },
  { jobs: ['completed', 'running'], expected: 'running' },
  { jobs: ['cancelled', 'running'], expected: 'running' },
]) {
  test(`started combo ${jobs.join(' + ')} resolves to ${expected}`, async () => {
    const state = lifecycleClient(jobs);
    const locked = await lockRepoPickupMovementForJob(state.client, state.jobs[1].id);
    assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, expected);
    assert.equal(state.updates, expected === 'running' ? 0 : 1);
    assert.equal(Boolean(state.movement.completed_at), expected === 'completed');
    // Idempotent: reconcile ulang tidak menulis lagi.
    assert.equal((await reconcileRepoPickupMovement(state.client, {
      id: state.movement.id, status: state.movement.status,
    })).status, expected);
    assert.equal(state.updates, expected === 'running' ? 0 : 1);
  });
}

test('started movement whose linked jobs are all cancelled after pickup completes, never cancels', async () => {
  const state = lifecycleClient(['cancelled', 'running']);
  let locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'running');
  state.jobs[1].status = 'cancelled';
  locked = await lockRepoPickupMovementForJob(state.client, state.jobs[1].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'completed');
  assert.equal(state.updates, 1);

  // Pemanggil yang tidak membawa started_at tetap tidak bisa membuat trip yang sudah jalan jadi cancelled.
  const bare = lifecycleClient(['cancelled', 'cancelled']);
  assert.equal((await reconcileRepoPickupMovement(bare.client, { id: bare.movement.id, status: 'running' })).status, 'completed');
  assert.notEqual(bare.movement.status, 'cancelled');
});

test('legacy movement without started_at and all jobs cancelled is cancelled (trip never happened)', async () => {
  const state = lifecycleClient(['cancelled', 'cancelled'], 'running', { started: false });
  const locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'cancelled');
  assert.equal(state.movement.completed_at, null);
  locked.status = state.movement.status;
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'cancelled');
  assert.equal(state.updates, 1);
});

test('cancelled movement is terminal and is not revived by reconciliation', async () => {
  const state = lifecycleClient(['completed'], 'cancelled');
  const locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'cancelled');
  assert.equal(state.updates, 0);
});

test('completed movement cannot revert to running or cancelled on later reconciliation', async () => {
  const state = lifecycleClient(['running'], 'completed');
  const locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'completed');
  assert.equal(state.updates, 0);
});

// Reproduksi produksi 2609/23-00250 / SKHU8711190 (WIB = UTC+7).
const repoTimeline = {
  runningAt: '2026-09-23T03:00:00.000Z', // perjalanan awal 23 Sep
  repoStoredAt: '2026-09-23T14:34:00.000Z', // dititip 23 Sep 21:34 WIB
  repoPickedUpAt: '2026-10-09T08:36:00.000Z', // pickup 9 Okt 15:36 WIB
  movementStartedAt: '2026-10-09T08:36:00.000Z',
};

test('A: job normal boleh selesai di hari yang sama setelah mulai jalan', () => {
  assert.doesNotThrow(() => assertCompletionNotBeforeStart('2026-09-23T10:00:00.000Z', { runningAt: '2026-09-23T03:00:00.000Z' }));
  assert.throws(
    () => assertCompletionNotBeforeStart('2026-09-23T02:00:00.000Z', { runningAt: '2026-09-23T03:00:00.000Z' }),
    { code: 'CONTAINER_JOB_COMPLETION_INVALID_TIME', message: 'Pekerjaan belum dapat diselesaikan. Waktu selesai tidak boleh lebih awal dari waktu mulai.' },
  );
});

test('B: job Repo yang di-pickup 9 Okt tidak boleh selesai 29 Sep walau setelah running_at awal', () => {
  assert.throws(
    () => assertCompletionNotBeforeStart('2026-09-29T03:00:00.000Z', repoTimeline),
    (error) => error.code === 'CONTAINER_JOB_COMPLETION_INVALID_TIME'
      && error.statusCode === 409
      && error.message.includes('pickup Repo')
      && error.message.includes('15.36 WIB')
      && error.details.lowerBound === '2026-10-09T08:36:00.000Z',
  );
});

test('C: job Repo pickup 9 Okt 15:36 boleh selesai 9 Okt 15:41', () => {
  assert.doesNotThrow(() => assertCompletionNotBeforeStart('2026-10-09T08:41:00.000Z', repoTimeline));
  assert.doesNotThrow(() => assertCompletionNotBeforeStart('2026-10-09T08:36:00.000Z', repoTimeline));
});

test('batas bawah memakai timestamp paling akhir dari running, pickup Repo, dan mulai movement', () => {
  assert.deepEqual(resolveCompletionLowerBound({ runningAt: repoTimeline.runningAt }), { source: 'running', at: new Date(repoTimeline.runningAt) });
  assert.equal(resolveCompletionLowerBound(repoTimeline).at.toISOString(), '2026-10-09T08:36:00.000Z');
  const movementLater = resolveCompletionLowerBound({ ...repoTimeline, movementStartedAt: '2026-10-09T08:40:00.000Z' });
  assert.deepEqual([movementLater.source, movementLater.at.toISOString()], ['repo_movement', '2026-10-09T08:40:00.000Z']);
  assert.equal(resolveCompletionLowerBound({}), null);
});

test('D: completed_at movement tidak pernah lebih awal dari started_at (job lama dengan waktu selesai invalid diabaikan)', async () => {
  const state = lifecycleClient(['completed', 'cancelled'], 'running', {
    startedAt: repoTimeline.movementStartedAt,
    nowIso: '2026-10-09T08:45:00.000Z',
  });
  state.jobs[0].completed_at = '2026-09-29T03:00:00.000Z'; // data lama: lebih awal dari pickup
  const locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal(locked.started_at, repoTimeline.movementStartedAt);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'completed');
  assert.ok(new Date(state.movement.completed_at) >= new Date(state.movement.started_at));
  assert.equal(state.movement.completed_at, '2026-10-09T08:45:00.000Z');
});

test('D: movement memakai waktu selesai job yang valid', async () => {
  const state = lifecycleClient(['completed'], 'running', { startedAt: repoTimeline.movementStartedAt });
  state.jobs[0].completed_at = '2026-10-09T08:41:00.000Z';
  const locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  await reconcileRepoPickupMovement(state.client, locked);
  assert.equal(state.movement.completed_at, '2026-10-09T08:41:00.000Z');
});

test('D: bila penyelesaian movement tetap jatuh sebelum started_at, transaksi ditolak (tidak diam-diam running)', async () => {
  const state = lifecycleClient(['cancelled'], 'running', {
    startedAt: '2026-10-09T08:36:00.000Z',
    nowIso: '2026-10-09T08:00:00.000Z', // jam server di belakang started_at
  });
  const locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  await assert.rejects(() => reconcileRepoPickupMovement(state.client, locked), { code: 'REPO_MOVEMENT_COMPLETION_BEFORE_START' });
  assert.equal(state.movement.status, 'running');
});

test('G: combo 2x20 selesai sekali setelah kedua job terminal, completed_at >= started_at', async () => {
  const state = lifecycleClient(['completed', 'running'], 'running', { startedAt: repoTimeline.movementStartedAt });
  state.jobs[0].completed_at = '2026-10-09T08:41:00.000Z';
  let locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'running');
  state.jobs[1].status = 'completed';
  state.jobs[1].completed_at = '2026-10-09T09:10:00.000Z';
  locked = await lockRepoPickupMovementForJob(state.client, state.jobs[1].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'completed');
  assert.equal(state.movement.completed_at, '2026-10-09T09:10:00.000Z');
  assert.ok(new Date(state.movement.completed_at) >= new Date(state.movement.started_at));
  assert.equal(state.updates, 1);
});
