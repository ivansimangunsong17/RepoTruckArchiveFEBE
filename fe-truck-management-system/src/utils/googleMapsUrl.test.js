import { describe, expect, it } from 'vitest';
import { resolveGoogleMapsUrl } from './googleMapsUrl';

describe('resolveGoogleMapsUrl', () => {
  it('memprioritaskan google_maps_url kalau tersedia', () => {
    expect(resolveGoogleMapsUrl({
      googleMapsUrl: 'https://maps.google.com/?q=-6.2,106.8',
      latitude: -6.1,
      longitude: 106.7,
      address: 'Jl. Industri No. 1',
    })).toBe('https://maps.google.com/?q=-6.2,106.8');
  });

  it('fallback ke latitude,longitude kalau google_maps_url kosong', () => {
    expect(resolveGoogleMapsUrl({
      latitude: -6.2,
      longitude: 106.8,
      address: 'Jl. Industri No. 1',
    })).toBe('https://www.google.com/maps?q=-6.2,106.8');
  });

  it('fallback ke pencarian alamat kalau google_maps_url dan koordinat kosong', () => {
    expect(resolveGoogleMapsUrl({
      address: 'Jl. Industri No. 1, Cikarang',
    })).toBe('https://www.google.com/maps/search/?api=1&query=Jl.%20Industri%20No.%201%2C%20Cikarang');
  });

  it('mengembalikan string kosong kalau ketiga sumber kosong', () => {
    expect(resolveGoogleMapsUrl({})).toBe('');
    expect(resolveGoogleMapsUrl()).toBe('');
  });

  it('koordinat null (bukan angka) tidak dianggap valid, tetap fallback ke alamat', () => {
    expect(resolveGoogleMapsUrl({
      latitude: null,
      longitude: null,
      address: 'Jl. Industri No. 1',
    })).toBe('https://www.google.com/maps/search/?api=1&query=Jl.%20Industri%20No.%201');
  });
});
