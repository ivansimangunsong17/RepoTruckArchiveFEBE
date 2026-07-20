import MasterDataPage, { DetailDocumentActions } from '../../components/master/MasterDataPage';
import MasterExpiryDate from '../../components/master/MasterExpiryDate';
import { buildOperationalJobs, getActiveOperationalJobs } from '../../data/operationalDashboard';
import { fallbackDrivers, fallbackTruckUnits } from '../../data/truckData';
import { useArchiveData } from '../../hooks/useArchiveData';

function formatTruckNumber(unitCode) {
  const value = String(unitCode || '-').trim();
  if (!value || value === '-') return '-';
  return value.replace(/^TRK-?/i, '') || value;
}

function getTruckRows() {
  try {
    const stored = JSON.parse(localStorage.getItem('tms-master-trucks-v2'));
    return Array.isArray(stored) && stored.length ? stored : fallbackTruckUnits;
  } catch {
    return fallbackTruckUnits;
  }
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function getDriverTruck(row, trucks) {
  return (trucks || []).find((item) => normalizeName(item.defaultDriver) === normalizeName(row.name));
}

function getUnitSequence(unitCode) {
  const match = String(unitCode || '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function sortDriversByTruck(rows, trucks) {
  return [...rows].sort((left, right) => {
    const leftTruck = getDriverTruck(left, trucks);
    const rightTruck = getDriverTruck(right, trucks);
    const sequenceDiff = getUnitSequence(leftTruck?.unitCode) - getUnitSequence(rightTruck?.unitCode);
    if (sequenceDiff !== 0) return sequenceDiff;
    return String(left.name || '').localeCompare(String(right.name || ''), 'id');
  });
}

function hasActiveDriverJob(row, activeJobs) {
  return (activeJobs || []).some((job) =>
    (job.driverId && row.id && job.driverId === row.id)
    || normalizeName(job.driver) === normalizeName(row.name));
}

function getDriverBaseStatus(row) {
  return ['Bertugas', 'Cuti', 'Tidak Aktif'].includes(row.status) ? row.status : 'Aktif';
}

function getDriverStatus(row, activeJobs) {
  const baseStatus = getDriverBaseStatus(row);
  if (baseStatus !== 'Aktif') return baseStatus;
  return hasActiveDriverJob(row, activeJobs) ? 'Bertugas' : 'Aktif';
}

function DriverIdentity({ row }) {
  return <span className="driver-name-cell">{row.name}</span>;
}

function DriverNumber({ row, trucks }) {
  const truck = getDriverTruck(row, trucks);
  return <span className="driver-number-cell">{formatTruckNumber(truck?.unitCode)}</span>;
}

function DriverStatus({ row, activeJobs }) {
  const status = getDriverStatus(row, activeJobs);
  const statusClass = status === 'Aktif' ? 'available' : status === 'Bertugas' ? 'in_use' : 'maintenance';
  return <span className={`driver-status-pill ${statusClass}`}><i />{status}</span>;
}

function DriverPlate({ row, trucks }) {
  const truck = getDriverTruck(row, trucks);
  return <span className="driver-plate-cell">{truck?.plateNumber || '-'}</span>;
}

function DriverLicense({ row }) {
  return <MasterExpiryDate value={row.licenseExpiry} />;
}

function getDriverPaymentLabel(row) {
  if (row.paymentMethod === 'emoney') {
    return [row.emoneyProvider || 'E-Money', row.emoneyNumber].filter(Boolean).join(' ') || '-';
  }
  return [row.bankName, row.bankAccountNumber].filter(Boolean).join(' ') || '-';
}

function DriverPayment({ row }) {
  return (
    <div className="driver-doc-cell">
      <strong>{getDriverPaymentLabel(row)}</strong>
    </div>
  );
}

function DriverDocumentSummary({ row }) {
  const documents = [
    row.driverPhoto,
    row.identityDocument,
    row.licenseDocument,
    row.partnershipLetter,
  ];
  const complete = documents.filter(Boolean).length;
  return (
    <div className="driver-doc-cell">
      <strong>{complete}/{documents.length}</strong>
    </div>
  );
}

const DRIVER_DOCUMENT_FIELD_KEYS = new Set([
  'driverPhoto',
  'identityDocument',
  'licenseDocument',
  'partnershipLetter',
]);

function DriverDocumentDetail({ row }) {
  const documents = [
    { label: 'Foto Sopir', file: row.driverPhoto },
    { label: 'KTP Driver', file: row.identityDocument },
    { label: 'Dokumen SIM', file: row.licenseDocument },
    { label: 'Surat Kemitraan', file: row.partnershipLetter },
  ];

  return (
    <div className="driver-document-detail-table">
      <div className="driver-document-detail-head">
        <strong>Jenis Dokumen</strong>
        <strong>View dan Download</strong>
      </div>
      {documents.map((document) => (
        <div className="driver-document-detail-row" key={document.label}>
          <strong>{document.label}</strong>
          <DetailDocumentActions file={document.file} />
        </div>
      ))}
    </div>
  );
}

const fields = [
  { key: 'name', section: 'Identitas Driver', label: 'Nama Driver', placeholder: 'Nama lengkap sesuai identitas', required: true },
  { key: 'phone', section: 'Identitas Driver', label: 'Kontak Driver', placeholder: '08xx xxxx xxxx', required: true },
  { key: 'paymentMethod', section: 'Pembayaran UJ Sopir', label: 'Metode Pembayaran', type: 'select', defaultValue: 'bank', options: [
    { value: 'bank', label: 'Bank Transfer' }, { value: 'emoney', label: 'E-Money' },
  ] },
  { key: 'bankName', section: 'Pembayaran UJ Sopir', label: 'Nama Bank', placeholder: 'Contoh: BCA / Mandiri / BRI', showIf: (form) => form.paymentMethod !== 'emoney' },
  { key: 'bankAccountNumber', section: 'Pembayaran UJ Sopir', label: 'No. Rekening Sopir', placeholder: 'Nomor rekening', inputMode: 'numeric', showIf: (form) => form.paymentMethod !== 'emoney' },
  { key: 'bankAccountHolder', section: 'Pembayaran UJ Sopir', label: 'Nama Pemilik Rekening', placeholder: 'Nama sesuai rekening', showIf: (form) => form.paymentMethod !== 'emoney' },
  { key: 'emoneyProvider', section: 'Pembayaran UJ Sopir', label: 'Provider E-Money', placeholder: 'Contoh: OVO / DANA / GoPay', showIf: (form) => form.paymentMethod === 'emoney' },
  { key: 'emoneyNumber', section: 'Pembayaran UJ Sopir', label: 'No. E-Money', placeholder: 'Nomor HP / akun e-money', inputMode: 'numeric', showIf: (form) => form.paymentMethod === 'emoney' },
  { key: 'licenseType', section: 'Informasi SIM', label: 'Jenis SIM', type: 'select', defaultValue: 'SIM B2 Umum', options: [
    { value: 'SIM B1 Umum', label: 'SIM B1 Umum' }, { value: 'SIM B2 Umum', label: 'SIM B2 Umum' },
  ] },
  { key: 'licenseExpiry', section: 'Informasi SIM', label: 'Masa Berlaku SIM', type: 'date', required: true, hint: 'Sistem akan menandai SIM yang mendekati kedaluwarsa.', expiryAlert: { label: 'SIM' } },
  { key: 'status', section: 'Status Ketersediaan', label: 'Status Driver', type: 'select', defaultValue: 'Aktif', normalize: (value) => (value === 'Bertugas' ? 'Aktif' : value), options: [
    { value: 'Aktif', label: 'Aktif / Standby' }, { value: 'Cuti', label: 'Cuti' }, { value: 'Tidak Aktif', label: 'Tidak Aktif' },
  ] },
  { key: 'healthStatus', section: 'Status Ketersediaan', label: 'Status Kesehatan', type: 'select', defaultValue: 'Aman', options: [
    { value: 'Aman', label: 'Aman' }, { value: 'Perlu Cek', label: 'Perlu Cek' }, { value: 'Tidak Fit', label: 'Tidak Fit' },
  ] },
  { key: 'notes', section: 'Status Ketersediaan', label: 'Catatan', type: 'textarea', placeholder: 'Catatan tambahan driver', full: true },
  { key: 'driverPhoto', section: 'Dokumen Driver', label: 'Foto Sopir', type: 'file', accept: '.jpg,.jpeg,.png', hint: 'Gunakan foto wajah sopir untuk identifikasi operational.' },
  { key: 'identityDocument', section: 'Dokumen Driver', label: 'KTP Driver', type: 'file' },
  { key: 'licenseDocument', section: 'Dokumen Driver', label: 'Dokumen SIM', type: 'file' },
  { key: 'partnershipLetter', section: 'Dokumen Driver', label: 'Surat Kemitraan', type: 'file', accept: '.pdf,.jpg,.jpeg,.png', hint: 'Upload surat perjanjian atau kemitraan sopir.' },
];

function DriversPage() {
  const archive = useArchiveData();
  const truckRows = archive.masters?.trucks?.length ? archive.masters.trucks : getTruckRows();
  const activeJobs = getActiveOperationalJobs(buildOperationalJobs(archive.orders));
  const detailFields = [
    ...fields
      .filter((field) => !DRIVER_DOCUMENT_FIELD_KEYS.has(field.key))
      .map((field) => {
        if (field.key === 'licenseExpiry') {
          return {
            ...field,
            renderDetail: (value) => <MasterExpiryDate value={value} label="SIM" />,
          };
        }
        return field;
      }),
    {
      key: 'driverDocumentDetail',
      label: 'Dokumen Sopir',
      full: true,
      renderDetail: (_, row) => <DriverDocumentDetail row={row} />,
    },
  ];

  return (
    <MasterDataPage
      eyebrow="Master Data"
      title="Data Sopir"
      singular="Sopir"
      description="Daftar sopir untuk assignment truck dan perjalanan harian."
      fields={fields}
      detailFields={detailFields}
      columns={[
        { key: 'truckNumber', label: 'No', render: (_, row) => <DriverNumber row={row} trucks={truckRows} /> },
        { key: 'name', label: 'Nama Sopir', render: (_, row) => <DriverIdentity row={row} /> },
        { key: 'plateNumber', label: 'Plat', render: (_, row) => <DriverPlate row={row} trucks={truckRows} /> },
        { key: 'licenseExpiry', label: 'Masa SIM', render: (_, row) => <DriverLicense row={row} /> },
        { key: 'paymentMethod', label: 'Rekening / E-Money', render: (_, row) => <DriverPayment row={row} /> },
        { key: 'status', label: 'Kondisi', render: (_, row) => <DriverStatus row={row} activeJobs={activeJobs} /> },
        { key: 'licenseDocument', label: 'Dokumen', render: (_, row) => <DriverDocumentSummary row={row} /> },
      ]}
      initialRows={fallbackDrivers}
      resource="drivers"
      storageKey="tms-master-drivers-v2"
      uniqueKeys={['phone']}
      filters={[{ key: 'status', label: 'Semua Status Driver', options: ['Aktif', 'Bertugas', 'Cuti', 'Tidak Aktif'] }]}
      pageClassName="driver-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar Sopir"
      toolbarDescription="Cari nama, cek status, masa SIM, dan kelengkapan dokumen."
      sortRows={(rows) => sortDriversByTruck(rows, truckRows)}
      stats={(data) => [
        { label: 'Total Sopir', value: data.length, detail: 'Terdaftar' },
        { label: 'Siap', value: data.filter((item) => getDriverStatus(item, activeJobs) === 'Aktif').length, detail: 'Bisa dipakai' },
        { label: 'Jalan', value: data.filter((item) => getDriverStatus(item, activeJobs) === 'Bertugas').length, detail: 'Ada job aktif' },
        { label: 'Tidak Siap', value: data.filter((item) => ['Cuti', 'Tidak Aktif'].includes(getDriverStatus(item, activeJobs))).length, detail: 'Cuti/nonaktif' },
      ]}
    />
  );
}

export default DriversPage;

