import assert from 'node:assert/strict';
import test from 'node:test';
import { toAssignmentSnapshot } from './container-jobs.mapper.js';

const vehicle = {
  id: 'truck-1', plate_number: 'B 9103 BEL',
  chassis_id: 'chassis-20', chassis_code: 'CH-20', chassis_size: '20FT',
};
const chassisFields = (snapshot) => Object.fromEntries(
  Object.entries(snapshot).filter(([key]) => key.startsWith('chassis')),
);

test('snapshot captures chassis from master, ignoring client chassis fields', () => {
  const snapshot = toAssignmentSnapshot({ chassisId: 'spoofed', chassisSize: '40FT' }, null, vehicle);
  assert.deepEqual(chassisFields(snapshot), {
    chassisId: 'chassis-20', chassisCode: 'CH-20', chassisSize: '20FT',
  });
});

test('status, document and driver-only updates preserve the saved chassis', () => {
  let saved = toAssignmentSnapshot({}, null, vehicle);
  for (const form of [
    { status: 'running' },
    { status: 'completed' },
    { eirNumber: 'EIR-001', chassisSize: '40FT' },
    { driver: 'New driver' },
  ]) {
    const next = toAssignmentSnapshot(form, null, null, saved);
    assert.deepEqual(chassisFields(next), chassisFields(saved));
    saved = next;
  }
  assert.equal(saved.chassisSize, '20FT');
});

test('legacy snapshot without chassis remains absent, including partial/null snapshots', () => {
  for (const previous of [{ driver: 'Budi' }, { chassisId: 'old-id' }, { chassisId: null, chassisSize: null }]) {
    const next = toAssignmentSnapshot({ chassisId: 'new-id', chassisSize: '40FT' }, null, null, previous);
    assert.deepEqual(chassisFields(next), chassisFields(previous));
  }
});

test('a different truck captures its chassis without modifying the old snapshot', () => {
  const previous = toAssignmentSnapshot({}, null, vehicle);
  const next = toAssignmentSnapshot({}, null, {
    id: 'truck-2', chassis_id: 'chassis-40', chassis_code: 'CH-40', chassis_size: '40FT',
  }, previous);
  assert.equal(next.chassisSize, '40FT');
  assert.equal(next.chassisId, 'chassis-40');
  assert.equal(previous.chassisSize, '20FT');
});

test('assignment to a truck without chassis does not inherit the old chassis', () => {
  const previous = toAssignmentSnapshot({}, null, vehicle);
  const next = toAssignmentSnapshot({}, null, { id: 'truck-2' }, previous);
  assert.deepEqual(chassisFields(next), { chassisId: null, chassisCode: null, chassisSize: null });
  assert.deepEqual(chassisFields(toAssignmentSnapshot({}, null, null, {})), {});
});
