import { render, screen, waitFor } from '@testing-library/react';
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

function expectedDateTimeLocalValue(value) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
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

  it('menolak status selesai tanpa lampiran EIR', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'approved',
          spkNumber: 'SPK-TEST-001',
          plateNumber: 'B 1000 AA',
          driver: 'Driver Aktif',
          chassis: 'TRK-001 - Hino FG',
          status: 'running',
          runningAt: '2026-07-19T08:00:00.000Z',
        }}
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await openOperationalPhase(user, /dokumen & closing/i);
    await user.selectOptions(screen.getByLabelText(/status pekerjaan/i), 'completed');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(screen.getByText(/upload lampiran EIR/i)).toBeInTheDocument();
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

    expect(screen.getByLabelText(/status pekerjaan/i)).toHaveValue('received');
    expect(screen.getByText(/Truck dan driver wajib lengkap sebelum perjalanan berjalan/i)).toBeInTheDocument();
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
    expect(screen.getByText('Lampiran EIR sudah diupload')).toBeInTheDocument();
  });

  it('menampilkan waktu edit sesuai jam lokal dan mengirimnya kembali sebagai ISO', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const runningAt = '2026-06-29T06:45:00.000Z';
    const expectedInputValue = expectedDateTimeLocalValue(runningAt);

    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'approved',
          status: 'running',
          plateNumber: 'B 1000 AA',
          driver: 'Driver Aktif',
          runningAt,
        }}
        initialPhase="closing"
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText(/waktu mulai/i)).toHaveValue(expectedInputValue);

    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      runningAt: new Date(expectedInputValue).toISOString(),
    }));
  });

  it('menampilkan EIR Titip di checklist closing untuk job yang pernah dititipkan', () => {
    render(
      <OperationalForm
        container={{
          ...container,
          repoLocation: 'Repo Cakung',
          repoEirNumber: 'EIR-TITIP-001',
          repoEirDocument: { name: 'eir-titip.pdf' },
        }}
        initialPhase="closing"
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('EIR Titip tersedia')).toBeInTheDocument();
    expect(screen.getByDisplayValue('EIR-TITIP-001')).toBeDisabled();
    expect(screen.getByText('eir-titip.pdf')).toBeInTheDocument();
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

  it('tidak otomatis memulai perjalanan ketika truck baru di-assign', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={{ ...container, rpujStatus: 'approved', spkNumber: 'SPK-TEST-001' }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      plateNumber: 'B 1000 AA',
      status: 'received',
      runningAt: '',
    }));
  });

  it('menolak status selesai ketika nomor container belum diisi', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={{
          ...container,
          containerNumber: '',
          rpujStatus: 'approved',
          spkNumber: 'SPK-TEST-001',
          plateNumber: 'B 1000 AA',
          driver: 'Driver Aktif',
          chassis: 'TRK-001 - Hino FG',
          status: 'running',
          runningAt: '2026-07-19T08:00:00.000Z',
        }}
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await openOperationalPhase(user, /dokumen & closing/i);
    await user.selectOptions(screen.getByLabelText(/status pekerjaan/i), 'completed');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(screen.getByText(/Lengkapi nomor container/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await openOperationalPhase(user, /persiapan job/i);
    expect(screen.getByLabelText('No. Container')).toBeEnabled();
  });

  it('mengizinkan Operational melengkapi dokumen kosong tanpa membuka revisi dokumen tersimpan', () => {
    render(
      <OperationalForm
        container={{
          ...container,
          status: 'completed',
          rpujStatus: 'paid',
          eirNumber: 'EIR-TERSIMPAN',
          eirDocument: null,
          spkNumber: 'SPK-TEST-001',
          plateNumber: 'B 1000 AA',
          driver: 'Driver Aktif',
          runningAt: '2026-07-19T08:00:00.000Z',
          completedAt: '2026-07-19T12:00:00.000Z',
        }}
        currentUser={{ role: 'operational' }}
        initialPhase="closing"
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('No. EIR')).toBeDisabled();
    expect(screen.getByLabelText(/waktu mulai/i)).toBeDisabled();
    expect(screen.getByLabelText(/waktu selesai/i)).toBeDisabled();
    expect(document.getElementById('operational-eir-document')).toBeEnabled();
    expect(screen.getByText(/hanya dapat melengkapi data atau file yang masih kosong/i)).toBeInTheDocument();
  });

  it('memulai perjalanan secara eksplisit dari tahap closing ketika UJ dan SPK siap', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'paid',
          spkNumber: 'SPK-TEST-001',
          plateNumber: 'B 1000 AA',
          driver: 'Driver Aktif',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await openOperationalPhase(user, /dokumen & closing/i);
    expect(screen.getByRole('button', { name: /mulai jalan/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /mulai jalan/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running',
      runningAt: expect.any(String),
    }));
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

  it('tetap menampilkan truck jika job sebelumnya berstatus dititipkan repo', () => {
    render(
      <OperationalForm
        container={container}
        activeJobs={[
          { id: 'job-repo', status: 'repo_stored', driver: 'Driver Repo', plateNumber: 'B 4000 RR' },
        ]}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 4000 RR', unitCode: 'TRK-004', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Repo' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /B 4000 RR/i })).toBeInTheDocument();
  });

  it('mewajibkan reassign truck dan sopir saat ambil container titip', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={{
          ...container,
          status: 'received',
          repoPickupMode: true,
          plateNumber: '',
          driver: '',
          repoLocation: 'Repo Cakung',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText(/Container sedang diambil dari depo penitipan/i)).toBeInTheDocument();
    expect(screen.getByLabelText('No. Container')).toBeDisabled();
    expect(screen.getByText(/No. Container terkunci saat ambil container titip/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /simpan assignment/i }));

    expect(screen.getByText(/Ambil container titip wajib assign ulang truck dan sopir/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mengunci biaya lainnya saat ambil container titip', async () => {
    const user = userEvent.setup();
    render(
      <OperationalForm
        container={{
          ...container,
          status: 'received',
          repoPickupMode: true,
          rpujStatus: 'paid',
          rpujNotes: JSON.stringify({ amount: 150000, notes: 'parkir' }),
          repoLocation: 'Repo Cakung',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /uang jalan & spk/i);

    expect(screen.getByLabelText(/nominal biaya/i)).toBeDisabled();
    expect(screen.getByLabelText(/catatan biaya/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /sudah dibayar/i })).toBeDisabled();
    expect(screen.getByText(/Biaya lainnya terkunci saat ambil container titip/i)).toBeInTheDocument();
  });

  it('mengirim pickup container titip sebagai perjalanan sedang jalan', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={{
          ...container,
          status: 'received',
          repoPickupMode: true,
          rpujStatus: 'approved',
          spkNumber: 'SPK-TEST-001',
          plateNumber: '',
          driver: '',
          repoLocation: 'Repo Cakung',
        }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    await user.click(screen.getByRole('button', { name: /simpan assignment/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running',
      plateNumber: 'B 1000 AA',
      driver: 'Driver Aktif',
      runningAt: expect.any(String),
    }));
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

    expect(open).toHaveBeenCalledWith('', '_blank', 'width=900,height=760');
    expect(open.mock.results[0].value.opener).toBeNull();
    const html = write.mock.calls.map(([value]) => value).join('');
    expect(html.indexOf('Tujuan')).toBeLessThan(html.indexOf('No. SPK'));
    expect(html).toContain('No. Container');
    expect(html).toContain('MSCU-123456-7');
    expect(html).not.toContain('JOB-TEST-001');
    expect(html).not.toContain('No. SO');
    expect(html).not.toContain('No. DO');
    expect(html).not.toContain('Chassis');
    expect(html).not.toContain('Rute Operasional');
    expect(html).not.toContain('Catatan Operasional');
    expect(html).toContain('BGLogoArmada.png');
    expect(html).toContain('alt="Logo Armada"');
    expect(html).toContain('Jl. Perjuangan No.11F, RT.1/RW.7, Kb. Jeruk, Kec. Kb. Jeruk, Kota Jakarta Barat, Daerah Khusus Ibukota Jakarta 11530');
    expect(html).not.toContain('Telp.');
    expect(html).not.toContain('ops@armada-logistik.co.id');
    expect(html).not.toContain('www.armada-logistik.co.id');
    expect(html).toContain('SPK ini di-generate secara otomatis oleh sistem dan tidak memerlukan tanda tangan.');
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

  it('membiarkan nomor container SPK kosong agar dapat diisi manual', async () => {
    const user = userEvent.setup();
    const write = vi.fn();
    const open = vi.spyOn(window, 'open').mockReturnValue({
      document: { write, close: vi.fn() },
    });

    render(
      <OperationalForm
        container={{
          ...container,
          containerNumber: '',
          jobNumber: 'JOB-TIDAK-BOLEH-TAMPIL',
          spkNumber: 'SPK-TEST-EMPTY',
          rpujStatus: 'approved',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /uang jalan & spk/i);
    await user.click(screen.getByRole('button', { name: /preview spk/i }));

    const html = write.mock.calls.map(([value]) => value).join('');
    expect(html).toMatch(/<th>No\. Container<\/th>[\s\S]*?<td><\/td>/);
    expect(html).not.toContain('JOB-TIDAK-BOLEH-TAMPIL');

    open.mockRestore();
  });

  it('menanamkan logo Armada ke PDF SPK yang didownload', async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:spk-logo-test');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    class MockLogoImage {
      naturalWidth = 612;

      naturalHeight = 408;

      set src(value) {
        this.source = value;
        Promise.resolve().then(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', MockLogoImage);
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,/9j/2Q==');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      render(
        <OperationalForm
          container={{ ...container, spkNumber: 'SPK-LOGO-001', rpujStatus: 'approved' }}
          masterTrucks={[]}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );

      await openOperationalPhase(user, /uang jalan & spk/i);
      await user.click(screen.getByRole('button', { name: /download spk/i }));
      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));

      const pdfBlob = createObjectURL.mock.calls[0][0];
      const pdfText = new TextDecoder('latin1').decode(await pdfBlob.arrayBuffer());
      expect(pdfText).toContain('/Subtype /Image');
      expect(pdfText).toContain('/Logo Do');
      expect(pdfText).not.toContain('Td (A)');
    } finally {
      getContext.mockRestore();
      toDataURL.mockRestore();
      click.mockRestore();
      vi.unstubAllGlobals();
      if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
      else delete URL.createObjectURL;
      if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
      else delete URL.revokeObjectURL;
    }
  });

  it('mengajukan uang jalan ke Finance dari tombol RPUJ', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={container}
        masterDestinations={[{ name: 'Bandung', uj20ft: 500000 }]}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
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
          plateNumber: 'B 1000 AA',
          driver: 'Driver Aktif',
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
          plateNumber: 'B 1000 AA',
          driver: 'Driver Aktif',
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

  it('mengunci truck dan driver setelah UJ ditransfer', async () => {
    const user = userEvent.setup();

    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'paid',
          plateNumber: 'B 9243 BEL',
          driver: 'IQBAL',
          chassis: '19 - HINO FG8JF2B-PGJ',
        }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Baru' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /persiapan job/i);

    expect(screen.getByLabelText('Truck')).toBeDisabled();
    expect(screen.getByText(/Driver dan truck terkunci karena UJ sudah ditransfer atau pekerjaan selesai/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Driver Otomatis')).toHaveValue('IQBAL');
  });

  it('tetap mengizinkan nomor container diisi pertama kali setelah UJ ditransfer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={{
          ...container,
          containerNumber: '',
          rpujStatus: 'paid',
          plateNumber: 'B 9243 BEL',
          driver: 'IQBAL',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const containerNumberInput = screen.getByLabelText('No. Container');
    expect(containerNumberInput).not.toBeDisabled();
    expect(screen.getByText(/Nomor pertama tetap dapat diisi meskipun UJ sudah dikirim/i)).toBeInTheDocument();

    await user.type(containerNumberInput, 'TCLU1234567');
    await user.click(screen.getByRole('button', { name: /simpan assignment/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ containerNumber: 'TCLU1234567' }));
  });

  it('tetap mengunci revisi nomor container yang sudah tersimpan setelah UJ ditransfer', () => {
    render(
      <OperationalForm
        container={{ ...container, rpujStatus: 'paid' }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('No. Container')).toBeDisabled();
    expect(screen.getByText(/No. Container yang sudah tersimpan terkunci/i)).toBeInTheDocument();
  });

  it('mengunci truck dan driver setelah pekerjaan selesai', async () => {
    const user = userEvent.setup();

    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'approved',
          status: 'completed',
          plateNumber: 'B 6102 WXA',
          driver: 'Tono Wibowo',
          chassis: '11 - Hino 500 Ranger',
        }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Baru' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /persiapan job/i);

    expect(screen.getByLabelText('Truck')).toBeDisabled();
    expect(screen.getByText(/Driver dan truck terkunci karena UJ sudah ditransfer atau pekerjaan selesai/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Driver Otomatis')).toHaveValue('Tono Wibowo');
  });

  it('mengizinkan admin merevisi truck dan driver setelah pekerjaan selesai', async () => {
    const user = userEvent.setup();

    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'approved',
          status: 'completed',
          plateNumber: 'B 6102 WXA',
          driver: 'Tono Wibowo',
          chassis: '11 - Hino 500 Ranger',
        }}
        currentUser={{ role: 'admin' }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Baru' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /persiapan job/i);

    expect(screen.getByLabelText('Truck')).not.toBeDisabled();
    await openOperationalPhase(user, /dokumen & closing/i);
    expect(screen.getByLabelText(/waktu mulai/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/waktu selesai/i)).not.toBeDisabled();
    expect(screen.queryByText(/Hubungi admin untuk revisi/i)).not.toBeInTheDocument();
  });

  it('mengunci biaya lainnya setelah RPUJ disetujui Finance', async () => {
    const user = userEvent.setup();

    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'approved',
          otherCostAmount: 200000,
          otherCostNotes: 'Uang masuk tol',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /uang jalan & spk/i);

    expect(screen.getByLabelText(/nominal biaya/i)).toBeDisabled();
    expect(screen.getByLabelText(/catatan biaya/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /disetujui finance/i })).toBeDisabled();
    expect(screen.getByText(/Biaya lainnya terkunci karena UJ sudah disetujui Finance/i)).toBeInTheDocument();
    expect(screen.getByText(/Biaya lainnya tidak bisa diubah setelah UJ disetujui Finance/i)).toBeInTheDocument();
  });
});
