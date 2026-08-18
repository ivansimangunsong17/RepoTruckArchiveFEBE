import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TodayTruckDashboard from './TodayTruckDashboard';
import { fetchDashboardReport } from '../../services/reports/reportService';
import { downloadPdfReport } from '../../utils/simplePdfReport';

vi.mock('../../services/reports/reportService', () => ({
  fetchDashboardReport: vi.fn(),
}));

vi.mock('../../utils/simplePdfReport', () => ({
  downloadPdfReport: vi.fn(),
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

  it('menampilkan last update dengan tanggal dan jam WIB', async () => {
    fetchDashboardReport.mockResolvedValue({
      trucks: [
        {
          id: 'truck-1',
          plateNumber: 'B 1234 XYZ',
          unitCode: 'TRK-001',
          capacity: '20FT',
          status: 'Aktif',
        },
      ],
      activeJobs: [
        {
          id: 'job-1',
          plateNumber: 'B 1234 XYZ',
          status: 'running',
          containerNumber: 'MSCU1234567',
          updatedAt: '2026-08-17T03:35:00.000Z',
          receivedAt: '2026-08-16T02:00:00.000Z',
        },
      ],
    });

    render(<TodayTruckDashboard />);

    expect(await screen.findByText(/Last Update: 17 Agustus 2026 10:35 WIB/i)).toBeInTheDocument();
    expect(screen.getByText(/^[A-Za-z]+, \d{2} [A-Za-z]+ \d{4}$/i)).toBeInTheDocument();
    expect(screen.queryByText('Data truck yang berjalan dan belum selesai.')).not.toBeInTheDocument();
    expect(screen.queryByText('Tanggal')).not.toBeInTheDocument();
  });

  it('memakai last update pada subtitle PDF', async () => {
    const user = userEvent.setup();
    fetchDashboardReport.mockResolvedValue({
      trucks: [
        {
          id: 'truck-1',
          plateNumber: 'B 1234 XYZ',
          unitCode: 'TRK-001',
          capacity: '20FT',
          status: 'Aktif',
        },
      ],
      activeJobs: [
        {
          id: 'job-1',
          plateNumber: 'B 1234 XYZ',
          status: 'running',
          updatedAt: '2026-08-17T03:35:00.000Z',
        },
      ],
    });

    render(<TodayTruckDashboard />);
    await screen.findByText(/Last Update/i);
    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    expect(downloadPdfReport).toHaveBeenCalledWith(expect.objectContaining({
      subtitle: 'Last Update 17 Agustus 2026 10:35 WIB',
    }));
  });

  it('menampilkan hanya size chassis di dashboard', async () => {
    const user = userEvent.setup();
    render(<TodayTruckDashboard />);

    await waitFor(() => expect(fetchDashboardReport).toHaveBeenCalled());
    expect(screen.queryByText('CH-001')).not.toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: '20FT' })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
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
    let rows = [];
    await waitFor(async () => {
      rows = await screen.findAllByRole('row');
      expect(rows.length).toBeGreaterThan(2);
    });
    expect(rows[1]).toHaveTextContent('1');
    expect(rows[1]).toHaveTextContent('99');
    expect(rows[1]).toHaveTextContent('20FT');
    expect(rows[2]).toHaveTextContent('2');
    expect(rows[2]).toHaveTextContent('1');
    expect(rows[2]).toHaveTextContent('40FT');
  });

  it('tidak menghitung truck maintenance sebagai availability dashboard', async () => {
    fetchDashboardReport.mockResolvedValue({
      trucks: [
        {
          id: 'truck-active',
          plateNumber: 'B 2000 OK',
          unitCode: 'TRK-020',
          capacity: '20FT',
          status: 'Aktif',
        },
        {
          id: 'truck-maintenance',
          plateNumber: 'B 2100 MT',
          unitCode: 'TRK-021',
          capacity: '20FT',
          status: 'Maintenance',
        },
        {
          id: 'truck-inactive',
          plateNumber: 'B 2200 NA',
          unitCode: 'TRK-022',
          capacity: '40FT',
          status: 'Tidak Aktif',
        },
      ],
      activeJobs: [],
    });

    render(<TodayTruckDashboard />);

    let availabilityRegion;
    await waitFor(() => {
      expect(fetchDashboardReport).toHaveBeenCalled();
      availabilityRegion = screen.getByLabelText('Ketersediaan Truck Hari Ini');
      expect(within(availabilityRegion).getByText('20FT').closest('article')).toHaveTextContent('1 Unit');
      expect(within(availabilityRegion).getByText('40FT').closest('article')).toHaveTextContent('0 Unit');
    });
    expect((await screen.findAllByText('Maintenance')).length).toBeGreaterThan(0);
    expect(screen.getByText('Maint')).toBeInTheDocument();
  });

  it('tidak menghitung job titipan repo sebagai truck terpakai di availability', async () => {
    fetchDashboardReport.mockResolvedValue({
      trucks: [
        {
          id: 'truck-repo',
          plateNumber: 'B 2300 RP',
          unitCode: 'TRK-023',
          capacity: '20FT',
          status: 'Aktif',
        },
      ],
      activeJobs: [
        {
          id: 'job-repo',
          plateNumber: 'B 2300 RP',
          truck: 'B 2300 RP',
          status: 'repo_stored',
          containerNumber: 'CONT-REPO',
        },
      ],
    });

    render(<TodayTruckDashboard />);

    await waitFor(() => {
      const availabilityRegion = screen.getByLabelText('Ketersediaan Truck Hari Ini');
      expect(within(availabilityRegion).getByText('20FT').closest('article')).toHaveTextContent('1 Unit');
    });
    expect(screen.queryByText('CONT-REPO')).not.toBeInTheDocument();
  });
});
