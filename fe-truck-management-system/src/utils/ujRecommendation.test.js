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

  it('membaca nominal UJ dengan format rupiah bertitik', () => {
    const recommendation = calculateUjRecommendation(
      { destination: 'Cikarang', size: '20FT' },
      [{ name: 'Cikarang', uj20ft: 'Rp 600.000', uj40ft: '750.000' }],
    );

    expect(recommendation.currentContainerUj).toBe(600000);
    expect(recommendation.hasConfiguredTariff).toBe(true);
  });

  it('menganggap tarif belum lengkap jika ukuran container ini belum punya UJ', () => {
    const recommendation = calculateUjRecommendation(
      { destination: 'Cikarang', size: '40FT' },
      [{ name: 'Cikarang', uj20ft: 600000, uj40ft: null }],
    );

    expect(recommendation.currentContainerUj).toBe(0);
    expect(recommendation.hasConfiguredTariff).toBe(false);
  });
});
