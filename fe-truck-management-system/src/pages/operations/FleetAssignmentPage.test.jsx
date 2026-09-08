import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FleetAssignmentPage from './FleetAssignmentPage';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { useArchiveData } from '../../hooks/useArchiveData';
import { fetchMaster } from '../../services/master-data/masterDataService';
import {
  fetchFleetAssignmentHistory,
  fetchFleetAssignments,
  updateFleetChassis,
  updateFleetDefaultDriver,
} from '../../services/operations/fleetAssignmentService';

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../hooks/useFeedback', () => ({ useFeedback: vi.fn() }));
vi.mock('../../hooks/useArchiveData', () => ({ useArchiveData: vi.fn() }));
vi.mock('../../services/master-data/masterDataService', () => ({ fetchMaster: vi.fn() }));
vi.mock('../../services/operations/fleetAssignmentService', () => ({
  fetchFleetAssignments: vi.fn(),
  updateFleetDefaultDriver: vi.fn(),
  updateFleetChassis: vi.fn(),
  fetchFleetAssignmentHistory: vi.fn(),
}));

const baseRow = {
  id: 'vehicle-1',
  unitCode: 'TRK-01',
  plateNumber: 'B 1234 XX',
  containerSize: '20FT',
  status: 'Aktif',
  defaultDriverId: 'driver-old',
  defaultDriverName: 'Sopir Lama',
  currentChassisId: 'chassis-old',
  currentChassisCode: 'CHS-OLD',
};

const driverList = [
  { id: 'driver-old', name: 'Sopir Lama', status: 'Aktif' },
  { id: 'driver-new', name: 'Sopir Baru', status: 'Aktif' },
];

const chassisList = [
  { id: 'chassis-old', chassisCode: 'CHS-OLD', capacity: '20FT', status: 'Aktif' },
  { id: 'chassis-new', chassisCode: 'CHS-NEW', capacity: '20FT', status: 'Aktif' },
];

function setup({ role = 'operational' } = {}) {
  const notify = vi.fn();
  const refresh = vi.fn();
  useAuth.mockReturnValue({ user: { id: 'user-1', role } });
  useFeedback.mockReturnValue({ notify });
  useArchiveData.mockReturnValue({ masters: { drivers: driverList, trucks: [] }, refresh });
  fetchMaster.mockResolvedValue(chassisList);
  fetchFleetAssignments.mockResolvedValue({ rows: [baseRow], driversOnActiveTrip: [] });
  return { notify, refresh };
}

