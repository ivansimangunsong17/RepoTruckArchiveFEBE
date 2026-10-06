import { LocationMasterPage, MapsCell, TextCell } from './LocationMasterPage';

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
        { key: 'googleMapsUrl', section: 'Peta', label: 'Link Google Maps', type: 'url', placeholder: 'https://maps.google.com/?q=...' },
        { key: 'latitude', section: 'Peta', label: 'Latitude', type: 'number', step: 'any', placeholder: 'Contoh: -6.123456', hint: 'Opsional, isi bila link Maps tidak tersedia.' },
        { key: 'longitude', section: 'Peta', label: 'Longitude', type: 'number', step: 'any', placeholder: 'Contoh: 106.123456' },
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
        {
          key: 'maps',
          label: 'Maps',
          headerClassName: '!w-20 !text-center',
          cellClassName: '!w-20 !text-center',
          render: (_value, row) => <MapsCell row={row} useAddressFallback={false} />,
        },
      ]}
      toolbarDescription="Cari nama terminal, nama PT, dan status."
      readOnly={readOnly}
    />
  );
}

export default TerminalsPage;
