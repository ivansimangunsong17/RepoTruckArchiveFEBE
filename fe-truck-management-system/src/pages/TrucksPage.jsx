import MasterDataPage, { DetailDocumentActions } from '../components/master/MasterDataPage';
import MasterExpiryDate from '../components/master/MasterExpiryDate';
import { buildOperationalJobs, getActiveOperationalJobs } from '../data/operationalDashboard';
import { fallbackDrivers, fallbackTruckUnits } from '../data/truckData';
import { useArchiveData } from '../hooks/useArchiveData';
import { useOperationalOrders } from '../hooks/useOperationalOrders';
import OperationalDataTruncatedNotice from '../components/common/OperationalDataTruncatedNotice';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useState } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { validateArchiveFile } from '../utils/fileValidation';
import DocumentLink from '../components/common/DocumentLink';
import {
  createVehicleDocument,
  createVehicleDocumentDownloadUrl,
  deleteVehicleDocument,
  fetchVehicleDocuments,
  updateVehicleDocument,
} from '../services/master-data/vehicleDocumentService';
import { hasPermission } from '../constants/roles';
import { formatMasterExpiryDate, getMasterExpiryState } from '../utils/masterExpiry';

const DOCUMENT_TYPES = [
  { value: 'STNK', label: 'STNK' },
];

const EMPTY_DOCUMENT_FORM = {
  documentType: 'STNK',
  documentNumber: '',
  issuedDate: '',
  expiredDate: '',
  file: null,
  notes: '',
};

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function hasActiveDriverJob(row, activeJobs) {
  return (activeJobs || []).some((job) =>
    (job.driverId && row.id && job.driverId === row.id)
    || normalizeName(job.driver) === normalizeName(row.name));
}

function getDriverBaseStatus(row) {
  return ['Cuti', 'Tidak Aktif'].includes(row.status) ? row.status : 'Aktif';
}

function getDriverStatus(row, activeJobs) {
  const baseStatus = getDriverBaseStatus(row);
  if (baseStatus !== 'Aktif') return baseStatus;
  return hasActiveDriverJob(row, activeJobs) ? 'Bertugas' : 'Aktif';
}

function sortDriversByName(rows) {
  return [...rows].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'id'));
}

function getDriverAssignedTruck(driverName, trucks = []) {
  const selectedDriver = normalizeName(driverName);
  if (!selectedDriver) return null;
  return trucks.find((truck) => normalizeName(truck.defaultDriver) === selectedDriver) || null;
}

function getDriverOptions(sourceDrivers, activeJobs = [], trucks = []) {
  const drivers = Array.isArray(sourceDrivers) && sourceDrivers.length ? sourceDrivers : fallbackDrivers;
  return sortDriversByName(drivers).map((driver) => {
    const status = getDriverStatus(driver, activeJobs);
    const assignedTruck = getDriverAssignedTruck(driver.name, trucks);
    const isAvailable = status === 'Aktif' && !assignedTruck;
    return {
      value: driver.name,
      label: isAvailable
        ? `${driver.name} - Aktif / Belum assign`
        : `${driver.name} - ${status}${assignedTruck ? ` / ${assignedTruck.unitCode || assignedTruck.plateNumber}` : ''}`,
      disabled: status !== 'Aktif',
      style: isAvailable
        ? { color: '#047857', fontWeight: 800 }
        : status === 'Aktif'
          ? { color: '#92400e', fontWeight: 700 }
          : { color: '#9ca3af' },
    };
  });
}

function getLocalDriverOptions(activeJobs = [], trucks = []) {
  try {
    const stored = JSON.parse(localStorage.getItem('tms-master-drivers-v2'));
    return getDriverOptions(stored, activeJobs, trucks);
  } catch {
    return getDriverOptions(fallbackDrivers, activeJobs, trucks);
  }
}

function normalizeChassisRows(rows) {
  return Array.isArray(rows) ? rows.filter((row) => row?.chassisCode || row?.plateNumber || row?.kirNumber) : [];
}

function getChassisCandidates(row = {}) {
  return [row.id, row.chassisCode, row.kirNumber, row.plateNumber]
    .filter(Boolean)
    .map(normalizeName);
}

function findTruckAssignedChassis(rows, chassisRow) {
  const candidates = getChassisCandidates(chassisRow);
  if (!candidates.length) return null;
  return (rows || []).find((truck) => candidates.includes(normalizeName(truck.kirChassisNumber))) || null;
}

