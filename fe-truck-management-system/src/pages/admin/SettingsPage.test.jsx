import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedback } from '../../hooks/useFeedback';
import SettingsPage from './SettingsPage';

vi.mock('../../hooks/useFeedback', () => ({
  useFeedback: vi.fn(),
}));

vi.mock('../../services/settings/settingsService', () => ({
  fetchSystemSettings: vi.fn(async () => null),
  isSettingsDatabaseEnabled: vi.fn(() => false),
  saveSystemSettings: vi.fn(async (settings) => {
    localStorage.setItem('tms-admin-settings', JSON.stringify(settings));
    return settings;
  }),
}));

describe('SettingsPage', () => {
  const notify = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useFeedback.mockReturnValue({ notify });
  });

  it('menampilkan konfigurasi kebutuhan sistem default', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Kebutuhan Sistem' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('React.js / Vite')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Node.js API')).toBeInTheDocument();
    expect(screen.getByDisplayValue('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByLabelText('Prefix Kode Truck')).toHaveValue('TRK');
  });

  it('menyimpan perubahan konfigurasi ke localStorage', async () => {
    render(<SettingsPage />);

    const companyInput = screen.getByLabelText('Nama Perusahaan');
    fireEvent.change(companyInput, { target: { value: 'PT Armada Baru' } });
    fireEvent.change(screen.getByLabelText('Prefix Sales Order'), { target: { value: 'ARM' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Laporan/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Kebutuhan Sistem' }));

    const saved = JSON.parse(localStorage.getItem('tms-admin-settings'));
    expect(saved).toEqual(expect.objectContaining({
      companyName: 'PT Armada Baru',
      orderPrefix: 'ARM',
    }));
    expect(saved.modules.reports).toBe(false);
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Kebutuhan sistem berhasil disimpan',
      }));
    });
  });
});
