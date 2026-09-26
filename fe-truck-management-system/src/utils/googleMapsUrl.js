// Urutan sumber tautan Maps (Phase 7): google_maps_url -> latitude,longitude -> pencarian alamat.
// Dipakai bersama oleh Master Lokasi (Admin) dan tampilan OPS supaya perilaku ikon Maps konsisten
// di mana pun lokasi ditampilkan.
export function resolveGoogleMapsUrl({ googleMapsUrl, latitude, longitude, address } = {}) {
  const url = String(googleMapsUrl || '').trim();
  if (url) return url;

  const hasCoordinates = latitude !== null && latitude !== undefined && latitude !== ''
    && longitude !== null && longitude !== undefined && longitude !== '';
  if (hasCoordinates) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps?q=${lat},${lng}`;
    }
  }

  const trimmedAddress = String(address || '').trim();
  if (trimmedAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedAddress)}`;
  }

  return '';
}
