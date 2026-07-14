import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MasterDataPage from './MasterDataPage';
import { useArchiveData } from '../../hooks/useArchiveData';
import { useFeedback } from '../../hooks/useFeedback';
import { fetchMasterPage } from '../../services/master-data/masterDataService';

vi.mock('../../hooks/useArchiveData', () => ({
  useArchiveData: vi.fn(),
}));

vi.mock('../../hooks/useFeedback', () => ({
  useFeedback: vi.fn(),
}));

vi.mock('../../services/master-data/masterDataService', () => ({
  fetchMasterPage: vi.fn(),
}));

const fields = [
  { key: 'name', label: 'Nama Data', placeholder: 'Masukkan nama', required: true },
  { key: 'status', label: 'Status', type: 'select', defaultValue: 'Aktif', options: [
    { value: 'Aktif', label: 'Aktif' },
    { value: 'Tidak Aktif', label: 'Tidak Aktif' },
  ] },
];

const rows = [{ id: 'row-1', name: 'Data Lama', status: 'Aktif' }];

function renderPage({ pageFields = fields } = {}) {
  return render(
    <MasterDataPage
      eyebrow="Master"
      title="Master Testing"
      description="Halaman pengujian"
      singular="Data"
      fields={pageFields}
      columns={[
        { key: 'name', label: 'Nama' },
        { key: 'status', label: 'Status' },
      ]}
      initialRows={[]}
      resource="customers"
      storageKey="test-master"
      uniqueKeys={['name']}
      filters={[]}
      stats={(data) => [{ label: 'Total', value: data.length, detail: 'data' }]}
    />,
  );
}

describe('MasterDataPage database mode', () => {
  const upsertMaster = vi.fn();
  const removeMaster = vi.fn();
  const notify = vi.fn();
  const confirmAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    upsertMaster.mockResolvedValue(undefined);
    removeMaster.mockResolvedValue(undefined);
    confirmAction.mockResolvedValue(true);
    fetchMasterPage.mockResolvedValue({ rows, total: rows.length });
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn();
      URL.revokeObjectURL = vi.fn();
    }
    URL.createObjectURL = vi.fn(() => 'blob:preview-image');
    URL.revokeObjectURL = vi.fn();
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      masters: { customers: rows },
      upsertMaster,
      removeMaster,
    });
    useFeedback.mockReturnValue({ notify, confirmAction });
  });

  it('menambahkan data baru melalui modal', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Input Data Baru/i }));
    await user.type(screen.getByPlaceholderText('Masukkan nama'), 'Data Baru');
    await user.click(screen.getByRole('button', { name: 'Simpan Data' }));

    await waitFor(() => expect(upsertMaster).toHaveBeenCalledWith(
      'customers',
      { name: 'Data Baru', status: 'Aktif' },
      null,
    ));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Data berhasil ditambahkan',
    }));
  });

  it('menolak nilai unik yang sudah digunakan', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Input Data Baru/i }));
    await user.type(screen.getByPlaceholderText('Masukkan nama'), 'Data Lama');
    await user.click(screen.getByRole('button', { name: 'Simpan Data' }));

    expect(screen.getByText('Nama Data sudah digunakan oleh data lain.')).toBeInTheDocument();
    expect(upsertMaster).not.toHaveBeenCalled();
  });

  it('mengarsipkan data setelah konfirmasi', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Arsipkan Data' }));

    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Arsipkan Data?',
    }));
    await waitFor(() => expect(removeMaster).toHaveBeenCalledWith('customers', 'row-1'));
  });

  it('menampilkan error jika arsip data gagal', async () => {
    const user = userEvent.setup();
    removeMaster.mockRejectedValueOnce(new Error('RLS menolak perubahan'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Arsipkan Data' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: 'Data gagal diarsipkan',
      message: 'RLS menolak perubahan',
    })));
  });

  it('meminta halaman master dari backend API dengan page size yang benar', async () => {
    renderPage();

    await waitFor(() => expect(fetchMasterPage).toHaveBeenCalledWith('customers', {
      page: 1,
      pageSize: 5,
      query: '',
      filters: {},
    }));
  });

  it('menolak PDF pada field import gambar', async () => {
    const user = userEvent.setup();
    const { container } = renderPage({
      pageFields: [
        ...fields,
        { key: 'driverPhoto', label: 'Foto Sopir', type: 'file', accept: '.jpg,.jpeg,.png' },
      ],
    });

    await user.click(screen.getByRole('button', { name: /Input Data Baru/i }));
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'foto.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText('Foto Sopir hanya boleh berupa JPG atau PNG.')).toBeInTheDocument();
  });

  it('menampilkan preview saat gambar berhasil di-import', async () => {
    const user = userEvent.setup();
    const { container } = renderPage({
      pageFields: [
        ...fields,
        { key: 'driverPhoto', label: 'Foto Sopir', type: 'file', accept: '.jpg,.jpeg,.png' },
      ],
    });

    await user.click(screen.getByRole('button', { name: /Input Data Baru/i }));
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['image'], 'foto.png', { type: 'image/png' })] },
    });

    expect(await screen.findByAltText('foto.png')).toHaveAttribute('src', 'blob:preview-image');
    expect(screen.getByText('Pilih gambar')).toBeInTheDocument();
  });
});
