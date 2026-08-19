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
    upsertMaster.mockResolvedValue({ id: 'end-user-2', name: 'PT Penerima Akhir' });
    removeMaster.mockResolvedValue(undefined);
    confirmAction.mockResolvedValue(true);
    fetchMasterPage.mockResolvedValue({
      rows: [{ id: 'end-user-1', name: 'PT Bekasi Plant', code: 'EU-001', status: 'Aktif' }],
      total: 1,
    });
    fetchMasterViewerNote.mockResolvedValue([]);
    saveMasterViewerNote.mockResolvedValue({});
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      masters: {
        'end-users': [{ id: 'end-user-1', name: 'PT Bekasi Plant', code: 'EU-001', status: 'Aktif' }],
      },
      upsertMaster,
      removeMaster,
    });
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    useFeedback.mockReturnValue({ notify, confirmAction });
  });

  it('menyimpan master end user baru', async () => {
    const user = userEvent.setup();
    render(<EndUsersPage />);

    await user.click(screen.getByRole('button', { name: /Input End User Baru/i }));
    await user.type(screen.getByPlaceholderText('Contoh: PT Customer Akhir Indonesia'), 'PT Penerima Akhir');
    await user.type(screen.getByPlaceholderText('Contoh: EUI-001'), 'EU-002');
    await user.type(screen.getByPlaceholderText('Nama penanggung jawab'), 'Andi');
    await user.type(screen.getByPlaceholderText('021 / 08xx'), '08123456789');
    await user.click(screen.getByRole('button', { name: 'Simpan End User' }));

    await waitFor(() => expect(upsertMaster).toHaveBeenCalledWith(
      'end-users',
      expect.objectContaining({
        name: 'PT Penerima Akhir',
        code: 'EU-002',
        pic: 'Andi',
        phone: '08123456789',
      }),
      null,
    ));
  });
});
