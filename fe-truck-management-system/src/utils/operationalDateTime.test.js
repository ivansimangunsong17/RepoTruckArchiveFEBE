import { describe, expect, it } from 'vitest';
import { nowWibInput, toOperationalIso, toWibInput } from './operationalDateTime';

describe('tanggal dan jam operasional WIB', () => {
  it('menyimpan tanggal aktual sebagai WIB tanpa mengikuti zona waktu browser', () => {
    expect(toOperationalIso('2026-09-23T10:00')).toBe('2026-09-23T03:00:00.000Z');
    expect(toOperationalIso('2026-10-09T15:36')).toBe('2026-10-09T08:36:00.000Z');
    expect(toWibInput('2026-10-09T08:41:00.000Z')).toBe('2026-10-09T15:41');
    expect(nowWibInput(new Date('2026-10-09T08:36:00.000Z'))).toBe('2026-10-09T15:36');
  });

  it('tidak membuat tanggal atau jam yang belum diisi dan menolak nilai tidak valid', () => {
    for (const value of ['', '2026-10-09T', 'T15:36', '2026-10-09T25:00', '2026-02-30T15:36']) {
      expect(toOperationalIso(value)).toBeNull();
    }
  });
});
