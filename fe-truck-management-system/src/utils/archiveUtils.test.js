import { describe, expect, it } from 'vitest';
import { calculateProgress } from './calculateProgress';
import { formatCurrency } from './formatCurrency';
import { formatDate, formatDateTime } from './formatDate';
import { isRequired, isValidEmail } from './validators';

describe('calculateProgress', () => {
  it('menghitung persentase dan membulatkan hasil', () => {
    expect(calculateProgress(2, 3)).toBe(67);
  });

  it('membatasi progress maksimal 100 persen', () => {
    expect(calculateProgress(12, 10)).toBe(100);
  });

  it('mengembalikan nol jika target belum tersedia', () => {
    expect(calculateProgress(5, 0)).toBe(0);
  });
});

describe('validators', () => {
  it('menolak nilai wajib yang hanya berisi spasi', () => {
    expect(isRequired('   ')).toBe(false);
    expect(isRequired('SO-001')).toBe(true);
  });

  it('memvalidasi format email sederhana', () => {
    expect(isValidEmail('admin@armada.com')).toBe(true);
    expect(isValidEmail('admin-armada.com')).toBe(false);
  });
});

describe('formatting', () => {
  it('memformat nilai ke Rupiah', () => {
    expect(formatCurrency(1250000)).toContain('1.250.000');
  });

  it('mengembalikan tanda hubung untuk tanggal kosong', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDateTime('')).toBe('-');
  });

  it('memformat tanggal valid menggunakan locale Indonesia', () => {
    expect(formatDate('2026-06-23')).toMatch(/23.*Juni.*2026/i);
  });

  it('tidak menggeser tanggal saat menerima format YYYY-MM-DD', () => {
    expect(formatDate('2026-07-17')).toMatch(/17.*Juli.*2026/i);
  });

  it('memformat tanggal dan jam dengan keterangan WIB', () => {
    expect(formatDateTime('2026-08-07T10:35:00+07:00')).toMatch(/07.*Agustus.*2026.*10:35.*WIB/i);
  });
});
