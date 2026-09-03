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
  useAuth.mockReturnValue({ user: { id: 'user-1', role } });
  useFeedback.mockReturnValue({ notify });
  useArchiveData.mockReturnValue({ masters: { drivers: driverList, trucks: [] } });
  fetchMaster.mockResolvedValue(chassisList);
  fetchFleetAssignments.mockResolvedValue({ rows: [baseRow], driversOnActiveTrip: [] });
  return { notify };
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
    expect(screen.getByText('TRK-01')).toBeInTheDocument();
  });

  it('tombol Ganti Sopir dan Pindahkan Chassis tersembunyi untuk role tanpa permission (Sales/Finance)', async () => {
    setup({ role: 'sales' });
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    expect(screen.queryByRole('button', { name: /Ganti sopir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pindahkan chassis/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Riwayat/i })).toBeInTheDocument();
  });

  it('modal ganti sopir menolak alasan kurang dari 8 karakter dan menyimpan saat valid', async () => {
    const user = userEvent.setup();
    const { notify } = setup();
    updateFleetDefaultDriver.mockResolvedValue({ id: 'vehicle-1', defaultDriverId: 'driver-new', defaultDriver: 'Sopir Baru' });
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    await user.click(screen.getByRole('button', { name: /Ganti sopir/i }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Sopir Baru/i), 'driver-new');
    await user.type(within(dialog).getByLabelText(/Alasan Perubahan/i), 'pendek');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    expect(await within(dialog).findByText(/minimal 8 karakter/i)).toBeInTheDocument();
    expect(updateFleetDefaultDriver).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/Alasan Perubahan/i));
    await user.type(within(dialog).getByLabelText(/Alasan Perubahan/i), 'Sopir lama resign dari perusahaan');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(updateFleetDefaultDriver).toHaveBeenCalledWith('vehicle-1', {
      defaultDriverId: 'driver-new',
      reason: 'Sopir lama resign dari perusahaan',
      note: '',
    }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Berlaku untuk ritasi baru berikutnya'),
    }));
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

  it('modal pindah chassis menyimpan perubahan chassis', async () => {
    const user = userEvent.setup();
    setup();
    updateFleetChassis.mockResolvedValue({ id: 'vehicle-1', currentChassisId: 'chassis-new', currentChassisCode: 'CHS-NEW' });
    render(<FleetAssignmentPage />);

    await screen.findByText('Sopir Lama');
    await user.click(screen.getByRole('button', { name: /Pindahkan chassis/i }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Chassis Baru/i), 'chassis-new');
    await user.type(within(dialog).getByLabelText(/Alasan Perubahan/i), 'Chassis lama masuk servis rutin');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(updateFleetChassis).toHaveBeenCalledWith('vehicle-1', {
      chassisId: 'chassis-new',
      reason: 'Chassis lama masuk servis rutin',
      note: '',
    }));
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
