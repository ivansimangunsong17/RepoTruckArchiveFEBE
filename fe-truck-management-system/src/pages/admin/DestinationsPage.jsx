import { LocationMasterPage, TextCell } from './LocationMasterPage';

function DestinationsPage() {
  return (
    <LocationMasterPage
      title="Master Lokasi Tujuan"
      singular="Lokasi Tujuan"
      description="Kelola daftar tujuan akhir yang dipakai pada input Sales Order dan dashboard."
      resource="destinations"
      storageKey="tms-master-destinations-v1"
      fields={[
        { key: 'name', section: 'Identitas Tujuan', label: 'Nama Lokasi Tujuan', placeholder: 'Contoh: Gudang Customer Bandung', required: true },
        { key: 'area', section: 'Identitas Tujuan', label: 'Area / Kota', placeholder: 'Contoh: Bandung' },
        { key: 'address', section: 'Alamat', label: 'Alamat Lengkap', placeholder: 'Alamat tujuan akhir', full: true },
      ]}
      columns={[
        { key: 'name', label: 'Nama Tujuan', render: (value) => <TextCell value={value} strong /> },
        { key: 'area', label: 'Area / Kota', render: (value) => <TextCell value={value} /> },
        { key: 'address', label: 'Alamat', render: (value) => <TextCell value={value} /> },
      ]}
      toolbarDescription="Cari nama tujuan, area/kota, alamat, dan status."
    />
  );
}

export default DestinationsPage;
