import { LocationMasterPage, TextCell } from './LocationMasterPage';
import { formatCurrency } from '../../utils/formatCurrency';

function CurrencyCell({ value }) {
  if (value === null || value === undefined || value === '') return <TextCell value="" />;
  return <span className="master-plain-cell strong">{formatCurrency(Number(value) || 0)}</span>;
}

function DestinationsPage({ readOnly = false }) {
  return (
    <LocationMasterPage
      title="Master Lokasi Tujuan"
      singular="Lokasi Tujuan"
      description="Kelola daftar tujuan akhir yang dipakai pada input Sales Order dan dashboard."
      resource="destinations"
      storageKey="tms-master-destinations-v1"
      fields={[
        { key: 'name', section: 'Identitas Tujuan', label: 'Nama Lokasi Tujuan', placeholder: 'Contoh: Gudang Customer Bandung', required: true },
        { key: 'uj20ft', section: 'Uang Jalan', label: 'UJ 20FT', type: 'number', placeholder: 'Contoh: 600000', min: 0, step: 1000, inputMode: 'numeric', normalize: (value) => (value === '' ? null : Number(value)) },
        { key: 'uj40ft', section: 'Uang Jalan', label: 'UJ 40FT', type: 'number', placeholder: 'Contoh: 700000', min: 0, step: 1000, inputMode: 'numeric', normalize: (value) => (value === '' ? null : Number(value)) },
        { key: 'ujNotes', section: 'Uang Jalan', label: 'Catatan UJ', type: 'textarea', placeholder: 'Catatan dasar uang jalan', full: true },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Nama Tujuan',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value} strong />,
        },
        { key: 'uj20ft', label: 'UJ 20FT', render: (value) => <CurrencyCell value={value} /> },
        { key: 'uj40ft', label: 'UJ 40FT', render: (value) => <CurrencyCell value={value} /> },
      ]}
      toolbarDescription="Cari nama tujuan dan status."
      readOnly={readOnly}
    />
  );
}

export default DestinationsPage;
