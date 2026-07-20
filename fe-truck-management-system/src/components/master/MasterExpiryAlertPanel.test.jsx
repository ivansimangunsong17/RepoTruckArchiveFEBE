import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MasterExpiryAlertPanel from './MasterExpiryAlertPanel';

describe('MasterExpiryAlertPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20, 9, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('menampilkan ringkasan dan daftar tenggat master secara otomatis', () => {
    render(
      <MasterExpiryAlertPanel
        singular="Truck"
        getIdentity={(row) => row.plateNumber}
        fields={[
          { key: 'stnkExpiryDate', label: 'STNK OFF', expiryAlert: { label: 'STNK' } },
          { key: 'kirExpiryDate', label: 'KIR OFF', expiryAlert: { label: 'KIR Truck' } },
        ]}
        rows={[
          { id: '1', plateNumber: 'B 1000 ARM', stnkExpiryDate: '2026-07-19', kirExpiryDate: '2026-07-25' },
          { id: '2', plateNumber: 'B 2000 ARM', stnkExpiryDate: '2026-08-10', kirExpiryDate: '' },
        ]}
      />,
    );

    const panel = screen.getByRole('region', { name: 'Peringatan masa berlaku' });
    expect(within(panel).getByText('3 tenggat perlu perhatian')).toBeInTheDocument();
    expect(within(panel).getAllByText('B 1000 ARM')).toHaveLength(2);
    expect(within(panel).getByText(/1 tanggal belum diisi/)).toBeInTheDocument();

    const summary = within(panel).getByLabelText('Ringkasan masa berlaku');
    expect(within(summary).getByText('Sudah Lewat').parentElement).toHaveTextContent('1');
    expect(within(summary).getByText('Segera Urus').parentElement).toHaveTextContent('1');
    expect(within(summary).getByText('Mau Habis').parentElement).toHaveTextContent('1');
    expect(within(summary).getByText('Belum Diisi').parentElement).toHaveTextContent('1');
  });
});
