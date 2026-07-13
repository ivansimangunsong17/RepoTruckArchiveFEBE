import { LocationMasterPage, TextCell } from './LocationMasterPage';

function StidsPage() {
  return (
    <LocationMasterPage
      title="Master STID"
      singular="STID"
      description="Kelola daftar STID yang dipakai pada kebutuhan operasional dan administrasi."
      resource="stids"
      storageKey="tms-master-stids-v1"
      fields={[
        { key: 'name', section: 'Identitas STID', label: 'Nama STID', placeholder: 'Contoh: STID Marunda', required: true },
        { key: 'code', section: 'Identitas STID', label: 'Kode STID', placeholder: 'Contoh: STID-MRD' },
        { key: 'address', section: 'Alamat', label: 'Alamat / Area', placeholder: 'Contoh: Marunda, Jakarta Utara', full: true },
        { key: 'stidDocument', section: 'Dokumen STID', label: 'Dokumen STID', type: 'file' },
      ]}
      columns={[
        { key: 'name', label: 'Nama STID', render: (value) => <TextCell value={value} strong /> },
        { key: 'code', label: 'Kode', render: (value) => <TextCell value={value} /> },
        { key: 'address', label: 'Alamat / Area', render: (value) => <TextCell value={value} /> },
      ]}
      toolbarDescription="Cari nama STID, kode, area, dan status."
    />
  );
}

export default StidsPage;
