import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MasterDataPage from './MasterDataPage';
import { useArchiveData } from '../../hooks/useArchiveData';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import {
  fetchMasterPage,
  fetchMasterViewerNote,
  saveMasterViewerNote,
} from '../../services/master-data/masterDataService';
import {
  createAttachmentDownloadUrl,
  deleteAttachmentFile,
  downloadAttachmentFile,
  uploadAttachmentFile,
} from '../../services/files/fileService';

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

const fields = [
  { key: 'name', label: 'Nama Data', placeholder: 'Masukkan nama', required: true },
  { key: 'status', label: 'Status', type: 'select', defaultValue: 'Aktif', options: [
    { value: 'Aktif', label: 'Aktif' },
    { value: 'Tidak Aktif', label: 'Tidak Aktif' },
  ] },
];

const rows = [{ id: 'row-1', name: 'Data Lama', status: 'Aktif' }];

function renderPage({ pageFields = fields, resource = 'customers', readOnly = false } = {}) {
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
      resource={resource}
      storageKey="test-master"
      uniqueKeys={['name']}
      filters={[]}
      stats={(data) => [{ label: 'Total', value: data.length, detail: 'data' }]}
      readOnly={readOnly}
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
    createAttachmentDownloadUrl.mockResolvedValue('http://localhost/document');
    deleteAttachmentFile.mockResolvedValue({ id: 'deleted' });
    downloadAttachmentFile.mockResolvedValue(undefined);
    uploadAttachmentFile.mockResolvedValue(null);
    confirmAction.mockResolvedValue(true);
    fetchMasterPage.mockResolvedValue({ rows, total: rows.length });
    fetchMasterViewerNote.mockResolvedValue([]);
    saveMasterViewerNote.mockResolvedValue({
      documentKey: 'identityDocument',
      note: 'STID belum ada karena masih proses.',
      updatedByName: 'Rina Viewer',
      updatedAt: '2026-07-31T03:00:00.000Z',
    });
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
    useAuth.mockReturnValue({ user: { role: 'admin' } });
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

  it('tetap menyimpan data meski field dibiarkan kosong', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Input Data Baru/i }));
    await user.click(screen.getByRole('button', { name: 'Simpan Data' }));

    await waitFor(() => expect(upsertMaster).toHaveBeenCalledWith(
      'customers',
      { name: '', status: 'Aktif' },
      null,
    ));
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

  it('menyediakan view dan download dokumen hanya dari modal detail', async () => {
    const user = userEvent.setup();
    const documentRows = [{
      ...rows[0],
      npwpDocument: { name: 'NPWP-Customer.pdf', path: 'npwp-document-id' },
    }];
    fetchMasterPage.mockResolvedValue({ rows: documentRows, total: documentRows.length });
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      masters: { customers: documentRows },
      upsertMaster,
      removeMaster,
    });

    renderPage({
      pageFields: [
        ...fields,
        { key: 'npwpDocument', label: 'Dokumen NPWP', type: 'file' },
      ],
    });

    expect(screen.queryByRole('button', { name: 'Download NPWP-Customer.pdf' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Lihat Data' }));

    expect(await screen.findByRole('button', { name: 'View NPWP-Customer.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download NPWP-Customer.pdf' })).toBeInTheDocument();
  });

  it('membuka master data untuk viewer tanpa aksi edit data', async () => {
    useAuth.mockReturnValue({ user: { role: 'observer' } });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Lihat Data' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Input Data Baru/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arsipkan Data' })).not.toBeInTheDocument();
  });

  it('mengizinkan viewer menyimpan catatan monitoring dari modal detail', async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: { role: 'observer', fullName: 'Rina Viewer' } });
    renderPage({
      readOnly: true,
      pageFields: [
        ...fields,
        {
          key: 'documentSummary',
          label: 'Dokumen',
          full: true,
          renderDetail: (_value, _row, meta) => (
            <div>
              <strong>Ringkasan dokumen</strong>
              {meta.renderViewerDocumentNote('identityDocument', 'KTP Driver')}
            </div>
          ),
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Lihat Data' }));
    const noteInput = await screen.findByRole('textbox', { name: 'Catatan KTP Driver' });
    await user.type(noteInput, 'STID belum ada karena masih proses.');
    await user.click(screen.getByRole('button', { name: 'Simpan catatan KTP Driver' }));

    await waitFor(() => expect(saveMasterViewerNote).toHaveBeenCalledWith(
      'customers',
      'row-1',
      'identityDocument',
      'STID belum ada karena masih proses.',
    ));
    expect(upsertMaster).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Catatan monitoring tersimpan',
    }));
  });

  it('mendownload dokumen tersimpan dari tombol detail', async () => {
    const user = userEvent.setup();
    const documentRows = [{
      ...rows[0],
      npwpDocument: { name: 'NPWP-Customer.pdf', path: 'npwp-document-id' },
    }];
    fetchMasterPage.mockResolvedValue({ rows: documentRows, total: documentRows.length });
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      masters: { customers: documentRows },
      upsertMaster,
      removeMaster,
    });

    renderPage({
      pageFields: [
        ...fields,
        { key: 'npwpDocument', label: 'Dokumen NPWP', type: 'file' },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Lihat Data' }));
    await user.click(await screen.findByRole('button', { name: 'Download NPWP-Customer.pdf' }));

    await waitFor(() => expect(downloadAttachmentFile).toHaveBeenCalledWith('npwp-document-id', 'NPWP-Customer.pdf'));
  });

  it('mempertahankan data lama saat edit meski ada field yang disembunyikan', async () => {
    const user = userEvent.setup();
    const hiddenRows = [{ id: 'row-2', name: 'Data Lama', status: 'Aktif', secretInfo: 'tetap-ada' }];
    fetchMasterPage.mockResolvedValue({ rows: hiddenRows, total: hiddenRows.length });
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      masters: { customers: hiddenRows },
      upsertMaster,
      removeMaster,
    });

    const { container } = renderPage({
      pageFields: [
        { key: 'name', label: 'Nama Data', placeholder: 'Masukkan nama', required: true },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'Aktif', options: [
          { value: 'Aktif', label: 'Aktif' },
          { value: 'Tidak Aktif', label: 'Tidak Aktif' },
        ] },
        {
          key: 'secretInfo',
          label: 'Info Rahasia',
          placeholder: 'Info internal',
          showIf: (form) => form.status === 'Aktif',
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Edit Data' }));
    await user.clear(screen.getByPlaceholderText('Masukkan nama'));
    await user.type(screen.getByPlaceholderText('Masukkan nama'), 'Data Baru');

    const statusSelect = container.querySelector('select');
    await user.selectOptions(statusSelect, 'Tidak Aktif');
    await user.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => expect(upsertMaster).toHaveBeenCalledWith(
      'customers',
      expect.objectContaining({
        id: 'row-2',
        name: 'Data Baru',
        status: 'Tidak Aktif',
        secretInfo: 'tetap-ada',
      }),
      'row-2',
    ));
  });

  it('mengisi ulang field tanggal dalam format yang valid saat edit', async () => {
    const user = userEvent.setup();
    const dateRows = [{
      id: 'row-3',
      name: 'Sopir ISO',
      status: 'Aktif',
      licenseExpiry: '2027-03-18T00:00:00.000Z',
    }];
    fetchMasterPage.mockResolvedValue({ rows: dateRows, total: dateRows.length });
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      masters: { customers: dateRows },
      upsertMaster,
      removeMaster,
    });

    const { container } = renderPage({
      pageFields: [
        { key: 'name', label: 'Nama Data', placeholder: 'Masukkan nama', required: true },
        { key: 'licenseExpiry', label: 'Masa Berlaku SIM', type: 'date', required: true },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'Aktif', options: [
          { value: 'Aktif', label: 'Aktif' },
          { value: 'Tidak Aktif', label: 'Tidak Aktif' },
        ] },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Edit Data' }));

    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput).toHaveValue('2027-03-18');
  });

  it('tidak menggeser tanggal saat row edit berasal dari Date object', async () => {
    const user = userEvent.setup();
    const originalToISOString = Date.prototype.toISOString;
    Date.prototype.toISOString = vi.fn(() => '2027-03-17T17:00:00.000Z');

    try {
      const dateRows = [{
        id: 'row-4',
        name: 'Sopir Lokal',
        status: 'Aktif',
        licenseExpiry: new Date(2027, 2, 18),
      }];
      fetchMasterPage.mockResolvedValue({ rows: dateRows, total: dateRows.length });
      useArchiveData.mockReturnValue({
        isDatabaseMode: true,
        masters: { customers: dateRows },
        upsertMaster,
        removeMaster,
      });

      const { container } = renderPage({
        pageFields: [
          { key: 'name', label: 'Nama Data', placeholder: 'Masukkan nama', required: true },
          { key: 'licenseExpiry', label: 'Masa Berlaku SIM', type: 'date', required: true },
          { key: 'status', label: 'Status', type: 'select', defaultValue: 'Aktif', options: [
            { value: 'Aktif', label: 'Aktif' },
            { value: 'Tidak Aktif', label: 'Tidak Aktif' },
          ] },
        ],
      });

      await user.click(await screen.findByRole('button', { name: 'Edit Data' }));

      const dateInput = container.querySelector('input[type="date"]');
      expect(dateInput).toHaveValue('2027-03-18');
    } finally {
      Date.prototype.toISOString = originalToISOString;
    }
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

  it('mengunggah isi dokumen master setelah record mendapatkan ID', async () => {
    const user = userEvent.setup();
    const driverId = 'a12b34cd-1111-4222-8333-1234567890ab';
    const attachmentId = 'd34e56fa-2222-4333-8444-1234567890ab';
    const savedDriver = { id: driverId, name: 'Sopir Baru', status: 'Aktif', licenseDocument: null };
    upsertMaster
      .mockResolvedValueOnce(savedDriver)
      .mockResolvedValueOnce({
        ...savedDriver,
        licenseDocument: { name: 'SIM.pdf', path: attachmentId },
      });
    uploadAttachmentFile.mockResolvedValue({
      id: attachmentId,
      fileNameOriginal: 'SIM.pdf',
      sizeBytes: 1024,
      mimeType: 'application/pdf',
    });

    const { container } = renderPage({
      resource: 'drivers',
      pageFields: [
        { key: 'name', label: 'Nama Data', placeholder: 'Masukkan nama', required: true },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'Aktif', options: [
          { value: 'Aktif', label: 'Aktif' },
        ] },
        { key: 'licenseDocument', label: 'Dokumen SIM', type: 'file' },
      ],
    });

    await user.click(screen.getByRole('button', { name: /Input Data Baru/i }));
    await user.type(screen.getByPlaceholderText('Masukkan nama'), 'Sopir Baru');
    const file = new File(['sim'], 'SIM.pdf', { type: 'application/pdf' });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
    await user.click(screen.getByRole('button', { name: 'Simpan Data' }));

    await waitFor(() => expect(uploadAttachmentFile).toHaveBeenCalledWith({
      path: '',
      entityType: 'driver',
      entityId: driverId,
      category: 'licenseDocument',
      file,
    }));
    expect(upsertMaster).toHaveBeenNthCalledWith(1, 'drivers', {
      name: 'Sopir Baru',
      status: 'Aktif',
      licenseDocument: null,
    }, null);
    expect(upsertMaster).toHaveBeenNthCalledWith(2, 'drivers', expect.objectContaining({
      id: driverId,
      licenseDocument: {
        name: 'SIM.pdf',
        size: 1024,
        type: 'application/pdf',
        lastModified: null,
        path: attachmentId,
      },
    }), driverId);
  });
});
