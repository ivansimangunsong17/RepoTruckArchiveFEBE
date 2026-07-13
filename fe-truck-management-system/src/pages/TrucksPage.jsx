import MasterDataPage from '../components/master/MasterDataPage';
import { buildOperationalJobs, getActiveOperationalJobs } from '../data/operationalDashboard';
import { fallbackDrivers, fallbackTruckUnits } from '../data/truckData';
import { useArchiveData } from '../hooks/useArchiveData';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useState } from 'react';
import { Download, Edit3, Trash2 } from 'lucide-react';
import { validateArchiveFile } from '../utils/fileValidation';
import {
  createVehicleDocument,
  createVehicleDocumentDownloadUrl,
  deleteVehicleDocument,
  fetchVehicleDocuments,
  updateVehicleDocument,
} from '../services/master-data/vehicleDocumentService';
import { hasPermission } from '../constants/roles';

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

function buildChassisOptions(rows, currentValue = '') {
  const options = normalizeChassisRows(rows).map((row) => ({
    value: row.chassisCode || row.kirNumber,
    label: [
      row.chassisCode || '-',
      row.plateNumber || 'Tanpa plat',
      row.capacity || '-',
    ].join(' - '),
  }));
  const hasCurrentValue = currentValue && options.some((option) => option.value === currentValue);
  if (!hasCurrentValue && currentValue) {
    return [{ value: currentValue, label: `${currentValue} - Data lama` }, ...options];
  }
  return options;
}

function requiredFile(label, value) {
  return value ? null : `${label} wajib diupload.`;
}

