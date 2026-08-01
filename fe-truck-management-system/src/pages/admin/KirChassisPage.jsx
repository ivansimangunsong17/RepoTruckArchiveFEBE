import MasterDataPage, { DetailDocumentActions } from '../../components/master/MasterDataPage';
import MasterExpiryDate from '../../components/master/MasterExpiryDate';
import { useArchiveData } from '../../hooks/useArchiveData';

const emptyRows = [];

function ChassisStatus({ value }) {
  const statusClass = value === 'Aktif' ? 'available' : value === 'Perlu Perpanjang' ? 'in_use' : 'maintenance';
  return <span className={`master-status-dot ${statusClass}`}><i />{value || '-'}</span>;
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function getChassisCandidates(row = {}) {
  return [row.id, row.chassisCode, row.kirNumber, row.plateNumber]
    .filter(Boolean)
    .map(normalizeName);
}

function findConnectedTruck(chassis, trucks = []) {
  const candidates = getChassisCandidates(chassis);
  if (!candidates.length) return null;
  return (trucks || []).find((truck) => candidates.includes(normalizeName(truck.kirChassisNumber))) || null;
}

function ConnectedTruckPlate({ row, trucks }) {
  const truck = findConnectedTruck(row, trucks);
  return <span className="master-plain-cell strong">{truck?.plateNumber || '-'}</span>;
}

function formatDisplayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function DateDetail({ value }) {
  return <span className="master-plain-cell strong">{formatDisplayDate(value)}</span>;
}

const fields = [
  { key: 'chassisCode', section: 'Identitas Chassis', label: 'Kode Chassis', placeholder: 'Contoh: CHS-001', required: true },
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
  { key: 'receivedDate', section: 'Identitas Chassis', label: 'Tanggal Unit Diterima', type: 'date', hint: 'Tanggal chassis resmi masuk ke armada. Bisa dikosongkan jika belum diketahui.' },
  { key: 'kirNumber', section: 'Dokumen Chassis', label: 'Nomor Chassis', placeholder: 'Contoh: CHS-DOC-2026-001' },
  { key: 'kirExpiryDate', section: 'Dokumen Chassis', label: 'KIR OFF', type: 'date', expiryAlert: { label: 'KIR Chassis' } },
  {
    key: 'status',
    section: 'Status',
    label: 'Status Chassis',
    type: 'select',
    defaultValue: 'Aktif',
    options: [
      { value: 'Aktif', label: 'Aktif' },
      { value: 'Perlu Perpanjang', label: 'Perlu Perpanjang' },
      { value: 'Tidak Aktif', label: 'Tidak Aktif' },
    ],
  },
  { key: 'notes', section: 'Catatan', label: 'Catatan', type: 'textarea', placeholder: 'Catatan tambahan', full: true },
  { key: 'photoDocument', section: 'Dokumen Chassis', label: 'Foto Chassis', type: 'file', accept: '.jpg,.jpeg,.png', full: true },
];

const CHASSIS_DOCUMENT_FIELD_KEYS = new Set(['photoDocument']);

function ChassisDocumentDetail({ row, renderViewerDocumentNote = null }) {
  const showNotes = typeof renderViewerDocumentNote === 'function';

  return (
    <div className="master-document-note-layout">
      <div className={`driver-document-detail-table chassis-document-detail-table ${showNotes ? 'has-notes' : ''}`}>
        <div className="driver-document-detail-head">
          <strong>Jenis Dokumen</strong>
          <strong>View dan Download</strong>
          {showNotes ? <strong>Catatan</strong> : null}
        </div>
        <div className="driver-document-detail-row">
          <strong>Foto Chassis</strong>
          <DetailDocumentActions file={row.photoDocument} />
          {showNotes ? renderViewerDocumentNote('photoDocument', 'Foto Chassis') : null}
        </div>
      </div>
    </div>
  );
}

function KirChassisPage({ readOnly = false }) {
  const archive = useArchiveData();
  const truckRows = archive.masters?.trucks || [];
  const detailFields = [
    ...fields.filter((field) => !CHASSIS_DOCUMENT_FIELD_KEYS.has(field.key)).map((field) => {
    if (field.key === 'receivedDate') {
      return {
        ...field,
        renderDetail: (value) => <DateDetail value={value} />,
      };
    }
    if (field.key === 'kirExpiryDate') {
      return {
        ...field,
        renderDetail: (value) => <MasterExpiryDate value={value} label="KIR Chassis" />,
      };
    }
    if (field.key === 'status') {
      return {
        ...field,
        renderDetail: (value) => <ChassisStatus value={value} />,
      };
    }
    return field;
    }),
    {
      key: 'chassisDocumentDetail',
      label: 'Dokumen Chassis',
      full: true,
      renderDetail: (_, row, meta) => <ChassisDocumentDetail row={row} renderViewerDocumentNote={meta.renderViewerDocumentNote} />,
    },
  ];

  return (
    <MasterDataPage
      eyebrow="Master Data"
      title="Master Data Chassis"
      singular="Data Chassis"
      description="Kelola data chassis, kapasitas container, masa berlaku chassis, dan dokumen pendukung."
      fields={fields}
      detailFields={detailFields}
      columns={[
        { key: 'chassisCode', label: 'Kode Chassis', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'plateNumber', label: 'Plat / Identitas', render: (_, row) => <ConnectedTruckPlate row={row} trucks={truckRows} /> },
        { key: 'capacity', label: 'Size', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'receivedDate', label: 'Diterima', render: (value) => <span className="master-plain-cell">{formatDisplayDate(value)}</span> },
        { key: 'kirNumber', label: 'Nomor Chassis', render: (value) => <span className="master-plain-cell">{value || '-'}</span> },
        { key: 'kirExpiryDate', label: 'KIR OFF', render: (value) => <MasterExpiryDate value={value} /> },
        { key: 'status', label: 'Status', render: (value) => <ChassisStatus value={value} /> },
      ]}
      initialRows={emptyRows}
      resource="kir-chassis"
      storageKey="tms-master-kir-chassis-v1"
      uniqueKeys={['chassisCode', 'kirNumber']}
      filters={[
        { key: 'status', label: 'Semua Status Chassis', options: ['Aktif', 'Perlu Perpanjang', 'Tidak Aktif'] },
        { key: 'size', label: 'Semua Size', options: ['20FT', '40FT', 'COMBO'] },
      ]}
      pageClassName="driver-data-page truck-data-page chassis-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar Data Chassis"
      toolbarDescription="Cari kode chassis, size, nomor chassis, dan status dokumen."
      stats={(data) => [
        { label: 'Total Chassis', value: data.length, detail: 'Data chassis terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Dokumen aman' },
        { label: 'Perlu Perpanjang', value: data.filter((item) => item.status === 'Perlu Perpanjang').length, detail: 'Perlu dicek' },
        { label: 'Tidak Aktif', value: data.filter((item) => item.status === 'Tidak Aktif').length, detail: 'Nonaktif' },
      ]}
      readOnly={readOnly}
    />
  );
}

export default KirChassisPage;
