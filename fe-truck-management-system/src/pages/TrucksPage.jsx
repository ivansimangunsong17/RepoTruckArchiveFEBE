import MasterDataPage from '../components/master/MasterDataPage';
import { buildOperationalJobs, getActiveOperationalJobs } from '../data/operationalDashboard';
import { fallbackDrivers, fallbackTruckUnits } from '../data/truckData';
import { useArchiveData } from '../hooks/useArchiveData';

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

function createFields(driverOptions) {
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
    { key: 'kirNumber', section: 'Dokumen Kendaraan', label: 'Nomor Uji KIR', placeholder: 'Contoh: KIR-2026-001', hint: 'Nomor identitas hasil uji KIR kendaraan.' },
    { key: 'stnkNumber', section: 'Dokumen Kendaraan', label: 'Nomor STNK', placeholder: 'Contoh: STNK-2026-001', hint: 'Nomor registrasi STNK kendaraan.' },
    { key: 'defaultDriver', section: 'Assignment Default', label: 'Driver Tetap', type: 'select', defaultValue: '', options: [{ value: '', label: 'Belum di-assign' }, ...driverOptions], hint: 'Opsional. Jika kosong, truck tetap berdiri sendiri sampai admin memilih sopir.' },
    { key: 'stnkDocument', section: 'Dokumen Kendaraan', label: 'Dokumen STNK', type: 'file' },
    { key: 'kirDocument', section: 'Dokumen Kendaraan', label: 'Dokumen KIR', type: 'file' },
  ];
}

function TruckNumber({ row }) {
  return (
    <div className="truck-identity-cell">
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

function TruckStnkExpiry({ row }) {
  return (
    <span className="master-plain-cell strong">
      {formatTruckDate(row.stnkExpiryDate)}
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
  const driverOptions = archive.masters?.drivers?.length
    ? getDriverOptions(archive.masters.drivers, activeJobs, truckRows)
    : getLocalDriverOptions(activeJobs, truckRows);
  const fields = createFields(driverOptions);

  return (
    <MasterDataPage
      eyebrow="Master Data"
      title="Master Truck"
      singular="Truck"
      description="Kelola nomor polisi, kode unit, driver tetap, merk dan tipe, VIN, nomor mesin, serta status truck."
      fields={fields}
      columns={[
        { key: 'unitCode', label: 'No', render: (_, row) => <TruckNumber row={row} /> },
        { key: 'plateNumber', label: 'Plat', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'defaultDriver', label: 'Sopir', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'status', label: 'Kondisi', render: (_, row) => <TruckStatus row={row} activeJobs={activeJobs} /> },
        { key: 'capacity', label: 'Size', render: (value) => <span className="master-plain-cell strong">{value || '-'}</span> },
        { key: 'stnkExpiryDate', label: 'Tanggal STNK OFF', render: (_, row) => <TruckStnkExpiry row={row} /> },
      ]}
      initialRows={fallbackTruckUnits}
      resource="trucks"
      storageKey="tms-master-trucks-v2"
      uniqueKeys={['plateNumber', 'unitCode', 'vin', 'engineNumber', 'kirNumber', 'stnkNumber']}
      filters={[{ key: 'status', label: 'Semua Status Truck', options: ['Aktif', 'Maintenance', 'Tidak Aktif'] }]}
      pageClassName="driver-data-page truck-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar Truck"
      toolbarDescription="Cari lambung, plat, sopir, size, dan kondisi truck."
      sortRows={sortTrucksByUnit}
      beforeSave={prepareTruckSave}
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
