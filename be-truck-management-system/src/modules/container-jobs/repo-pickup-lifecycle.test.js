import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lockRepoPickupMovementForJob,
  reconcileRepoPickupMovement,
  requirePhysicalRepoPickup,
} from './repo-pickup-lifecycle.js';

function lifecycleClient(jobStatuses, initialStatus = 'running') {
  const movement = { id: 'movement-1', status: initialStatus, completed_at: null };
  const jobs = jobStatuses.map((status, index) => ({ id: `job-${index + 1}`, status }));
  let updates = 0;
  const client = {
    async query(sql, params) {
      if (sql.includes('for update of cpm')) {
        assert.ok(jobs.some((job) => job.id === params[0]));
        return { rows: [{ ...movement }] };
      }
      if (sql.includes('count(*) filter')) {
        return { rows: [{
          total: jobs.length,
          completed: jobs.filter((job) => job.status === 'completed').length,
          cancelled: jobs.filter((job) => job.status === 'cancelled').length,
          last_completed_at: '2026-10-07T10:00:00.000Z',
        }] };
      }
      if (sql.includes('update container_pickup_movements')) {
        assert.equal(params[0], movement.id);
        if (movement.status !== 'running') return { rows: [] };
        movement.status = params[1];
        movement.completed_at = movement.status === 'completed' ? params[2] : null;
        updates += 1;
        return { rows: [{ ...movement }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return { client, jobs, movement, get updates() { return updates; } };
}

test('single pickup requires physical confirmation and uses server time', () => {
  assert.throws(() => requirePhysicalRepoPickup({}), { code: 'REPO_PICKUP_CONFIRMATION_REQUIRED' });
  assert.equal(requirePhysicalRepoPickup({
    pickupConfirmed: true,
    runningAt: '2099-01-01T00:00:00.000Z',
  }, new Date('2026-10-07T08:00:00.000Z')), '2026-10-07T08:00:00.000Z');
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

test('all linked jobs cancelled cancels the movement; repeated cancellation is safe', async () => {
  const state = lifecycleClient(['cancelled', 'running']);
  let locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'running');
  state.jobs[1].status = 'cancelled';
  locked = await lockRepoPickupMovementForJob(state.client, state.jobs[1].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'cancelled');
  locked = await lockRepoPickupMovementForJob(state.client, state.jobs[1].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'cancelled');
  assert.equal(state.updates, 1);
});

test('completed movement cannot revert to running or cancelled on later reconciliation', async () => {
  const state = lifecycleClient(['running'], 'completed');
  const locked = await lockRepoPickupMovementForJob(state.client, state.jobs[0].id);
  assert.equal((await reconcileRepoPickupMovement(state.client, locked)).status, 'completed');
  assert.equal(state.updates, 0);
});
