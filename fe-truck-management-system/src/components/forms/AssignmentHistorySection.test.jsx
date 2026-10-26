import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AssignmentHistorySection from './AssignmentHistorySection';
import { fetchContainerJobAssignmentHistory } from '../../services/archive/containerJobService';

vi.mock('../../services/archive/containerJobService', () => ({
  fetchContainerJobAssignmentHistory: vi.fn(),
}));

describe('AssignmentHistorySection', () => {
  it('menampilkan riwayat sopir A -> sopir B dengan label Ambil Titip', async () => {
    fetchContainerJobAssignmentHistory.mockResolvedValueOnce([
      {
        id: 'h-1',
        changeSource: 'repo_pickup',
        previousDriverName: 'Sopir A',
        nextDriverName: 'Sopir B',
        previousPlateNumber: 'B 1 AA',
        nextPlateNumber: 'B 2 BB',
        changedByName: 'Ops',
        createdAt: '2026-10-20T02:00:00.000Z',
      },
    ]);
    render(<AssignmentHistorySection containerJobId="job-1" />);

    expect(await screen.findByText('Ambil Titip')).toBeInTheDocument();
    expect(screen.getByText('Sopir: Sopir A > Sopir B')).toBeInTheDocument();
    expect(screen.getByText('Truck: B 1 AA > B 2 BB')).toBeInTheDocument();
    expect(screen.queryByText('repo_pickup')).not.toBeInTheDocument();
  });

  it('label combo 2x20 dan tidak mengarang riwayat bila data lama kosong', async () => {
    fetchContainerJobAssignmentHistory.mockResolvedValueOnce([
      { id: 'h-2', changeSource: 'repo_combo_pickup', previousDriverName: 'Sopir A', nextDriverName: 'Sopir C', previousPlateNumber: 'B 1 AA', nextPlateNumber: 'B 3 CC', createdAt: '2026-10-20T02:00:00.000Z' },
    ]);
    const { unmount } = render(<AssignmentHistorySection containerJobId="job-2" />);
    expect(await screen.findByText('Ambil Titip Combo 2x20')).toBeInTheDocument();
    unmount();

    fetchContainerJobAssignmentHistory.mockResolvedValueOnce([]);
    render(<AssignmentHistorySection containerJobId="job-legacy" />);
    await vi.waitFor(() => expect(fetchContainerJobAssignmentHistory).toHaveBeenCalledWith('job-legacy'));
    expect(screen.queryByText(/Ambil Titip/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sopir:/)).not.toBeInTheDocument();
  });
});
