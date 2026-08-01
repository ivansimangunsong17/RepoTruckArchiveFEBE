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

function isDriverBlacklisted(row) {
  return row?.status === 'Blacklist';
}

function sortDriversByTruck(rows, trucks) {
  return [...rows].sort((left, right) => {
    const blacklistDiff = Number(isDriverBlacklisted(left)) - Number(isDriverBlacklisted(right));
    if (blacklistDiff !== 0) return blacklistDiff;
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
  return ['Cuti', 'Tidak Aktif', 'Blacklist'].includes(row.status) ? row.status : 'Aktif';
}

function getDriverStatus(row, activeJobs) {
  const baseStatus = getDriverBaseStatus(row);
  if (baseStatus !== 'Aktif') return baseStatus;
  return hasActiveDriverJob(row, activeJobs) ? 'Bertugas' : 'Aktif';
}

function DriverIdentity({ row }) {
  return <span className="driver-name-cell" title={row.name || ''}>{row.nickname || row.name}</span>;
}

function calculateDriverAge(birthDate, referenceDate = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  let age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  const dayDiff = referenceDate.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age >= 0 ? age : null;
}

function DriverAge({ row }) {
  const age = calculateDriverAge(row.birthDate);
  return <span className="master-plain-cell strong">{age === null ? '-' : `${age} th`}</span>;
}

function DriverNumber({ row, trucks }) {
  const truck = getDriverTruck(row, trucks);
  return <span className="driver-number-cell">{formatTruckNumber(truck?.unitCode)}</span>;
}

function DriverStatus({ row, activeJobs }) {
  const status = getDriverStatus(row, activeJobs);
  const statusClass = status === 'Aktif' ? 'available' : status === 'Bertugas' ? 'in_use' : status === 'Blacklist' ? 'blacklist' : 'maintenance';
  return <span className={`driver-status-pill ${statusClass}`}><i />{status}</span>;
}

function DriverPlate({ row, trucks }) {
  const truck = getDriverTruck(row, trucks);
  return <span className="driver-plate-cell">{truck?.plateNumber || '-'}</span>;
}

function DriverLicense({ row }) {
  return <MasterExpiryDate value={row.licenseExpiry} />;
}

function getDriverPaymentInfo(row) {
  if (row.paymentMethod === 'emoney') {
    const account = [row.emoneyProvider || 'E-Money', row.emoneyNumber].filter(Boolean).join(' ');
    return {
      account: account || '-',
      holder: row.emoneyAccountHolder || '',
    };
  }
  return {
    account: [row.bankName, row.bankAccountNumber].filter(Boolean).join(' ') || '-',
    holder: row.bankAccountHolder || '',
  };
}

function DriverPayment({ row }) {
  const payment = getDriverPaymentInfo(row);
  return (
    <div className="driver-payment-cell">
      <strong>{payment.account}</strong>
      <span>{payment.holder || '-'}</span>
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

function DriverDocumentDetail({ row, renderViewerDocumentNote = null }) {
  const documents = [
    { key: 'driverPhoto', label: 'Foto Sopir', file: row.driverPhoto },
    { key: 'identityDocument', label: 'KTP Driver', file: row.identityDocument },
    { key: 'licenseDocument', label: 'Dokumen SIM', file: row.licenseDocument },
    { key: 'partnershipLetter', label: 'Surat Kemitraan', file: row.partnershipLetter },
  ];
  const showNotes = typeof renderViewerDocumentNote === 'function';

  return (
    <div className="master-document-note-layout">
      <div className={`driver-document-detail-table ${showNotes ? 'has-notes' : ''}`}>
        <div className="driver-document-detail-head">
          <strong>Jenis Dokumen</strong>
          <strong>View dan Download</strong>
          {showNotes ? <strong>Catatan</strong> : null}
        </div>
        {documents.map((document) => (
          <div className="driver-document-detail-row" key={document.key}>
            <strong>{document.label}</strong>
            <DetailDocumentActions file={document.file} />
            {showNotes ? renderViewerDocumentNote(document.key, document.label) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const fields = [
  { key: 'name', section: 'Identitas Driver', label: 'Nama Lengkap Driver', placeholder: 'Nama lengkap sesuai identitas', required: true },
  { key: 'nickname', section: 'Identitas Driver', label: 'Nama Panggilan', placeholder: 'Contoh: Safei / Tono' },
  {
    key: 'nik',
    section: 'Identitas Driver',
    label: 'NIK',
    placeholder: '16 digit NIK KTP',
    inputMode: 'numeric',
    hint: 'Opsional, isi sesuai NIK pada KTP sopir.',
    validate: (form) => (form.nik && !/^\d{16}$/.test(String(form.nik).trim()) ? 'NIK harus 16 digit angka.' : ''),
  },
  { key: 'birthDate', section: 'Identitas Driver', label: 'Tanggal Lahir', type: 'date' },
  { key: 'phone', section: 'Identitas Driver', label: 'Kontak Driver', placeholder: '08xx xxxx xxxx', required: true },
  { key: 'paymentMethod', section: 'Pembayaran UJ Sopir', label: 'Metode Pembayaran', type: 'select', defaultValue: 'bank', options: [
    { value: 'bank', label: 'Bank Transfer' }, { value: 'emoney', label: 'E-Money' },
  ] },
  { key: 'bankName', section: 'Pembayaran UJ Sopir', label: 'Nama Bank', placeholder: 'Contoh: BCA / Mandiri / BRI', showIf: (form) => form.paymentMethod !== 'emoney' },
  { key: 'bankAccountNumber', section: 'Pembayaran UJ Sopir', label: 'No. Rekening Sopir', placeholder: 'Nomor rekening', inputMode: 'numeric', showIf: (form) => form.paymentMethod !== 'emoney' },
  { key: 'bankAccountHolder', section: 'Pembayaran UJ Sopir', label: 'Nama Pemilik Rekening', placeholder: 'Nama sesuai rekening', showIf: (form) => form.paymentMethod !== 'emoney' },
  { key: 'emoneyProvider', section: 'Pembayaran UJ Sopir', label: 'Provider E-Money', placeholder: 'Contoh: OVO / DANA / GoPay', showIf: (form) => form.paymentMethod === 'emoney' },
  { key: 'emoneyNumber', section: 'Pembayaran UJ Sopir', label: 'No. E-Money', placeholder: 'Nomor HP / akun e-money', inputMode: 'numeric', showIf: (form) => form.paymentMethod === 'emoney' },
  { key: 'emoneyAccountHolder', section: 'Pembayaran UJ Sopir', label: 'Nama Pemilik E-Money', placeholder: 'Nama pemilik akun e-money', showIf: (form) => form.paymentMethod === 'emoney' },
  { key: 'licenseType', section: 'Informasi SIM', label: 'Jenis SIM', type: 'select', defaultValue: 'SIM B2 Umum', options: [
    { value: 'SIM B1 Umum', label: 'SIM B1 Umum' }, { value: 'SIM B2 Umum', label: 'SIM B2 Umum' },
  ] },
  { key: 'licenseExpiry', section: 'Informasi SIM', label: 'Masa Berlaku SIM', type: 'date', required: true, hint: 'Sistem akan menandai SIM yang mendekati kedaluwarsa.', expiryAlert: { label: 'SIM' } },
  { key: 'status', section: 'Status Ketersediaan', label: 'Status Driver', type: 'select', defaultValue: 'Aktif', normalize: (value) => (value === 'Bertugas' ? 'Aktif' : value), options: [
    { value: 'Aktif', label: 'Aktif / Standby' }, { value: 'Cuti', label: 'Cuti' }, { value: 'Tidak Aktif', label: 'Tidak Aktif' }, { value: 'Blacklist', label: 'Blacklist' },
  ] },
  {
    key: 'blacklistedAt',
    section: 'Blacklist Sopir',
    label: 'Tanggal Blacklist',
    type: 'date',
    showIf: (form) => form.status === 'Blacklist',
    hint: 'Jika kosong, sistem akan memakai tanggal hari ini saat disimpan.',
  },
  {
    key: 'blacklistReason',
    section: 'Blacklist Sopir',
    label: 'Alasan Blacklist',
    type: 'textarea',
    placeholder: 'Tuliskan alasan sopir masuk blacklist',
    full: true,
    showIf: (form) => form.status === 'Blacklist',
    validate: (form) => (form.status === 'Blacklist' && !String(form.blacklistReason || '').trim() ? 'Alasan blacklist wajib diisi.' : ''),
  },
  {
    key: 'blacklistNotes',
    section: 'Blacklist Sopir',
    label: 'Catatan Blacklist',
    type: 'textarea',
    placeholder: 'Catatan tambahan opsional',
    full: true,
    showIf: (form) => form.status === 'Blacklist',
  },
  { key: 'healthStatus', section: 'Status Ketersediaan', label: 'Status Kesehatan', type: 'select', defaultValue: 'Aman', options: [
    { value: 'Aman', label: 'Aman' }, { value: 'Perlu Cek', label: 'Perlu Cek' }, { value: 'Tidak Fit', label: 'Tidak Fit' },
  ] },
  { key: 'notes', section: 'Status Ketersediaan', label: 'Catatan', type: 'textarea', placeholder: 'Catatan tambahan driver', full: true },
  { key: 'driverPhoto', section: 'Dokumen Driver', label: 'Foto Sopir', type: 'file', accept: '.jpg,.jpeg,.png', hint: 'Gunakan foto wajah sopir untuk identifikasi operational.' },
  { key: 'identityDocument', section: 'Dokumen Driver', label: 'KTP Driver', type: 'file' },
  { key: 'licenseDocument', section: 'Dokumen Driver', label: 'Dokumen SIM', type: 'file' },
  { key: 'partnershipLetter', section: 'Dokumen Driver', label: 'Surat Kemitraan', type: 'file', accept: '.pdf,.jpg,.jpeg,.png', hint: 'Upload surat perjanjian atau kemitraan sopir.' },
];

function todayDateInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

async function prepareDriverSave({ payload, editingId, rows, confirmAction, activeJobs = [] }) {
  if (payload.status !== 'Blacklist') return { payload };

  const existing = rows.find((row) => String(row.id) === String(editingId));
  const wasBlacklisted = existing?.status === 'Blacklist';
  const blacklistPayload = {
    ...payload,
    blacklistedAt: payload.blacklistedAt || todayDateInput(),
  };

  if (wasBlacklisted) return { payload: blacklistPayload };

  const activeJobWarning = hasActiveDriverJob(payload, activeJobs)
    ? ' Sopir ini masih terdeteksi memiliki job aktif, pastikan keputusan sudah sesuai kondisi operasional.'
    : '';
  const approved = await confirmAction({
    title: 'Blacklist sopir ini?',
    message: `Sopir yang masuk blacklist tidak akan diprioritaskan untuk assignment job berikutnya. Alasan: ${payload.blacklistReason}.${activeJobWarning}`,
    confirmLabel: 'Ya, Blacklist Sopir',
    cancelLabel: 'Batal',
    tone: 'danger',
  });

  if (!approved) return null;
  return { payload: blacklistPayload };
}

function DriversPage({ readOnly = false }) {
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
      renderDetail: (_, row, meta) => <DriverDocumentDetail row={row} renderViewerDocumentNote={meta.renderViewerDocumentNote} />,
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
        { key: 'nickname', label: 'Nama Panggilan', render: (_, row) => <DriverIdentity row={row} /> },
        { key: 'nik', label: 'NIK', render: (value) => <span className="master-plain-cell">{value || '-'}</span> },
        { key: 'birthDate', label: 'Umur', render: (_, row) => <DriverAge row={row} /> },
        { key: 'plateNumber', label: 'Plat', render: (_, row) => <DriverPlate row={row} trucks={truckRows} /> },
        { key: 'licenseExpiry', label: 'Masa SIM', render: (_, row) => <DriverLicense row={row} /> },
        { key: 'paymentMethod', label: 'Rekening / E-Money', render: (_, row) => <DriverPayment row={row} /> },
        { key: 'status', label: 'Kondisi', render: (_, row) => <DriverStatus row={row} activeJobs={activeJobs} /> },
        { key: 'licenseDocument', label: 'Dokumen', render: (_, row) => <DriverDocumentSummary row={row} /> },
      ]}
      initialRows={fallbackDrivers}
      resource="drivers"
      storageKey="tms-master-drivers-v2"
      uniqueKeys={['phone', 'nik']}
      filters={[{ key: 'status', label: 'Semua Status Driver', options: ['Aktif', 'Bertugas', 'Cuti', 'Tidak Aktif', 'Blacklist'] }]}
      pageClassName="driver-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar Sopir"
      toolbarDescription="Cari nama panggilan, cek status, masa SIM, dan kelengkapan dokumen."
      sortRows={(rows) => sortDriversByTruck(rows, truckRows)}
      beforeSave={(args) => prepareDriverSave({ ...args, activeJobs })}
      stats={(data) => [
        { label: 'Total Sopir', value: data.length, detail: 'Terdaftar' },
        { label: 'Siap', value: data.filter((item) => getDriverStatus(item, activeJobs) === 'Aktif').length, detail: 'Bisa dipakai' },
        { label: 'Jalan', value: data.filter((item) => getDriverStatus(item, activeJobs) === 'Bertugas').length, detail: 'Ada job aktif' },
        { label: 'Tidak Siap', value: data.filter((item) => ['Cuti', 'Tidak Aktif'].includes(getDriverStatus(item, activeJobs))).length, detail: 'Cuti/nonaktif' },
        { label: 'Blacklist', value: data.filter((item) => getDriverStatus(item, activeJobs) === 'Blacklist').length, detail: 'Tidak dipakai' },
      ]}
      readOnly={readOnly}
    />
  );
}

export default DriversPage;

