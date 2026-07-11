import { describe, expect, it } from 'vitest';
import { buildWeeklyOrderDays } from './weeklyOrderDays';

describe('buildWeeklyOrderDays', () => {
  it('starts from tomorrow because current date is shown in dashboard', () => {
    const days = buildWeeklyOrderDays([
      {
        id: 'job-1',
        soNumber: 'SO-2026-001',
        containerNumber: 'CONT-001',
        size: '20FT',
        tripDateKey: '2026-07-12',
      },
    ], '2026-07-11');

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({
      dateKey: '2026-07-12',
      orderCount: 1,
      totalContainers: 1,
      twentyFt: 1,
    });
  });

  it('does not include current date jobs', () => {
    const days = buildWeeklyOrderDays([
      {
        id: 'job-today',
        soNumber: 'SO-2026-TODAY',
        containerNumber: 'CONT-TODAY',
        size: '40FT',
        tripDateKey: '2026-07-11',
      },
    ], '2026-07-11');

    expect(days[0]).toMatchObject({
      dateKey: '2026-07-12',
      orderCount: 0,
      totalContainers: 0,
    });
  });
});
