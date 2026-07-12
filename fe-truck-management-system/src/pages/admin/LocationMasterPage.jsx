import MasterDataPage from '../../components/master/MasterDataPage';

const emptyRows = [];

function StatusCell({ value }) {
  const statusClass = value === 'Aktif' ? 'available' : 'maintenance';
  return <span className={`master-status-dot ${statusClass}`}><i />{value || '-'}</span>;
}

const statusField = {
  key: 'status',
  section: 'Status',
  label: 'Status',
  type: 'select',
  defaultValue: 'Aktif',
  options: [
    { value: 'Aktif', label: 'Aktif' },
    { value: 'Tidak Aktif', label: 'Tidak Aktif' },
  ],
};

export function LocationMasterPage({
  title,
  singular,
  description,
  resource,
  storageKey,
  fields,
  columns,
  toolbarDescription,
}) {
  return (
    <MasterDataPage
      eyebrow="Master Data"
      title={title}
      singular={singular}
      description={description}
      fields={[...fields, statusField, { key: 'notes', section: 'Catatan', label: 'Catatan', type: 'textarea', placeholder: 'Catatan tambahan', full: true }]}
      columns={[
        ...columns,
        { key: 'status', label: 'Status', render: (value) => <StatusCell value={value} /> },
      ]}
      initialRows={emptyRows}
      resource={resource}
      storageKey={storageKey}
      uniqueKeys={['name', 'code']}
      filters={[{ key: 'status', label: 'Semua Status', options: ['Aktif', 'Tidak Aktif'] }]}
      pageClassName="driver-data-page truck-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle={`Daftar ${singular}`}
      toolbarDescription={toolbarDescription}
      stats={(data) => [
        { label: `Total ${singular}`, value: data.length, detail: 'Data terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Bisa dipilih' },
        { label: 'Tidak Aktif', value: data.filter((item) => item.status === 'Tidak Aktif').length, detail: 'Disembunyikan dari operasional' },
        { label: 'Lengkap', value: data.filter((item) => item.name).length, detail: 'Nama tersedia' },
      ]}
    />
  );
}

export function TextCell({ value, strong = false }) {
  return <span className={`master-plain-cell ${strong ? 'strong' : ''}`.trim()}>{value || '-'}</span>;
}
