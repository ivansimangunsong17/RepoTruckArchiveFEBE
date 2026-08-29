import { LocationMasterPage, TextCell } from './LocationMasterPage';

function EndUsersPage({ readOnly = false }) {
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
          key: 'address',
          label: 'Alamat',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value} />,
        },
      ]}
      statsOverride={(data) => [
        { label: 'Total Lokasi', value: data.length, detail: 'Data terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Bisa dipilih' },
        { label: 'Tidak Aktif', value: data.filter((item) => item.status === 'Tidak Aktif').length, detail: 'Disembunyikan' },
      ]}
      toolbarDescription="Cari nama lokasi, alamat, dan status."
      readOnly={readOnly}
    />
  );
}

export default EndUsersPage;
