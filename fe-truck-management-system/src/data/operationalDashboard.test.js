import { describe, expect, it } from 'vitest';
import { getOperationalDashboardData, getOperationalWorkStage, isActiveOperationalJob } from './operationalDashboard';

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

  it('tidak menambah prospek demo saat mode live API sudah punya data', () => {
    const result = getOperationalDashboardData([{
      id: 'so-1',
      soNumber: 'SO-001',
      customer: 'PT Test',
      origin: 'Jakarta',
      destination: 'Bekasi',
      tripDate: '2026-07-08',
      status: 'waiting_operational',
      containers: [{
        id: 'job-1',
        size: '20FT',
        status: 'received',
      }],
    }], {
      currentDateKey: '2026-07-07',
      hasLiveOrders: true,
      allowDemoFallback: true,
    });

    expect(result.visibleFutureJobs).toHaveLength(1);
    expect(result.visibleFutureJobs[0].soNumber).toBe('SO-001');
  });

  it('tidak menampilkan job selesai sebagai prospek di tanggal SO awal', () => {
    const result = getOperationalDashboardData([{
      id: 'so-1',
      soNumber: 'SO-001',
      customer: 'PT Test',
      origin: 'Jakarta',
      destination: 'Bekasi',
      tripDate: '2026-07-12',
      status: 'completed',
      containers: [{
        id: 'job-1',
        containerNumber: 'CONT-1',
        plateNumber: 'B 1234 XYZ',
        driver: 'Andi',
        status: 'completed',
        runningAt: '2026-07-11T08:00:00.000Z',
        completedAt: '2026-07-11T12:00:00.000Z',
      }],
    }], {
      currentDateKey: '2026-07-11',
      hasLiveOrders: true,
      allowDemoFallback: false,
    });

    expect(result.futureJobs).toHaveLength(0);
    expect(result.visibleFutureJobs).toHaveLength(0);
    expect(result.jobs[0]).toMatchObject({
      id: 'job-1',
      tripDateKey: '2026-07-11',
      status: 'completed',
    });
  });

  it('memisahkan job berdasarkan tindakan operasional berikutnya', () => {
    expect(getOperationalWorkStage({ status: 'received' })).toBe('assignment');
    expect(getOperationalWorkStage({
      status: 'received',
      plateNumber: 'B 1234 XYZ',
      driver: 'Andi',
      rpujStatus: 'paid',
      spkNumber: 'SPK-001',
    })).toBe('ready');
    expect(getOperationalWorkStage({
      status: 'received',
      plateNumber: 'B 1234 XYZ',
      driver: 'Andi',
      rpujStatus: 'submitted',
    })).toBe('attention');
    expect(getOperationalWorkStage({
      status: 'running',
      plateNumber: 'B 1234 XYZ',
      driver: 'Andi',
    })).toBe('running');
  });

  it('menyediakan antrean kerja untuk job hari ini dan yang terlambat', () => {
    const result = getOperationalDashboardData([{
      id: 'so-queue',
      soNumber: 'SO-QUEUE',
      tripDate: '2026-07-07',
      containers: [
        { id: 'job-assignment', status: 'received' },
        { id: 'job-ready', status: 'received', plateNumber: 'B 1000 AA', driver: 'Ani', rpujStatus: 'approved', spkNumber: 'SPK-01' },
        { id: 'job-attention', status: 'received', plateNumber: 'B 2000 BB', driver: 'Budi', rpujStatus: 'submitted' },
        { id: 'job-running', status: 'running', plateNumber: 'B 3000 CC', driver: 'Caca' },
      ],
    }], {
      currentDateKey: '2026-07-07',
      hasLiveOrders: true,
      allowDemoFallback: false,
    });

    expect(result.workQueues.assignment.map((job) => job.id)).toEqual(['job-assignment']);
    expect(result.workQueues.ready.map((job) => job.id)).toEqual(['job-ready']);
    expect(result.workQueues.attention.map((job) => job.id)).toEqual(['job-attention']);
    expect(result.workQueues.running.map((job) => job.id)).toEqual(['job-running']);
  });
});
