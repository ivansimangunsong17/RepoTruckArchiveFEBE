import { describe, expect, it } from 'vitest';
import {
  buildDriverCommissionCsvRows,
  driverCommissionFinanceStatus,
  driverCommissionProofStatus,
  driverCommissionStatusLabel,
  isFullyDeductedCommission,
  summarizeDriverCommissions,
} from './driverCommissionCsv';

const fullyDeductedDriver = {
  driverName: 'Rahmat',
  paymentMethod: 'bank',
  bankName: 'BCA',
  bankAccountNumber: '123456',
  bankAccountHolder: 'Rahmat',
  batchStatus: 'paid',
  paymentStatus: 'paid',
  totalAmount: 500000,
  grossAmount: 500000,
  deductionAmount: 500000,
  netAmount: 0,
  items: [
    {
      completedDate: '2026-09-20',
      soNumber: 'SO-001',
      containerNumber: 'CONT-001',
      containerSize: '20FT',
      customerName: 'PT A',
      destination: 'Cikarang',
      truckPlateNumber: 'B 1000 AA',
      amount: 500000,
    },
  ],
};

describe('driverCommissionCsv', () => {
  it('memberi status khusus untuk komisi yang lunas via potongan penuh', () => {
    expect(isFullyDeductedCommission(fullyDeductedDriver)).toBe(true);
    expect(driverCommissionFinanceStatus(fullyDeductedDriver)).toBe('deducted_paid');
    expect(driverCommissionStatusLabel(fullyDeductedDriver)).toBe('Lunas via Potongan');
    expect(driverCommissionProofStatus(fullyDeductedDriver)).toBe('Tidak Ada Transfer');
  });

  it('CSV menulis status Lunas via Potongan untuk payment net nol tanpa bukti transfer', () => {
    const rows = buildDriverCommissionCsvRows([fullyDeductedDriver], {
      periodStart: '2026-09-20',
      periodEnd: '2026-09-26',
      batchStatus: 'paid',
    });

    expect(rows).toEqual([
      expect.arrayContaining([
        'Rahmat',
        500000,
        500000,
        0,
        'Lunas via Potongan',
        'paid',
      ]),
    ]);
  });

  it('summary menjaga net amount tidak negatif ketika potongan penuh', () => {
    expect(summarizeDriverCommissions([
      {
        totalAmount: 500000,
        deductionAmount: 600000,
      },
    ])).toEqual({
      grossAmount: 500000,
      deductionAmount: 600000,
      netAmount: 0,
    });
  });
});
