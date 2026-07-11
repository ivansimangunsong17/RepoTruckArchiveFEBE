import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityLogPage from './ActivityLogPage';
import { fetchActivityLogPage } from '../../services/system/activityLogService';

vi.mock('../../services/system/activityLogService', () => ({
  fetchActivityLogPage: vi.fn(),
  isActivityLogDatabaseEnabled: () => true,
}));

const rows = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  time: `2026-06-${String(23 - index).padStart(2, '0')}T09:00:00+07:00`,
  user: index === 10 ? 'Sarah Sales' : 'Budi Admin',
  role: index === 10 ? 'sales' : 'admin',
  action: index === 10 ? 'CREATE_SALES_ORDER' : `Aktivitas ${index + 1}`,
  target: `Data ${index + 1}`,
  module: index === 10 ? 'sales_orders' : 'auth',
}));

describe('ActivityLogPage', () => {
  beforeEach(() => {
    fetchActivityLogPage.mockImplementation(async ({
      page,
      role,
      action,
      module,
      dateFrom,
      dateTo,
    }) => {
      const filtered = rows.filter((item) => (
        (!role || item.role === role)
        && (!action || item.action === action)
        && (!module || item.module === module)
        && (!dateFrom || item.time.slice(0, 10) >= dateFrom)
        && (!dateTo || item.time.slice(0, 10) <= dateTo)
      ));
      return {
        total: filtered.length,
        rows: filtered.slice((page - 1) * 10, page * 10),
      };
    });
  });

  it('membagi Activity Log menjadi 10 data per halaman', async () => {
    const user = userEvent.setup();
    render(<ActivityLogPage />);

    expect(await screen.findByText('Aktivitas 1')).toBeInTheDocument();
    expect(screen.queryByText('Data 11')).not.toBeInTheDocument();
    expect(screen.getByText('Halaman 1 dari 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));

    expect(await screen.findByText('Data 11')).toBeInTheDocument();
    expect(screen.getByText('Menampilkan 11–12 dari 12 aktivitas')).toBeInTheDocument();
  });

  it('kembali ke halaman pertama dan memfilter berdasarkan role', async () => {
    const user = userEvent.setup();
    render(<ActivityLogPage />);
    await screen.findByText('Aktivitas 1');

    await user.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    await user.selectOptions(screen.getByLabelText('Filter role'), 'sales');

    await waitFor(() => expect(screen.getByText('Halaman 1 dari 1')).toBeInTheDocument());
    expect(screen.getByText('Sarah Sales')).toBeInTheDocument();
    expect(screen.queryByText('Budi Admin')).not.toBeInTheDocument();
  });

  it('mengirim filter modul, aksi, dan tanggal ke API', async () => {
    const user = userEvent.setup();
    render(<ActivityLogPage />);
    await screen.findByText('Aktivitas 1');

    await user.selectOptions(screen.getByLabelText('Filter modul'), 'sales_orders');
    await user.selectOptions(screen.getByLabelText('Filter aksi'), 'CREATE_SALES_ORDER');
    fireEvent.change(screen.getByLabelText('Tanggal dari'), { target: { value: '2026-06-13' } });
    fireEvent.change(screen.getByLabelText('Tanggal sampai'), { target: { value: '2026-06-13' } });

    await waitFor(() => {
      expect(fetchActivityLogPage).toHaveBeenLastCalledWith(expect.objectContaining({
        module: 'sales_orders',
        action: 'CREATE_SALES_ORDER',
        dateFrom: '2026-06-13',
        dateTo: '2026-06-13',
      }));
    });
    expect(screen.getByText('Data 11')).toBeInTheDocument();
  });
});
