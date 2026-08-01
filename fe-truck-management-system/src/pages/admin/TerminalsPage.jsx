import { LocationMasterPage, TextCell } from './LocationMasterPage';

function TerminalsPage({ readOnly = false }) {
  return (
    <LocationMasterPage
      title="Master Terminal"
      singular="Terminal"
      description="Kelola daftar terminal dan nama PT yang dipakai pada input Sales Order."
      resource="terminals"
      storageKey="tms-master-terminals-v1"
      fields={[
        { key: 'name', section: 'Identitas Terminal', label: 'Nama Terminal', placeholder: 'Contoh: Terminal 3 / NPCT1', required: true },
        { key: 'code', section: 'Identitas Terminal', label: 'Nama PT', placeholder: 'Contoh: PT Pelabuhan Indonesia (Persero)' },
        { key: 'portArea', section: 'Area', label: 'Area Pelabuhan', placeholder: 'Contoh: Tanjung Priok', full: true },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Nama Terminal',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value} strong />,
        },
        { key: 'code', label: 'Nama PT', render: (value) => <TextCell value={value} /> },
      ]}
      toolbarDescription="Cari nama terminal, nama PT, dan status."
      readOnly={readOnly}
    />
  );
}

export default TerminalsPage;
