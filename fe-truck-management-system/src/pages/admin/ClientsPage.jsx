import { useMemo } from 'react';
import { Eye } from 'lucide-react';
import DocumentLink from '../../components/common/DocumentLink';
import MasterDataPage from '../../components/master/MasterDataPage';
import { USER_ROLES } from '../../constants/roles';
import { fallbackCustomers, fallbackUsers } from '../../data/masterData';
import { useArchiveData } from '../../hooks/useArchiveData';

function CustomerValue({ value, emphasis = false }) {
  const displayValue = String(value || '-');
  if (emphasis) {
    return <strong className="customer-table-value is-emphasis" title={displayValue}>{displayValue}</strong>;
  }
  return <span className="customer-table-value" title={displayValue}>{displayValue}</span>;
}

function CustomerName({ row }) {
  return (
    <div className="customer-name-cell">
      <CustomerValue value={row.name} emphasis />
    </div>
  );
}

function CustomerDocumentView({ file, documentName }) {
  if (!file) {
    return (
      <button
        aria-label={`View ${documentName}`}
        className="customer-document-button"
        type="button"
        disabled
        title={`${documentName} belum tersedia`}
      >
        <Eye size={13} /> View
      </button>
    );
  }

  return <DocumentLink file={file} className="customer-document-button" label="View" />;
}

const baseFields = [
  { key: 'name', section: 'Identitas Customer', label: 'Nama Customer', placeholder: 'Contoh: PT Armada Logistik', required: true },
  { key: 'npwp', section: 'Identitas Customer', label: 'NPWP', placeholder: '00.000.000.0-000.000', required: true, hint: 'Gunakan format NPWP perusahaan.' },
  { key: 'address', section: 'Identitas Customer', label: 'Alamat Customer', type: 'textarea', placeholder: 'Masukkan alamat lengkap customer', required: true, full: true },
  { key: 'pic', section: 'PIC & Informasi Kontak', label: 'Nama PIC', placeholder: 'Nama penanggung jawab', required: true },
  { key: 'phone', section: 'PIC & Informasi Kontak', label: 'Nomor Kontak', placeholder: '021 / 08xx', required: true },
  { key: 'email', section: 'PIC & Informasi Kontak', label: 'Email PIC', type: 'email', placeholder: 'pic@customer.com' },
  { key: 'salesName', section: 'PIC & Informasi Kontak', label: 'Nama Sales', type: 'select', defaultValue: '' },
  { key: 'contractNumber', section: 'Umbrella Contract', label: 'Nomor Contract', placeholder: 'UC/CLIENT/2026/001', required: true },
  { key: 'contractStart', section: 'Umbrella Contract', label: 'Tanggal Mulai', type: 'date', required: true },
  {
    key: 'contractEnd',
    section: 'Umbrella Contract',
    label: 'Tanggal Berakhir',
    type: 'date',
    required: true,
    expiryAlert: { label: 'Umbrella Contract' },
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
  const archive = useArchiveData();
  const userRows = archive.masters?.users?.length ? archive.masters.users : fallbackUsers;
  const activeSalesUsers = useMemo(() => (
    userRows
      .filter((user) => user.role === USER_ROLES.SALES && (!user.status || user.status === 'Aktif'))
      .map((user) => String(user.name || user.fullName || '').trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'id'))
  ), [userRows]);
  const fields = useMemo(() => baseFields.map((field) => {
    if (field.key !== 'salesName') return field;
    return {
      ...field,
      options: (form) => {
        const currentValue = String(form.salesName || '').trim();
        const names = activeSalesUsers.includes(currentValue) || !currentValue
          ? activeSalesUsers
          : [currentValue, ...activeSalesUsers];
        return [
          { value: '', label: 'Pilih sales' },
          ...names.map((name) => ({ value: name, label: name })),
        ];
      },
    };
  }), [activeSalesUsers]);

  return (
    <MasterDataPage
      eyebrow="Master Data"
      title="Master Client"
      singular="Client"
      description="Kelola identitas customer, alamat, PIC, informasi kontak, NPWP, dan umbrella contract."
      fields={fields}
      columns={[
        { key: 'rowNumber', label: 'No', render: (_, __, meta) => <span className="customer-number-cell">{meta.rowNumber}</span> },
        { key: 'name', label: 'Customer', render: (_, row) => <CustomerName row={row} /> },
        { key: 'npwp', label: 'NPWP', render: (value) => <CustomerValue value={value} /> },
        { key: 'pic', label: 'PIC', render: (value) => <CustomerValue value={value} emphasis /> },
        { key: 'phone', label: 'Kontak', render: (value) => <CustomerValue value={value} /> },
        {
          key: 'npwpDocument',
          label: 'Copy NPWP',
          render: (value) => <CustomerDocumentView file={value} documentName="dokumen NPWP" />,
        },
        {
          key: 'contractDocument',
          label: 'UB',
          render: (value) => <CustomerDocumentView file={value} documentName="dokumen Umbrella Contract" />,
        },
        { key: 'salesName', label: 'Sales', render: (value) => <CustomerValue value={value} emphasis /> },
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
      toolbarDescription="Cari customer, NPWP, PIC, kontak, UB, atau nama sales."
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
