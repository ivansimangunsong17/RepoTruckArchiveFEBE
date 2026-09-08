import { describe, expect, it } from 'vitest';
import { getChassisRow } from './TrucksPage';

describe('getChassisRow', () => {
  it('mencocokkan berdasarkan chassisCode yang persis', () => {
    const rows = [{ id: 'c1', chassisCode: 'CHS-A', capacity: '20FT' }];
    expect(getChassisRow(rows, 'CHS-A')?.id).toBe('c1');
  });

  it('tidak salah tangkap chassis lain yang nomor KIR-nya kebetulan sama dengan kode chassis yang dicari', () => {
    // Reproduksi bug nyata: chassis "CHS-A" datanya berantakan (nomor KIR-nya kepasang kode chassis
    // lain, "CHS-B"), sementara chassis "CHS-B" sendiri benar-benar ada dengan kodenya sendiri.
    // Truck yang chassisnya benar-benar "CHS-B" HARUS ketemu chassis B, bukan chassis A.
    const rows = [
      { id: 'chassis-a', chassisCode: 'CHS-A', kirNumber: 'CHS-B', capacity: '20FT' },
      { id: 'chassis-b', chassisCode: 'CHS-B', kirNumber: 'KIR-B-ASLI', capacity: '40FT' },
    ];
    const match = getChassisRow(rows, 'CHS-B');
    expect(match?.id).toBe('chassis-b');
    expect(match?.capacity).toBe('40FT');
  });

  it('urutan array tidak memengaruhi hasil -- exact code match tetap menang walau chassis yang salah muncul duluan', () => {
    const rows = [
      { id: 'chassis-a', chassisCode: 'CHS-A', kirNumber: 'CHS-B' },
      { id: 'chassis-b', chassisCode: 'CHS-B' },
    ];
    expect(getChassisRow(rows, 'CHS-B')?.id).toBe('chassis-b');
  });

  it('fallback ke id/nomor KIR/plat kalau tidak ada chassisCode yang cocok (data legacy)', () => {
    const rows = [{ id: 'chassis-legacy', chassisCode: 'CHS-LEGACY', kirNumber: 'KIR-OLD-001' }];
    expect(getChassisRow(rows, 'KIR-OLD-001')?.id).toBe('chassis-legacy');
  });

  it('mengembalikan null kalau chassisValue kosong', () => {
    expect(getChassisRow([{ id: 'c1', chassisCode: 'CHS-A' }], '')).toBeNull();
  });

  it('mengembalikan null kalau tidak ada yang cocok sama sekali', () => {
    expect(getChassisRow([{ id: 'c1', chassisCode: 'CHS-A' }], 'CHS-TIDAK-ADA')).toBeNull();
  });
});
