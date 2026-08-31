import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OperationsPage from './OperationsPage';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { useArchiveData } from '../../hooks/useArchiveData';
import { fetchContainerJobsPage } from '../../services/archive/containerJobService';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useFeedback', () => ({
  useFeedback: vi.fn(),
}));

vi.mock('../../hooks/useArchiveData', () => ({
  useArchiveData: vi.fn(),
}));

vi.mock('../../services/archive/containerJobService', () => ({
  cancelContainerJob: vi.fn(),
  fetchContainerJob: vi.fn(),
  fetchContainerJobsPage: vi.fn(),
  generateContainerJobSpk: vi.fn(),
}));

function runningJobRow(overrides = {}) {
  return {
    id: 'job-1',
    soNumber: 'SO-001',
    customer: 'PT Contoh',
    containerNumber: 'TCLU1234567',
    driver: 'Budi',
    plateNumber: 'B 1234 XYZ',
    status: 'running',
    tripDate: '2026-07-11',
    receivedAt: '2026-07-10T08:00:00.000Z',
    runningAt: '2026-07-11T07:00:00.000Z',
    ...overrides,
  };
}

describe('OperationsPage status inap', () => {
  const notify = vi.fn();
  const updateJob = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { id: 'user-1', role: 'operational', fullName: 'Ops Test' },
    });
    useFeedback.mockReturnValue({ notify, confirmAction: vi.fn().mockResolvedValue(true) });
    useArchiveData.mockReturnValue({
      isDatabaseMode: true,
      orders: [],
      masters: { trucks: [], drivers: [], destinations: [], depots: [] },
      updateJob,
      refresh: vi.fn(),
    });
    fetchContainerJobsPage.mockResolvedValue({
      rows: [runningJobRow()],
      total: 1,
      totalRows: 1,
      counts: { received: 0, running: 1, inap: 0, repo_stored: 0, completed: 0, cancelled: 0 },
      rpujCounts: { queue: 0, submitted: 0, approved: 0, paid: 0 },
    });
  });

  it('menandai job sebagai inap lewat modal, tanpa field harga sama sekali', async () => {
    const user = userEvent.setup();
    updateJob.mockResolvedValue(runningJobRow({ status: 'inap', inapReason: 'Curfew malam', inapStartedAt: '2026-07-11T20:00:00.000Z' }));

    render(<OperationsPage />);

    await user.click(await screen.findByRole('button', { name: /Tandai Inap/i }));

    expect(screen.getByRole('heading', { name: 'Tandai Inap' })).toBeInTheDocument();
    // Operational tidak pernah melihat input harga di form ini.
    expect(screen.queryByText(/harga/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/harga/i)).not.toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /Simpan Inap/i });
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Curfew malam/i), 'Curfew malam, truk tidak boleh jalan sampai subuh');
    expect(saveButton).not.toBeDisabled();

    await user.click(saveButton);

    await waitFor(() => expect(updateJob).toHaveBeenCalledWith('job-1', expect.objectContaining({
      status: 'inap',
      inapReason: 'Curfew malam, truk tidak boleh jalan sampai subuh',
    })));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Container ditandai inap' }));
  });

  it('menampilkan tombol Selesai Inap dan histori inap untuk job yang sedang inap, tanpa tombol Tandai Inap lagi', async () => {
    fetchContainerJobsPage.mockResolvedValue({
      rows: [runningJobRow({
        status: 'inap',
        inapReason: 'Curfew malam, truk tidak boleh jalan sampai subuh',
        inapStartedAt: '2026-07-11T20:00:00.000Z',
      })],
      total: 1,
      totalRows: 1,
      counts: { received: 0, running: 0, inap: 1, repo_stored: 0, completed: 0, cancelled: 0 },
      rpujCounts: { queue: 0, submitted: 0, approved: 0, paid: 0 },
    });
    updateJob.mockResolvedValue(runningJobRow({ status: 'running', inapReason: 'Curfew malam, truk tidak boleh jalan sampai subuh' }));

    const user = userEvent.setup();
    render(<OperationsPage />);

    expect(await screen.findByRole('button', { name: /Selesai Inap/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Tandai Inap/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Selesai Inap/i }));

    await waitFor(() => expect(updateJob).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'running' })));
  });

  it('mengirim filter tanggal selesai ke API Container Job', async () => {
    render(<OperationsPage />);

    const completedDateInput = await screen.findByLabelText(/filter tanggal selesai/i);
    fireEvent.change(completedDateInput, { target: { value: '2026-07-12' } });

    await waitFor(() => expect(fetchContainerJobsPage).toHaveBeenCalledWith(expect.objectContaining({
      completedDate: '2026-07-12',
    })));
  });
});