function buildChassisOptions(rows, currentValue = '', truckRows = []) {
  const options = normalizeChassisRows(rows).map((row) => ({
    value: row.chassisCode || row.kirNumber,
    label: [
      row.chassisCode || '-',
      row.plateNumber || 'Tanpa plat',
      row.capacity || '-',
    ].join(' - '),
    assignedTruck: findTruckAssignedChassis(truckRows, row),
  })).map((option) => ({
    ...option,
    label: option.assignedTruck
      ? `${option.label} - Terhubung: ${option.assignedTruck.unitCode || '-'} (${option.assignedTruck.plateNumber || '-'})`
      : option.label,
    style: option.assignedTruck ? { color: '#92400e', fontWeight: 800 } : undefined,
  }));
  const hasCurrentValue = currentValue && options.some((option) => option.value === currentValue);
  if (!hasCurrentValue && currentValue) {
    return [{ value: currentValue, label: `${currentValue} - Data lama` }, ...options];
  }
  return options;
}

function getChassisCapacity(rows, chassisValue) {
  return getChassisRow(rows, chassisValue)?.capacity || '';
}

const INSURANCE_TYPE_OPTIONS = [
  { value: '', label: 'Pilih jenis asuransi' },
  { value: 'All Risk', label: 'All Risk' },
  { value: 'TLO', label: 'TLO' },
];

