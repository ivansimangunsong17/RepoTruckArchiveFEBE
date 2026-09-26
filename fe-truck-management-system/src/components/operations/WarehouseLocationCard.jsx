import { MapPin } from 'lucide-react';
import { resolveGoogleMapsUrl } from '../../utils/googleMapsUrl';

// Info lokasi gudang untuk OPS (Phase 7). Nama/alamat dibaca dari snapshot container job (beku,
// tidak berubah walau Master Lokasi diedit belakangan -- lihat Phase 5), sementara link/koordinat
// Maps diambil LIVE dari Master Lokasi lewat masterLocations (data itu sengaja tidak ikut
// di-snapshot, karena murni alat bantu navigasi, bukan data historis transaksi).
function WarehouseLocationCard({ container = {}, masterLocations = [], masterDestinations = [] }) {
  const hasLocation = Boolean(container.warehouseLocationId);
  const liveLocation = hasLocation
    ? (masterLocations || []).find((location) => location.id === container.warehouseLocationId)
    : null;
  const destinationName = container.destinationId
    ? (masterDestinations || []).find((destination) => destination.id === container.destinationId)?.name || ''
    : '';
  const mapsUrl = resolveGoogleMapsUrl({
    googleMapsUrl: liveLocation?.googleMapsUrl,
    latitude: liveLocation?.latitude,
    longitude: liveLocation?.longitude,
    address: container.warehouseLocationAddressSnapshot,
  });

  if (!hasLocation) {
    return (
      <div className="warehouse-location-card !block rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Lokasi Gudang</span>
        <strong className="mt-0.5 block font-semibold">Lokasi belum dipilih</strong>
        <span className="text-xs text-amber-800">Sales belum memilih lokasi gudang untuk order ini. Job tetap dapat diproses seperti biasa.</span>
      </div>
    );
  }

  return (
    <div className="warehouse-location-card !block rounded-md border border-sky-200 bg-sky-50/70 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Lokasi Gudang</span>
          <strong className="mt-0.5 block truncate text-sm font-bold text-slate-950">{container.warehouseLocationNameSnapshot || '-'}</strong>
          <span className="mt-1 block text-xs text-slate-600">{container.warehouseLocationAddressSnapshot || 'Alamat tidak tersedia'}</span>
          <span className="mt-1 inline-flex rounded-md border border-sky-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-700">
            Tujuan: {destinationName || '-'}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-white text-sky-700 shadow-sm disabled:opacity-40"
          onClick={() => mapsUrl && window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
          disabled={!mapsUrl}
          title={mapsUrl ? 'Buka lokasi di Google Maps' : 'Belum ada link Maps, koordinat, atau alamat'}
          aria-label="Buka lokasi di Google Maps"
        >
          <MapPin size={16} />
        </button>
      </div>
    </div>
  );
}

export default WarehouseLocationCard;
