import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DataTable from './DataTable';

const columns = [
  { key: 'name', label: 'Nama' },
  {
    key: 'status',
    label: 'Status',
    render: (value) => <strong>{value.toUpperCase()}</strong>,
  },
];

describe('DataTable', () => {
  it('menampilkan data dan custom renderer', () => {
    render(<DataTable columns={columns} rows={[{ id: '1', name: 'Truck A', status: 'aktif' }]} />);

    expect(screen.getByText('Truck A')).toBeInTheDocument();
    expect(screen.getByText('AKTIF')).toBeInTheDocument();
    expect(screen.getByText('AKTIF').closest('td')).toHaveAttribute('data-label', 'Status');
  });

  it('menampilkan empty state saat tidak ada data', () => {
    render(<DataTable columns={columns} rows={[]} />);

    expect(screen.getByText(/Belum ada data/i)).toBeInTheDocument();
  });
});