function createFields(driverOptions, chassisRows = []) {
  return [
    { key: 'plateNumber', section: 'Identitas Unit', label: 'Nomor Polisi', placeholder: 'B 1234 CPL', required: true },
    { key: 'unitCode', section: 'Identitas Unit', label: 'Kode Unit', placeholder: 'TRK-001', required: true, hint: 'Kode internal harus unik.' },
    { key: 'capacity', section: 'Identitas Unit', label: 'Kapasitas Container', type: 'select', defaultValue: '20FT', options: [
      { value: '20FT', label: '20FT' }, { value: '40FT', label: '40FT' },
    ] },
    { key: 'status', section: 'Identitas Unit', label: 'Status Truck', type: 'select', defaultValue: 'Aktif', normalize: (value) => (value === 'Bertugas' ? 'Aktif' : value), options: [
      { value: 'Aktif', label: 'Aktif / Standby' }, { value: 'Maintenance', label: 'Maintenance' }, { value: 'Tidak Aktif', label: 'Tidak Aktif' },
    ] },
    { key: 'brand', section: 'Spesifikasi Kendaraan', label: 'Merk Truck', placeholder: 'Contoh: Hino', required: true },
    { key: 'type', section: 'Spesifikasi Kendaraan', label: 'Tipe Truck', placeholder: 'Contoh: Ranger FG 235 JJ', required: true },
    { key: 'vin', section: 'Nomor Identifikasi Kendaraan', label: 'Nomor Rangka (VIN)', placeholder: 'Masukkan nomor rangka kendaraan', required: true },
    { key: 'engineNumber', section: 'Nomor Identifikasi Kendaraan', label: 'Nomor Mesin', placeholder: 'Masukkan nomor mesin kendaraan', required: true },
    {
      key: 'kirChassisNumber',
      section: 'Data Chassis',
      sectionClassName: 'accent-chassis',
      label: 'Chassis',
      type: 'select',
      defaultValue: '',
      full: true,
      required: true,
      options: (form) => {
        const options = buildChassisOptions(chassisRows, form.kirChassisNumber);
        return [{ value: '', label: options.length ? 'Wajib pilih chassis dari master' : 'Belum ada data master chassis' }, ...options];
      },
      hint: 'Pilih chassis dari master data yang saat ini dipasangkan ke unit truck ini.',
    },
    {
      key: 'kirNumber',
      section: 'Dokumen Kendaraan',
      sectionClassName: 'accent-documents',
      label: 'Nomor KIR',
      placeholder: 'Wajib isi nomor KIR',
      className: 'span-third',
      required: true,
    },
    { key: 'kirExpiryDate', section: 'Dokumen Kendaraan', label: 'Tanggal KIR OFF', type: 'date', className: 'span-third', required: true },
    { key: 'kirDocument', section: 'Dokumen Kendaraan', label: 'Dokumen KIR', type: 'file', className: 'span-third', compactUpload: true, validate: (form) => requiredFile('Dokumen KIR', form.kirDocument) },
    { key: 'stnkNumber', section: 'Dokumen Kendaraan', label: 'Nomor STNK', placeholder: 'Wajib isi nomor STNK', className: 'span-third', required: true },
    { key: 'stnkExpiryDate', section: 'Dokumen Kendaraan', label: 'Tanggal STNK OFF', type: 'date', className: 'span-third', required: true },
    { key: 'stnkDocument', section: 'Dokumen Kendaraan', label: 'Dokumen STNK', type: 'file', className: 'span-third', compactUpload: true, validate: (form) => requiredFile('Dokumen STNK', form.stnkDocument) },
    { key: 'stidCode', section: 'Dokumen Kendaraan', label: 'Nomor STID', placeholder: 'Wajib isi nomor STID', className: 'span-third', required: true },
    { key: 'stidExpiryDate', section: 'Dokumen Kendaraan', label: 'Tanggal STID OFF', type: 'date', className: 'span-third', required: true },
    { key: 'stidDocument', section: 'Dokumen Kendaraan', label: 'Dokumen STID', type: 'file', className: 'span-third', compactUpload: true, validate: (form) => requiredFile('Dokumen STID', form.stidDocument) },
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
    <div className="span-full rounded-lg border border-slate-200 bg-white p-4">
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
            <small className="text-xs font-medium text-slate-500">PDF, JPG, PNG - Maks. 5 MB</small>
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

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[760px] border-collapse bg-white text-left text-sm">
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
            {loading ? <tr><td className="px-3 py-4 text-slate-500" colSpan="7">Memuat dokumen...</td></tr> : null}
            {!loading && !rows.length ? <tr><td className="px-3 py-4 text-slate-500" colSpan="7">Belum ada dokumen kendaraan.</td></tr> : null}
            {rows.map((row) => (
              <tr className="border-t border-slate-200" key={row.id}>
                <td className="px-3 py-2 font-bold text-slate-900">{documentTypeLabel(row.documentType)}</td>
                <td className="px-3 py-2 text-slate-700">{row.documentNumber || '-'}</td>
                <td className="px-3 py-2 text-slate-700">{row.issuedDate || '-'}</td>
                <td className="px-3 py-2 text-slate-700">{row.expiredDate || '-'}</td>
                <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${statusClass(row.status)}`}>{row.status}</span></td>
                <td className="px-3 py-2">
                  {row.relativePath && vehicleId ? <a className="font-bold text-slate-700 underline" href={createVehicleDocumentDownloadUrl(vehicleId, row.id)} target="_blank" rel="noreferrer">{row.fileNameOriginal || 'Download'}</a> : '-'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    {row.relativePath && vehicleId ? <a className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700" href={createVehicleDocumentDownloadUrl(vehicleId, row.id)} target="_blank" rel="noreferrer" aria-label="Download"><Download size={14} /></a> : null}
                    {editable && canUpdate ? <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700" type="button" onClick={() => { setEditing(row); setForm({ documentType: row.documentType, documentNumber: row.documentNumber || '', issuedDate: row.issuedDate || '', expiredDate: row.expiredDate || '', file: null, notes: row.notes || '' }); }} aria-label="Edit dokumen"><Edit3 size={14} /></button> : null}
                    {editable && canDelete ? <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700" type="button" onClick={() => removeDocument(row)} aria-label="Hapus dokumen"><Trash2 size={14} /></button> : null}
                  </div>
                </td>
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

function formatTruckDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getDaysUntilLabel(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays > 0) return `Sisa ${diffDays} hari lagi`;
  if (diffDays === 0) return 'Hari ini';
  return `Lewat ${Math.abs(diffDays)} hari`;
}

function ExpiryDetail({ value }) {
  return (
    <div className="master-expiry-detail">
      <strong>{formatTruckDate(value)}</strong>
      <small>{getDaysUntilLabel(value)}</small>
    </div>
  );
}

function TruckStnkExpiry({ row }) {
  return (
    <span className="master-plain-cell strong">
      {formatTruckDate(row.stnkExpiryDate)}
    </span>
  );
}

function getChassisRow(rows, chassisValue) {
  if (!chassisValue) return null;
  const normalizedValue = String(chassisValue).trim().toLowerCase();
  return (rows || []).find((row) => {
    const candidates = [
      row.id,
      row.chassisCode,
      row.kirNumber,
      row.plateNumber,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());

    return candidates.includes(normalizedValue);
  }) || null;
}

function TruckKirExpiry({ row }) {
  return (
    <span className="master-plain-cell strong">
      {formatTruckDate(row.kirExpiryDate)}
    </span>
  );
}

function TruckChassisExpiry({ row, chassisRows }) {
  const chassis = getChassisRow(chassisRows, row.kirChassisNumber);
  return (
    <span className="master-plain-cell strong">
      {formatTruckDate(chassis?.kirExpiryDate)}
    </span>
  );
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

async function prepareTruckSave({ payload, editingId, rows, confirmAction }) {
  const assignedTrucks = findDriverAssignedTrucks(rows, payload.defaultDriver, editingId);
  if (!assignedTrucks.length) return { payload };

  const truckList = assignedTrucks
    .map((truck) => `${truck.unitCode || '-'} (${truck.plateNumber || '-'})`)
    .join(', ');
  const approved = await confirmAction({
    title: 'Pindahkan sopir ke truck ini?',
    message: `${payload.defaultDriver} saat ini masih terhubung ke ${truckList}. Jika dilanjutkan, sopir akan dilepas dari truck sebelumnya dan dipasang ke truck ini.`,
    confirmLabel: 'Pindahkan Sopir',
  });

  if (!approved) return null;

  return {
    payload,
    relatedRows: assignedTrucks.map((truck) => ({
      id: truck.id,
      row: { ...truck, defaultDriver: '' },
    })),
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

function TrucksPage() {
  const archive = useArchiveData();
  const activeJobs = getActiveOperationalJobs(buildOperationalJobs(archive.orders));
  const truckRows = archive.masters?.trucks?.length ? archive.masters.trucks : fallbackTruckUnits;
  const chassisRows = archive.masters?.['kir-chassis'] || [];
  const driverOptions = archive.masters?.drivers?.length
    ? getDriverOptions(archive.masters.drivers, activeJobs, truckRows)
    : getLocalDriverOptions(activeJobs, truckRows);
  const fields = createFields(driverOptions, chassisRows);
  const detailFields = fields.map((field) => {
    if (field.key === 'kirExpiryDate' || field.key === 'stnkExpiryDate' || field.key === 'stidExpiryDate') {
      return {
        ...field,
        renderDetail: (value) => <ExpiryDetail value={value} />,
      };
    }
    return field;
  });

  return (
    <MasterDataPage
      eyebrow="Master Data"
      title="Master Truck"
      singular="Truck"
      description="Kelola identitas unit truck, pasangan chassis, data KIR, STNK, dan driver tetap."
      fields={fields}
      detailFields={detailFields}
      columns={[
        { key: 'unitCode', label: 'No', render: (_, row) => <TruckNumber row={row} /> },
        { key: 'plateNumber', label: 'Plat', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'defaultDriver', label: 'Sopir', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'capacity', label: 'Size', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'kirExpiryDate', label: 'KIR OFF', render: (_, row) => <TruckKirExpiry row={row} /> },
        { key: 'kirChassisNumber', label: 'CHASSIS OFF', render: (_, row) => <TruckChassisExpiry row={row} chassisRows={chassisRows} /> },
        { key: 'stnkExpiryDate', label: 'STNK OFF', render: (_, row) => <TruckStnkExpiry row={row} /> },
        { key: 'status', label: 'Kondisi', render: (_, row) => <TruckStatus row={row} activeJobs={activeJobs} /> },
      ]}
      initialRows={fallbackTruckUnits}
      resource="trucks"
      storageKey="tms-master-trucks-v2"
      uniqueKeys={['plateNumber', 'unitCode', 'vin', 'engineNumber', 'kirNumber', 'kirChassisNumber', 'stnkNumber']}
      filters={[{ key: 'status', label: 'Semua Status Truck', options: ['Aktif', 'Maintenance', 'Tidak Aktif'] }]}
      pageClassName="driver-data-page truck-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar Truck"
      toolbarDescription="Cari unit, plat, sopir, chassis, nomor KIR, size, dan kondisi truck."
      sortRows={sortTrucksByUnit}
      beforeSave={prepareTruckSave}
      extraDetailContent={(row) => <VehicleDocumentsPanel vehicle={row} />}
      stats={(data) => [
        { label: 'Total Truck', value: data.length, detail: 'Unit terdaftar' },
        { label: 'Standby', value: data.filter((item) => getTruckStatus(item, activeJobs) === 'Aktif').length, detail: 'Siap pakai' },
        { label: 'Jalan', value: data.filter((item) => getTruckStatus(item, activeJobs) === 'Bertugas').length, detail: 'Ada job aktif' },
        { label: 'Tidak Siap', value: data.filter((item) => ['Maintenance', 'Tidak Aktif'].includes(getTruckStatus(item, activeJobs))).length, detail: 'Perawatan/nonaktif' },
      ]}
    />
  );
}

export default TrucksPage;
