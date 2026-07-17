import MasterDataPage from '../../components/master/MasterDataPage';
import { formatDate } from '../../utils/formatDate';

const emptyRows = [];

function KirStatus({ value }) {
  const statusClass = value === 'Aktif' ? 'available' : value === 'Perlu Perpanjang' ? 'in_use' : 'maintenance';
  return <span className={`master-status-dot ${statusClass}`}><i />{value || '-'}</span>;
}

const fields = [
  { key: 'unitCode', section: 'Identitas Truck', label: 'Kode Truck', placeholder: 'Contoh: HEAD-001', required: true },
  { key: 'plateNumber', section: 'Identitas Truck', label: 'Nomor Polisi Truck', placeholder: 'Contoh: B 1234 XYZ', required: true },
  { key: 'kirNumber', section: 'Dokumen KIR', label: 'Nomor Uji KIR', placeholder: 'Contoh: KIR-H-2026-001' },
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

function KirHeadsPage() {
  return (
    <MasterDataPage
      eyebrow="Master Data"
      title="Master KIR"
      singular="KIR"
      description="Kelola data uji KIR untuk unit truck, nomor polisi, masa berlaku, dan dokumen pendukung."
      fields={fields}
      columns={[
        { key: 'unitCode', label: 'Kode Truck', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'plateNumber', label: 'Plat Truck', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'kirNumber', label: 'No KIR', render: (value) => <span className="master-plain-cell">{value || '-'}</span> },
        { key: 'kirExpiryDate', label: 'Tanggal KIR OFF', render: (value) => <span className="master-plain-cell strong">{formatDate(value)}</span> },
        { key: 'status', label: 'Status', render: (value) => <KirStatus value={value} /> },
      ]}
      initialRows={emptyRows}
      resource="kir-heads"
      storageKey="tms-master-kir-heads-v1"
      uniqueKeys={['unitCode', 'plateNumber', 'kirNumber']}
      filters={[{ key: 'status', label: 'Semua Status KIR', options: ['Aktif', 'Perlu Perpanjang', 'Tidak Aktif'] }]}
      pageClassName="driver-data-page truck-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar KIR"
      toolbarDescription="Cari kode truck, plat, nomor KIR, dan status dokumen."
      stats={(data) => [
        { label: 'Total Truck', value: data.length, detail: 'Data KIR terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Dokumen aman' },
        { label: 'Perlu Perpanjang', value: data.filter((item) => item.status === 'Perlu Perpanjang').length, detail: 'Perlu dicek' },
        { label: 'Tidak Aktif', value: data.filter((item) => item.status === 'Tidak Aktif').length, detail: 'Nonaktif' },
      ]}
    />
  );
}

export default KirHeadsPage;
