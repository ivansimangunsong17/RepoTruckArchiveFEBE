import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../api/httpClient';
import { compressImageFile } from '../../utils/imageCompression';
import { uploadAttachmentFile } from './fileService';

vi.mock('../api/httpClient', () => ({
  httpClient: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../auth/authTokenStore', () => ({
  getAuthToken: vi.fn(() => ''),
}));

vi.mock('../config/dataSource', () => ({
  API_BASE_URL: 'https://api.example.test/api',
}));

vi.mock('../../utils/imageCompression', () => ({
  compressImageFile: vi.fn(async (file) => file),
}));

describe('fileService uploadAttachmentFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('FileReader', class {
      readAsDataURL(file) {
        this.result = `data:${file.type};name=${file.name};size=${file.size}`;
        this.onload();
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mengirim PDF tanpa perubahan metadata file', async () => {
    const pdf = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    httpClient.post.mockResolvedValue({ id: 'attachment-1' });

    await uploadAttachmentFile({
      entityType: 'driver',
      entityId: 'driver-1',
      category: 'identity_document',
      file: pdf,
    });

    expect(compressImageFile).toHaveBeenCalledWith(pdf);
    expect(httpClient.post).toHaveBeenCalledWith('/attachments/upload', expect.objectContaining({
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      fileSize: pdf.size,
      fileBase64: `data:application/pdf;name=invoice.pdf;size=${pdf.size}`,
    }));
  });

  it('mengirim gambar memakai file hasil compress beserta metadatanya', async () => {
    const original = new File([new Uint8Array(3_000_000)], 'ktp.png', { type: 'image/png' });
    const compressed = new File(['compressed'], 'ktp.jpg', { type: 'image/jpeg' });
    compressImageFile.mockResolvedValueOnce(compressed);
    httpClient.post.mockResolvedValue({ id: 'attachment-2' });

    await uploadAttachmentFile({
      entityType: 'driver',
      entityId: 'driver-1',
      category: 'identity_document',
      file: original,
    });

    expect(httpClient.post).toHaveBeenCalledWith('/attachments/upload', expect.objectContaining({
      fileName: 'ktp.jpg',
      mimeType: 'image/jpeg',
      fileSize: compressed.size,
      fileBase64: `data:image/jpeg;name=ktp.jpg;size=${compressed.size}`,
    }));
  });

  it('menolak upload jika hasil akhir setelah compress masih lebih dari 5 MB', async () => {
    const original = new File([new Uint8Array(8 * 1024 * 1024)], 'ktp.png', { type: 'image/png' });
    const stillTooLarge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'ktp.jpg', { type: 'image/jpeg' });
    compressImageFile.mockResolvedValueOnce(stillTooLarge);

    await expect(uploadAttachmentFile({
      entityType: 'driver',
      entityId: 'driver-1',
      category: 'identity_document',
      file: original,
    })).rejects.toThrow('Dokumen melebihi batas maksimal 5 MB.');

    expect(httpClient.post).not.toHaveBeenCalled();
  });
});
