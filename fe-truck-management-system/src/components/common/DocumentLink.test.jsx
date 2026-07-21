import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentLink from './DocumentLink';
import { downloadAttachmentFile } from '../../services/files/fileService';

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
});
