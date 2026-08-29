import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EndUsersPage from './EndUsersPage';
import { useArchiveData } from '../../hooks/useArchiveData';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import {
  fetchMasterPage,
  fetchMasterViewerNote,
  saveMasterViewerNote,
} from '../../services/master-data/masterDataService';

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

describe('EndUsersPage', () => {
  const upsertMaster = vi.fn();
  const removeMaster = vi.fn();
  const notify = vi.fn();
  const confirmAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    upsertMaster.mockResolvedValue({ id: 'end-user-2', name: 'Gudang Penerima Akhir' });
    removeMaster.mockResolvedValue(undefined);
    confirmAction.mockResolvedValue(true);
    fetchMasterPage.mockResolvedValue({
      rows: [{ id: 'end-user-1', name: 'Gudang Bekasi Plant', address: 'Jl. Industri No. 1, Bekasi', status: 'Aktif' }],
      total: 1,
    });
    fetchMasterViewerNote.mockResolvedValue([]);
    saveMasterViewerNote.mockResolvedValue({});
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      masters: {
        'end-users': [{ id: 'end-user-1', name: 'Gudang Bekasi Plant', address: 'Jl. Industri No. 1, Bekasi', status: 'Aktif' }],
      },
      upsertMaster,
      removeMaster,
    });
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    useFeedback.mockReturnValue({ notify, confirmAction });
  });

  it('menyimpan master lokasi baru', async () => {
    const user = userEvent.setup();
    render(<EndUsersPage />);

    await user.click(screen.getByRole('button', { name: /Input Lokasi Baru/i }));
    await user.type(screen.getByPlaceholderText('Contoh: Gudang Customer Akhir'), 'Gudang Penerima Akhir');
    await user.type(screen.getByPlaceholderText('Masukkan alamat lengkap lokasi'), 'Jl. Penerima No. 2, Karawang');
    await user.click(screen.getByRole('button', { name: 'Simpan Lokasi' }));

    await waitFor(() => expect(upsertMaster).toHaveBeenCalledWith(
      'end-users',
      expect.objectContaining({
        name: 'Gudang Penerima Akhir',
        address: 'Jl. Penerima No. 2, Karawang',
      }),
      null,
    ));
  });
});
