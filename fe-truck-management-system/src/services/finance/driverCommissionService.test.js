import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../api/httpClient';
import {
  fetchDriverCommissionPeriodReport,
  recordDriverCommissionDeduction,
  submitDriverCommissionBatch,
  updateDriverCommissionDeduction,
  voidDriverCommissionDeduction,
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

  it('mengirim potongan komisi baru ke payment', async () => {
    const payload = { deductionType: 'hutang_sopir', amount: 100000, reason: 'Potongan hutang sopir sesuai catatan Finance' };
    await recordDriverCommissionDeduction('payment-1', payload);

    expect(httpClient.post).toHaveBeenCalledWith('/driver-commissions/payments/payment-1/deductions', payload);
  });

  it('menolak menambah potongan tanpa paymentId, bukannya mengirim "undefined" ke URL', async () => {
    expect(() => recordDriverCommissionDeduction(undefined, { amount: 1000, reason: 'x' })).toThrow();
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it('mengubah potongan komisi', async () => {
    const payload = { deductionType: 'kasbon', amount: 50000, reason: 'Kasbon diperbarui nominalnya' };
    await updateDriverCommissionDeduction('deduction-1', payload);

    expect(httpClient.patch).toHaveBeenCalledWith('/driver-commissions/deductions/deduction-1', payload);
  });

  it('membatalkan potongan komisi dengan alasan', async () => {
    await voidDriverCommissionDeduction('deduction-1', 'Hutang sudah lunas');

    expect(httpClient.patch).toHaveBeenCalledWith('/driver-commissions/deductions/deduction-1/void', { reason: 'Hutang sudah lunas' });
  });
});
