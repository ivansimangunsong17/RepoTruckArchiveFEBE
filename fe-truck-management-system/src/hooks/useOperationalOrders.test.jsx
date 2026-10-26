import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildOperationalJobs, getActiveOperationalJobs, getOperationalDashboardData } from '../data/operationalDashboard';
import { mergeOperationalOrders, useOperationalOrders } from './useOperationalOrders';
import { useArchiveData } from './useArchiveData';
import OperationalDataTruncatedNotice from '../components/common/OperationalDataTruncatedNotice';
import { fetchActiveOperationalSalesOrders } from '../services/archive/salesOrderService';

vi.mock('./useArchiveData', () => ({ useArchiveData: vi.fn() }));
vi.mock('../services/archive/salesOrderService', () => ({ fetchActiveOperationalSalesOrders: vi.fn() }));

const TODAY = '2026-10-26';

function order(index, containers, extra = {}) {
  return { id: `so-${index}`, soNumber: `SO-${index}`, status: 'completed', tripDate: '2026-01-01', containers, ...extra };
}

// 120 SO: list SO hanya mengembalikan 100 baris pertama; SO aktif berada di luar batas itu.
const allOrders = Array.from({ length: 120 }, (_, index) => order(index + 1, [
  { id: `job-${index + 1}`, status: 'completed', size: '20FT', plateNumber: `B ${index + 1} DONE`, driver: `SOPIR DONE ${index + 1}` },
]));
const activeOldOrder = order(115, [
  { id: 'job-active', status: 'running', size: '20FT', plateNumber: 'B 9830 FEH', driver: 'SOPIR LAMA', driverId: 'drv-old', vehicleId: 'veh-old' },
], { status: 'running', tripDate: TODAY });
const inapOldOrder = order(118, [
  { id: 'job-inap', status: 'inap', size: '40FT', plateNumber: 'B 9103 BEL', driver: 'SOPIR INAP', driverId: 'drv-inap', vehicleId: 'veh-inap' },
], { status: 'running', tripDate: TODAY });
const firstHundred = allOrders.slice(0, 100);

describe('P1-5: job aktif tidak terbatas 100 SO pertama', () => {
  it('regresi: dari 100 SO pertama saja, truck/sopir aktif di SO lama tidak terdeteksi', () => {
    const activeJobs = getActiveOperationalJobs(buildOperationalJobs(firstHundred, TODAY), TODAY);
    expect(activeJobs).toHaveLength(0);
  });

  it('gabungan dengan SO aktif mendeteksi truck/sopir Bertugas dan angka dashboard lengkap', () => {
    const merged = mergeOperationalOrders(firstHundred, [activeOldOrder, inapOldOrder]);
    expect(merged).toHaveLength(102);
    const activeJobs = getActiveOperationalJobs(buildOperationalJobs(merged, TODAY), TODAY);
    expect(activeJobs.map((job) => job.plateNumber).sort()).toEqual(['B 9103 BEL', 'B 9830 FEH']);
    expect(activeJobs.map((job) => job.driverId).sort()).toEqual(['drv-inap', 'drv-old']);
    const dashboard = getOperationalDashboardData(merged, { currentDateKey: TODAY, hasLiveOrders: true, allowDemoFallback: false });
    expect(dashboard.workQueues.running.map((job) => job.id).sort()).toEqual(['job-active', 'job-inap']);
    // Job completed tidak pernah dianggap aktif.
    expect(activeJobs.some((job) => job.status === 'completed')).toBe(false);
  });

  it('versi SO di archive (state lokal terbaru) diutamakan saat id sama', () => {
    const stale = order(1, [{ id: 'job-1', status: 'running' }], { status: 'running' });
    const fresh = order(1, [{ id: 'job-1', status: 'completed' }]);
    expect(mergeOperationalOrders([fresh], [stale])).toEqual([fresh]);
  });

  it('hook memuat SO aktif dari backend di mode database dan tetap aman bila request gagal', async () => {
    useArchiveData.mockReturnValue({ isDatabaseMode: true, orders: firstHundred });
    fetchActiveOperationalSalesOrders.mockResolvedValueOnce({ rows: [activeOldOrder], truncated: false });
    const { result } = renderHook(() => useOperationalOrders());
    await waitFor(() => expect(result.current.orders).toHaveLength(101));
    expect(result.current.orders.some((item) => item.id === activeOldOrder.id)).toBe(true);
    expect(result.current.truncated).toBe(false);

    fetchActiveOperationalSalesOrders.mockRejectedValueOnce(new Error('offline'));
    useArchiveData.mockReturnValue({ isDatabaseMode: true, orders: [...firstHundred] });
    const failing = renderHook(() => useOperationalOrders());
    await waitFor(() => expect(fetchActiveOperationalSalesOrders).toHaveBeenCalledTimes(2));
    expect(failing.result.current.orders).toHaveLength(100);
    expect(failing.result.current.truncated).toBe(false);
  });

  it('mode demo/lokal tidak memanggil backend', () => {
    fetchActiveOperationalSalesOrders.mockClear();
    useArchiveData.mockReturnValue({ isDatabaseMode: false, orders: firstHundred });
    const { result } = renderHook(() => useOperationalOrders());
    expect(result.current.orders).toBe(firstHundred);
    expect(result.current.truncated).toBe(false);
    expect(fetchActiveOperationalSalesOrders).not.toHaveBeenCalled();
  });
  it('hasil terpotong di batas maksimum ditandai truncated dan memunculkan peringatan', async () => {
    useArchiveData.mockReturnValue({ isDatabaseMode: true, orders: [] });
    fetchActiveOperationalSalesOrders.mockResolvedValueOnce({ rows: [activeOldOrder], truncated: true });
    const { result } = renderHook(() => useOperationalOrders());
    await waitFor(() => expect(result.current.truncated).toBe(true));
    render(<OperationalDataTruncatedNotice truncated={result.current.truncated} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/belum lengkap/i);
  });

  it('peringatan tidak tampil bila data lengkap', () => {
    const { container } = render(<OperationalDataTruncatedNotice truncated={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
