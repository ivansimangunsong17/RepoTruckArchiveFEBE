import { LocationMasterPage, TextCell } from './LocationMasterPage';

function DepotsPage() {
  return (
    <LocationMasterPage
      title="Master Depo"
      singular="Depo"
      description="Kelola daftar depo yang dipakai pada input Sales Order."
      resource="depots"
      storageKey="tms-master-depots-v1"
      fields={[
        { key: 'name', section: 'Identitas Depo', label: 'Nama Depo', placeholder: 'Contoh: Depo Marunda', required: true },
        { key: 'code', section: 'Identitas Depo', label: 'Kode Depo', placeholder: 'Contoh: DPMRD' },
        { key: 'address', section: 'Alamat', label: 'Alamat / Area', placeholder: 'Contoh: Marunda, Jakarta Utara', full: true },
      ]}
      columns={[
        { key: 'name', label: 'Nama Depo', render: (value) => <TextCell value={value} strong /> },
        { key: 'code', label: 'Kode', render: (value) => <TextCell value={value} /> },
      ]}
      toolbarDescription="Cari nama depo, kode, dan status."
    />
  );
}

export default DepotsPage;
