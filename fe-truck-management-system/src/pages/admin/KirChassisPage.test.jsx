import { describe, expect, it } from 'vitest';
import { findConnectedTruck } from './KirChassisPage';

describe('findConnectedTruck', () => {
  it('mencocokkan truck lewat chassisCode chassis ini', () => {
    const chassis = { id: 'chassis-b', chassisCode: 'CHS-B' };
    const trucks = [{ id: 'truck-1', plateNumber: 'B 1111 AA', kirChassisNumber: 'CHS-B' }];
    expect(findConnectedTruck(chassis, trucks)?.id).toBe('truck-1');
  });

  it('tidak mengklaim truck yang sebenarnya terpasang ke chassis lain hanya karena nomor KIR chassis ini kebetulan sama teksnya', () => {
    // Reproduksi bug nyata: chassis "CHS-A" nomor KIR-nya kepasang "CHS-B" (data berantakan).
    // Truck yang benar-benar terpasang ke chassis "CHS-B" tidak boleh muncul sebagai "terhubung"
    // ke chassis "CHS-A" juga -- itu klaim ganda yang salah.
    const chassisA = { id: 'chassis-a', chassisCode: 'CHS-A', kirNumber: 'CHS-B' };
    const trucks = [{ id: 'truck-1', plateNumber: 'B 1111 AA', kirChassisNumber: 'CHS-B' }];
    expect(findConnectedTruck(chassisA, trucks)).toBeNull();
  });

  it('chassis yang benar-benar berkode CHS-B tetap ketemu truck yang sama walau ada chassis lain yang datanya berantakan', () => {
    const chassisB = { id: 'chassis-b', chassisCode: 'CHS-B' };
    const trucks = [{ id: 'truck-1', plateNumber: 'B 1111 AA', kirChassisNumber: 'CHS-B' }];
    expect(findConnectedTruck(chassisB, trucks)?.id).toBe('truck-1');
  });

  it('fallback ke id/nomor KIR/plat kalau chassisCode chassis ini kosong (data legacy)', () => {
    const legacyChassis = { id: 'chassis-legacy', chassisCode: '', kirNumber: 'KIR-OLD-001' };
    const trucks = [{ id: 'truck-1', kirChassisNumber: 'KIR-OLD-001' }];
    expect(findConnectedTruck(legacyChassis, trucks)?.id).toBe('truck-1');
  });

  it('mengembalikan null kalau tidak ada truck yang cocok', () => {
    expect(findConnectedTruck({ chassisCode: 'CHS-X' }, [{ id: 'truck-1', kirChassisNumber: 'CHS-Y' }])).toBeNull();
  });
});
