import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ExpenseCheckConfirmModal from './ExpenseCheckConfirmModal';
import {
  addExpenseTransferProof,
  deleteExpenseTransferProof,
  fetchExpenseTransferProofs,
  updateExpenseTransferProof,
} from '../../../services/finance/financeService';

vi.mock('../../../services/finance/financeService', () => ({
  addExpenseTransferProof: vi.fn(),
  deleteExpenseTransferProof: vi.fn(),
  fetchExpenseTransferProofs: vi.fn(),
  updateExpenseTransferProof: vi.fn(),
}));

vi.mock('../../../services/files/fileService', () => ({
  createAttachmentDownloadUrl: vi.fn().mockResolvedValue(''),
  downloadAttachmentFile: vi.fn(),
}));

const MB = 1024 * 1024;
const row = {
  id: 'expense-1',
  amount: 125000,
  batchDate: '2026-08-20',
  batchStatus: 'open',
  financeCheckStatus: 'belum_dicek',
  soNumber: 'SO-EXP-001',
  containerNumber: 'CONT-EXP-001',
  driverName: 'Driver Expense',
  category: 'uang_admin_tf',
};

function makeFile(name, type, size) {
  const file = new File(['proof'], name, { type });
  if (size) Object.defineProperty(file, 'size', { value: size });
  return file;
}

function dropFiles(target, files) {
  return fireEvent.drop(target, { dataTransfer: { files, types: ['Files'] } });
}

function renderModal(props = {}) {
  return render(
    <ExpenseCheckConfirmModal
      adminFeeAmount=""
      adjustmentNote=""
      batchDate="2026-08-20"
      onAdjustmentNoteChange={vi.fn()}
      onAdminFeeAmountChange={vi.fn()}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      onProofsChange={vi.fn()}
      row={row}
      {...props}
    />,
  );
}

async function findDropzone() {
  return screen.findByTestId('finance-expense-transfer-proof-dropzone');
}

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchExpenseTransferProofs.mockResolvedValue([]);
});

