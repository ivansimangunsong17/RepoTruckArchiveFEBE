import { describe, expect, it } from 'vitest';
import { calculateUjRecommendation, findDestinationMaster } from './ujRecommendation';

describe('ujRecommendation', () => {
  it('mencocokkan tujuan dari nama parsial master destination', () => {
    const destination = findDestinationMaster(
      [
        { name: 'Bandung', uj20ft: 500000 },
        { name: 'Gudang Customer Cikarang', uj20ft: 600000, uj40ft: 750000, status: 'Aktif' },
      ],
      'Cikarang',
    );

    expect(destination?.name).toBe('Gudang Customer Cikarang');
  });

  it('memprioritaskan nama persis daripada master parsial yang muncul lebih dahulu', () => {
    const recommendation = calculateUjRecommendation(
      { destination: 'Marunda', size: '20FT' },
      [
        { name: 'IDWI MARUNDA', uj20ft: 300000, status: 'Aktif' },
        { name: 'Marunda', uj20ft: 400000, status: 'Aktif' },
      ],
    );

    expect(recommendation.destinationName).toBe('Marunda');
    expect(recommendation.currentContainerUj).toBe(400000);
  });

  it('membaca nominal UJ dengan format rupiah bertitik', () => {
    const recommendation = calculateUjRecommendation(
      { destination: 'Cikarang', size: '20FT' },
      [{ name: 'Cikarang', uj20ft: 'Rp 600.000', uj40ft: '750.000', driverCommissionAmount: '50.000' }],
    );

    expect(recommendation.currentContainerUj).toBe(600000);
    expect(recommendation.driverCommissionAmount).toBe(50000);
    expect(recommendation.hasConfiguredTariff).toBe(true);
  });

  it('memilih komisi sopir berdasarkan ukuran container', () => {
    const destinations = [{
      name: 'Cikarang',
      uj20ft: 600000,
      uj40ft: 750000,
      driverCommission20ftAmount: 50000,
      driverCommission40ftAmount: 80000,
    }];

    expect(calculateUjRecommendation({ destination: 'Cikarang', size: '20FT' }, destinations).driverCommissionAmount).toBe(50000);
    expect(calculateUjRecommendation({ destination: 'Cikarang', size: '40FT' }, destinations).driverCommissionAmount).toBe(80000);
  });

  it('menganggap tarif belum lengkap jika ukuran container ini belum punya UJ', () => {
    const recommendation = calculateUjRecommendation(
      { destination: 'Cikarang', size: '40FT' },
      [{ name: 'Cikarang', uj20ft: 600000, uj40ft: null }],
    );

    expect(recommendation.currentContainerUj).toBe(0);
    expect(recommendation.hasConfiguredTariff).toBe(false);
  });

  it('menambahkan surcharge Rp100.000 untuk container Reefer', () => {
    const recommendation = calculateUjRecommendation(
      { destination: 'Cikarang', size: '40FT', type: 'Reefer' },
      [{ name: 'Cikarang', uj20ft: 600000, uj40ft: 750000 }],
    );

    expect(recommendation.baseContainerUj).toBe(750000);
    expect(recommendation.reeferSurcharge).toBe(100000);
    expect(recommendation.currentContainerUj).toBe(850000);
  });

  it('tidak menambahkan surcharge Reefer jika tarif dasar belum tersedia', () => {
    const recommendation = calculateUjRecommendation(
      { destination: 'Cikarang', size: '40FT', containerType: 'REEFER' },
      [{ name: 'Cikarang', uj20ft: 600000, uj40ft: null }],
    );

    expect(recommendation.currentContainerUj).toBe(0);
    expect(recommendation.reeferSurcharge).toBe(0);
    expect(recommendation.hasConfiguredTariff).toBe(false);
  });

  it('Repo Reefer tetap memakai UJ dasar dan tidak mendapat komisi', () => {
    const recommendation = calculateUjRecommendation(
      { destination: 'Cikarang', size: '40FT', type: 'Reefer', shipment: 'Repo Full' },
      [{ name: 'Cikarang', uj40ft: 750000, driverCommission40ftAmount: 80000 }],
    );

    expect(recommendation.currentContainerUj).toBe(750000);
    expect(recommendation.reeferSurcharge).toBe(0);
    expect(recommendation.driverCommissionAmount).toBe(0);
  });
});
