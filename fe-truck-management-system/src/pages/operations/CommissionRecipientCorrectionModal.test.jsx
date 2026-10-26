import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CommissionRecipientCorrectionModal from './CommissionRecipientCorrectionModal';
import { correctContainerJobCommissionRecipient } from '../../services/archive/containerJobService';

vi.mock('../../services/master-data/masterDataService', () => ({
  fetchMaster: vi.fn().mockResolvedValue([
    { id: 'drv-a', name: 'Sopir A' },
    { id: 'drv-b', name: 'Sopir B' },
  ]),
}));
vi.mock('../../services/archive/containerJobService', () => ({
  correctContainerJobCommissionRecipient: vi.fn(),
}));

const row = { containerJobId: 'job-1', soNumber: 'SO-1', containerNumber: 'SITU2688029' };

describe('CommissionRecipientCorrectionModal', () => {
  it('mengirim sopir dan alasan, lalu memberi tahu halaman untuk memuat ulang', async () => {
    const user = userEvent.setup();
    const onCorrected = vi.fn();
    correctContainerJobCommissionRecipient.mockResolvedValueOnce({});
    render(<CommissionRecipientCorrectionModal row={row} onClose={vi.fn()} onCorrected={onCorrected} />);

    await screen.findByRole('option', { name: 'Sopir A' });
    const save = screen.getByRole('button', { name: /simpan koreksi/i });
    expect(save).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/sopir penerima komisi/i), 'drv-a');
    await user.type(screen.getByLabelText(/alasan koreksi/i), 'Sopir penitip terverifikasi');
    await user.click(save);

    await waitFor(() => expect(onCorrected).toHaveBeenCalled());
    expect(correctContainerJobCommissionRecipient).toHaveBeenCalledWith('job-1', { driverId: 'drv-a', reason: 'Sopir penitip terverifikasi' });
  });

  it('menampilkan penolakan backend (mis. sopir Ambil Titip) tanpa menutup modal', async () => {
    const user = userEvent.setup();
    const onCorrected = vi.fn();
    correctContainerJobCommissionRecipient.mockRejectedValueOnce(new Error('Sopir Ambil Titip hanya menerima UJ Repo, tidak bisa menjadi penerima komisi ritasi ini.'));
    render(<CommissionRecipientCorrectionModal row={row} onClose={vi.fn()} onCorrected={onCorrected} />);

    await screen.findByRole('option', { name: 'Sopir B' });
    await user.selectOptions(screen.getByLabelText(/sopir penerima komisi/i), 'drv-b');
    await user.type(screen.getByLabelText(/alasan koreksi/i), 'Coba alihkan ke B');
    await user.click(screen.getByRole('button', { name: /simpan koreksi/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/hanya menerima UJ Repo/);
    expect(onCorrected).not.toHaveBeenCalled();
  });
});
