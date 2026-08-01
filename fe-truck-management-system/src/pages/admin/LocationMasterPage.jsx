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
  pageClassName,
  statusFieldOverride,
  statusColumnOverride,
  filtersOverride,
  statsOverride,
  readOnly = false,
}) {
  const effectiveStatusField = statusFieldOverride === null ? null : statusFieldOverride || statusField;
  const effectiveStatusColumn = statusColumnOverride === null ? null : statusColumnOverride || {
    key: 'status',
    label: 'Status',
    headerClassName: '!w-36 !text-center',
    cellClassName: '!w-36 !text-center',
    render: (value) => <StatusCell value={value} />,
  };
  const effectiveFilters = filtersOverride || [{ key: 'status', label: 'Semua Status', options: ['Aktif', 'Tidak Aktif'] }];
  const effectiveStats = statsOverride || ((data) => [
    { label: `Total ${singular}`, value: data.length, detail: 'Data terdaftar' },
    { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Bisa dipilih' },
    { label: 'Tidak Aktif', value: data.filter((item) => item.status === 'Tidak Aktif').length, detail: 'Disembunyikan dari operasional' },
    { label: 'Lengkap', value: data.filter((item) => item.name).length, detail: 'Nama tersedia' },
  ]);

  return (
    <MasterDataPage
      eyebrow="Master Data"
      title={title}
      singular={singular}
      description={description}
      fields={[...fields, ...(effectiveStatusField ? [effectiveStatusField] : []), { key: 'notes', section: 'Catatan', label: 'Catatan', type: 'textarea', placeholder: 'Catatan tambahan', full: true }]}
      columns={[...columns, ...(effectiveStatusColumn ? [effectiveStatusColumn] : [])]}
      initialRows={emptyRows}
      resource={resource}
      storageKey={storageKey}
      uniqueKeys={['name', 'code']}
      filters={effectiveFilters}
      pageClassName={pageClassName || 'driver-data-page truck-data-page'}
      pageSize={20}
      showModeChip={false}
      toolbarTitle={`Daftar ${singular}`}
      toolbarDescription={toolbarDescription}
      stats={effectiveStats}
      readOnly={readOnly}
    />
  );
}

export function TextCell({ value, strong = false }) {
  return <span className={`master-plain-cell ${strong ? 'strong' : ''}`.trim()}>{value || '-'}</span>;
}
