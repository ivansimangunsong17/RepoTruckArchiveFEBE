import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelContainerJob, fetchContainerJobsPage, generateContainerJobSpk, updateContainerJob } from './containerJobService';
import { httpClient } from '../api/httpClient';
import { uploadAttachmentFile } from '../files/fileService';

vi.mock('../api/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../files/fileService', () => ({
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
    });

    expect(httpClient.get).toHaveBeenCalledWith('/container-jobs?page=3&pageSize=8&query=CONT&status=running');
    expect(result.counts).toEqual({ received: 0, running: 0, completed: 0 });
  });

  it('mengupdate Container Job ke backend API', async () => {
    httpClient.patch.mockResolvedValue({ id: 'job-1', status: 'running' });

    const result = await updateContainerJob('job-1', { status: 'running' });

    expect(httpClient.patch).toHaveBeenCalledWith('/container-jobs/job-1', { status: 'running' });
    expect(result.status).toBe('running');
  });

  it('mengupload dokumen sebelum complete job', async () => {
    const spkDocument = new File(['spk'], 'spk.pdf', { type: 'application/pdf' });
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
});
