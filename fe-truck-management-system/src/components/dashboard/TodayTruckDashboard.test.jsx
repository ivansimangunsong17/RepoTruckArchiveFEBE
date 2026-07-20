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

  it('menampilkan No dan No Lambung serta mengurutkan truck 20FT di atas 40FT', async () => {
    fetchDashboardReport.mockResolvedValue({
      trucks: [
        {
          id: 'truck-40',
          plateNumber: 'B 4000 XYZ',
          unitCode: 'TRK-001',
          capacity: '40FT',
          chassisSize: '40FT',
          defaultDriver: 'Budi',
        },
        {
          id: 'truck-20',
          plateNumber: 'B 2000 XYZ',
          unitCode: 'TRK-099',
          capacity: '20FT',
          chassisSize: '20FT',
          defaultDriver: 'Andi',
        },
      ],
      activeJobs: [],
    });

    render(<TodayTruckDashboard />);

    expect(await screen.findByRole('columnheader', { name: 'No Lambung' })).toBeInTheDocument();
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('1');
    expect(rows[1]).toHaveTextContent('99');
    expect(rows[1]).toHaveTextContent('20FT');
    expect(rows[2]).toHaveTextContent('2');
    expect(rows[2]).toHaveTextContent('1');
    expect(rows[2]).toHaveTextContent('40FT');
  });
});
