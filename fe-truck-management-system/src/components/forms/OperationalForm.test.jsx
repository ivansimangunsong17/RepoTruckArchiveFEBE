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

async function openOperationalPhase(user, name) {
  await user.click(screen.getByRole('tab', { name }));
}

describe('OperationalForm', () => {
  it('membagi form operasional ke dalam phase kerja', async () => {
    const user = userEvent.setup();

    render(
      <OperationalForm
        container={container}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Truck')).toBeInTheDocument();
    expect(screen.queryByText('Biaya Lainnya')).not.toBeInTheDocument();
    expect(screen.queryByText('Dokumen Operasional')).not.toBeInTheDocument();

    await openOperationalPhase(user, /uang jalan & spk/i);
    expect(screen.getByText('Biaya Lainnya')).toBeInTheDocument();
    expect(screen.queryByText('EIR')).not.toBeInTheDocument();

    await openOperationalPhase(user, /dokumen & closing/i);
    expect(screen.getByText('Dokumen Operasional')).toBeInTheDocument();
    expect(screen.getByText('EIR')).toBeInTheDocument();
    expect(screen.getByLabelText('No. EIR')).toBeInTheDocument();
  });

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
        container={{ ...container, rpujStatus: 'approved' }}
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await openOperationalPhase(user, /dokumen & closing/i);
    await user.selectOptions(screen.getByLabelText(/status pekerjaan/i), 'completed');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(screen.getByText(/Pekerjaan belum dapat diselesaikan/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mewajibkan truck dan driver otomatis untuk status sedang jalan', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={{ ...container, rpujStatus: 'approved' }}
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await openOperationalPhase(user, /dokumen & closing/i);
    await user.selectOptions(screen.getByLabelText(/status pekerjaan/i), 'running');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(screen.getByText(/Truck, driver otomatis, dan waktu mulai wajib diisi/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('menampilkan checklist final sebelum status selesai', async () => {
    const user = userEvent.setup();

    render(
      <OperationalForm
        container={{ ...container, rpujStatus: 'approved', spkNumber: 'SPK-TEST-001' }}
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /dokumen & closing/i);

    expect(screen.getByText('Truck dan driver ada')).toBeInTheDocument();
    expect(screen.getByText('Waktu mulai dan selesai ada')).toBeInTheDocument();
    expect(screen.getByText('UJ sudah disetujui/dikirim')).toBeInTheDocument();
    expect(screen.getByText('SPK ada')).toBeInTheDocument();
    expect(screen.getByText('Dokumen wajib lengkap')).toBeInTheDocument();
  });

  it('menolak status sedang jalan sebelum UJ disetujui Finance', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={{ ...container, rpujStatus: 'submitted' }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');

    await openOperationalPhase(user, /dokumen & closing/i);
    expect(screen.getByLabelText(/status pekerjaan/i)).toHaveValue('received');

    await user.selectOptions(screen.getByLabelText(/status pekerjaan/i), 'running');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(screen.getByText(/UJ disetujui Finance/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('menampilkan truck aktif dan mengisi driver otomatis dari truck', async () => {
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
    expect(screen.queryByRole('option', { name: /B 2000 BB/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /B 3000 CC/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');

    expect(screen.getByLabelText('Driver Otomatis')).toHaveValue('Driver Aktif');
  });

  it('tidak menampilkan truck jika driver atau truck masih aktif di job lain', () => {
    render(
      <OperationalForm
        container={container}
        activeJobs={[
          { id: 'job-busy-driver', status: 'running', driver: 'Driver Sibuk', plateNumber: 'B 9999 ZZ' },
          { id: 'job-busy-truck', status: 'received', driver: 'Driver Lain', plateNumber: 'B 2000 BB' },
        ]}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Sibuk' },
          { id: 'truck-2', plateNumber: 'B 2000 BB', unitCode: 'TRK-002', capacity: '20FT', brand: 'Fuso', type: 'FN', status: 'Aktif', defaultDriver: 'Driver Siap' },
          { id: 'truck-3', plateNumber: 'B 3000 CC', unitCode: 'TRK-003', capacity: '20FT', brand: 'UD', type: 'Quester', status: 'Aktif', defaultDriver: 'Driver Siap 2' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('option', { name: /B 1000 AA/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /B 2000 BB/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /B 3000 CC/i })).toBeInTheDocument();
  });

  it('mengisi info pembayaran UJ driver dari master sopir', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={container}
        masterDrivers={[
          { id: 'driver-1', name: 'Driver E Money', paymentMethod: 'emoney', emoneyProvider: 'DANA', emoneyNumber: '081299990000' },
        ]}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver E Money' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');

    expect(screen.getByLabelText('Driver Otomatis')).toHaveValue('Driver E Money');
    expect(screen.getByLabelText('Pembayaran UJ Driver')).toHaveValue('DANA 081299990000');

    await openOperationalPhase(user, /uang jalan & spk/i);
    await user.type(screen.getByLabelText(/nominal biaya/i), '150000');
    await user.click(screen.getByRole('button', { name: /ajukan uang jalan/i }));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      driverPaymentMethod: 'emoney',
      driverBankAccount: 'DANA 081299990000',
      driverEmoneyProvider: 'DANA',
      driverEmoneyNumber: '081299990000',
    });
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

  it('memasukkan biaya lainnya ke preview SPK', async () => {
    const user = userEvent.setup();
    const write = vi.fn();
    const close = vi.fn();
    const open = vi.spyOn(window, 'open').mockReturnValue({
      document: { write, close },
    });

    render(
      <OperationalForm
        container={{
          ...container,
          doNumber: 'DO-TEST-001',
          jobNumber: 'JOB-TEST-001',
          shipment: 'import',
          spkNumber: 'SPK-TEST-001',
          rpujNotes: JSON.stringify({ amount: 150000, notes: 'Tol dan parkir' }),
        }}
        masterDestinations={[{ name: 'Bandung', uj20ft: 500000 }]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /uang jalan & spk/i);
    await user.click(screen.getByRole('button', { name: /preview spk/i }));

    const html = write.mock.calls.map(([value]) => value).join('');
    expect(html).toContain('No. SO');
    expect(html).toContain('No. DO');
    expect(html).toContain('No. Job / Container');
    expect(html).toContain('JOB-TEST-001 / MSCU-123456-7');
    expect(html).toContain('UJ');
    expect(html).toContain('Uang Jalan');
    expect(html).toContain('Biaya Lainnya');
    expect(html).toContain('Catatan Biaya Lainnya');
    expect(html).toContain('Tol dan parkir');
    expect(html).toContain('Total RPUJ');
    expect(html).not.toContain('Persetujuan');
    expect(html).not.toContain('OPERATIONAL');
    expect(html).not.toContain('FINANCE');
    expect(html).not.toContain('DRIVER');

    open.mockRestore();
  });

  it('mengajukan uang jalan ke Finance dari tombol RPUJ', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={container}
        masterDestinations={[{ name: 'Bandung', uj20ft: 500000 }]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await openOperationalPhase(user, /uang jalan & spk/i);
    await user.type(screen.getByLabelText(/nominal biaya/i), '150000');
    await user.type(screen.getByLabelText(/catatan biaya/i), 'Tol dan parkir');
    await user.click(screen.getByRole('button', { name: /ajukan uang jalan/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      rpujStatus: 'submitted',
      otherCostAmount: '150000',
      otherCostNotes: 'Tol dan parkir',
    });
    expect(onSubmit.mock.calls[0][0].rpujNotes).toContain('"amount":150000');
    expect(onSubmit.mock.calls[0][0].rpujNotes).toContain('Tol dan parkir');
  });

  it('menahan generate SPK sampai Finance approve RPUJ', async () => {
    const user = userEvent.setup();
    const onGenerateSpk = vi.fn();

    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'submitted',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onGenerateSpk={onGenerateSpk}
      />,
    );

    await openOperationalPhase(user, /uang jalan & spk/i);
    const generateButton = screen.getByRole('button', { name: /menunggu finance/i });

    expect(generateButton).toBeDisabled();
    expect(screen.getByText(/Finance approve RPUJ/i)).toBeInTheDocument();

    await user.click(generateButton);

    expect(onGenerateSpk).not.toHaveBeenCalled();
  });

  it('mengizinkan generate SPK setelah RPUJ diapprove tanpa bukti transfer', async () => {
    const user = userEvent.setup();
    const onGenerateSpk = vi.fn().mockResolvedValue({
      spkNumber: 'SPK-PAID-001',
      spkGeneratedAt: '2026-07-17T08:00:00.000Z',
    });

    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'approved',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onGenerateSpk={onGenerateSpk}
      />,
    );

    await openOperationalPhase(user, /uang jalan & spk/i);
    await user.click(screen.getByRole('button', { name: /generate spk/i }));

    expect(onGenerateSpk).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('SPK-PAID-001')).toBeInTheDocument();
  });
});
