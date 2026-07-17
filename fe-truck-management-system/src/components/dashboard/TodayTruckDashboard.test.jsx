import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TodayTruckDashboard from './TodayTruckDashboard';
import { fetchDashboardReport } from '../../services/reports/reportService';

vi.mock('../../services/reports/reportService', () => ({
  fetchDashboardReport: vi.fn(),
}));

describe('TodayTruckDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDashboardReport.mockResolvedValue({
      trucks: [
        {
          id: 'truck-1',
          plateNumber: 'B 1234 XYZ',
          unitCode: 'TRK-001',
          capacity: '20FT',
          chassisCode: 'CH-001',
          chassisSize: '20FT',
          defaultDriver: 'Andi Pratama',
        },
      ],
      activeJobs: [],
    });
  });

  it('menampilkan hanya size chassis di dashboard', async () => {
    const user = userEvent.setup();
    render(<TodayTruckDashboard />);

    await waitFor(() => expect(fetchDashboardReport).toHaveBeenCalled());
    expect(screen.queryByText('CH-001')).not.toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: '20FT' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Detail' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('20FT');
    expect(screen.queryByText('CH-001')).not.toBeInTheDocument();
  });
});
