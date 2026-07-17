import MasterDataPage from '../../components/master/MasterDataPage';
import { fallbackCustomers } from '../../data/masterData';

function CustomerName({ row, rowNumber }) {
  return (
    <div className="customer-name-cell">
      <span className="customer-row-number">{rowNumber}</span>
      <strong>{row.name}</strong>
    </div>
  );
}

function CustomerPic({ row }) {
  return (
    <div className="customer-pic-cell">
      <strong>{row.pic || '-'}</strong>
    </div>
  );
}

function CustomerContract({ value }) {
  const statusClass = value === 'Aktif' ? 'available' : value === 'Review' ? 'in_use' : 'maintenance';
  return <span className={`master-status-dot ${statusClass}`}><i />{value || '-'}</span>;
}

function CustomerDocumentSummary({ row }) {
  const complete = [row.npwpDocument, row.contractDocument].filter(Boolean).length;
  return (
    <div className="master-doc-count">
      <strong>{complete}/2</strong>
    </div>
  );
}

const fields = [
  { key: 'name', section: 'Identitas Customer', label: 'Nama Customer', placeholder: 'Contoh: PT Armada Logistik', required: true },
  { key: 'npwp', section: 'Identitas Customer', label: 'NPWP', placeholder: '00.000.000.0-000.000', required: true, hint: 'Gunakan format NPWP perusahaan.' },
  { key: 'address', section: 'Identitas Customer', label: 'Alamat Customer', type: 'textarea', placeholder: 'Masukkan alamat lengkap customer', required: true, full: true },
  { key: 'pic', section: 'PIC & Informasi Kontak', label: 'Nama PIC', placeholder: 'Nama penanggung jawab', required: true },
  { key: 'phone', section: 'PIC & Informasi Kontak', label: 'Nomor Kontak', placeholder: '021 / 08xx', required: true },
  { key: 'email', section: 'PIC & Informasi Kontak', label: 'Email PIC', type: 'email', placeholder: 'pic@customer.com' },
  { key: 'contractNumber', section: 'Umbrella Contract', label: 'Nomor Contract', placeholder: 'UC/CLIENT/2026/001', required: true },
  { key: 'contractStart', section: 'Umbrella Contract', label: 'Tanggal Mulai', type: 'date', required: true },
  {
    key: 'contractEnd',
    section: 'Umbrella Contract',
    label: 'Tanggal Berakhir',
    type: 'date',
    required: true,
    validate: (form) => form.contractStart && form.contractEnd < form.contractStart
      ? 'Tanggal berakhir contract tidak boleh lebih awal dari tanggal mulai.'
      : '',
  },
  {
    key: 'contract', section: 'Umbrella Contract', label: 'Status Contract', type: 'select', defaultValue: 'Aktif', options: [
      { value: 'Aktif', label: 'Aktif' }, { value: 'Review', label: 'Dalam Review' }, { value: 'Tidak Aktif', label: 'Tidak Aktif' },
    ]
  },
  { key: 'npwpDocument', section: 'Dokumen Pendukung', label: 'Dokumen NPWP', type: 'file', hint: 'Opsional untuk mode dummy.' },
  { key: 'contractDocument', section: 'Dokumen Pendukung', label: 'Dokumen Umbrella Contract', type: 'file', hint: 'Unggah contract yang telah ditandatangani.' },
];

function ClientsPage() {
  return (
    <MasterDataPage
      eyebrow="Master Data"
      title="Master Client"
      singular="Client"
      description="Kelola identitas customer, alamat, PIC, informasi kontak, NPWP, dan umbrella contract."
      fields={fields}
      columns={[
        { key: 'name', label: 'Customer', render: (_, row, meta) => <CustomerName row={row} rowNumber={meta.rowNumber} /> },
        { key: 'pic', label: 'PIC', render: (_, row) => <CustomerPic row={row} /> },
        { key: 'contract', label: 'Contract', render: (value) => <CustomerContract value={value} /> },
        { key: 'contractDocument', label: 'Dokumen', render: (_, row) => <CustomerDocumentSummary row={row} /> },
      ]}
      initialRows={fallbackCustomers}
      resource="customers"
      storageKey="tms-master-clients-v2"
      uniqueKeys={['name', 'npwp', 'contractNumber']}
      filters={[{ key: 'contract', label: 'Semua Status Contract', options: ['Aktif', 'Review', 'Tidak Aktif'] }]}
      pageClassName="driver-data-page customer-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar Customer"
      toolbarDescription="Cari customer, PIC, dan status contract."
      stats={(data) => [
        { label: 'Total Customer', value: data.length, detail: 'Terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.contract === 'Aktif').length, detail: 'Bisa order' },
        { label: 'Review', value: data.filter((item) => item.contract === 'Review').length, detail: 'Cek kontrak' },
        { label: 'Tidak Aktif', value: data.filter((item) => item.contract === 'Tidak Aktif').length, detail: 'Nonaktif' },
      ]}
    />
  );
}

export default ClientsPage;
