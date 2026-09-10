import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OperationalForm from './OperationalForm';
import { fetchContainerJobAssignmentHistory } from '../../services/archive/containerJobService';

vi.mock('../../services/archive/containerJobService', () => ({
  fetchContainerJobAssignmentHistory: vi.fn().mockResolvedValue([]),
}));

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

async function chooseDriver(user, driverName) {
  const input = screen.getByLabelText('Sopir Aktual Ritasi');
  await user.clear(input);
  await user.type(input, driverName);
  await user.click(await screen.findByRole('option', { name: new RegExp(driverName, 'i') }));
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
    expect(screen.queryByText('Komisi Sopir')).not.toBeInTheDocument();
    expect(screen.queryByText('Dokumen Operasional')).not.toBeInTheDocument();

    await openOperationalPhase(user, /biaya perjalanan & spk/i);
    expect(screen.getByText('Komisi Sopir')).toBeInTheDocument();
    expect(screen.queryByText('EIR')).not.toBeInTheDocument();

    await openOperationalPhase(user, /dokumen & closing/i);
    expect(screen.getByText('Dokumen Operasional')).toBeInTheDocument();
    expect(screen.getByText('EIR')).toBeInTheDocument();
    expect(screen.getByLabelText('No. EIR')).toBeInTheDocument();
  });

  it('menampilkan file dokumen yang sudah ter-upload walau object file dari backend cuma punya path (bukan name)', async () => {
    // Regression: backend kadang mengembalikan attachment yang sudah ada di database dengan
    // `name` kosong (bug mapping snake_case/camelCase) atau memang tanpa `name` eksplisit,
    // hanya `path`/`storagePath`. Modal tidak boleh menampilkan "Belum ada file" untuk kasus ini.
    const user = userEvent.setup();

    render(
      <OperationalForm
        container={{
          ...container,
          eirDocument: { path: 'attachment-eir-1', storagePath: 'container_job/job-1/eirDocument/tllu.jpeg', name: '' },
          travelDocumentFile: { path: 'attachment-travel-1', storagePath: 'container_job/job-1/travelDocumentFile/wa.jpeg', name: '' },
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /dokumen & closing/i);

    const eirUploadButton = screen.getByRole('button', { name: 'Pilih lampiran EIR' });
    expect(eirUploadButton).toHaveTextContent('Ubah File');
    expect(within(eirUploadButton.parentElement).queryByText('Belum ada file')).not.toBeInTheDocument();

    const travelUploadButton = screen.getByRole('button', { name: 'Pilih No. Surat Jalan' });
    expect(travelUploadButton).toHaveTextContent('Ubah File');
    expect(within(travelUploadButton.parentElement).queryByText('Belum ada file')).not.toBeInTheDocument();
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
    expect(screen.getByText('Biaya perjalanan tercatat')).toBeInTheDocument();
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

    expect(screen.getByLabelText(/tanggal mulai/i)).toHaveValue(expectedInputValue.slice(0, 10));
    expect(screen.getByLabelText(/jam mulai/i)).toHaveValue(expectedInputValue.slice(11, 16));

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

  it('mengizinkan status sedang jalan setelah truck dan driver lengkap', async () => {
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

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running',
      plateNumber: 'B 1000 AA',
      driver: 'Driver Aktif',
      runningAt: expect.any(String),
    }));
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

    expect(screen.getByLabelText('Sopir Aktual Ritasi')).toHaveValue('Driver Aktif');
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

  it('membatasi Sales ke mode dokumen operational saja', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <OperationalForm
        container={{ ...container, status: 'running', eirNumber: '', loadingVoucher: '' }}
        currentUser={{ role: 'sales', fullName: 'Sales A' }}
        masterDrivers={[]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByRole('tab', { name: /persiapan job/i })).not.toBeInTheDocument();
    expect(screen.getByText('Dokumen Operasional')).toBeInTheDocument();
    expect(screen.getByLabelText('No. EIR')).toBeEnabled();
    expect(screen.getByLabelText(/status pekerjaan/i)).toBeDisabled();

    await user.type(screen.getByLabelText('No. EIR'), 'EIR-SALES-001');
    await user.click(screen.getByRole('button', { name: /simpan container job - simpan dokumen/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      eirNumber: 'EIR-SALES-001',
      updatedBy: 'Sales A',
    }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('status');
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('plateNumber');
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

  it('tetap menampilkan truck jika hanya default sopirnya yang aktif di job lain', () => {
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

    expect(screen.getByRole('option', { name: /B 1000 AA/i })).toBeInTheDocument();
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

  it('mewajibkan truck dan sopir lengkap saat ambil container titip', async () => {
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

    expect(screen.getByText(/Ambil container titip wajib melengkapi truck dan sopir/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mengunci komisi sopir saat ambil container titip', async () => {
    const user = userEvent.setup();
    render(
      <OperationalForm
        container={{
          ...container,
          status: 'received',
          repoPickupMode: true,
          rpujStatus: 'paid',
          repoLocation: 'Repo Cakung',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /biaya perjalanan & spk/i);

    expect(screen.getByLabelText(/ada komisi sopir/i)).toBeDisabled();
    expect(screen.getByText(/Komisi sopir terkunci saat ambil container titip/i)).toBeInTheDocument();
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

  it('mengizinkan pickup container titip oleh sopir dan truck yang sama', async () => {
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
          plateNumber: 'B 4000 RR',
          driver: 'Driver Repo',
          repoLocation: 'Repo Cakung',
        }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 4000 RR', unitCode: 'TRK-004', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Repo' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /simpan assignment/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running',
      plateNumber: 'B 4000 RR',
      driver: 'Driver Repo',
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

    expect(screen.getByLabelText('Sopir Aktual Ritasi')).toHaveValue('Driver E Money');
    expect(screen.getByLabelText('Pembayaran UJ Driver')).toHaveValue('DANA 081299990000');

    await openOperationalPhase(user, /biaya perjalanan & spk/i);
    await user.click(screen.getByRole('button', { name: /simpan biaya & spk/i }));

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

  it('menampilkan uang jalan tanpa biaya lainnya di preview SPK', async () => {
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
        }}
        masterDestinations={[{ name: 'Bandung', uj20ft: 500000 }]}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /biaya perjalanan & spk/i);
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
    expect(html).not.toContain('Informasi Biaya Perjalanan');
    expect(html).not.toContain('Uang Jalan');
    expect(html).not.toContain('Komisi Sopir');
    expect(html).not.toContain('Biaya Lainnya');
    expect(html).not.toContain('Catatan Biaya Lainnya');
    expect(html).not.toContain('Total Biaya Perjalanan');
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

    await openOperationalPhase(user, /biaya perjalanan & spk/i);
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

      await openOperationalPhase(user, /biaya perjalanan & spk/i);
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

  it('mencegah submit ganda saat penyimpanan masih berjalan', async () => {
    const user = userEvent.setup();
    let resolveSubmit;
    const onSubmit = vi.fn(() => new Promise((resolve) => {
      resolveSubmit = resolve;
    }));

    render(
      <OperationalForm
        container={container}
        masterDestinations={[{ name: 'Bandung', uj20ft: 500000 }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const saveButton = screen.getByRole('button', { name: /simpan container job/i });
    await user.dblClick(saveButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveTextContent(/menyimpan/i);

    resolveSubmit();
    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });

  it('mengirim snapshot komisi sopir saat checkbox komisi aktif', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={container}
        masterDestinations={[{ id: 'destination-1', name: 'Bandung', uj20ft: 500000, driverCommissionAmount: 50000 }]}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    await openOperationalPhase(user, /biaya perjalanan & spk/i);
    await user.click(screen.getByLabelText(/ada komisi sopir/i));
    await user.click(screen.getByRole('button', { name: /simpan biaya & spk/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      rpujStatus: 'submitted',
      hasDriverCommission: true,
      driverCommissionAmount: 50000,
      driverCommissionSourceDestinationId: 'destination-1',
      driverCommissionNote: 'Komisi Bandung',
    });
  });

  it('mengizinkan generate SPK setelah biaya perjalanan tercatat', async () => {
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

    await openOperationalPhase(user, /biaya perjalanan & spk/i);
    const generateButton = screen.getByRole('button', { name: /generate spk/i });

    expect(generateButton).toBeEnabled();

    await user.click(generateButton);

    expect(onGenerateSpk).toHaveBeenCalledTimes(1);
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

    await openOperationalPhase(user, /biaya perjalanan & spk/i);
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
    expect(screen.getByLabelText('Sopir Aktual Ritasi')).toHaveValue('IQBAL');
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
    expect(screen.getByLabelText('Sopir Aktual Ritasi')).toHaveValue('Tono Wibowo');
  });

  it('mengizinkan admin merevisi data terkunci setelah mode koreksi aktif', async () => {
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

    expect(screen.getByLabelText('Truck')).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /mode koreksi admin/i }));
    await user.type(screen.getByLabelText(/alasan koreksi/i), 'Koreksi salah input truck');

    expect(screen.getByLabelText('Truck')).not.toBeDisabled();
    await openOperationalPhase(user, /dokumen & closing/i);
    expect(screen.getByLabelText(/waktu mulai/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/waktu selesai/i)).not.toBeDisabled();
    expect(screen.queryByText(/Hubungi admin untuk revisi/i)).not.toBeInTheDocument();
  });

  it('mengirim mode dan alasan koreksi admin saat menyimpan', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={{
          ...container,
          rpujStatus: 'approved',
          status: 'completed',
          plateNumber: 'B 6102 WXA',
          driver: 'Tono Wibowo',
          runningAt: '2026-07-19T08:00:00.000Z',
          completedAt: '2026-07-19T12:00:00.000Z',
        }}
        currentUser={{ role: 'admin' }}
        initialPhase="closing"
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /mode koreksi admin/i }));
    await user.type(screen.getByLabelText(/alasan koreksi/i), 'Koreksi tanggal selesai');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      adminCorrectionMode: true,
      adminCorrectionReason: 'Koreksi tanggal selesai',
    }));
  });

  it('mengunci komisi sopir setelah pekerjaan selesai', async () => {
    const user = userEvent.setup();

    render(
      <OperationalForm
        container={{
          ...container,
          status: 'completed',
        }}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await openOperationalPhase(user, /biaya perjalanan & spk/i);

    expect(screen.getByLabelText(/ada komisi sopir/i)).toBeDisabled();
    expect(screen.getByText(/Komisi sopir terkunci setelah pekerjaan selesai/i)).toBeInTheDocument();
  });

  it('menampilkan info "hanya berlaku untuk ritasi ini" di section Assignment Aktual', () => {
    render(
      <OperationalForm
        container={container}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('Assignment Aktual')).toBeInTheDocument();
    expect(screen.getByText('Perubahan ini hanya berlaku untuk ritasi ini dan tidak mengubah master.')).toBeInTheDocument();
  });

  it('mengizinkan mengganti sopir tanpa mengganti truck, mengirim driverId dan vehicleId terpisah', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={container}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' },
        ]}
        masterDrivers={[
          { id: 'driver-1', name: 'Driver Aktif', status: 'Aktif' },
          { id: 'driver-2', name: 'Driver Cadangan', status: 'Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    expect(screen.getByLabelText('Sopir Aktual Ritasi')).toHaveValue('Driver Aktif');

    await chooseDriver(user, 'Driver Cadangan');
    expect(screen.getByLabelText('Truck')).toHaveValue('B 1000 AA');

    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      driver: 'Driver Cadangan',
      driverId: 'driver-2',
      plateNumber: 'B 1000 AA',
      vehicleId: 'truck-1',
    }));
  });

  it('mewajibkan alasan perubahan saat mengganti sopir pada ritasi yang sudah jalan', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={{
          ...container,
          driver: 'Driver Lama',
          plateNumber: 'B 1000 AA',
          chassis: 'TRK-001 - Hino FG',
          status: 'running',
          runningAt: '2026-07-19T08:00:00.000Z',
        }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Lama' },
        ]}
        masterDrivers={[
          { id: 'driver-1', name: 'Driver Lama', status: 'Aktif' },
          { id: 'driver-2', name: 'Driver Baru', status: 'Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await chooseDriver(user, 'Driver Baru');
    expect(screen.getByText(/alasan perubahan sopir\/truck wajib diisi/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /simpan container job/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Ritasi sudah berjalan -- alasan perubahan sopir/truck wajib diisi.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/alasan perubahan/i), 'Sopir lama sakit mendadak');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      driver: 'Driver Baru',
      assignmentChangeReason: 'Sopir lama sakit mendadak',
    }));
  });

  it('tidak mewajibkan alasan saat mengganti truck sementara status masih Belum Jalan', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OperationalForm
        container={{ ...container, driver: 'Driver Lama', plateNumber: 'B 1000 AA' }}
        masterTrucks={[
          { id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Lama' },
          { id: 'truck-2', plateNumber: 'B 2000 BB', unitCode: 'TRK-002', capacity: '20FT', brand: 'Fuso', type: 'FN', status: 'Aktif', defaultDriver: 'Driver Lain' },
        ]}
        masterDrivers={[{ id: 'driver-1', name: 'Driver Lama', status: 'Aktif' }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 2000 BB');
    expect(screen.queryByText(/alasan perubahan sopir\/truck wajib diisi/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /simpan container job/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ plateNumber: 'B 2000 BB' }));
  });

  it('menampilkan Riwayat Assignment kosong ketika belum ada perubahan', async () => {
    fetchContainerJobAssignmentHistory.mockResolvedValueOnce([]);
    render(
      <OperationalForm
        container={container}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('Riwayat Assignment')).toBeInTheDocument();
    expect(await screen.findByText('Belum ada riwayat perubahan.')).toBeInTheDocument();
  });

  it('menampilkan daftar Riwayat Assignment dari data yang di-fetch', async () => {
    fetchContainerJobAssignmentHistory.mockResolvedValueOnce([
      {
        id: 'hist-1',
        changeSource: 'operational',
        previousDriverName: 'Driver Lama',
        nextDriverName: 'Driver Baru',
        previousPlateNumber: 'B 1000 AA',
        nextPlateNumber: 'B 1000 AA',
        reason: 'Sopir lama sakit',
        note: '',
        changedByName: 'Budi Operational',
        createdAt: '2026-07-20T08:00:00.000Z',
      },
    ]);
    render(
      <OperationalForm
        container={container}
        masterTrucks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Sopir lama sakit/)).toBeInTheDocument();
    expect(screen.getByText(/Driver Lama/)).toBeInTheDocument();
    expect(screen.getByText(/Driver Baru/)).toBeInTheDocument();
    expect(screen.getByText('Operational')).toBeInTheDocument();
  });

  it('menampilkan tombol "Jadikan sopir ini default truck" untuk Operational dan Admin', () => {
    const truckAndDriverProps = {
      masterTrucks: [{ id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' }],
      masterDrivers: [{ id: 'driver-1', name: 'Driver Aktif', status: 'Aktif' }],
    };
    const { unmount } = render(
      <OperationalForm container={container} currentUser={{ role: 'operational' }} onClose={vi.fn()} onSubmit={vi.fn()} {...truckAndDriverProps} />,
    );
    expect(screen.getByRole('button', { name: 'Jadikan sopir ini default truck' })).toBeInTheDocument();
    unmount();

    render(
      <OperationalForm container={container} currentUser={{ role: 'admin' }} onClose={vi.fn()} onSubmit={vi.fn()} {...truckAndDriverProps} />,
    );
    expect(screen.getByRole('button', { name: 'Jadikan sopir ini default truck' })).toBeInTheDocument();
  });

  it('tidak menampilkan tombol "Jadikan sopir ini default truck" untuk Sales/Finance', () => {
    const truckAndDriverProps = {
      masterTrucks: [{ id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' }],
      masterDrivers: [{ id: 'driver-1', name: 'Driver Aktif', status: 'Aktif' }],
    };
    const { unmount } = render(
      <OperationalForm container={container} currentUser={{ role: 'sales' }} onClose={vi.fn()} onSubmit={vi.fn()} {...truckAndDriverProps} />,
    );
    expect(screen.queryByRole('button', { name: 'Jadikan sopir ini default truck' })).not.toBeInTheDocument();
    unmount();

    render(
      <OperationalForm container={container} currentUser={{ role: 'finance' }} onClose={vi.fn()} onSubmit={vi.fn()} {...truckAndDriverProps} />,
    );
    expect(screen.queryByRole('button', { name: 'Jadikan sopir ini default truck' })).not.toBeInTheDocument();
  });

  it('tombol default truck nonaktif sampai truck+sopir terisi dan sopir beda dari default saat ini', async () => {
    const user = userEvent.setup();
    render(
      <OperationalForm
        container={container}
        currentUser={{ role: 'operational' }}
        masterTrucks={[{ id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' }]}
        masterDrivers={[
          { id: 'driver-1', name: 'Driver Aktif', status: 'Aktif' },
          { id: 'driver-2', name: 'Driver Cadangan', status: 'Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onSetTruckDefaultDriver={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Jadikan sopir ini default truck' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    expect(screen.getByRole('button', { name: 'Jadikan sopir ini default truck' })).toBeDisabled();

    await chooseDriver(user, 'Driver Cadangan');
    expect(screen.getByRole('button', { name: 'Jadikan sopir ini default truck' })).toBeEnabled();
  });

  it('memunculkan blok konfirmasi dengan teks yang benar, dan menolak submit tanpa alasan', async () => {
    const user = userEvent.setup();
    const onSetTruckDefaultDriver = vi.fn().mockResolvedValue({});
    render(
      <OperationalForm
        container={container}
        currentUser={{ role: 'operational' }}
        masterTrucks={[{ id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' }]}
        masterDrivers={[
          { id: 'driver-1', name: 'Driver Aktif', status: 'Aktif' },
          { id: 'driver-2', name: 'Driver Cadangan', status: 'Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onSetTruckDefaultDriver={onSetTruckDefaultDriver}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    await chooseDriver(user, 'Driver Cadangan');
    await user.click(screen.getByRole('button', { name: 'Jadikan sopir ini default truck' }));

    expect(screen.getByText(/Ini akan mengubah default sopir untuk B 1000 AA menjadi Driver Cadangan/)).toBeInTheDocument();
    expect(screen.getByText(/Perubahan hanya berlaku untuk ritasi baru berikutnya dan tidak mengubah ritasi lama/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Konfirmasi' }));
    expect(screen.getByText(/Alasan wajib diisi minimal 8 karakter/i)).toBeInTheDocument();
    expect(onSetTruckDefaultDriver).not.toHaveBeenCalled();
  });

  it('memanggil onSetTruckDefaultDriver dengan payload benar dan menampilkan notifikasi sukses', async () => {
    const user = userEvent.setup();
    const onSetTruckDefaultDriver = vi.fn().mockResolvedValue({});
    render(
      <OperationalForm
        container={container}
        currentUser={{ role: 'operational' }}
        masterTrucks={[{ id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' }]}
        masterDrivers={[
          { id: 'driver-1', name: 'Driver Aktif', status: 'Aktif' },
          { id: 'driver-2', name: 'Driver Cadangan', status: 'Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onSetTruckDefaultDriver={onSetTruckDefaultDriver}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    await chooseDriver(user, 'Driver Cadangan');
    await user.click(screen.getByRole('button', { name: 'Jadikan sopir ini default truck' }));
    await user.type(screen.getByPlaceholderText(/sopir tetap truck ini memang diganti/i), 'Sopir tetap truck ini resmi diganti sesuai kesepakatan baru');
    await user.click(screen.getByRole('button', { name: 'Konfirmasi' }));

    await waitFor(() => {
      expect(onSetTruckDefaultDriver).toHaveBeenCalledWith('truck-1', {
        defaultDriverId: 'driver-2',
        reason: 'Sopir tetap truck ini resmi diganti sesuai kesepakatan baru',
      });
    });
    expect(await screen.findByText('Default sopir truck diperbarui. Berlaku untuk ritasi baru berikutnya.')).toBeInTheDocument();
  });

  it('menampilkan label "Sopir Aktual Ritasi" dan info "Default sopir truck saat ini" secara terpisah', async () => {
    const user = userEvent.setup();
    render(
      <OperationalForm
        container={container}
        currentUser={{ role: 'operational' }}
        masterTrucks={[{ id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' }]}
        masterDrivers={[{ id: 'driver-1', name: 'Driver Aktif', status: 'Aktif' }]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Sopir Aktual Ritasi')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    expect(screen.getByText(/Default sopir truck saat ini: Driver Aktif/)).toBeInTheDocument();
  });

  it('mengganti sopir ritasi biasa tanpa klik aksi default tidak memanggil onSetTruckDefaultDriver', async () => {
    const user = userEvent.setup();
    const onSetTruckDefaultDriver = vi.fn();
    render(
      <OperationalForm
        container={container}
        currentUser={{ role: 'operational' }}
        masterTrucks={[{ id: 'truck-1', plateNumber: 'B 1000 AA', unitCode: 'TRK-001', capacity: '20FT', brand: 'Hino', type: 'FG', status: 'Aktif', defaultDriver: 'Driver Aktif' }]}
        masterDrivers={[
          { id: 'driver-1', name: 'Driver Aktif', status: 'Aktif' },
          { id: 'driver-2', name: 'Driver Cadangan', status: 'Aktif' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onSetTruckDefaultDriver={onSetTruckDefaultDriver}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Truck'), 'B 1000 AA');
    await chooseDriver(user, 'Driver Cadangan');
    await user.click(screen.getByRole('button', { name: /simpan container job/i }));

    expect(onSetTruckDefaultDriver).not.toHaveBeenCalled();
  });
});
