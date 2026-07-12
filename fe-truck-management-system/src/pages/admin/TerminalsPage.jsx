import { LocationMasterPage, TextCell } from './LocationMasterPage';

function TerminalsPage() {
  return (
    <LocationMasterPage
      title="Master Terminal"
      singular="Terminal"
      description="Kelola daftar terminal/pelabuhan yang dipakai pada input Sales Order."
      resource="terminals"
      storageKey="tms-master-terminals-v1"
      fields={[
        { key: 'name', section: 'Identitas Terminal', label: 'Nama Terminal', placeholder: 'Contoh: Terminal 3 / NPCT1', required: true },
        { key: 'code', section: 'Identitas Terminal', label: 'Kode Terminal', placeholder: 'Contoh: NPCT1' },
        { key: 'portArea', section: 'Area', label: 'Area Pelabuhan', placeholder: 'Contoh: Tanjung Priok', full: true },
      ]}
      columns={[
        { key: 'name', label: 'Nama Terminal', render: (value) => <TextCell value={value} strong /> },
        { key: 'code', label: 'Kode', render: (value) => <TextCell value={value} /> },
        { key: 'portArea', label: 'Area Pelabuhan', render: (value) => <TextCell value={value} /> },
      ]}
      toolbarDescription="Cari nama terminal, kode, area pelabuhan, dan status."
    />
  );
}

export default TerminalsPage;
