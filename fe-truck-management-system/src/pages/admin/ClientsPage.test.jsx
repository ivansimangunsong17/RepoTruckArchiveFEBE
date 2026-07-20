import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClientsPage from './ClientsPage';

vi.mock('../../hooks/useArchiveData', () => ({
  useArchiveData: () => ({
    masters: {
      users: [
        { id: 'user-sales-1', name: 'Sinta Sales', role: 'sales', status: 'Aktif' },
        { id: 'user-ops-1', name: 'Budi Ops', role: 'operational', status: 'Aktif' },
        { id: 'user-sales-2', name: 'Sales Nonaktif', role: 'sales', status: 'Nonaktif' },
      ],
    },
  }),
}));

vi.mock('../../components/master/MasterDataPage', () => ({
  default: ({ columns, fields }) => {
    const row = {
      name: 'PT Contoh Customer',
      npwp: '01.234.567.8-999.000',
      pic: 'Budi PIC',
      phone: '08123456789',
      contractNumber: 'UC/CONTOH/001',
      salesName: 'Sales Armada 01',
      npwpDocument: { name: 'NPWP-Customer.pdf', path: 'npwp-document-id' },
      contractDocument: { name: 'Umbrella-Contract.pdf', path: 'contract-document-id' },
    };
    return (
      <>
        <table>
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Aksi</th></tr></thead>
          <tbody>
            <tr>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row[column.key], row, { rowNumber: 1 }) : row[column.key]}
                </td>
              ))}
              <td>Aksi</td>
            </tr>
          </tbody>
        </table>
        <div data-testid="field-list">{fields.map((field) => field.key).join(',')}</div>
        <div data-testid="sales-field-type">{fields.find((field) => field.key === 'salesName')?.type}</div>
        <div data-testid="sales-field-options">
          {fields.find((field) => field.key === 'salesName')?.options({ salesName: '' }).map((option) => option.label).join(',')}
        </div>
      </>
    );
  },
}));

describe('ClientsPage', () => {
  it('menampilkan susunan kolom customer yang lengkap', () => {
    render(<ClientsPage />);
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'No', 'Customer', 'NPWP', 'PIC', 'Kontak', 'Copy NPWP', 'UB', 'Sales', 'Aksi',
    ]);
    expect(screen.getByText('PT Contoh Customer')).toBeInTheDocument();
    expect(screen.getByText('01.234.567.8-999.000')).toBeInTheDocument();
    expect(screen.getByText('Sales Armada 01')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View NPWP-Customer.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Umbrella-Contract.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument();
    expect(screen.queryByText('UC/CONTOH/001')).not.toBeInTheDocument();
    expect(screen.getByTestId('field-list')).toHaveTextContent('salesName');
    expect(screen.getByTestId('field-list')).not.toHaveTextContent('companyProfileDocument');
    expect(screen.getByTestId('field-list')).not.toHaveTextContent('legalDocument');
    expect(screen.getByTestId('field-list')).not.toHaveTextContent('otherDocument');
  });

  it('mengambil pilihan nama sales dari User Management role Sales aktif', () => {
    render(<ClientsPage />);

    expect(screen.getByTestId('sales-field-type')).toHaveTextContent('select');
    expect(screen.getByTestId('sales-field-options')).toHaveTextContent('Pilih sales,Sinta Sales');
    expect(screen.getByTestId('sales-field-options')).not.toHaveTextContent('Budi Ops');
    expect(screen.getByTestId('sales-field-options')).not.toHaveTextContent('Sales Nonaktif');
  });
});
