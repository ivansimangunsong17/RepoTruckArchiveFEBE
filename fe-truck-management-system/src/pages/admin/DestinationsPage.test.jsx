import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DestinationsPage from './DestinationsPage';
import { useArchiveData } from '../../hooks/useArchiveData';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import {
  fetchMasterPage,
  fetchMasterViewerNote,
  saveMasterViewerNote,
} from '../../services/master-data/masterDataService';
import {
  createAttachmentDownloadUrl,
  deleteAttachmentFile,
  downloadAttachmentFile,
  uploadAttachmentFile,
} from '../../services/files/fileService';

vi.mock('../../hooks/useArchiveData', () => ({
  useArchiveData: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useFeedback', () => ({
  useFeedback: vi.fn(),
}));

vi.mock('../../services/master-data/masterDataService', () => ({
  fetchMasterPage: vi.fn(),
  fetchMasterViewerNote: vi.fn(),
  saveMasterViewerNote: vi.fn(),
}));

vi.mock('../../services/files/fileService', () => ({
  createAttachmentDownloadUrl: vi.fn(),
  deleteAttachmentFile: vi.fn(),
  downloadAttachmentFile: vi.fn(),
  uploadAttachmentFile: vi.fn(),
}));

describe('DestinationsPage', () => {
  const upsertMaster = vi.fn();
  const removeMaster = vi.fn();
  const notify = vi.fn();
  const confirmAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    upsertMaster.mockResolvedValue({ id: 'destination-2', name: 'Cikarang' });
    removeMaster.mockResolvedValue(undefined);
    confirmAction.mockResolvedValue(true);
    fetchMasterPage.mockResolvedValue({
      rows: [{ id: 'destination-1', name: 'Bekasi', status: 'Aktif', driverCommission20ftAmount: 25000, driverCommission40ftAmount: 40000 }],
      total: 1,
    });
    fetchMasterViewerNote.mockResolvedValue([]);
    saveMasterViewerNote.mockResolvedValue({});
    createAttachmentDownloadUrl.mockResolvedValue('http://localhost/document');
    deleteAttachmentFile.mockResolvedValue({ id: 'deleted' });
    downloadAttachmentFile.mockResolvedValue(undefined);
    uploadAttachmentFile.mockResolvedValue(null);
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      masters: {
        destinations: [{ id: 'destination-1', name: 'Bekasi', status: 'Aktif', driverCommission20ftAmount: 25000, driverCommission40ftAmount: 40000 }],
      },
      upsertMaster,
      removeMaster,
    });
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    useFeedback.mockReturnValue({ notify, confirmAction });
  });

  it('menyimpan komisi sopir 20FT dan 40FT dari master tujuan', async () => {
    const user = userEvent.setup();
    render(<DestinationsPage />);

    await user.click(screen.getByRole('button', { name: /Input Lokasi Tujuan Baru/i }));
    await user.type(screen.getByPlaceholderText('Contoh: Gudang Customer Bandung'), 'Cikarang');
    await user.type(screen.getByPlaceholderText('Contoh: 50000'), '50000');
    await user.type(screen.getByPlaceholderText('Contoh: 75000'), '75000');
    await user.click(screen.getByRole('button', { name: 'Simpan Lokasi Tujuan' }));

    await waitFor(() => expect(upsertMaster).toHaveBeenCalledWith(
      'destinations',
      expect.objectContaining({
        name: 'Cikarang',
        driverCommission20ftAmount: 50000,
        driverCommission40ftAmount: 75000,
      }),
      null,
    ));
  });
});
