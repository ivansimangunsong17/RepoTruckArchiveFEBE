import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OperationalForm from './OperationalForm';

const container = {
  id: 'job-1',
  containerNumber: 'MSCU-123456-7',
  soNumber: 'SO-2026-001',
  customer: 'PT Armada Test',
  origin: 'Jakarta',
  destination: 'Bandung',
  size: '20FT',
  status: 'received',
};

describe('OperationalForm', () => {
  it('tidak memakai truck dummy ketika master truck API kosong', () => {
    render(
      <OperationalForm
        container={container}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('option', { name: /B 1234 XYZ/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Truck')).toHaveValue('');
  });

  it('menolak status selesai jika assignment dan dokumen wajib belum lengkap', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={container}
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Status Pekerjaan'), 'completed');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(screen.getByText(/Pekerjaan belum dapat diselesaikan/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mewajibkan truck dan driver otomatis untuk status sedang jalan', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={container}
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Status Pekerjaan'), 'running');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(screen.getByText(/Truck, driver otomatis, dan waktu mulai wajib diisi/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('menampilkan truck aktif atau bertugas dan mengisi driver otomatis dari truck', async () => {
    const user = userEvent.setup();
    render(
      <OperationalForm
        container={container}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' },
          { id: 'truck-2', plateNumber: 'B 2000 BB', unitCode: 'TRK-002', capacity: '20FT', brand: 'Fuso', type: 'FN', status: 'Bertugas', defaultDriver: 'Driver Bertugas' },
          { id: 'truck-3', plateNumber: 'B 3000 CC', unitCode: 'TRK-003', capacity: '20FT', brand: 'UD', type: 'Quester', status: 'Maintenance' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /B 1000 AA/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /B 2000 BB/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /B 3000 CC/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');

    expect(screen.getByLabelText('Driver Otomatis')).toHaveValue('Driver Aktif');
  });

  it('menyaring truck yang kapasitasnya tidak sesuai dengan ukuran container', () => {
    render(
      <OperationalForm
        container={container}
        masterTrucks={[
          { id: 'truck-20', plateNumber: 'B 2020 OK', unitCode: 'TRK-020', capacity: '20FT', status: 'Aktif', defaultDriver: 'Driver 20' },
          { id: 'truck-40', plateNumber: 'B 4040 NO', unitCode: 'TRK-040', capacity: '40FT', status: 'Aktif', defaultDriver: 'Driver 40' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /B 2020 OK/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /B 4040 NO/i })).not.toBeInTheDocument();
  });
});
