import { describe, expect, it, vi } from 'vitest';
import { getChassisRow, prepareTruckSave } from './TrucksPage';

describe('prepareTruckSave sopir default', () => {
  const driverRows = [{ id: 'drv-1', name: 'SUWITO' }, { id: 'drv-2', name: 'TISMAN' }];
  const rows = [
    { id: 'unit-a', unitCode: 'A', plateNumber: 'B 1 A', defaultDriverId: 'drv-1', defaultDriver: 'SUWITO' },
    { id: 'unit-b', unitCode: 'B', plateNumber: 'B 2 B', defaultDriverId: null, defaultDriver: '' },
  ];

  it('memindahkan sopir A ke B: kirim ID, minta konfirmasi, dan tidak mem-PATCH unit A dari frontend', async () => {
    const confirmAction = vi.fn().mockResolvedValue(true);
    const prepared = await prepareTruckSave({
      payload: { ...rows[1], defaultDriverId: 'drv-1' },
      editingId: 'unit-b',
      rows,
      confirmAction,
      driverRows,
      masterDatabaseMode: true,
    });
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(prepared.payload).toMatchObject({ defaultDriverId: 'drv-1', defaultDriver: 'SUWITO' });
    expect(prepared.relatedRows).toEqual([]);
  });

  it('mengubah data kendaraan tanpa mengganti sopir tidak meminta konfirmasi pindah sopir', async () => {
    const confirmAction = vi.fn().mockResolvedValue(true);
    const prepared = await prepareTruckSave({
      payload: { ...rows[0], plateNumber: 'B 1 AA' },
      editingId: 'unit-a',
      rows,
      confirmAction,
      driverRows,
    });
    expect(confirmAction).not.toHaveBeenCalled();
    expect(prepared.payload).toMatchObject({ defaultDriverId: 'drv-1', defaultDriver: 'SUWITO', plateNumber: 'B 1 AA' });
  });

  it('membatalkan konfirmasi pindah sopir tidak menyimpan apa pun', async () => {
    const prepared = await prepareTruckSave({
      payload: { ...rows[1], defaultDriverId: 'drv-1' },
      editingId: 'unit-b',
      rows,
      confirmAction: vi.fn().mockResolvedValue(false),
      driverRows,
    });
    expect(prepared).toBeNull();
  });
});

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
