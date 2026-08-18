import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelContainerJob, fetchContainerJobsPage, generateContainerJobSpk, updateContainerJob } from './containerJobService';
import { httpClient } from '../api/httpClient';
import { deleteAttachmentFile, uploadAttachmentFile } from '../files/fileService';

vi.mock('../api/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../files/fileService', () => ({
  deleteAttachmentFile: vi.fn(),
  uploadAttachmentFile: vi.fn(),
}));

describe('containerJobService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengambil halaman Container Job dari backend API', async () => {
    httpClient.get.mockResolvedValue({ rows: [], total: 0, counts: { received: 0, running: 0, completed: 0 } });

    const result = await fetchContainerJobsPage({
      page: 3,
      pageSize: 8,
      query: 'CONT',
      status: 'running',
      tripDate: '2026-07-11',
      entrySource: 'realtime',
    });

    expect(httpClient.get).toHaveBeenCalledWith('/container-jobs?page=3&pageSize=8&query=CONT&status=running&tripDate=2026-07-11&entrySource=realtime');
    expect(result.counts).toEqual({ received: 0, running: 0, completed: 0 });
  });

  it('mengirim parameter pagination grup SO saat diminta', async () => {
    httpClient.get.mockResolvedValue({ rows: [], total: 0, totalRows: 0, totalGroups: 0 });

    await fetchContainerJobsPage({
      page: 2,
      pageSize: 8,
      groupByOrder: true,
      rpujStage: 'approved',
    });

    expect(httpClient.get).toHaveBeenCalledWith('/container-jobs?page=2&pageSize=8&query=&rpujStage=approved&groupByOrder=true');
  });

  it('mengupdate Container Job ke backend API', async () => {
    httpClient.patch.mockResolvedValue({ id: 'job-1', status: 'running' });

    const result = await updateContainerJob('job-1', { status: 'running' });

    expect(httpClient.patch).toHaveBeenCalledWith('/container-jobs/job-1', { status: 'running' });
    expect(result.status).toBe('running');
  });

  it('mengupload dokumen sebelum complete job', async () => {
    const spkDocument = new File(['spk'], 'spk.pdf', { type: 'application/pdf' });
    uploadAttachmentFile.mockResolvedValue({ id: 'attachment-spk-1' });
    httpClient.patch.mockResolvedValue({ id: 'job-1', status: 'completed' });

    await updateContainerJob('job-1', {
      status: 'completed',
      spkDocument: { rawFile: spkDocument },
      updatedBy: 'Ops',
    });

    expect(uploadAttachmentFile).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'container_job',
      entityId: 'job-1',
      category: 'spkDocument',
      file: spkDocument,
      uploadedByName: 'Ops',
    }));
    expect(httpClient.patch).toHaveBeenCalledWith('/container-jobs/job-1', expect.objectContaining({ status: 'completed' }));
  });

  it('mengupload lampiran biaya lainnya dengan kategori terpisah dari SPK', async () => {
    const additionalCostDocument = new File(['biaya'], 'biaya.pdf', { type: 'application/pdf' });
    uploadAttachmentFile.mockResolvedValue({ id: 'attachment-cost-1' });
    httpClient.patch.mockResolvedValue({ id: 'job-1', status: 'received' });
    httpClient.get.mockResolvedValue({ id: 'job-1', additionalCostDocument: { name: 'biaya.pdf' } });

    await updateContainerJob('job-1', {
      status: 'received',
      additionalCostDocument: { rawFile: additionalCostDocument },
      updatedBy: 'Ops',
    });

    expect(uploadAttachmentFile).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'container_job',
      entityId: 'job-1',
      category: 'additionalCostDocument',
      file: additionalCostDocument,
      uploadedByName: 'Ops',
    }));
    expect(uploadAttachmentFile).not.toHaveBeenCalledWith(expect.objectContaining({
      category: 'spkDocument',
      file: additionalCostDocument,
    }));
    expect(httpClient.patch.mock.invocationCallOrder[0]).toBeLessThan(uploadAttachmentFile.mock.invocationCallOrder[0]);
    expect(httpClient.get).toHaveBeenCalledWith('/container-jobs/job-1');
  });

  it('tidak mengupload dokumen ketika update data utama gagal', async () => {
    const additionalCostDocument = new File(['biaya'], 'biaya.pdf', { type: 'application/pdf' });
    httpClient.patch.mockRejectedValue(new Error('Validasi gagal'));

    await expect(updateContainerJob('job-1', {
      status: 'received',
      additionalCostDocument: { rawFile: additionalCostDocument },
      updatedBy: 'Ops',
    })).rejects.toThrow('Validasi gagal');

    expect(uploadAttachmentFile).not.toHaveBeenCalled();
  });

  it('menghapus upload baru ketika PATCH complete gagal', async () => {
    const eirDocument = new File(['eir'], 'eir.pdf', { type: 'application/pdf' });
    uploadAttachmentFile.mockResolvedValue({ id: 'attachment-eir-1' });
    httpClient.patch.mockRejectedValue(new Error('Waktu selesai tidak valid'));

    await expect(updateContainerJob('job-1', {
      status: 'completed',
      eirDocument: { rawFile: eirDocument },
      updatedBy: 'Ops',
    })).rejects.toThrow('Waktu selesai tidak valid');

    expect(uploadAttachmentFile).toHaveBeenCalledWith(expect.objectContaining({
      category: 'eirDocument',
      file: eirDocument,
    }));
    expect(deleteAttachmentFile).toHaveBeenCalledWith('attachment-eir-1');
  });

  it('mengenerate SPK lewat backend API', async () => {
    httpClient.post.mockResolvedValue({ id: 'job-1', spkNumber: 'SPK-202607-0001' });

    const result = await generateContainerJobSpk('job-1', { updatedBy: 'Ops' });

    expect(httpClient.post).toHaveBeenCalledWith('/container-jobs/job-1/spk', { updatedBy: 'Ops' });
    expect(result.spkNumber).toBe('SPK-202607-0001');
  });

  it('membatalkan Container Job lewat payload status cancelled', async () => {
    httpClient.patch.mockResolvedValue({ id: 'job-1', status: 'cancelled' });

    const result = await cancelContainerJob('job-1', 'Ops');

    expect(httpClient.patch).toHaveBeenCalledWith('/container-jobs/job-1', { status: 'cancelled', updatedBy: 'Ops' });
    expect(result.status).toBe('cancelled');
  });

  it('membatalkan Container Job dengan alasan dan sumber pembatalan', async () => {
    httpClient.patch.mockResolvedValue({
      id: 'job-1',
      status: 'cancelled',
      cancelReason: 'Customer hanya menjalankan 2 dari 3 container',
      cancelSource: 'customer',
    });

    const result = await cancelContainerJob('job-1', {
      updatedBy: 'Ops',
      cancelReason: 'Customer hanya menjalankan 2 dari 3 container',
      cancelSource: 'customer',
    });

    expect(httpClient.patch).toHaveBeenCalledWith('/container-jobs/job-1', {
      status: 'cancelled',
      updatedBy: 'Ops',
      cancelReason: 'Customer hanya menjalankan 2 dari 3 container',
      cancelSource: 'customer',
    });
    expect(result.cancelSource).toBe('customer');
  });
});