describe('ExpenseCheckConfirmModal drag & drop bukti transfer', () => {
  it('menampilkan dropzone dengan petunjuk format dan ukuran file', async () => {
    renderModal();
    const dropzone = await findDropzone();

    expect(within(dropzone).getByText('Tarik bukti transfer ke sini')).toBeInTheDocument();
    expect(within(dropzone).getByText('Pilih File Bukti')).toBeInTheDocument();
    expect(within(dropzone).getByText(/PDF maks\. 5 MB, JPG\/PNG maks\. 10 MB/)).toBeInTheDocument();
  });

  it('membuka file picker saat dropzone diklik', async () => {
    const user = userEvent.setup();
    renderModal();
    await findDropzone();
    const input = screen.getByLabelText(/file bukti/i);
    const pickerOpened = vi.fn();
    input.addEventListener('click', pickerOpened);

    await user.click(screen.getByText('Tarik bukti transfer ke sini'));

    expect(pickerOpened).toHaveBeenCalled();
  });

  it('tetap menerima file valid dari file picker', async () => {
    const user = userEvent.setup();
    renderModal();
    await findDropzone();

    await user.upload(screen.getByLabelText(/file bukti/i), makeFile('bukti-picker.pdf', 'application/pdf'));

    expect(screen.getByText('bukti-picker.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan Bukti' })).toBeEnabled();
  });

  it.each([
    ['bukti-transfer.pdf', 'application/pdf', 428 * 1024, '428 KB'],
    ['bukti-transfer.jpg', 'image/jpeg', 2 * MB, '2.0 MB'],
    ['bukti-transfer.png', 'image/png', 900 * 1024, '900 KB'],
  ])('memilih %s yang di-drop tanpa langsung mengunggah', async (name, type, size, readableSize) => {
    renderModal();
    const dropzone = await findDropzone();
    expect(screen.getByRole('button', { name: 'Simpan Bukti' })).toBeDisabled();

    dropFiles(dropzone, [makeFile(name, type, size)]);

    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(screen.getByText(readableSize)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File Bukti Transfer dihapus' })).toBeInTheDocument();
    expect(screen.queryByText('Tarik bukti transfer ke sini')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan Bukti' })).toBeEnabled();
    expect(addExpenseTransferProof).not.toHaveBeenCalled();
  });

  it('mencegah browser membuka file yang di-drop, termasuk di luar dropzone', async () => {
    renderModal();
    const dropzone = await findDropzone();

    expect(fireEvent.dragOver(dropzone, { dataTransfer: { types: ['Files'] } })).toBe(false);
    expect(dropFiles(dropzone, [makeFile('bukti.pdf', 'application/pdf')])).toBe(false);
    expect(dropFiles(document.body, [makeFile('lain.pdf', 'application/pdf')])).toBe(false);
    expect(screen.queryByText('lain.pdf')).not.toBeInTheDocument();
  });

  it('menampilkan state drag-over saat file ditarik ke dropzone', async () => {
    renderModal();
    const dropzone = await findDropzone();

    fireEvent.dragEnter(dropzone, { dataTransfer: { types: ['Files'] } });
    expect(dropzone).toHaveClass('is-dragging');
    expect(screen.getByText('Lepaskan file di sini')).toBeInTheDocument();

    fireEvent.dragLeave(dropzone, { dataTransfer: { types: ['Files'] } });
    expect(dropzone).not.toHaveClass('is-dragging');
  });

  it.each([
    ['tipe file tidak didukung', makeFile('bukti.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'Bukti transfer hanya boleh berupa PDF, JPG, atau PNG.'],
    ['PDF melebihi 5 MB', makeFile('besar.pdf', 'application/pdf', 6 * MB), 'Bukti transfer melebihi batas maksimal 5 MB.'],
    ['gambar melebihi 10 MB', makeFile('besar.jpg', 'image/jpeg', 11 * MB), 'Bukti transfer melebihi batas maksimal 10 MB.'],
  ])('menolak %s tanpa mengubah isian form', async (_label, file, message) => {
    const user = userEvent.setup();
    renderModal();
    const dropzone = await findDropzone();
    const amountInput = screen.getByLabelText('Nominal bukti transfer');
    await user.clear(amountInput);
    await user.type(amountInput, '120000');
    await user.type(screen.getByLabelText('Catatan bukti transfer'), 'Transfer pagi');

    dropFiles(dropzone, [file]);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(file.name)).not.toBeInTheDocument();
    expect(amountInput).toHaveValue(120000);
    expect(screen.getByLabelText('Tanggal bukti transfer')).toHaveValue('2026-08-20');
    expect(screen.getByLabelText('Catatan bukti transfer')).toHaveValue('Transfer pagi');
    expect(screen.getByRole('button', { name: 'Simpan Bukti' })).toBeDisabled();
    expect(addExpenseTransferProof).not.toHaveBeenCalled();
  });

  it('menolak file tidak valid tanpa membuang file valid yang sudah dipilih', async () => {
    renderModal();
    const dropzone = await findDropzone();
    dropFiles(dropzone, [makeFile('bukti-valid.pdf', 'application/pdf')]);
    await screen.findByText('bukti-valid.pdf');

    dropFiles(dropzone, [makeFile('catatan.txt', 'text/plain')]);

    expect(await screen.findByRole('alert')).toHaveTextContent(/hanya boleh berupa PDF, JPG, atau PNG/);
    expect(screen.getByText('bukti-valid.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan Bukti' })).toBeEnabled();
  });

  it('menolak lebih dari satu file sekaligus', async () => {
    renderModal();
    const dropzone = await findDropzone();

    dropFiles(dropzone, [makeFile('a.pdf', 'application/pdf'), makeFile('b.pdf', 'application/pdf')]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Pilih satu file saja untuk setiap bukti.');
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument();
  });

  it('menyimpan file hasil drop lewat handler Simpan Bukti yang sama lalu mengosongkan pilihan file', async () => {
    const user = userEvent.setup();
    const file = makeFile('bukti-drop.pdf', 'application/pdf');
    const savedProof = {
      id: 'proof-1', amount: 125000, transferDate: '2026-08-20', note: 'Transfer pagi',
      attachment: { id: 'att-1', name: 'bukti-drop.pdf', path: 'att-1' },
    };
    addExpenseTransferProof.mockResolvedValue(savedProof);
    renderModal();
    const dropzone = await findDropzone();
    await user.type(screen.getByLabelText('Catatan bukti transfer'), 'Transfer pagi');
    dropFiles(dropzone, [file]);
    await screen.findByText('bukti-drop.pdf');
    fetchExpenseTransferProofs.mockResolvedValue([savedProof]);

    await user.click(screen.getByRole('button', { name: 'Simpan Bukti' }));

    await waitFor(() => expect(addExpenseTransferProof).toHaveBeenCalledTimes(1));
    expect(addExpenseTransferProof).toHaveBeenCalledWith('expense-1', {
      amount: 125000,
      transferDate: '2026-08-20',
      note: 'Transfer pagi',
      proofFile: file,
    });
    await user.click(await screen.findByRole('button', { name: 'Tambah Bukti' }));
    const freshDropzone = await findDropzone();
    expect(within(freshDropzone).getByText('Tarik bukti transfer ke sini')).toBeInTheDocument();
    expect(within(freshDropzone).queryByText('bukti-drop.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan Bukti' })).toBeDisabled();
  });

  it('menghapus file terpilih tanpa mengubah nominal, tanggal, dan catatan', async () => {
    const user = userEvent.setup();
    renderModal();
    const dropzone = await findDropzone();
    const amountInput = screen.getByLabelText('Nominal bukti transfer');
    await user.clear(amountInput);
    await user.type(amountInput, '99000');
    fireEvent.change(screen.getByLabelText('Tanggal bukti transfer'), { target: { value: '2026-08-21' } });
    await user.type(screen.getByLabelText('Catatan bukti transfer'), 'Transfer kedua');
    dropFiles(dropzone, [makeFile('bukti-hapus.pdf', 'application/pdf')]);
    await screen.findByText('bukti-hapus.pdf');

    await user.click(screen.getByRole('button', { name: 'File Bukti Transfer dihapus' }));

    expect(screen.queryByText('bukti-hapus.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Tarik bukti transfer ke sini')).toBeInTheDocument();
    expect(amountInput).toHaveValue(99000);
    expect(screen.getByLabelText('Tanggal bukti transfer')).toHaveValue('2026-08-21');
    expect(screen.getByLabelText('Catatan bukti transfer')).toHaveValue('Transfer kedua');
    expect(screen.getByRole('button', { name: 'Simpan Bukti' })).toBeDisabled();
  });

  it('tidak mengubah daftar Bukti Pembayaran Finance yang sudah tersimpan', async () => {
    const user = userEvent.setup();
    fetchExpenseTransferProofs.mockResolvedValue([{
      id: 'proof-existing', amount: 125000, transferDate: '2026-08-20', note: 'Bukti lama',
      attachment: { id: 'att-existing', name: 'bukti-lama.pdf', path: 'att-existing' },
    }]);
    renderModal();
    await user.click(await screen.findByRole('button', { name: 'Tambah Bukti' }));
    const dropzone = await findDropzone();

    dropFiles(dropzone, [makeFile('bukti-baru.pdf', 'application/pdf')]);

    await screen.findByText('bukti-baru.pdf');
    const savedSection = screen.getByText('Bukti Pembayaran Finance').closest('section');
    expect(within(savedSection).getByText('bukti-lama.pdf')).toBeInTheDocument();
    expect(within(savedSection).getByText('1 bukti')).toBeInTheDocument();
    expect(within(savedSection).queryByText('bukti-baru.pdf')).not.toBeInTheDocument();
    expect(addExpenseTransferProof).not.toHaveBeenCalled();
    expect(updateExpenseTransferProof).not.toHaveBeenCalled();
    expect(deleteExpenseTransferProof).not.toHaveBeenCalled();
  });
});
