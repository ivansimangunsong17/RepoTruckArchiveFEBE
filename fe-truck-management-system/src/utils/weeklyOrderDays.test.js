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

  it('keeps full customer list for crowded daily rows', () => {
    const days = buildWeeklyOrderDays([
      { id: 'job-1', soNumber: 'SO-1', containerNumber: 'CONT-1', size: '20FT', tripDateKey: '2026-07-12', customer: 'PT Alpha' },
      { id: 'job-2', soNumber: 'SO-2', containerNumber: 'CONT-2', size: '40FT', tripDateKey: '2026-07-12', customer: 'PT Beta' },
      { id: 'job-3', soNumber: 'SO-3', containerNumber: 'CONT-3', size: '40FT', tripDateKey: '2026-07-12', customer: 'PT Gamma' },
    ], '2026-07-11');

    expect(days[0].customerList).toEqual(['PT Alpha', 'PT Beta', 'PT Gamma']);
    expect(days[0].customerBreakdown).toEqual([
      { customer: 'PT Alpha', totalContainers: 1, twentyFt: 1, fortyFt: 0 },
      { customer: 'PT Beta', totalContainers: 1, twentyFt: 0, fortyFt: 1 },
      { customer: 'PT Gamma', totalContainers: 1, twentyFt: 0, fortyFt: 1 },
    ]);
    expect(days[0].shortCustomerSummary).toBe('PT Alpha +2');
    expect(days[0].fullCustomerSummary).toBe('PT Alpha, PT Beta, PT Gamma');
  });

  it('tidak menghitung container yang sudah dibatalkan', () => {
    const days = buildWeeklyOrderDays([
      { id: 'job-active', soNumber: 'SO-1', containerNumber: 'CONT-1', size: '20FT', tripDateKey: '2026-07-12', customer: 'PT Alpha', status: 'received' },
      { id: 'job-cancelled', soNumber: 'SO-1', containerNumber: 'CONT-2', size: '20FT', tripDateKey: '2026-07-12', customer: 'PT Alpha', status: 'cancelled' },
    ], '2026-07-11');

    expect(days[0]).toMatchObject({
      orderCount: 1,
      totalContainers: 1,
      twentyFt: 1,
      fortyFt: 0,
    });
    expect(days[0].customerBreakdown).toEqual([
      { customer: 'PT Alpha', totalContainers: 1, twentyFt: 1, fortyFt: 0 },
    ]);
  });
});
