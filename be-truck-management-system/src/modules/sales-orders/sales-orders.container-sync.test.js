import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileSalesOrderContainers } from './sales-orders.container-sync.js';

const currentJobs = [
  { id: 'job-active', status: 'received', container_size: '20FT' },
  { id: 'job-cancelled', status: 'cancelled', container_size: '20FT' },
];

test('menyimpan ulang SO tidak membuat job pengganti untuk job cancelled', () => {
  const submittedContainers = [
    { size: '20FT', status: 'received' },
    { size: '20FT', status: 'received' },
  ];

  const result = reconcileSalesOrderContainers(submittedContainers, currentJobs);

  assert.deepEqual(
    result.assignments.map((assignment) => assignment.currentJob?.id),
    ['job-active', 'job-cancelled'],
  );
  assert.deepEqual(result.removableIds, []);
});

test('job baru hanya dibuat saat qty container memang bertambah', () => {
  const submittedContainers = [
    { size: '20FT' },
    { size: '20FT' },
    { size: '20FT' },
  ];

  const result = reconcileSalesOrderContainers(submittedContainers, currentJobs);

  assert.deepEqual(
    result.assignments.map((assignment) => assignment.currentJob?.id || null),
    ['job-active', 'job-cancelled', null],
  );
});

test('pengurangan qty mempertahankan job aktif dan histori cancelled', () => {
  const result = reconcileSalesOrderContainers([{ size: '20FT' }], currentJobs);

  assert.equal(result.assignments[0].currentJob.id, 'job-active');
  assert.deepEqual(result.removableIds, []);
});