describe('FleetAssignmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan sopir default dan chassis terpasang di tabel', async () => {
    setup();
    render(<FleetAssignmentPage />);

    expect(await screen.findByText('Sopir Lama')).toBeInTheDocument();
    expect(screen.getByText('CHS-OLD')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
  });

  it('menampilkan header tabel yang disederhanakan', async () => {
    setup();
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['No', 'Plat', 'Size', 'Sopir', 'Chassis', 'Status', 'Aksi']);
  });

  it('menyederhanakan nomor lambung di kolom No sesuai pola unitCode', async () => {
    setup();
    fetchFleetAssignments.mockResolvedValue({
      rows: [
        { ...baseRow, id: 'vehicle-2', unitCode: 'TRK-DMY-01', plateNumber: 'B 0001 XX' },
        { ...baseRow, id: 'vehicle-3', unitCode: 'TRK-4475-20', plateNumber: 'B 0002 XX' },
        { ...baseRow, id: 'vehicle-4', unitCode: 'HEAD-4475-HD', plateNumber: 'B 0003 XX' },
      ],
      driversOnActiveTrip: [],
    });
    render(<FleetAssignmentPage />);

    expect(await screen.findByText('DMY-01')).toBeInTheDocument();
    expect(screen.getByText('4475-20')).toBeInTheDocument();
    expect(screen.getByText('4475-HD')).toBeInTheDocument();
  });

  it('menampilkan strip saat unit belum memiliki chassis terpasang dan filter ukuran hanya 20FT/40FT', async () => {
    setup();
    fetchFleetAssignments.mockResolvedValue({
      rows: [{ ...baseRow, containerSize: '', currentChassisId: null, currentChassisCode: '' }],
      driversOnActiveTrip: [],
    });
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Filter ukuran/i })).not.toHaveTextContent('COMBO');
  });

  it('tombol Ganti Sopir dan Pindahkan Chassis tersembunyi untuk role tanpa permission (Sales/Finance)', async () => {
    setup({ role: 'sales' });
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    expect(screen.queryByRole('button', { name: /Ganti sopir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pindahkan chassis/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Riwayat/i })).toBeInTheDocument();
  });

  it('modal ganti sopir bisa simpan tanpa alasan, catatan opsional terkirim jika diisi', async () => {
    const user = userEvent.setup();
    const { notify, refresh } = setup();
    updateFleetDefaultDriver.mockResolvedValue({ id: 'vehicle-1', defaultDriverId: 'driver-new', defaultDriver: 'Sopir Baru' });
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    await user.click(screen.getByRole('button', { name: /Ganti sopir/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/Alasan Perubahan/i)).not.toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText(/Sopir Baru/i), 'driver-new');
    await user.type(within(dialog).getByLabelText(/Catatan Tambahan/i), 'Sopir lama resign dari perusahaan');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(updateFleetDefaultDriver).toHaveBeenCalledWith('vehicle-1', {
      defaultDriverId: 'driver-new',
      note: 'Sopir lama resign dari perusahaan',
    }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Berlaku untuk ritasi baru berikutnya'),
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it('menampilkan warning saat sopir yang dipilih sedang dipakai di ritasi berjalan', async () => {
    const user = userEvent.setup();
    setup();
    fetchFleetAssignments.mockResolvedValue({ rows: [baseRow], driversOnActiveTrip: ['driver-new'] });
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    await user.click(screen.getByRole('button', { name: /Ganti sopir/i }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Sopir Baru/i), 'driver-new');

    expect(await within(dialog).findByText(/sedang dipakai di ritasi berjalan/i)).toBeInTheDocument();
  });

  it('modal pindah chassis bisa simpan tanpa alasan', async () => {
    const user = userEvent.setup();
    const { refresh } = setup();
    updateFleetChassis.mockResolvedValue({ id: 'vehicle-1', currentChassisId: 'chassis-new', currentChassisCode: 'CHS-NEW' });
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    await user.click(screen.getByRole('button', { name: /Pindahkan chassis/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/Alasan Perubahan/i)).not.toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText(/Chassis Baru/i), 'chassis-new');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(updateFleetChassis).toHaveBeenCalledWith('vehicle-1', {
      chassisId: 'chassis-new',
      note: '',
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it('tombol Simpan tetap disabled sebelum sopir/chassis baru dipilih', async () => {
    const user = userEvent.setup();
    setup();
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    await user.click(screen.getByRole('button', { name: /Ganti sopir/i }));
    const driverDialog = await screen.findByRole('dialog');
    expect(within(driverDialog).getByRole('button', { name: 'Simpan' })).toBeDisabled();
    await user.click(within(driverDialog).getByRole('button', { name: 'Batal' }));

    await user.click(screen.getByRole('button', { name: /Pindahkan chassis/i }));
    const chassisDialog = await screen.findByRole('dialog');
    expect(within(chassisDialog).getByRole('button', { name: 'Simpan' })).toBeDisabled();
  });

  it('menampilkan riwayat assignment dalam modal Riwayat', async () => {
    const user = userEvent.setup();
    setup();
    fetchFleetAssignmentHistory.mockResolvedValue([
      {
        id: 'history-1',
        changeType: 'default_driver',
        previousDriverName: 'Sopir Lama',
        nextDriverName: 'Sopir Baru',
        reason: 'Sopir lama resign',
        note: '',
        changedByName: 'Budi Operational',
        changedByRole: 'operational',
        createdAt: '2026-09-01T08:00:00.000Z',
      },
    ]);
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    await user.click(screen.getByRole('button', { name: /Riwayat/i }));

    expect(await screen.findByText(/Sopir Lama > Sopir Baru/i)).toBeInTheDocument();
    expect(fetchFleetAssignmentHistory).toHaveBeenCalledWith('vehicle-1');
  });
});
