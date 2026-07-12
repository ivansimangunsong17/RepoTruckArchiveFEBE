import MasterDataPage from '../../components/master/MasterDataPage';

const emptyRows = [];

function formatDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function KirStatus({ value }) {
  const statusClass = value === 'Aktif' ? 'available' : value === 'Perlu Perpanjang' ? 'in_use' : 'maintenance';
  return <span className={`master-status-dot ${statusClass}`}><i />{value || '-'}</span>;
}

const fields = [
  { key: 'chassisCode', section: 'Identitas Chassis', label: 'Kode Chassis', placeholder: 'Contoh: CHS-001', required: true },
  { key: 'plateNumber', section: 'Identitas Chassis', label: 'Nomor Polisi / Identitas', placeholder: 'Contoh: B 1234 XYZ' },
  {
    key: 'capacity',
    section: 'Identitas Chassis',
    label: 'Kapasitas Container',
    type: 'select',
    defaultValue: '20FT',
    options: [
      { value: '20FT', label: '20FT' },
      { value: '40FT', label: '40FT' },
      { value: 'COMBO', label: 'Combo' },
    ],
  },
  { key: 'kirNumber', section: 'Dokumen KIR', label: 'Nomor Uji KIR', placeholder: 'Contoh: KIR-C-2026-001' },
  { key: 'kirExpiryDate', section: 'Dokumen KIR', label: 'Tanggal KIR OFF', type: 'date' },
  {
    key: 'status',
    section: 'Status',
    label: 'Status KIR',
    type: 'select',
    defaultValue: 'Aktif',
    options: [
      { value: 'Aktif', label: 'Aktif' },
      { value: 'Perlu Perpanjang', label: 'Perlu Perpanjang' },
      { value: 'Tidak Aktif', label: 'Tidak Aktif' },
    ],
  },
  { key: 'notes', section: 'Catatan', label: 'Catatan', type: 'textarea', placeholder: 'Catatan tambahan', full: true },
  { key: 'kirDocument', section: 'Dokumen KIR', label: 'Dokumen KIR', type: 'file' },
];

function KirChassisPage() {
  return (
    <MasterDataPage
      eyebrow="Master Data"
      title="Master KIR Chassis"
      singular="KIR Chassis"
      description="Kelola data uji KIR untuk chassis, kapasitas container, masa berlaku, dan dokumen pendukung."
      fields={fields}
      columns={[
        { key: 'chassisCode', label: 'Kode Chassis', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'plateNumber', label: 'Plat / Identitas', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'capacity', label: 'Size', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'kirNumber', label: 'No KIR', render: (value) => <span className="master-plain-cell">{value || '-'}</span> },
        { key: 'kirExpiryDate', label: 'Tanggal KIR OFF', render: (value) => <span className="master-plain-cell strong">{formatDate(value)}</span> },
        { key: 'status', label: 'Status', render: (value) => <KirStatus value={value} /> },
      ]}
      initialRows={emptyRows}
      resource="kir-chassis"
      storageKey="tms-master-kir-chassis-v1"
      uniqueKeys={['chassisCode', 'plateNumber', 'kirNumber']}
      filters={[
        { key: 'status', label: 'Semua Status KIR', options: ['Aktif', 'Perlu Perpanjang', 'Tidak Aktif'] },
        { key: 'size', label: 'Semua Size', options: ['20FT', '40FT', 'COMBO'] },
      ]}
      pageClassName="driver-data-page truck-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar KIR Chassis"
      toolbarDescription="Cari kode chassis, plat/identitas, size, nomor KIR, dan status dokumen."
      stats={(data) => [
        { label: 'Total Chassis', value: data.length, detail: 'Data KIR terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Dokumen aman' },
        { label: 'Perlu Perpanjang', value: data.filter((item) => item.status === 'Perlu Perpanjang').length, detail: 'Perlu dicek' },
        { label: 'Tidak Aktif', value: data.filter((item) => item.status === 'Tidak Aktif').length, detail: 'Nonaktif' },
      ]}
    />
  );
}

export default KirChassisPage;