function createFields(driverOptions, chassisRows = [], truckRows = []) {
  return [
    { key: 'plateNumber', section: 'Identitas Unit', label: 'Nomor Polisi', placeholder: 'B 1234 CPL' },
    { key: 'unitCode', section: 'Identitas Unit', label: 'Kode Unit', placeholder: 'TRK-001', hint: 'Kode internal harus unik.' },
    { key: 'status', section: 'Identitas Unit', label: 'Status Truck', type: 'select', defaultValue: 'Aktif', normalize: (value) => (value === 'Bertugas' ? 'Aktif' : value), options: [
      { value: 'Aktif', label: 'Aktif / Standby' }, { value: 'Maintenance', label: 'Maintenance' }, { value: 'Tidak Aktif', label: 'Tidak Aktif' },
    ] },
    { key: 'receivedDate', section: 'Identitas Unit', label: 'Tanggal Unit Diterima', type: 'date', hint: 'Tanggal unit resmi masuk ke armada. Bisa dikosongkan jika belum diketahui.' },
    { key: 'brand', section: 'Spesifikasi Kendaraan', label: 'Merk Truck', placeholder: 'Contoh: Hino' },
    { key: 'type', section: 'Spesifikasi Kendaraan', label: 'Tipe Truck', placeholder: 'Contoh: Ranger FG 235 JJ' },
    { key: 'vin', section: 'Nomor Identifikasi Kendaraan', label: 'Nomor Rangka (VIN)', placeholder: 'Masukkan nomor rangka kendaraan' },
    { key: 'engineNumber', section: 'Nomor Identifikasi Kendaraan', label: 'Nomor Mesin', placeholder: 'Masukkan nomor mesin kendaraan' },
    {
      key: 'kirChassisNumber',
      section: 'Data Chassis',
      sectionClassName: 'accent-chassis',
      label: 'Chassis',
      type: 'select',
      defaultValue: '',
      full: true,
      options: (form) => {
        const options = buildChassisOptions(chassisRows, form.kirChassisNumber, truckRows);
        return [{ value: '', label: options.length ? 'Pilih chassis dari master' : 'Belum ada data master chassis' }, ...options];
      },
      onChange: (value, form) => {
        const capacity = getChassisCapacity(chassisRows, value);
        return {
          ...form,
          kirChassisNumber: value,
          capacity: capacity || form.capacity,
        };
      },
      hint: 'Pilih chassis dari master data jika unit sudah dipasangkan.',
      warning: (form, { editingId } = {}) => {
        const assignedTruck = findChassisAssignedTrucks(truckRows, form.kirChassisNumber, editingId, chassisRows)[0];
        if (!assignedTruck) return '';
        return `Chassis ini sudah terhubung ke ${assignedTruck.unitCode || '-'} (${assignedTruck.plateNumber || '-'}). Saat disimpan, sistem akan meminta persetujuan pemindahan.`;
      },
    },
    {
      key: 'kirNumber',
      section: 'Dokumen Kendaraan',
      sectionClassName: 'accent-documents',
      label: 'Nomor KIR',
      placeholder: 'Opsional, bisa dilengkapi nanti',
      className: 'vehicle-document-field vehicle-document-number',
    },
    { key: 'kirExpiryDate', section: 'Dokumen Kendaraan', label: 'Tanggal KIR OFF', type: 'date', className: 'vehicle-document-field vehicle-document-date', expiryAlert: { label: 'KIR Truck' } },
    { key: 'kirDocument', section: 'Dokumen Kendaraan', label: 'Dokumen KIR', type: 'file', className: 'vehicle-document-field vehicle-document-upload', compactUpload: true },
    { key: 'stnkNumber', section: 'Dokumen Kendaraan', label: 'Nomor STNK', placeholder: 'Opsional, bisa dilengkapi nanti', className: 'vehicle-document-field vehicle-document-number' },
    { key: 'stnkExpiryDate', section: 'Dokumen Kendaraan', label: 'Tanggal STNK OFF', type: 'date', className: 'vehicle-document-field vehicle-document-date', expiryAlert: { label: 'STNK' } },
    { key: 'stnkDocument', section: 'Dokumen Kendaraan', label: 'Dokumen STNK', type: 'file', className: 'vehicle-document-field vehicle-document-upload', compactUpload: true },
    { key: 'stidCode', section: 'Dokumen Kendaraan', label: 'Nomor STID', placeholder: 'Opsional, bisa dilengkapi nanti', className: 'vehicle-document-field vehicle-document-number' },
    { key: 'stidExpiryDate', section: 'Dokumen Kendaraan', label: 'Tanggal STID OFF', type: 'date', className: 'vehicle-document-field vehicle-document-date', expiryAlert: { label: 'STID' } },
    { key: 'stidDocument', section: 'Dokumen Kendaraan', label: 'Dokumen STID', type: 'file', className: 'vehicle-document-field vehicle-document-upload', compactUpload: true },
    { key: 'solarBarcodeNumber', section: 'Dokumen Kendaraan', label: 'Nomor Barcode Solar', placeholder: 'Opsional, bisa dilengkapi nanti', className: 'vehicle-document-field vehicle-document-number' },
    { key: 'solarBarcodeDate', section: 'Dokumen Kendaraan', label: 'Tanggal Barcode Solar', type: 'date', className: 'vehicle-document-field vehicle-document-date' },
    { key: 'solarBarcodeDocument', section: 'Dokumen Kendaraan', label: 'Dokumen Barcode Solar', type: 'file', className: 'vehicle-document-field vehicle-document-upload', compactUpload: true },
    { key: 'taxPaymentDate', section: 'Dokumen Kendaraan', label: 'Tanggal Bayar Pajak', type: 'date', className: 'vehicle-document-field vehicle-document-tax' },
    { key: 'photoDocument', section: 'Dokumen Kendaraan', label: 'Foto Unit Truck', type: 'file', accept: '.jpg,.jpeg,.png', className: 'vehicle-document-field vehicle-document-photo', compactUpload: true },
    { key: 'insuranceType', section: 'Asuransi Kendaraan', label: 'Jenis Asuransi', type: 'select', defaultValue: '', options: INSURANCE_TYPE_OPTIONS, className: 'span-quarter' },
    { key: 'insurancePolicyNumber', section: 'Asuransi Kendaraan', label: 'Nomor Asuransi', placeholder: 'Contoh: POL-TRK-001', className: 'span-quarter' },
    { key: 'insuranceExpiryDate', section: 'Asuransi Kendaraan', label: 'Tanggal Berakhir', type: 'date', className: 'span-quarter', expiryAlert: { label: 'Asuransi Truck' } },
    { key: 'insuranceDocument', section: 'Asuransi Kendaraan', label: 'Upload Dokumen', type: 'file', className: 'span-quarter', compactUpload: true },
    { key: 'defaultDriver', section: 'Assignment Default', label: 'Driver Tetap', type: 'select', defaultValue: '', options: [{ value: '', label: 'Belum di-assign' }, ...driverOptions], hint: 'Opsional. Jika kosong, truck tetap berdiri sendiri sampai admin memilih sopir.' },
  ];
}

function documentTypeLabel(value) {
  return DOCUMENT_TYPES.find((item) => item.value === value)?.label || value || '-';
}

function statusClass(status) {
  if (status === 'Expired') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'Segera Habis') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'Akan Habis') return 'border-yellow-200 bg-yellow-50 text-yellow-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function toVehicleDocumentFile(vehicleId, row) {
  if (!vehicleId || !row?.relativePath) return null;
  return {
    name: row.fileNameOriginal || row.fileName || documentTypeLabel(row.documentType) || 'Dokumen kendaraan',
    type: row.mimeType || row.fileType || '',
    size: row.sizeBytes || row.fileSize || 0,
    url: createVehicleDocumentDownloadUrl(vehicleId, row.id),
  };
}

