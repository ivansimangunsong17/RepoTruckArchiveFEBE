import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OperationsPage from './OperationsPage';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { useArchiveData } from '../../hooks/useArchiveData';
import { fetchContainerJob, fetchContainerJobsPage } from '../../services/archive/containerJobService';

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
  pickupComboRepoContainerJobs: vi.fn(),
  pickupRepoContainerJob: vi.fn(),
  resetContainerJobAssignment: vi.fn(),
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
    fetchContainerJob.mockImplementation(async (id) => ({
      ...runningJobRow({ id }),
      hasDriverCommission: true,
      driverCommissionAmount: 100000,
    }));
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

  it('menampilkan job inap di Sedang Jalan dan membuka Update Ritasi untuk menyelesaikannya', async () => {
    const inapJob = runningJobRow({
      status: 'inap',
      inapReason: 'Curfew malam, truk tidak boleh jalan sampai subuh',
      inapStartedAt: '2026-07-11T20:00:00.000Z',
    });
    fetchContainerJobsPage.mockResolvedValue({
      rows: [inapJob],
      total: 1,
      totalRows: 1,
      counts: { received: 0, running: 0, inap: 1, repo_stored: 0, completed: 0, cancelled: 0 },
      rpujCounts: { queue: 0, submitted: 0, approved: 0, paid: 0 },
    });
    fetchContainerJob.mockResolvedValue({
      ...inapJob,
      hasDriverCommission: true,
      driverCommissionAmount: 100000,
    });

    const user = userEvent.setup();
    render(<OperationsPage />);

    const runningTab = await screen.findByTitle('Sedang Jalan');
    await waitFor(() => expect(runningTab).toHaveTextContent('1'));
    await user.click(runningTab);

    await waitFor(() => expect(fetchContainerJobsPage).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active_journey',
    })));
    expect(screen.getByRole('button', { name: /Update Ritasi/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Tandai Inap/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Update Ritasi/i }));

    expect(await screen.findByText('Dokumen & Closing')).toBeInTheDocument();
    expect(updateJob).not.toHaveBeenCalled();
  });

  it('mengirim filter tanggal selesai ke API Container Job', async () => {
    render(<OperationsPage />);

    const completedDateInput = await screen.findByLabelText(/filter tanggal selesai/i);
    fireEvent.change(completedDateInput, { target: { value: '2026-07-12' } });

    await waitFor(() => expect(fetchContainerJobsPage).toHaveBeenCalledWith(expect.objectContaining({
      completedDate: '2026-07-12',
    })));
  });

  it('menampilkan ringkasan party container di header sales order', async () => {
    fetchContainerJobsPage.mockResolvedValue({
      rows: [
        runningJobRow({ id: 'job-1', size: '40FT' }),
        runningJobRow({ id: 'job-2', size: '40FT', containerNumber: 'TCLU7654321' }),
        runningJobRow({ id: 'job-3', size: '20FT', containerNumber: 'TCLU7654322' }),
      ],
      total: 3,
      totalRows: 3,
      counts: { received: 0, running: 3, inap: 0, repo_stored: 0, completed: 0, cancelled: 0 },
      rpujCounts: { queue: 0, submitted: 0, approved: 0, paid: 0 },
    });

    render(<OperationsPage />);

    expect(await screen.findByText('Party 1 x 20FT + 2 x 40FT')).toBeInTheDocument();
  });

  it('menampilkan toolbar combo saat dua container titip 20FT dipilih', async () => {
    const repoJob = (id, containerNumber) => runningJobRow({
      id,
      containerNumber,
      status: 'repo_stored',
      size: '20FT',
      repoLocation: 'DEPO TGI',
      repoStoredAt: '2026-09-22T02:00:00.000Z',
      repoReason: 'Menunggu ambil lanjutan',
      repoContainerCondition: 'empty',
    });
    fetchContainerJobsPage.mockResolvedValue({
      rows: [repoJob('repo-1', 'MSDU1111111'), repoJob('repo-2', 'MSDU2222222')],
      total: 1,
      totalRows: 2,
      counts: { received: 0, running: 0, inap: 0, repo_stored: 2, completed: 0, cancelled: 0 },
      rpujCounts: { queue: 0, submitted: 0, approved: 0, paid: 0 },
    });

    const user = userEvent.setup();
    render(<OperationsPage />);

    const comboChecks = await screen.findAllByRole('checkbox', { name: /combo/i });
    expect(comboChecks).toHaveLength(2);
    await user.click(comboChecks[0]);
    await user.click(comboChecks[1]);

    expect(screen.getByText('2/2 container 20FT dipilih')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Combo 2x20/i })).not.toBeDisabled();
  });

  it('menampilkan ringkasan pickup combo di detail tanpa menganggap dokumen container lain lengkap', async () => {
    const comboJob = runningJobRow({
      id: 'combo-1',
      containerNumber: 'MSDU1111111',
      status: 'running',
      repoLocation: 'DEPO TGI',
      repoStoredAt: '2026-09-22T02:00:00.000Z',
      repoPickedUpAt: '2026-09-22T04:00:00.000Z',
      pickupMovement: {
        id: 'movement-1',
        type: 'combo_2x20',
        sequenceNo: 1,
        itemCount: 2,
        containerNumbers: ['MSDU1111111', 'MSDU2222222'],
      },
      travelDocumentFile: { name: 'surat-jalan-1.pdf', path: '/docs/surat-jalan-1.pdf' },
    });
    fetchContainerJobsPage.mockResolvedValue({
      rows: [comboJob],
      total: 1,
      totalRows: 1,
      counts: { received: 0, running: 1, inap: 0, repo_stored: 0, completed: 0, cancelled: 0 },
      rpujCounts: { queue: 0, submitted: 0, approved: 0, paid: 0 },
    });
    fetchContainerJob.mockResolvedValue(comboJob);

    const user = userEvent.setup();
    render(<OperationsPage />);

    await user.click(await screen.findByRole('button', { name: /Detail/i }));

    expect(await screen.findByText('Pickup Movement')).toBeInTheDocument();
    expect(screen.getByText('Combo 2x20')).toBeInTheDocument();
    expect(screen.getByText('MSDU1111111 + MSDU2222222')).toBeInTheDocument();
    expect(screen.getAllByText('1/4').length).toBeGreaterThanOrEqual(1);
  });

});
