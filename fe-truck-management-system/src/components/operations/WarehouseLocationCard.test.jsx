import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WarehouseLocationCard from './WarehouseLocationCard';

describe('WarehouseLocationCard', () => {
  it('menampilkan penanda "Lokasi belum dipilih" saat container tidak punya warehouseLocationId', () => {
    render(<WarehouseLocationCard container={{ id: 'job-1' }} masterLocations={[]} masterDestinations={[]} />);

    expect(screen.getByText('Lokasi belum dipilih')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buka lokasi di Google Maps' })).not.toBeInTheDocument();
  });

  it('menampilkan nama, alamat, tujuan, dan ikon Maps aktif saat lokasi terisi lengkap', () => {
    const container = {
      id: 'job-1',
      warehouseLocationId: 'location-1',
      warehouseLocationNameSnapshot: 'Gudang Cikarang',
      warehouseLocationAddressSnapshot: 'Jl. Industri No. 1, Cikarang',
      destinationId: 'destination-1',
    };
    const masterLocations = [
      { id: 'location-1', googleMapsUrl: 'https://maps.google.com/?q=-6.2,106.8' },
    ];
    const masterDestinations = [{ id: 'destination-1', name: 'Cikarang' }];

    render(<WarehouseLocationCard container={container} masterLocations={masterLocations} masterDestinations={masterDestinations} />);

    expect(screen.getByText('Gudang Cikarang')).toBeInTheDocument();
    expect(screen.getByText('Jl. Industri No. 1, Cikarang')).toBeInTheDocument();
    expect(screen.getByText('Tujuan: Cikarang')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buka lokasi di Google Maps' })).toBeEnabled();
  });

  it('fallback ke pencarian alamat snapshot saat Master Lokasi tidak punya link/koordinat', () => {
    const container = {
      id: 'job-1',
      warehouseLocationId: 'location-1',
      warehouseLocationNameSnapshot: 'Gudang Cikarang',
      warehouseLocationAddressSnapshot: 'Jl. Industri No. 1, Cikarang',
      destinationId: null,
    };
    const masterLocations = [{ id: 'location-1' }];

    render(<WarehouseLocationCard container={container} masterLocations={masterLocations} masterDestinations={[]} />);

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    screen.getByRole('button', { name: 'Buka lokasi di Google Maps' }).click();
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=Jl.%20Industri%20No.%201%2C%20Cikarang',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('ikon Maps nonaktif kalau lokasi ada tapi tidak ditemukan di master dan snapshot alamat kosong', () => {
    const container = {
      id: 'job-1',
      warehouseLocationId: 'location-missing',
      warehouseLocationNameSnapshot: 'Gudang Lama',
      warehouseLocationAddressSnapshot: '',
      destinationId: null,
    };

    render(<WarehouseLocationCard container={container} masterLocations={[]} masterDestinations={[]} />);

    expect(screen.getByRole('button', { name: 'Buka lokasi di Google Maps' })).toBeDisabled();
  });
});
