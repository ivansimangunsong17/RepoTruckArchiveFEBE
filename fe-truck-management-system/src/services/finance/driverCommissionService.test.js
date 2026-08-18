import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../api/httpClient';
import {
  fetchDriverCommissionPeriodReport,
  submitDriverCommissionBatch,
} from './driverCommissionService';

vi.mock('../api/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('../../utils/imageCompression', () => ({
  compressImageFile: vi.fn((file) => file),
}));

vi.mock('../../utils/fileValidation', () => ({
  validateArchiveFile: vi.fn(() => ''),
  validateFinalUploadFile: vi.fn(() => ''),
}));

describe('driverCommissionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpClient.get.mockResolvedValue({});
    httpClient.post.mockResolvedValue({});
  });

  it('mengambil report komisi per periode', async () => {
    await fetchDriverCommissionPeriodReport({ periodStart: '2026-08-13', periodEnd: '2026-08-19' });

    expect(httpClient.get).toHaveBeenCalledWith('/driver-commissions/period-report?periodStart=2026-08-13&periodEnd=2026-08-19');
  });

  it('mengirim pengajuan batch komisi', async () => {
    const payload = { periodStart: '2026-08-13', periodEnd: '2026-08-19' };
    await submitDriverCommissionBatch(payload);

    expect(httpClient.post).toHaveBeenCalledWith('/driver-commissions/batches', payload);
  });
});
