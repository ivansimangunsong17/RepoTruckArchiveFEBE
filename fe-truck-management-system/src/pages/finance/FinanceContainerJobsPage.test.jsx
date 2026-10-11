import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import FinanceContainerJobsPage from './FinanceContainerJobsPage';
import { fetchContainerJob, fetchContainerJobAssignmentHistory, fetchContainerJobsPage } from '../../services/archive/containerJobService';

vi.mock('../../services/archive/containerJobService', () => ({
  fetchContainerJobsPage: vi.fn(), fetchContainerJob: vi.fn(), fetchContainerJobAssignmentHistory: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchContainerJobsPage.mockResolvedValue({ rows: [{ id: 'job-1', soNumber: 'SO-1', customer: 'Customer ABC', containerNumber: 'CONT-1', size: '20FT', status: 'repo_stored', tripDate: '2026-09-01' }], total: 1 });
  fetchContainerJob.mockResolvedValue({
    id: 'job-1', soNumber: 'SO-1', customer: 'Customer ABC', containerNumber: 'CONT-1', status: 'repo_stored',
    tripDate: '2026-09-01', runningAt: '2026-09-01T01:00:00.000Z', repoStoredAt: '2026-09-01T04:00:00.000Z',
    repoPickedUpAt: '2026-09-02T01:00:00.000Z', completedAt: '2026-09-02T05:00:00.000Z',
    driver: 'Sopir A', plateNumber: 'B 1234', expenses: [{ id: 'expense-1', category: 'UJ', amount: 100000, financeCheckStatus: 'sudah_dicek' }],
  });
  fetchContainerJobAssignmentHistory.mockResolvedValue([]);
});

it('Finance mencari, membuka detail Repo read only, dan melihat timeline tanpa aksi operasional', async () => {
  const user = userEvent.setup();
  render(<FinanceContainerJobsPage />);
  expect(await screen.findByText('CONT-1 (20FT)')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Cari container, SO, atau customer'), 'CONT');
  await user.selectOptions(screen.getByLabelText('Status'), 'repo_stored');
  await waitFor(() => expect(fetchContainerJobsPage).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'CONT', status: 'repo_stored', page: 1 })));
  await user.click(screen.getByRole('button', { name: 'Detail' }));
  expect(await screen.findByText('Container Dititipkan', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText(/Pickup \/ Mulai Perjalanan Repo/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Detail Container Job · Read Only/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /simpan|mulai perjalanan|pickup repo|selesai final|batal job/i })).not.toBeInTheDocument();
});
