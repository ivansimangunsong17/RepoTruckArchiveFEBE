import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FilterStatus from './FilterStatus';

describe('FilterStatus', () => {
  it('menampilkan jumlah data tanpa tombol reset saat filter tidak aktif', () => {
    render(<FilterStatus total={20} filtered={20} label="sales order" />);

    expect(screen.getByText(/Menampilkan/)).toHaveTextContent('20 dari 20 sales order');
    expect(screen.queryByRole('button', { name: /reset filter/i })).not.toBeInTheDocument();
  });

  it('menjalankan reset saat filter aktif', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<FilterStatus total={20} filtered={3} active label="data" onReset={onReset} />);

    await user.click(screen.getByRole('button', { name: /reset filter/i }));

    expect(onReset).toHaveBeenCalledOnce();
  });
});
