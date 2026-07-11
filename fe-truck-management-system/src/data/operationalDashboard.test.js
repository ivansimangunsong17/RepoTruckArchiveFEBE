import { describe, expect, it } from 'vitest';
import { getOperationalDashboardData, isActiveOperationalJob } from './operationalDashboard';

describe('operationalDashboard', () => {
  it('menganggap truck tanggal sebelumnya tetap aktif jika job belum selesai', () => {
    const currentDateKey = '2026-07-07';

    expect(isActiveOperationalJob({
      tripDateKey: '2026-07-06',
      plateNumber: 'B 1234 XYZ',
      status: 'running',
    }, currentDateKey)).toBe(true);
  });

  it('tidak mengunci truck untuk job mendatang atau sudah selesai', () => {
    const currentDateKey = '2026-07-07';

    expect(isActiveOperationalJob({
      tripDateKey: '2026-07-08',
      plateNumber: 'B 1234 XYZ',
      status: 'running',
    }, currentDateKey)).toBe(false);

    expect(isActiveOperationalJob({
      tripDateKey: '2026-07-06',
      plateNumber: 'B 1234 XYZ',
      status: 'completed',
    }, currentDateKey)).toBe(false);
  });

  it('menampilkan job aktif tanggal lewat sebagai eksisting aktif', () => {
    const result = getOperationalDashboardData([{
      id: 'so-1',
      soNumber: 'SO-001',
      customer: 'PT Test',
      origin: 'Jakarta',
      destination: 'Bekasi',
      tripDate: '2026-07-06',
      status: 'running',
      containers: [{
        id: 'job-1',
        containerNumber: 'CONT-1',
        plateNumber: 'B 1234 XYZ',
        driver: 'Andi',
        status: 'running',
      }],
    }], {
      currentDateKey: '2026-07-07',
      hasLiveOrders: true,
      allowDemoFallback: false,
    });

    expect(result.todayJobs).toHaveLength(0);
    expect(result.activeJobs).toHaveLength(1);
    expect(result.assignedActiveJobs).toBe(1);
    expect(result.activeJobs[0]).toMatchObject({
      id: 'job-1',
      tripDateKey: '2026-07-06',
    });
  });

  it('tidak mengganti job aktif tanggal lewat dengan fallback demo', () => {
    const result = getOperationalDashboardData([{
      id: 'so-1',
      soNumber: 'SO-001',
      customer: 'PT Test',
      origin: 'Jakarta',
      destination: 'Bekasi',
      tripDate: '2026-07-06',
      status: 'running',
      containers: [{
        id: 'job-1',
        containerNumber: 'CONT-1',
        plateNumber: 'B 1234 XYZ',
        driver: 'Andi',
        status: 'running',
      }],
    }], {
      currentDateKey: '2026-07-07',
      hasLiveOrders: false,
      allowDemoFallback: true,
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].soNumber).toBe('SO-001');
    expect(result.activeJobs).toHaveLength(1);
  });
});
