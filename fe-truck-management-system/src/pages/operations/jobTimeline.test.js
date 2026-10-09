import { describe, expect, it } from 'vitest';
import { buildJobTimelinePhases } from './jobTimeline';

// Reproduksi 2609/23-00250 / SKHU8711190 (WIB = UTC+7).
const repoJob = {
  status: 'completed',
  tripDate: '2026-09-23',
  receivedAt: '2026-09-22T08:00:00.000Z',
  runningAt: '2026-09-23T03:00:00.000Z',
  repoStoredAt: '2026-09-23T14:34:00.000Z',
  repoPickedUpAt: '2026-10-09T08:36:00.000Z',
  completedAt: '2026-10-09T08:41:00.000Z',
  pickupMovement: { id: 'movement-1', startedAt: '2026-10-09T08:36:00.000Z', completedAt: '2026-10-09T08:41:00.000Z' },
};

describe('buildJobTimelinePhases', () => {
  it('job normal tetap Diterima / Mulai / Selesai', () => {
    const phases = buildJobTimelinePhases({
      receivedAt: '2026-09-22T08:00:00.000Z',
      runningAt: '2026-09-23T03:00:00.000Z',
      completedAt: '2026-09-23T10:00:00.000Z',
    });
    expect(phases.map((phase) => [phase.label, phase.value, phase.done])).toEqual([
      ['Diterima', '2026-09-22T08:00:00.000Z', true],
      ['Mulai', '2026-09-23T03:00:00.000Z', true],
      ['Selesai', '2026-09-23T10:00:00.000Z', true],
    ]);
  });

  it('job Repo memisahkan leg awal dan leg Repo; pickup bukan waktu mulai perjalanan awal', () => {
    const phases = buildJobTimelinePhases(repoJob);
    expect(phases.map((phase) => [phase.label, phase.value])).toEqual([
      ['Tanggal Jalan', '2026-09-23'],
      ['Mulai Perjalanan Awal', '2026-09-23T03:00:00.000Z'],
      ['Container Dititipkan', '2026-09-23T14:34:00.000Z'],
      ['Pickup / Mulai Perjalanan Repo', '2026-10-09T08:36:00.000Z'],
      ['Perjalanan Lanjutan Selesai', '2026-10-09T08:41:00.000Z'],
    ]);
    expect(phases.find((phase) => phase.key === 'tripDate').format).toBe('date');
    expect(phases.every((phase) => !phase.warning)).toBe(true);
  });

  it('memakai timestamp movement untuk leg Repo, lalu fallback ke repoPickedUpAt / completedAt', () => {
    const fromJobOnly = buildJobTimelinePhases({ ...repoJob, pickupMovement: null });
    expect(fromJobOnly.find((phase) => phase.key === 'repoPickup').value).toBe(repoJob.repoPickedUpAt);
    expect(fromJobOnly.find((phase) => phase.key === 'repoCompleted').value).toBe(repoJob.completedAt);

    const stillStored = buildJobTimelinePhases({ ...repoJob, status: 'repo_stored', repoPickedUpAt: null, completedAt: null, pickupMovement: null });
    expect(stillStored.filter((phase) => phase.done).map((phase) => phase.key)).toEqual(['tripDate', 'originalRunning', 'repoStored']);
  });

  it('menandai data lama yang selesai sebelum pickup Repo', () => {
    const phases = buildJobTimelinePhases({
      ...repoJob,
      runningAt: '2026-09-29T03:00:00.000Z',
      completedAt: '2026-09-29T03:00:00.000Z',
      pickupMovement: { id: 'movement-1', startedAt: '2026-10-09T08:36:00.000Z', completedAt: '2026-09-29T03:00:00.000Z' },
    });
    expect(phases.find((phase) => phase.key === 'repoCompleted').warning).toBe('Lebih awal dari pickup Repo, perlu koreksi');
  });
});
