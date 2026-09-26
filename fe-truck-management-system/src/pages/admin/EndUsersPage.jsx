import { MapPin } from 'lucide-react';
import { useArchiveData } from '../../hooks/useArchiveData';
import { resolveGoogleMapsUrl } from '../../utils/googleMapsUrl';
import { LocationMasterPage, TextCell, StatusCell } from './LocationMasterPage';

function MapsCell({ row }) {
  const mapsUrl = resolveGoogleMapsUrl({
    googleMapsUrl: row.googleMapsUrl,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
  });
  if (!mapsUrl) {
    return (
      <button type="button" className="customer-document-button" disabled title="Belum ada link Maps atau koordinat">
        <MapPin size={13} />
      </button>
    );
  }
  return (
    <button
      type="button"
      className="customer-document-button"
      onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
      title="Buka lokasi di Google Maps"
      aria-label="Buka lokasi di Google Maps"
    >
      <MapPin size={13} />
    </button>
  );
}

function EndUsersPage({ readOnly = false }) {
  const archive = useArchiveData();
  const destinationRows = archive.masters?.destinations || [];
  const destinationsById = new Map(destinationRows.map((destination) => [destination.id, destination]));
  const activeDestinationOptions = destinationRows
    .filter((destination) => !destination.status || destination.status === 'Aktif')
    .map((destination) => ({ value: destination.id, label: destination.name }))
    .sort((left, right) => left.label.localeCompare(right.label, 'id'));

  return (
    <LocationMasterPage
      title="Master Lokasi"
      singular="Lokasi"
      description="Kelola daftar lokasi yang digunakan sebagai referensi tujuan/customer akhir."
      resource="end-users"
      storageKey="tms-master-end-users-v1"
      pageClassName="driver-data-page customer-data-page"
      fields={[
        { key: 'name', section: 'Identitas Lokasi', label: 'Nama Lokasi', placeholder: 'Contoh: Gudang Customer Akhir', required: true },
        { key: 'address', section: 'Identitas Lokasi', label: 'Alamat', type: 'textarea', placeholder: 'Masukkan alamat lengkap lokasi', full: true },
        {
          key: 'destinationId',
          section: 'Tujuan & Peta',
          label: 'Master Tujuan',
          type: 'select',
          defaultValue: '',
          hint: 'Opsional. Menghubungkan lokasi ini ke tarif UJ dan Komisi pada Master Tujuan.',
          options: (form) => {
            const currentValue = String(form.destinationId || '').trim();
            const hasCurrentValue = !currentValue || activeDestinationOptions.some((option) => option.value === currentValue);
            const list = hasCurrentValue
              ? activeDestinationOptions
              : [{ value: currentValue, label: `${destinationsById.get(currentValue)?.name || 'Tujuan'} (Tidak Aktif)` }, ...activeDestinationOptions];
            return [{ value: '', label: 'Tanpa Tujuan (Opsional)' }, ...list];
          },
        },
        { key: 'googleMapsUrl', section: 'Tujuan & Peta', label: 'Link Google Maps', type: 'url', placeholder: 'https://maps.google.com/?q=...' },
        { key: 'latitude', section: 'Tujuan & Peta', label: 'Latitude', type: 'number', step: 'any', placeholder: 'Contoh: -6.123456', hint: 'Opsional, isi bila link Maps tidak tersedia.' },
        { key: 'longitude', section: 'Tujuan & Peta', label: 'Longitude', type: 'number', step: 'any', placeholder: 'Contoh: 106.123456' },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Nama Lokasi',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value} strong />,
        },
        {
          key: 'destinationId',
          label: 'Tujuan',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value ? destinationsById.get(value)?.name || '' : ''} />,
        },
        {
          key: 'address',
          label: 'Alamat',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value} />,
        },
        {
          key: 'status',
          label: 'Status',
          headerClassName: '!w-36 !text-center',
          cellClassName: '!w-36 !text-center',
          render: (value) => <StatusCell value={value} />,
        },
        {
          key: 'maps',
          label: 'Maps',
          headerClassName: '!w-20 !text-center',
          cellClassName: '!w-20 !text-center',
          render: (_value, row) => <MapsCell row={row} />,
        },
      ]}
      statusColumnOverride={null}
      statsOverride={(data) => [
        { label: 'Total Lokasi', value: data.length, detail: 'Data terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Bisa dipilih' },
        { label: 'Tidak Aktif', value: data.filter((item) => item.status === 'Tidak Aktif').length, detail: 'Disembunyikan' },
        { label: 'Terhubung Tujuan', value: data.filter((item) => item.destinationId).length, detail: 'Sudah dikaitkan Master Tujuan' },
      ]}
      toolbarDescription="Cari nama lokasi, alamat, dan status."
      readOnly={readOnly}
    />
  );
}

export default EndUsersPage;