function VehicleDocumentsPanel({ vehicle, editable = false }) {
  const { user } = useAuth();
  const canRead = hasPermission(user, 'vehicle_document.read');
  const canCreate = hasPermission(user, 'vehicle_document.create');
  const canUpdate = hasPermission(user, 'vehicle_document.update');
  const canDelete = hasPermission(user, 'vehicle_document.delete');
  const vehicleId = vehicle?.id || '';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_DOCUMENT_FORM);

  useEffect(() => {
    if (!vehicleId || !canRead) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    fetchVehicleDocuments(vehicleId)
      .then((result) => {
        if (active) setRows(Array.isArray(result) ? result.filter((row) => row.documentType === 'STNK') : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Dokumen kendaraan gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, vehicleId]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditing(null);
    setForm(EMPTY_DOCUMENT_FORM);
  }

  async function saveDocument(event) {
    event.preventDefault();
    if (!vehicleId) return;
    if (!editing && !form.file) {
      setError('Upload file dokumen wajib diisi.');
      return;
    }
    setError('');
    try {
      const saved = editing
        ? await updateVehicleDocument(vehicleId, editing.id, form)
        : await createVehicleDocument(vehicleId, form);
      setRows((current) => editing
        ? current.map((row) => (row.id === saved.id ? saved : row))
        : [saved, ...current]);
      resetForm();
    } catch (requestError) {
      setError(requestError.message || 'Dokumen kendaraan gagal disimpan.');
    }
  }

  async function removeDocument(row) {
    if (!vehicleId) return;
    if (!window.confirm(`Hapus dokumen ${documentTypeLabel(row.documentType)}?`)) return;
    try {
      await deleteVehicleDocument(vehicleId, row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (requestError) {
      setError(requestError.message || 'Dokumen kendaraan gagal dihapus.');
    }
  }

  if (!canRead) return null;

  return (
    <div className="vehicle-documents-panel span-full rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-black text-slate-900">Dokumen Kendaraan</h3>
          <p className="m-0 mt-1 text-xs text-slate-500">Pantau dokumen STNK untuk unit truck ini.</p>
        </div>
      </div>

      {error ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div> : null}

      {editable && vehicleId && (canCreate || (editing && canUpdate)) ? (
        <form className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={saveDocument}>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Jenis Dokumen
            <input className="h-9 rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm font-bold text-slate-900" value="STNK" readOnly />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Nomor Dokumen
            <input className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" value={form.documentNumber} onChange={(event) => updateField('documentNumber', event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Tanggal Terbit
            <input className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" type="date" value={form.issuedDate} onChange={(event) => updateField('issuedDate', event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Tanggal Expired
            <input className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" type="date" value={form.expiredDate} onChange={(event) => updateField('expiredDate', event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Upload File
            <div className="flex items-center gap-2">
              <input
                id={`vehicle-document-file-${vehicleId}`}
                className="hidden"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  const validationError = validateArchiveFile(file, { label: 'Dokumen kendaraan' });
                  if (validationError) {
                    setError(validationError);
                    event.target.value = '';
                    return;
                  }
                  setError('');
                  updateField('file', file || null);
                }}
              />
              <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700" htmlFor={`vehicle-document-file-${vehicleId}`}>Pilih File</label>
              <span className="min-w-0 truncate text-sm font-semibold text-slate-600">{form.file?.name || 'Belum ada file'}</span>
            </div>
            <small className="text-xs font-medium text-slate-500">PDF maks. 5 MB, JPG/PNG maks. 10 MB</small>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Catatan
            <input className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />
          </label>
          <div className="flex items-center gap-2 md:col-span-2 xl:col-span-3">
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white" type="submit">{editing ? 'Simpan Perubahan' : 'Tambah Dokumen'}</button>
            {editing ? <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700" type="button" onClick={resetForm}>Batal</button> : null}
          </div>
        </form>
      ) : editable ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Simpan data kendaraan terlebih dahulu sebelum upload dokumen.</p>
      ) : null}

      <div className="vehicle-documents-table-wrap table-wrap overflow-x-auto rounded-lg border border-slate-200">
        <table className="vehicle-documents-table responsive-data-table w-full min-w-[760px] border-collapse bg-white text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Jenis Dokumen</th>
              <th className="px-3 py-2">Nomor Dokumen</th>
              <th className="px-3 py-2">Tanggal Terbit</th>
              <th className="px-3 py-2">Tanggal Expired</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr className="responsive-empty-row"><td className="px-3 py-4 text-slate-500" colSpan="7">Memuat dokumen...</td></tr> : null}
            {!loading && !rows.length ? <tr className="responsive-empty-row"><td className="px-3 py-4 text-slate-500" colSpan="7">Belum ada dokumen kendaraan.</td></tr> : null}
            {rows.map((row) => (
              <tr className="border-t border-slate-200" key={row.id}>
                {(() => {
                  const documentFile = toVehicleDocumentFile(vehicleId, row);
                  return (
                    <>
                <td className="px-3 py-2 font-bold text-slate-900" data-label="Jenis Dokumen">{documentTypeLabel(row.documentType)}</td>
                <td className="px-3 py-2 text-slate-700" data-label="Nomor Dokumen">{row.documentNumber || '-'}</td>
                <td className="px-3 py-2 text-slate-700" data-label="Tanggal Terbit">{row.issuedDate || '-'}</td>
                <td className="px-3 py-2 text-slate-700" data-label="Tanggal Expired">{row.expiredDate || '-'}</td>
                <td className="px-3 py-2" data-label="Status"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${statusClass(row.status)}`}>{row.status}</span></td>
                <td className="px-3 py-2" data-label="File">
                  {documentFile ? <DocumentLink file={documentFile} className="font-bold text-slate-700 underline" label="" /> : '-'}
                </td>
                <td className="px-3 py-2" data-label="Aksi">
                  <div className="flex gap-2">
                    {documentFile ? <DocumentLink file={documentFile} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700" label="Download" download iconOnly /> : null}
                    {editable && canUpdate ? <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700" type="button" onClick={() => { setEditing(row); setForm({ documentType: row.documentType, documentNumber: row.documentNumber || '', issuedDate: row.issuedDate || '', expiredDate: row.expiredDate || '', file: null, notes: row.notes || '' }); }} aria-label="Edit dokumen"><Edit3 size={14} /></button> : null}
                    {editable && canDelete ? <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700" type="button" onClick={() => removeDocument(row)} aria-label="Hapus dokumen"><Trash2 size={14} /></button> : null}
                  </div>
                </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TruckNumber({ row }) {
  return (
    <div className="truck-row-number-cell">
      <span>{String(row.unitCode || '-').replace(/^TRK-?/i, '')}</span>
    </div>
  );
}

function ExpiryDetail({ value }) {
  return <MasterExpiryDate value={value} />;
}

function formatDisplayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function DateDetail({ value }) {
  return <span className="master-plain-cell strong">{formatDisplayDate(value)}</span>;
}

const TRUCK_DOCUMENT_FIELD_KEYS = new Set([
  'photoDocument',
  'kirNumber',
  'kirExpiryDate',
  'kirDocument',
  'stnkNumber',
  'stnkExpiryDate',
  'stnkDocument',
  'taxPaymentDate',
  'stidCode',
  'stidExpiryDate',
  'stidDocument',
  'solarBarcodeNumber',
  'solarBarcodeDate',
  'solarBarcodeDocument',
  'insuranceType',
  'insurancePolicyNumber',
  'insuranceExpiryDate',
  'insuranceDocument',
]);

function TruckDocumentSummary({ row, renderViewerDocumentNote = null }) {
  const documents = [
    {
      key: 'photoDocument',
      label: 'Foto Unit',
      number: 'Foto unit truck',
      file: row.photoDocument,
      showExpiry: false,
    },
    {
      key: 'kirDocument',
      label: 'KIR',
      number: row.kirNumber,
      expiryDate: row.kirExpiryDate,
      expiryLabel: 'KIR Truck',
      file: row.kirDocument,
    },
    {
      key: 'stnkDocument',
      label: 'STNK',
      number: row.stnkNumber,
      expiryDate: row.stnkExpiryDate,
      expiryLabel: 'STNK',
      file: row.stnkDocument,
      extra: row.taxPaymentDate ? `Bayar pajak: ${formatDisplayDate(row.taxPaymentDate)}` : '',
    },
    {
      key: 'stidDocument',
      label: 'STID',
      number: row.stidCode,
      expiryDate: row.stidExpiryDate,
      expiryLabel: 'STID',
      file: row.stidDocument,
    },
    {
      key: 'solarBarcodeDocument',
      label: 'Barcode Solar',
      number: row.solarBarcodeNumber,
      file: row.solarBarcodeDocument,
      extra: row.solarBarcodeDate ? `Tanggal: ${formatDisplayDate(row.solarBarcodeDate)}` : '',
      showExpiry: false,
    },
    {
      key: 'insuranceDocument',
      label: 'Asuransi',
      number: [row.insuranceType, row.insurancePolicyNumber].filter(Boolean).join(' / '),
      expiryDate: row.insuranceExpiryDate,
      expiryLabel: 'Asuransi Truck',
      file: row.insuranceDocument,
    },
  ];
  const showNotes = typeof renderViewerDocumentNote === 'function';

  return (
    <div className="master-document-note-layout">
      <div className={`truck-document-summary-table ${showNotes ? 'has-notes' : ''}`}>
        <div className="truck-document-summary-head">
          <strong>Jenis</strong>
          <strong>Nomor Dokumen</strong>
          <strong>Berlaku Sampai</strong>
          <strong>Status</strong>
          <strong>File</strong>
          {showNotes ? <strong>Catatan</strong> : null}
        </div>
        {documents.map((document) => (
          <div className="truck-document-summary-row" key={document.key}>
            <strong>{document.label}</strong>
            <div className="truck-document-summary-info">
              <span className={document.number ? '' : 'is-empty'}>{document.number || '-'}</span>
              {document.extra ? <small>{document.extra}</small> : null}
            </div>
            <span className="truck-document-date">{document.showExpiry === false ? '-' : formatMasterExpiryDate(document.expiryDate)}</span>
            {document.showExpiry === false ? (
              <span className="truck-document-status is-neutral">Tidak Berlaku</span>
            ) : (() => {
              const expiryState = getMasterExpiryState(document.expiryDate);
              return <span className={`truck-document-status is-${expiryState.key}`}>{expiryState.label}</span>;
            })()}
            <DetailDocumentActions file={document.file} />
            {showNotes ? renderViewerDocumentNote(document.key, document.label) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TruckStnkExpiry({ row }) {
  return <MasterExpiryDate value={row.stnkExpiryDate} />;
}

function TruckTaxPaymentDate({ row }) {
  return <span className="master-plain-cell strong">{formatDisplayDate(row.taxPaymentDate)}</span>;
}

export function getChassisRow(rows, chassisValue) {
  if (!chassisValue) return null;
  const normalizedValue = String(chassisValue).trim().toLowerCase();
  const list = rows || [];

  // Kode chassis adalah identitas resmi yang ditulis updateVehicleChassis() ke kir_chassis_number
  // truck -- dicek lebih dulu secara eksklusif supaya tidak salah tangkap chassis LAIN yang nomor
  // KIR atau platnya kebetulan sama teksnya dengan kode chassis yang sedang dicari (data legacy).
  const exactCodeMatch = list.find((row) => String(row.chassisCode || '').trim().toLowerCase() === normalizedValue);
  if (exactCodeMatch) return exactCodeMatch;

  return list.find((row) => {
    const candidates = [row.id, row.kirNumber, row.plateNumber]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());

    return candidates.includes(normalizedValue);
  }) || null;
}

function TruckKirExpiry({ row }) {
  return <MasterExpiryDate value={row.kirExpiryDate} />;
}

function TruckStidExpiry({ row }) {
  return <MasterExpiryDate value={row.stidExpiryDate} />;
}

function TruckChassisSize({ row, chassisRows }) {
  const chassis = getChassisRow(chassisRows, row.kirChassisNumber);
  if (!chassis) return <span className="master-plain-cell strong">-</span>;
  const chassisCode = chassis.chassisCode || row.kirChassisNumber || '-';
  const capacity = chassis.capacity || '-';
  return <span className="master-plain-cell strong">{chassisCode} - {capacity}</span>;
}

function getUnitSequence(unitCode) {
  const match = String(unitCode || '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function sortTrucksByUnit(rows) {
  return [...rows].sort((left, right) => {
    const sequenceDiff = getUnitSequence(left.unitCode) - getUnitSequence(right.unitCode);
    if (sequenceDiff !== 0) return sequenceDiff;
    return String(left.plateNumber || '').localeCompare(String(right.plateNumber || ''), 'id');
  });
}

function findDriverAssignedTrucks(rows, driverName, currentTruckId) {
  const selectedDriver = normalizeName(driverName);
  if (!selectedDriver) return [];
  return (rows || []).filter((truck) =>
    truck.id !== currentTruckId && normalizeName(truck.defaultDriver) === selectedDriver);
}

function findChassisAssignedTrucks(rows, chassisNumber, currentTruckId, chassisRows = []) {
  const chassis = getChassisRow(chassisRows, chassisNumber);
  const candidates = chassis ? getChassisCandidates(chassis) : [normalizeName(chassisNumber)].filter(Boolean);
  if (!candidates.length) return [];
  return (rows || []).filter((truck) =>
    truck.id !== currentTruckId && candidates.includes(normalizeName(truck.kirChassisNumber)));
}

function mergeRelatedRows(...groups) {
  const rowsById = new Map();
  groups.flat().forEach((item) => {
    if (!item?.id) return;
    const existing = rowsById.get(item.id);
    rowsById.set(item.id, existing
      ? { id: item.id, row: { ...existing.row, ...item.row } }
      : item);
  });
  return [...rowsById.values()];
}

async function prepareTruckSave({ payload, editingId, rows, confirmAction, chassisRows = [] }) {
  const chassisCapacity = getChassisCapacity(chassisRows, payload.kirChassisNumber);
  const normalizedPayload = chassisCapacity ? { ...payload, capacity: chassisCapacity } : payload;
  const assignedTrucks = findDriverAssignedTrucks(rows, normalizedPayload.defaultDriver, editingId);
  const chassisAssignedTrucks = findChassisAssignedTrucks(rows, normalizedPayload.kirChassisNumber, editingId, chassisRows);
  let driverRelatedRows = [];

  if (assignedTrucks.length) {
    const truckList = assignedTrucks
      .map((truck) => `${truck.unitCode || '-'} (${truck.plateNumber || '-'})`)
      .join(', ');
    const approved = await confirmAction({
      title: 'Pindahkan sopir ke truck ini?',
      message: `${normalizedPayload.defaultDriver} saat ini masih terhubung ke ${truckList}. Jika dilanjutkan, sopir akan dilepas dari truck sebelumnya dan dipasang ke truck ini.`,
      confirmLabel: 'Pindahkan Sopir',
    });

    if (!approved) return null;
    driverRelatedRows = assignedTrucks.map((truck) => ({
      id: truck.id,
      row: { ...truck, defaultDriver: '' },
    }));
  }

  // Backend (updateVehicleChassis, dipakai bareng dengan Assignment Armada) yang sekarang
  // melepas chassis dari truck lama secara atomic saat truck ini disimpan -- dialog konfirmasi
  // di sini murni informasional untuk Admin, TIDAK lagi mem-PATCH truck lama secara manual dari
  // frontend (jalur lama ini non-atomic dan tidak menyentuh current_chassis_id/current_chassis_code).
  if (chassisAssignedTrucks.length) {
    const chassisLabel = normalizedPayload.kirChassisNumber || 'chassis ini';
    const truckList = chassisAssignedTrucks
      .map((truck) => `${truck.unitCode || '-'} (${truck.plateNumber || '-'})`)
      .join(', ');
    const approved = await confirmAction({
      title: 'Pindahkan chassis ke truck ini?',
      message: `${chassisLabel} saat ini masih terhubung ke ${truckList}. Jika dilanjutkan, chassis akan dilepas dari truck sebelumnya dan dipasang ke truck ini.`,
      confirmLabel: 'Pindahkan Chassis',
    });

    if (!approved) return null;
  }

  return {
    payload: normalizedPayload,
    relatedRows: mergeRelatedRows(driverRelatedRows),
  };
}

function hasActiveTruckJob(row, activeJobs) {
  return (activeJobs || []).some((job) =>
    (job.vehicleId && row.id && job.vehicleId === row.id)
    || String(job.plateNumber || job.truck || '').trim().toLowerCase() === String(row.plateNumber || '').trim().toLowerCase());
}

function getTruckBaseStatus(row) {
  return ['Maintenance', 'Tidak Aktif'].includes(row.status) ? row.status : 'Aktif';
}

function getTruckStatus(row, activeJobs) {
  const baseStatus = getTruckBaseStatus(row);
  if (baseStatus !== 'Aktif') return baseStatus;
  return hasActiveTruckJob(row, activeJobs) ? 'Bertugas' : 'Aktif';
}

function TruckStatus({ row, activeJobs }) {
  const status = getTruckStatus(row, activeJobs);
  const statusClass = status === 'Aktif' ? 'available' : status === 'Bertugas' ? 'in_use' : 'maintenance';
  return <span className={`master-status-dot ${statusClass}`}><i />{status || '-'}</span>;
}

function TrucksPage({ readOnly = false }) {
  const archive = useArchiveData();
  const { orders: operationalOrders, truncated: operationalDataTruncated } = useOperationalOrders();
  const activeJobs = getActiveOperationalJobs(buildOperationalJobs(operationalOrders));
  const truckRows = archive.isMasterDatabaseMode
    ? archive.masters?.trucks || []
    : archive.masters?.trucks?.length ? archive.masters.trucks : fallbackTruckUnits;
  const chassisRows = archive.masters?.['kir-chassis'] || [];
  const driverOptions = archive.masters?.drivers?.length
    ? getDriverOptions(archive.masters.drivers, activeJobs, truckRows)
    : archive.isMasterDatabaseMode ? [] : getLocalDriverOptions(activeJobs, truckRows);
  const fields = createFields(driverOptions, chassisRows, truckRows);
  const detailFields = [
    ...fields
      .filter((field) => !TRUCK_DOCUMENT_FIELD_KEYS.has(field.key))
      .map((field) => {
        if (field.key === 'receivedDate') {
          return {
            ...field,
            renderDetail: (value) => <DateDetail value={value} />,
          };
        }
        if (field.key === 'taxPaymentDate') {
          return {
            ...field,
            renderDetail: (value) => <DateDetail value={value} />,
          };
        }
        if (field.key === 'kirExpiryDate' || field.key === 'stnkExpiryDate' || field.key === 'stidExpiryDate' || field.key === 'insuranceExpiryDate') {
          return {
            ...field,
            renderDetail: (value) => <ExpiryDetail value={value} />,
          };
        }
        return field;
      }),
    {
      key: 'truckDocumentSummary',
      label: 'Dokumen Kendaraan',
      full: true,
      renderDetail: (_, row, meta) => <TruckDocumentSummary row={row} renderViewerDocumentNote={meta.renderViewerDocumentNote} />,
    },
  ];

  return (
    <>
    <OperationalDataTruncatedNotice truncated={operationalDataTruncated} />
    <MasterDataPage
      eyebrow="Master Data"
      title="Master Truck"
      singular="Truck"
      description="Kelola identitas unit truck, pasangan chassis, data KIR, STNK, dan driver tetap."
      fields={fields}
      detailFields={detailFields}
      detailModalClassName="truck-detail-modal compact-master-detail-modal"
      columns={[
        { key: 'unitCode', label: 'No Lambung', render: (_, row) => <TruckNumber row={row} /> },
        { key: 'plateNumber', label: 'Plat', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'defaultDriver', label: 'Sopir', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'capacity', label: 'Chassis / Size', render: (_, row) => <TruckChassisSize row={row} chassisRows={chassisRows} /> },
        { key: 'kirExpiryDate', label: 'KIR OFF', render: (_, row) => <TruckKirExpiry row={row} /> },
        { key: 'stidExpiryDate', label: 'STID OFF', render: (_, row) => <TruckStidExpiry row={row} /> },
        { key: 'stnkExpiryDate', label: 'STNK OFF', render: (_, row) => <TruckStnkExpiry row={row} /> },
        { key: 'taxPaymentDate', label: 'Bayar Pajak', render: (_, row) => <TruckTaxPaymentDate row={row} /> },
        { key: 'status', label: 'Kondisi', render: (_, row) => <TruckStatus row={row} activeJobs={activeJobs} /> },
      ]}
      initialRows={fallbackTruckUnits}
      resource="trucks"
      storageKey="tms-master-trucks-v2"
      uniqueKeys={['plateNumber', 'unitCode', 'vin', 'engineNumber', 'kirNumber', 'stnkNumber']}
      filters={[{ key: 'status', label: 'Semua Status Truck', options: ['Aktif', 'Bertugas', 'Maintenance', 'Tidak Aktif'] }]}
      pageClassName="driver-data-page truck-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar Truck"
      toolbarDescription="Cari unit, plat, sopir, chassis, dokumen, asuransi, dan kondisi truck."
      sortRows={sortTrucksByUnit}
      beforeSave={(args) => prepareTruckSave({ ...args, chassisRows })}
      extraDetailContent={(row) => <VehicleDocumentsPanel vehicle={row} />}
      stats={(data) => [
        { label: 'Total Truck', value: data.length, detail: 'Unit terdaftar' },
        { label: 'Standby', value: data.filter((item) => getTruckStatus(item, activeJobs) === 'Aktif').length, detail: 'Siap pakai' },
        { label: 'Jalan', value: data.filter((item) => getTruckStatus(item, activeJobs) === 'Bertugas').length, detail: 'Ada job aktif' },
        { label: 'Tidak Siap', value: data.filter((item) => ['Maintenance', 'Tidak Aktif'].includes(getTruckStatus(item, activeJobs))).length, detail: 'Perawatan/nonaktif' },
      ]}
      readOnly={readOnly}
    />
    </>
  );
}

export default TrucksPage;
