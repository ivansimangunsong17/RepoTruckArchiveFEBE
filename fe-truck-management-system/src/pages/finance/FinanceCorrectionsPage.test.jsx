import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceCorrectionsPage from './FinanceCorrectionsPage';
import {
  approveFinanceCorrection,
  fetchFinanceCorrections,
  rejectFinanceCorrection,
} from '../../services/finance/financeService';

vi.mock('../../services/finance/financeService', () => ({
  approveFinanceCorrection: vi.fn(),
  fetchFinanceCorrections: vi.fn(),
  rejectFinanceCorrection: vi.fn(),
}));

const correctionRow = {
  id: 'correction-1',
  soNumber: 'SO-TEST-001',
  invoiceNumber: 'INV-OLD',
  customer: 'PT Customer Test',
  destination: 'Cikarang',
  correctionType: 'invoice_number',
  currentValue: 'INV-OLD',
  requestedValue: 'INV-NEW',
  reason: 'Nomor invoice salah input.',
  status: 'pending',
  requestedByName: 'Finance Test',
  requestedAt: '2026-07-24T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchFinanceCorrections.mockResolvedValue({
    rows: [correctionRow],
    summary: { pending: 1, applied: 0, rejected: 0 },
  });
  approveFinanceCorrection.mockResolvedValue({ ...correctionRow, status: 'applied' });
  rejectFinanceCorrection.mockResolvedValue({ ...correctionRow, status: 'rejected' });
});

describe('FinanceCorrectionsPage', () => {
  it('menampilkan daftar koreksi pending dan approve lewat modal Admin', async () => {
    const user = userEvent.setup();
    render(<FinanceCorrectionsPage />);

    expect(await screen.findByText('SO-TEST-001')).toBeInTheDocument();
    expect(screen.getByText('INV-OLD')).toBeInTheDocument();
    expect(screen.getByText('INV-NEW')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.type(screen.getByLabelText(/Catatan Admin/i), 'Nomor sudah dicek.');
    await user.click(screen.getAllByRole('button', { name: 'Approve' }).at(-1));

    await waitFor(() => {
      expect(approveFinanceCorrection).toHaveBeenCalledWith('correction-1', 'Nomor sudah dicek.');
    });
  });

  it('mewajibkan catatan saat reject koreksi', async () => {
    const user = userEvent.setup();
    render(<FinanceCorrectionsPage />);

    await screen.findByText('SO-TEST-001');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getAllByRole('button', { name: 'Reject' }).at(-1));

    expect(await screen.findByText('Catatan reject wajib diisi.')).toBeInTheDocument();
    expect(rejectFinanceCorrection).not.toHaveBeenCalled();
  });
});
