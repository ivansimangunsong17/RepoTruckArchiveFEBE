import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentLink from './DocumentLink';
import { createAttachmentDownloadUrl, downloadAttachmentFile } from '../../services/files/fileService';

vi.mock('../../services/files/fileService', () => ({
  createAttachmentDownloadUrl: vi.fn(),
  downloadAttachmentFile: vi.fn(),
}));

describe('DocumentLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memicu download attachment lewat URL backend', async () => {
    downloadAttachmentFile.mockResolvedValue(undefined);

    render(<DocumentLink file={{ name: 'KTP Driver.pdf', path: 'file-id' }} label="Download" download />);

    fireEvent.click(screen.getByRole('button', { name: 'Download KTP Driver.pdf' }));

    await waitFor(() => expect(downloadAttachmentFile).toHaveBeenCalledWith('file-id', 'KTP Driver.pdf'));
  });

  it('menampilkan preview attachment di layar tanpa membuka tab baru', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    createAttachmentDownloadUrl.mockResolvedValue('https://api.test/attachments/file-id');

    render(<DocumentLink file={{ name: 'KTP Driver.pdf', path: 'file-id', type: 'application/pdf' }} label="View" />);

    fireEvent.click(screen.getByRole('button', { name: 'View KTP Driver.pdf' }));

    expect(await screen.findByRole('dialog', { name: 'Preview KTP Driver.pdf' })).toBeInTheDocument();
    expect(screen.getByTitle('KTP Driver.pdf')).toHaveAttribute('src', 'https://api.test/attachments/file-id');
    expect(openSpy).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('menampilkan gambar preview dalam area yang menyesuaikan viewport', async () => {
    createAttachmentDownloadUrl.mockResolvedValue('https://api.test/attachments/image-id');

    render(<DocumentLink file={{ name: 'bukti.jpg', path: 'image-id', type: 'image/jpeg' }} label="View" />);

    fireEvent.click(screen.getByRole('button', { name: 'View bukti.jpg' }));

    const image = await screen.findByAltText('bukti.jpg');
    expect(image.closest('.document-preview-image-scroll')).toBeInTheDocument();
  });
});
