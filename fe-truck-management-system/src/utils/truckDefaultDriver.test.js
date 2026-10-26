import { describe, expect, it } from 'vitest';
import {
  CLEAR_LEGACY_DEFAULT_DRIVER,
  findDriverDefaultTruck,
  findTrucksHoldingDriver,
  getTruckDefaultDriverName,
  isLegacyDefaultDriver,
  resolveTruckDefaultDriverPayload,
} from './truckDefaultDriver';

const drivers = [
  { id: 'drv-suwito', name: 'SUWITO' },
  { id: 'drv-tisman', name: 'TISMAN', nickname: 'Tis' },
  { id: 'drv-dede', name: 'DEDE RAPLY' },
  { id: 'drv-amdani', name: 'AMDANI' },
];

// Reproduksi kondisi production: nama tersimpan berbeda dengan sopir dari ID.
const trucks = [
  { id: 'unit-01', unitCode: '01', plateNumber: 'B 9830 FEH', defaultDriverId: 'drv-suwito', defaultDriver: 'TISMAN' },
  { id: 'unit-04', unitCode: '04', plateNumber: 'B 9103 BEL', defaultDriverId: 'drv-dede', defaultDriver: 'AMDANI' },
  { id: 'unit-07', unitCode: '07', plateNumber: 'B 7 LEG', defaultDriverId: null, defaultDriver: 'Tis' },
];

describe('pasangan sopir default Master Truck dan Master Sopir', () => {
  it('Master Truck menampilkan nama dari ID sopir, bukan teks nama yang basi', () => {
    expect(getTruckDefaultDriverName(trucks[0], drivers)).toBe('SUWITO');
    expect(getTruckDefaultDriverName(trucks[1], drivers)).toBe('DEDE RAPLY');
  });

  it('Master Sopir mencari unit lewat ID, sehingga TISMAN dan AMDANI tidak ikut mengklaim unit 01/04', () => {
    expect(findDriverDefaultTruck(drivers[0], trucks)?.id).toBe('unit-01');
    expect(findDriverDefaultTruck(drivers[2], trucks)?.id).toBe('unit-04');
    expect(findDriverDefaultTruck(drivers[3], trucks)).toBeNull();
    // TISMAN hanya cocok ke unit legacy tanpa ID (lewat nickname), bukan ke unit 01.
    expect(findDriverDefaultTruck(drivers[1], trucks)?.id).toBe('unit-07');
  });

  it('kedua halaman menghasilkan pasangan yang sama untuk semua unit', () => {
    const fromTrucks = trucks
      .map((truck) => [truck.id, getTruckDefaultDriverName(truck, drivers)])
      .filter(([, name]) => name);
    const fromDrivers = drivers
      .map((driver) => [findDriverDefaultTruck(driver, trucks)?.id, driver])
      .filter(([truckId]) => truckId);
    expect(fromDrivers).toHaveLength(fromTrucks.length);
    fromDrivers.forEach(([truckId, driver]) => {
      const truck = trucks.find((item) => item.id === truckId);
      const shownOnTruckPage = getTruckDefaultDriverName(truck, drivers).toLowerCase();
      expect([driver.name, driver.nickname].filter(Boolean).map((name) => name.toLowerCase())).toContain(shownOnTruckPage);
    });
  });

  it('unit legacy tanpa ID tetap menampilkan nama fallback', () => {
    expect(isLegacyDefaultDriver(trucks[2])).toBe(true);
    expect(isLegacyDefaultDriver(trucks[0])).toBe(false);
    expect(getTruckDefaultDriverName(trucks[2], drivers)).toBe('Tis');
  });

  it('daftar unit yang perlu dilepas saat sopir dipindah memakai ID, dengan nama hanya untuk legacy', () => {
    expect(findTrucksHoldingDriver(trucks, drivers[0], 'unit-04').map((truck) => truck.id)).toEqual(['unit-01']);
    expect(findTrucksHoldingDriver(trucks, drivers[1], 'unit-04').map((truck) => truck.id)).toEqual(['unit-07']);
    expect(findTrucksHoldingDriver(trucks, drivers[3], 'unit-02')).toEqual([]);
  });
});

describe('resolveTruckDefaultDriverPayload', () => {
  it('memilih sopir dari form mengirim ID dan nama sopir dari Master Sopir', () => {
    expect(resolveTruckDefaultDriverPayload({ defaultDriverId: 'drv-tisman', defaultDriver: 'SUWITO' }, { drivers }))
      .toMatchObject({ defaultDriverId: 'drv-tisman', defaultDriver: 'TISMAN' });
  });

  it('unit legacy yang tidak disentuh tetap mempertahankan nama tanpa ID', () => {
    expect(resolveTruckDefaultDriverPayload({ defaultDriverId: '' }, { drivers, legacyDefaultDriver: 'Tis' }))
      .toMatchObject({ defaultDriverId: null, defaultDriver: 'Tis' });
  });

  it('melepas sopir legacy dan sopir ber-ID mengosongkan ID dan nama', () => {
    expect(resolveTruckDefaultDriverPayload({ defaultDriverId: CLEAR_LEGACY_DEFAULT_DRIVER }, { drivers, legacyDefaultDriver: 'Tis' }))
      .toMatchObject({ defaultDriverId: '', defaultDriver: '' });
    expect(resolveTruckDefaultDriverPayload({ defaultDriverId: '' }, { drivers }))
      .toMatchObject({ defaultDriverId: '', defaultDriver: '' });
  });
});
