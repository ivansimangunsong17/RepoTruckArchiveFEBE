import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { fallbackDrivers, fallbackTruckUnits } from '../../data/truckData';
import { hasPermission } from '../../constants/roles';
import AssignmentHistorySection from './AssignmentHistorySection';
import AttachmentUploadField from '../common/AttachmentUploadField';
import DateTimeWibInput from '../common/DateTimeWibInput';
import UjRecommendationCard from '../operations/UjRecommendationCard';
import { calculateUjRecommendation } from '../../utils/ujRecommendation';
import { formatCurrency } from '../../utils/formatCurrency';
import { validateArchiveFile } from '../../utils/fileValidation';
import { formatDate } from '../../utils/formatDate';
import { isApiDataSource } from '../../services/config/dataSource';
import armadaLogo from '../../Assets/BGLogoArmada.png';

const documentFields = [
  ['eirDocument', 'Lampiran EIR'],
  ['loadingVoucherDocument', 'No. Bon Muat / Bon Bongkar'],
  ['tilaGatepassDocumentFile', 'No. TILA / Delivery Card / Gatepass / SP2'],
  ['travelDocumentFile', 'No. Surat Jalan'],
];

const operationalDocumentFields = [
  { valueField: 'loadingVoucher', fileField: 'loadingVoucherDocument', label: 'No. Bon Muat / Bon Bongkar' },
  { valueField: 'tilaGatepassDocument', fileField: 'tilaGatepassDocumentFile', label: 'No. TILA / Delivery Card / Gatepass / SP2' },
  { valueField: 'travelDocument', fileField: 'travelDocumentFile', label: 'No. Surat Jalan' },
];

const operationalPhaseOptions = [
  { id: 'preparation', label: 'Persiapan Job', description: 'Assignment truck dan nomor container' },
  { id: 'rpuj', label: 'Biaya Perjalanan & SPK', description: 'Komisi sopir dan penerbitan SPK' },
  { id: 'closing', label: 'Dokumen & Closing', description: 'Dokumen operasional dan status perjalanan' },
];

const statusOptions = [
  {
    value: 'received',
    label: 'Belum Jalan',
    description: 'Pekerjaan belum mulai diproses.',
    tone: 'border-slate-300 bg-slate-100 text-slate-600',
    selectStyle: { borderColor: '#cbd5e1', backgroundColor: '#f8fafc', color: '#334155' },
  },
  {
    value: 'running',
    label: 'Sedang Jalan',
    description: 'Truck/container sedang dalam proses.',
    tone: 'border-amber-300 bg-amber-50 text-amber-700',
    selectStyle: { borderColor: '#f59e0b', backgroundColor: '#fffbeb', color: '#92400e' },
  },
  {
    value: 'completed',
    label: 'Selesai',
    description: 'Pekerjaan selesai, data masih bisa diedit.',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    selectStyle: { borderColor: '#10b981', backgroundColor: '#ecfdf5', color: '#047857' },
  },
];

const OPERATIONAL_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png';
const DRIVER_SEARCH_MAX_RESULTS = 8;

function getMasterData(storageKey, fallback) {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || fallback;
  } catch {
    return fallback;
  }
}

function fileMetadata(file) {
  return file ? { name: file.name, size: file.size, type: file.type, rawFile: file } : null;
}

// Attachment dari backend kadang cuma punya `path`/`storagePath` tanpa `name` eksplisit
// (tergantung mapper). Jangan hanya cek `.name` -- itu bikin file yang sudah ter-upload
// dianggap kosong dan tampil "Belum ada file" padahal sudah ada di database.
function hasDocumentFile(file) {
  return Boolean(file?.path || file?.name || file?.storagePath);
}

function documentFileLabel(file) {
  if (!hasDocumentFile(file)) return 'Belum ada file';
  return file?.name || 'Dokumen tersimpan';
}

function getTruckDefaultDriver(truck, fallbackRows = []) {
  if (!truck) return '';
  const fallbackTruck = fallbackRows.find((item) => item.plateNumber === truck.plateNumber);
  return truck.defaultDriver || truck.default_driver_name || truck.defaultDriverName || fallbackTruck?.defaultDriver || fallbackTruck?.default_driver_name || '';
}

function normalizeSize(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '');
}

function getTruckCapacity(truck = {}) {
  return normalizeSize(truck.capacity || truck.containerSize || truck.container_size || truck.size || truck.defaultSize);
}

function normalizeTruck(truck, fallbackRows = []) {
  return {
    ...truck,
    defaultDriver: getTruckDefaultDriver(truck, fallbackRows),
    capacity: getTruckCapacity(truck),
  };
}

function isTruckCompatibleWithContainer(truck, containerSize) {
  const truckCapacity = getTruckCapacity(truck);
  return !containerSize || !truckCapacity || truckCapacity === 'COMBO' || truckCapacity === containerSize;
}

function isTruckCompatibleForRepoPickup(truck, containerSize, isComboPickup = false) {
  const truckCapacity = getTruckCapacity(truck);
  if (isComboPickup) return truckCapacity === '40FT' || truckCapacity === 'COMBO';
  return isTruckCompatibleWithContainer(truck, containerSize);
}

function isTruckAssignable(truck) {
  return ['Aktif', 'Siap'].includes(truck?.status);
}

function isActiveAssignmentJob(job) {
  return job && !['completed', 'cancelled', 'repo_stored'].includes(job.status || 'received');
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function isDriverBlacklisted(driver) {
  return driver?.status === 'Blacklist';
}

function isTruckBusyForAnotherJob(truck, activeJobs = [], currentJobId) {
  if (!truck) return false;
  const truckPlate = String(truck.plateNumber || '').trim();
  return (activeJobs || []).some((job) => {
    if (!isActiveAssignmentJob(job) || String(job.id) === String(currentJobId)) return false;
    return truckPlate && String(job.plateNumber || '').trim() === truckPlate;
  });
}

function isDriverBusyForAnotherJob(driver, activeJobs = [], currentJobId) {
  if (!driver) return false;
  const driverName = normalizeName(driver.name);
  if (!driverName) return false;
  return (activeJobs || []).some((job) => (
    isActiveAssignmentJob(job) && String(job.id) !== String(currentJobId) && normalizeName(job.driver) === driverName
  ));
}

function getDriverPaymentInfo(driver) {
  if (!driver) {
    return {
      driverPaymentMethod: 'bank',
      driverBankAccount: '',
      driverBankName: '',
      driverBankAccountNumber: '',
      driverBankAccountHolder: '',
      driverEmoneyProvider: '',
      driverEmoneyNumber: '',
    };
  }
  const driverPaymentMethod = driver.paymentMethod === 'emoney' ? 'emoney' : 'bank';
  const bankAccount = [driver.bankName, driver.bankAccountNumber].filter(Boolean).join(' ');
  const emoneyAccount = [driver.emoneyProvider || 'E-Money', driver.emoneyNumber].filter(Boolean).join(' ');
  return {
    driverPaymentMethod,
    driverBankAccount: driverPaymentMethod === 'emoney' ? emoneyAccount : bankAccount,
    driverBankName: driver.bankName || '',
    driverBankAccountNumber: driver.bankAccountNumber || '',
    driverBankAccountHolder: driver.bankAccountHolder || '',
    driverEmoneyProvider: driver.emoneyProvider || '',
    driverEmoneyNumber: driver.emoneyNumber || '',
  };
}

function nowForDateTimeInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function toDateTimeInputValue(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function dateTimeInputToIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function isLongTripOverOneDay(startValue, endValue) {
  if (!startValue || !endValue) return false;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return end.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
}

function SearchableDriverInput({ value, drivers = [], disabled = false, onChange, currentDriverExists = true }) {
  const [open, setOpen] = useState(false);
  const query = normalizeName(value);
  const matches = drivers
    .filter((driver) => {
      if (!query) return true;
      return normalizeName(`${driver.name || ''} ${driver.nickname || ''}`).includes(query);
    })
    .slice(0, DRIVER_SEARCH_MAX_RESULTS);

  function selectDriver(driverName) {
    onChange({ target: { name: 'driver', value: driverName } });
    setOpen(false);
  }

  return (
    <div className="searchable-input operational-driver-search">
      <input
        aria-label="Sopir Aktual Ritasi"
        autoComplete="off"
        disabled={disabled}
        name="driver"
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        onChange={(event) => {
          onChange(event);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        placeholder="Ketik nama sopir..."
        value={value}
      />
      {open && !disabled ? (
        <div className="searchable-input-results operational-driver-search-results" role="listbox">
          {value && !currentDriverExists ? (
            <button type="button" role="option" onMouseDown={() => selectDriver(value)}>
              {value}
            </button>
          ) : null}
          {matches.length ? matches.map((driver) => (
            <button key={driver.id || driver.name} type="button" role="option" onMouseDown={() => selectDriver(driver.name)}>
              <strong>{driver.nickname || driver.name}</strong>
              {driver.nickname ? <span>{driver.name}</span> : null}
            </button>
          )) : (
            <span className="searchable-input-empty">Sopir tidak ditemukan</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function generateSpkNumber() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const suffix = String(now.getTime()).slice(-4);
  return `SPK-${yearMonth}-${suffix}`;
}

function spkValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '-';
}

function spkDateValue(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return spkValue(value);
  return formatDate(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTruckUnitCode(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.replace(/^TRK-?/i, '').replace(/^0+(\d)/, '$1') || normalized;
}

function normalizePdfText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfText(value) {
  return normalizePdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function fitPdfText(value, maxLength = 72) {
  const text = normalizePdfText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function formatSpkShipment(value) {
  const shipment = String(value || '').toLowerCase();
  const checked = (keyword) => (shipment.includes(keyword) ? '[x]' : '[ ]');
  const domesticChecked = shipment.includes('domestik') || shipment.includes('domestic');
  const repoEmptyChecked = shipment.includes('repo_empty') || shipment.includes('repo empty');
  const repoFullChecked = shipment.includes('repo_full') || shipment.includes('repo full');
  return `${checked('import')} Import    ${checked('export')} Export    ${domesticChecked ? '[x]' : '[ ]'} Domestic    ${repoEmptyChecked ? '[x]' : '[ ]'} Repo Empty    ${repoFullChecked ? '[x]' : '[ ]'} Repo Full`;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Logo Armada gagal dimuat.'));
    image.src = source;
  });
}

async function createPdfImage(source) {
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas untuk logo SPK tidak tersedia.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const encoded = dataUrl.split(',')[1] || '';
  const binary = window.atob(encoded);
  return {
    width: canvas.width,
    height: canvas.height,
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  };
}

function buildPdfFile(contentStream, logoImage = null) {
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(contentStream);
  const imageResource = logoImage ? ' /XObject << /Logo 7 0 R >>' : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >>${imageResource} >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    {
      dictionary: `<< /Length ${contentBytes.length} >>`,
      stream: contentBytes,
    },
  ];
  if (logoImage) {
    objects.push({
      dictionary: `<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.bytes.length} >>`,
      stream: logoImage.bytes,
    });
  }

  const chunks = [];
  let byteLength = 0;
  const offsets = [];

  function append(value) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes);
    byteLength += bytes.length;
  }

  append('%PDF-1.4\n');

  objects.forEach((object, index) => {
    offsets[index + 1] = byteLength;
    append(`${index + 1} 0 obj\n`);
    if (typeof object === 'string') {
      append(object);
    } else {
      append(`${object.dictionary}\nstream\n`);
      append(object.stream);
      append('\nendstream');
    }
    append('\nendobj\n');
  });

  const xrefStart = byteLength;
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index <= objects.length; index += 1) {
    append(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  append(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
}

function createSpkPdfBlob(documentData, logoImage = null) {
  const commands = [
    '0.8 w',
    'BT /F2 17 Tf 0 0 0 rg 185 812 Td (SURAT PERINTAH KERJA \\(SPK\\)) Tj ET',
    '0.62 0.06 0.08 RG 34 790 m 561 790 l S',
    ...(logoImage ? ['q 54 0 0 36 36 742 cm /Logo Do Q'] : []),
    `BT /F2 10 Tf 0 0 0 rg 95 768 Td (${escapePdfText(documentData.company.name)}) Tj ET`,
    `BT /F1 7 Tf 0.25 0.25 0.25 rg 95 755 Td (${escapePdfText(documentData.company.addressLines[0])}) Tj ET`,
    `BT /F1 7 Tf 0.25 0.25 0.25 rg 95 744 Td (${escapePdfText(documentData.company.addressLines[1])}) Tj ET`,
    '0.65 0.65 0.65 RG 34 730 m 561 730 l S',
  ];

  const leftX = 34;
  const pageWidth = 527;
  const sectionHeaderHeight = 16;
  const rowHeight = 16;
  const labelWidth = 122;

  function drawText(text, x, y, { bold = false, size = 7, color = '0 0 0' } = {}) {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg ${x} ${y} Td (${escapePdfText(text)}) Tj ET`);
  }

  function drawSection(title, rows, y) {
    commands.push(`q 0.62 0.06 0.08 rg ${leftX} ${y - sectionHeaderHeight} ${pageWidth} ${sectionHeaderHeight} re f Q`);
    drawText(title, leftX + 8, y - 11, { bold: true, size: 7, color: '1 1 1' });
    let currentY = y - sectionHeaderHeight;

    rows.forEach((row) => {
      const rowBottom = currentY - rowHeight;
      if (row.highlight) {
        commands.push(`q 0.96 0.96 0.96 rg ${leftX} ${rowBottom} ${pageWidth} ${rowHeight} re f Q`);
      }
      commands.push(`0.82 0.82 0.82 RG ${leftX} ${rowBottom} ${pageWidth} ${rowHeight} re S`);
      commands.push(`0.82 0.82 0.82 RG ${leftX + labelWidth} ${rowBottom} 0 ${rowHeight} re S`);
      drawText(row.label, leftX + 8, rowBottom + 5, { bold: true, size: 6.4 });
      drawText(':', leftX + labelWidth + 8, rowBottom + 5, { size: 6.4 });
      drawText(fitPdfText(row.value, row.maxLength || 76), leftX + labelWidth + 22, rowBottom + 5, { bold: Boolean(row.highlight), size: row.highlight ? 7 : 6.4 });
      currentY = rowBottom;
    });

    return currentY - 10;
  }

  let y = 710;
  y = drawSection('1. INFORMASI SPK / ORDER', documentData.orderRows, y);
  y = drawSection('2. INFORMASI ARMADA & DRIVER', documentData.driverRows, y);
  y = drawSection('3. INFORMASI OPERASIONAL', documentData.operationalRows, y);
  drawText('Catatan:', leftX, y, { bold: true, size: 6.4, color: '0.62 0.06 0.08' });
  documentData.notes.forEach((note, index) => drawText(`${index + 1}. ${note}`, leftX, y - 10 - (index * 9), { size: 5.7 }));
  commands.push('0.82 0.82 0.82 RG 430 44 131 50 re S');
  drawText('No. Dokumen : FM-OPS-09-01', 437, 82, { size: 5.8 });
  drawText('Rev         : 01', 437, 70, { size: 5.8 });
  drawText(`Tgl Berlaku : ${documentData.effectiveDate}`, 437, 58, { size: 5.8 });
  drawText(documentData.systemGeneratedNote, leftX, 30, { size: 5.8, color: '0.35 0.35 0.35' });

  return buildPdfFile(commands.join('\n'), logoImage);
}

function OperationalForm({ container, onClose, onSubmit, onGenerateSpk, onSetTruckDefaultDriver, masterTrucks, masterDrivers, masterDestinations, activeJobs = [], currentUser, initialPhase = 'preparation' }) {
  const apiDataMode = isApiDataSource();
  const [fallbackTruckRows] = useState(() => getMasterData('tms-master-trucks-v2', fallbackTruckUnits));
  const [fallbackDriverRows] = useState(() => getMasterData('tms-master-drivers-v2', fallbackDrivers));
  const fileInputRefs = useRef({});
  const localTruckRows = apiDataMode ? [] : fallbackTruckRows;
  const localDriverRows = apiDataMode ? [] : fallbackDriverRows;
  const trucks = (Array.isArray(masterTrucks) ? masterTrucks : localTruckRows)
    .map((truck) => normalizeTruck(truck, localTruckRows));
  const drivers = Array.isArray(masterDrivers) ? masterDrivers : localDriverRows;
  const findDriverByName = (name) => drivers.find((driver) => normalizeName(driver.name) === normalizeName(name));
  const findDriverById = (id) => (id ? drivers.find((driver) => driver.id === id) : null);
  const getDriverDisplayName = (name) => (name ? findDriverByName(name)?.nickname || name : name);
  const isTruckDefaultDriverBlacklisted = (truck) => isDriverBlacklisted(findDriverByName(getTruckDefaultDriver(truck, localTruckRows)));
  const containerSize = normalizeSize(container.size || container.containerSize);
  const initialDriver = findDriverByName(container.driver);
  const initialDriverPayment = {
    ...getDriverPaymentInfo(initialDriver),
    driverPaymentMethod: container.driverPaymentMethod || getDriverPaymentInfo(initialDriver).driverPaymentMethod,
    driverBankAccount: container.driverBankAccount || getDriverPaymentInfo(initialDriver).driverBankAccount,
    driverBankName: container.driverBankName || getDriverPaymentInfo(initialDriver).driverBankName,
    driverBankAccountNumber: container.driverBankAccountNumber || getDriverPaymentInfo(initialDriver).driverBankAccountNumber,
    driverBankAccountHolder: container.driverBankAccountHolder || getDriverPaymentInfo(initialDriver).driverBankAccountHolder,
    driverEmoneyProvider: container.driverEmoneyProvider || getDriverPaymentInfo(initialDriver).driverEmoneyProvider,
    driverEmoneyNumber: container.driverEmoneyNumber || getDriverPaymentInfo(initialDriver).driverEmoneyNumber,
  };
  const ujRecommendation = calculateUjRecommendation(container, masterDestinations);
  const defaultDriverCommissionAmount = Number(ujRecommendation.driverCommissionAmount || 0);
  const commissionDataLoaded = Object.prototype.hasOwnProperty.call(container, 'hasDriverCommission')
    && Object.prototype.hasOwnProperty.call(container, 'driverCommissionAmount');
  const existingHasDriverCommission = container.hasDriverCommission === true;
  const existingDriverCommissionAmount = Number(container.driverCommissionAmount || 0);
  const [form, setForm] = useState({
    executionSource: container.executionSource === 'vendor' ? 'vendor' : 'internal',
    containerNumber: container.containerNumber || '',
    rpujStatus: container.rpujStatus || 'pending',
    rpujNotes: container.rpujNotes || '',
    hasDriverCommission: existingHasDriverCommission,
    driverCommissionAmount: String(existingHasDriverCommission ? existingDriverCommissionAmount || defaultDriverCommissionAmount : 0),
    driverCommissionSourceDestinationId: container.driverCommissionSourceDestinationId || ujRecommendation.destinationId || '',
    driverCommissionNote: container.driverCommissionNote || '',
    spkNumber: container.spkNumber || '',
    spkGeneratedAt: container.spkGeneratedAt || container.spk_generated_at || '',
    spkFilePath: container.spkFilePath || container.spk_file_path || '',
    spkDocument: container.spkDocument || null,
    eirNumber: container.eirNumber || '',
    eirDocument: container.eirDocument || null,
    loadingVoucher: container.loadingVoucher || '',
    loadingVoucherDocument: container.loadingVoucherDocument || null,
    tilaGatepassDocument: container.tilaGatepassDocument || container.unloadingVoucher || container.weighingDocument || '',
    tilaGatepassDocumentFile: container.tilaGatepassDocumentFile || container.unloadingVoucherDocument || container.weighingDocumentFile || null,
    driver: container.driver || '',
    driverId: container.driverId || '',
    ...initialDriverPayment,
    chassis: container.chassis || '',
    plateNumber: container.plateNumber || '',
    vehicleId: container.vehicleId || '',
    assignmentChangeReason: '',
    assignmentChangeNote: '',
    travelDocument: container.travelDocument || '',
    travelDocumentFile: container.travelDocumentFile || null,
    otherDocuments: container.otherDocuments || [],
    status: container.status || 'received',
    runningAt: toDateTimeInputValue(container.runningAt),
    completedAt: toDateTimeInputValue(container.completedAt),
    adminCorrectionMode: false,
    adminCorrectionReason: '',
  });
  const isSalesRole = String(currentUser?.role || '').trim().toLowerCase() === 'sales';
  const canUpdateOperational = !isSalesRole && (!currentUser || hasPermission(currentUser, 'operations.update'));
  const canUpdateDocuments = hasPermission(currentUser, 'documents.operational.update') || canUpdateOperational;
  const isDocumentOnlyMode = canUpdateDocuments && !canUpdateOperational;
  const [activePhase, setActivePhase] = useState(() => (isDocumentOnlyMode ? 'closing' : initialPhase));
  const [error, setError] = useState('');
  const [notification, setNotification] = useState(null);
  const [executionSourceConfirmation, setExecutionSourceConfirmation] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [defaultDriverFormOpen, setDefaultDriverFormOpen] = useState(false);
  const [defaultDriverReason, setDefaultDriverReason] = useState('');
  const [defaultDriverSaving, setDefaultDriverSaving] = useState(false);
  const [defaultDriverError, setDefaultDriverError] = useState('');
  const submitInFlightRef = useRef(false);
  const driverCommissionEditedRef = useRef(false);
  const ujAmount = Number(ujRecommendation.currentContainerUj || 0);
  const driverCommissionAmountValue = form.hasDriverCommission ? Number(form.driverCommissionAmount || 0) : 0;
  const rpujStatus = form.rpujStatus || 'pending';
  const isVendorExecution = form.executionSource === 'vendor';
  const isRepoPickupMode = Boolean(container.repoPickupMode);
  const isRepoComboPickupMode = Boolean(container.repoComboPickupMode);
  const requiresFinanceApprovalForSpk = false;
  const hasCompleteAssignment = isVendorExecution || Boolean(String(form.plateNumber || '').trim() && String(form.driver || '').trim());
  const financeApprovedForSpk = !requiresFinanceApprovalForSpk || ['approved', 'paid'].includes(form.rpujStatus);
  const canGenerateSpk = !isVendorExecution && canUpdateOperational && !isRepoPickupMode && financeApprovedForSpk && hasCompleteAssignment;
  const assignmentRequirementMessage = 'Lengkapi truck dan driver terlebih dahulu.';
  const spkRequirementMessage = !form.spkNumber && !hasCompleteAssignment
    ? 'SPK bisa dibuat setelah truck dan driver lengkap.'
    : requiresFinanceApprovalForSpk && !form.spkNumber && !financeApprovedForSpk
      ? 'SPK bisa dibuat setelah biaya perjalanan tercatat.'
      : '';
  const canAccessAdminCorrection = String(currentUser?.role || '').toLowerCase() === 'admin';
  const canReviseLockedFields = canAccessAdminCorrection && Boolean(form.adminCorrectionMode);
  const canEditDriverCommission = !isVendorExecution && commissionDataLoaded && canUpdateOperational && !isRepoPickupMode && (canReviseLockedFields || form.status !== 'completed');
  const canFillMissingAssignment = canUpdateOperational && !hasCompleteAssignment && form.status !== 'completed';
  const canEditAssignment = canUpdateOperational && (canReviseLockedFields || canFillMissingAssignment || (rpujStatus !== 'paid' && form.status !== 'completed'));
  const originalAssignedDriver = String(container.driver || '').trim();
  const originalAssignedPlate = String(container.plateNumber || '').trim();
  const hadCompleteAssignmentBefore = Boolean(originalAssignedDriver && originalAssignedPlate);
  const assignmentIdentityChanged = String(form.driver || '').trim() !== originalAssignedDriver
    || String(form.plateNumber || '').trim() !== originalAssignedPlate;
  const assignmentChangeReasonRequired = !canReviseLockedFields
    && hadCompleteAssignmentBefore
    && assignmentIdentityChanged
    && form.status !== 'received';
  const canSetTruckDefaultDriver = canUpdateOperational && hasPermission(currentUser, 'operations.truck_default_driver.update');
  const selectedTruckForDefault = trucks.find((truck) => truck.plateNumber === form.plateNumber) || null;
  const canTriggerSetDefaultDriver = Boolean(
    canSetTruckDefaultDriver
      && onSetTruckDefaultDriver
      && selectedTruckForDefault
      && String(form.driver || '').trim()
      && normalizeName(form.driver) !== normalizeName(selectedTruckForDefault.defaultDriver),
  );
  const hasSavedContainerNumber = Boolean(String(container.containerNumber || '').trim());
  const canFillInitialContainerNumber = !hasSavedContainerNumber && !['completed', 'cancelled'].includes(container.status);
  const canEditContainerNumber = canUpdateOperational && !isRepoPickupMode && (
    canReviseLockedFields
      || canFillInitialContainerNumber
      || (!['running', 'completed', 'cancelled'].includes(form.status) && rpujStatus !== 'paid')
  );
  const isCompletedDocumentFollowUp = !canReviseLockedFields && form.status === 'completed';
  const canEditDocumentValue = (field) => canUpdateDocuments && (isDocumentOnlyMode || !isCompletedDocumentFollowUp || !String(container[field] || '').trim());
  const canEditDocumentFile = (field) => canUpdateDocuments && (isDocumentOnlyMode || !isCompletedDocumentFollowUp || !container[field]);
  const canEditOtherDocuments = canUpdateDocuments && (isDocumentOnlyMode || !isCompletedDocumentFollowUp);
  const canEditTimeline = canUpdateOperational && (canReviseLockedFields || container.status !== 'completed');
  const canStartTrip = canUpdateOperational && (isVendorExecution || hasCompleteAssignment || canReviseLockedFields);
  const availableStatusOptions = statusOptions.filter((option) => {
    if (isDocumentOnlyMode) return option.value === form.status;
    if (canReviseLockedFields) return true;
    if (container.status === 'completed') return option.value === 'completed';
    if (container.status === 'running') return option.value !== 'received';
    return true;
  });
  const tripStartRequirementMessage = 'Status perjalanan baru bisa Sedang Jalan setelah truck dan driver lengkap.';
  const hasEirDocument = Boolean(form.eirDocument);
  const hasRepoHistory = Boolean(container.repoLocation || container.repoStoredAt || container.repoEirNumber || container.repoPickedUpAt || container.repoEirDocument);
  const hasInapHistory = Boolean(container.inapStartedAt || container.inapReason);
  const longTripNeedsInapReview = !hasInapHistory && isLongTripOverOneDay(form.runningAt, form.completedAt);
  const hasRepoEirReceipt = Boolean(String(container.repoEirNumber || '').trim() && container.repoEirDocument);
  const hasSpkDocument = Boolean(form.spkNumber || form.spkDocument);
  const isReadyToStart = form.status === 'received'
    && hasCompleteAssignment
    && canStartTrip
    && (isVendorExecution || hasSpkDocument);
  const primaryActionLabel = isDocumentOnlyMode
    ? 'Simpan Dokumen'
    : activePhase === 'preparation'
    ? isVendorExecution ? 'Simpan Ritasi Vendor' : 'Simpan Assignment'
    : activePhase === 'rpuj'
      ? 'Simpan Biaya & SPK'
      : isReadyToStart
        ? 'Mulai Jalan'
        : form.status === 'running'
          ? 'Simpan Update Perjalanan'
          : form.status === 'completed'
            ? 'Simpan Closing'
            : 'Simpan Dokumen & Status';
  const closingChecklist = [
    { label: 'Nomor container ada', ready: Boolean(String(form.containerNumber || '').trim()) },
    ...(isVendorExecution ? [] : [{ label: 'Truck dan driver ada', ready: hasCompleteAssignment }]),
    { label: 'Waktu mulai dan selesai ada', ready: Boolean(form.runningAt && form.completedAt) },
    ...(isVendorExecution ? [] : [
      { label: 'Biaya perjalanan tercatat', ready: canStartTrip },
      { label: 'SPK ada', ready: hasSpkDocument },
    ]),
    ...(hasRepoHistory ? [{ label: 'EIR Titip tersedia', ready: hasRepoEirReceipt }] : []),
    { label: 'Lampiran EIR sudah diupload', ready: hasEirDocument },
  ];

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      if (executionSourceConfirmation) {
        setExecutionSourceConfirmation(null);
        return;
      }
      if (notification) {
        setNotification(null);
        return;
      }
      onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [executionSourceConfirmation, notification, onClose]);

  useEffect(() => {
    if (isVendorExecution && activePhase === 'rpuj') setActivePhase('preparation');
  }, [activePhase, isVendorExecution]);

  function showSubmitNotification(message, title = 'Data belum lengkap') {
    setError('');
    setNotification({ title, message });
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function applyExecutionSource(executionSource) {
    setError('');
    setForm((current) => ({
      ...current,
      executionSource,
      ...(executionSource === 'vendor' ? {
        driver: '',
        driverId: '',
        plateNumber: '',
        vehicleId: '',
        chassis: '',
        assignmentChangeReason: '',
        assignmentChangeNote: '',
        hasDriverCommission: false,
        driverCommissionAmount: '0',
        driverCommissionSourceDestinationId: '',
        driverCommissionNote: '',
        rpujStatus: 'pending',
      } : {}),
    }));
    setExecutionSourceConfirmation(null);
  }

  function updateExecutionSource(executionSource) {
    if (executionSource === form.executionSource) return;
    const hasInternalAssignment = Boolean(
      container.driverId
      || container.vehicleId
      || (container.driver && container.driver !== 'VENDOR')
      || (container.plateNumber && container.plateNumber !== 'VENDOR'),
    );
    const hasUjTransaction = ['submitted', 'approved', 'paid'].includes(container.rpujStatus)
      || Number(container.ujAmountSnapshot || 0) > 0
      || (Array.isArray(container.expenses) && container.expenses.length > 0);
    if (executionSource === 'vendor' && (hasInternalAssignment || hasUjTransaction)) {
      setExecutionSourceConfirmation({ hasInternalAssignment, hasUjTransaction });
      return;
    }
    applyExecutionSource(executionSource);
  }

  function updateAdminCorrectionMode(event) {
    const checked = event.target.checked;
    setForm((current) => ({
      ...current,
      adminCorrectionMode: checked,
      adminCorrectionReason: checked ? current.adminCorrectionReason : '',
    }));
  }

  function updateDriverCommission(event) {
    const checked = event.target.checked;
    driverCommissionEditedRef.current = true;
    setForm((current) => ({
      ...current,
      hasDriverCommission: checked,
      driverCommissionAmount: checked
        ? String(Number(current.driverCommissionAmount || 0) || defaultDriverCommissionAmount || 0)
        : '0',
      driverCommissionSourceDestinationId: checked
        ? current.driverCommissionSourceDestinationId || ujRecommendation.destinationId || ''
        : '',
      driverCommissionNote: checked
        ? current.driverCommissionNote || `Komisi ${ujRecommendation.destinationName || container.destination || 'tujuan'}`
        : '',
    }));
  }

  function updateStatusValue(status) {
    const now = nowForDateTimeInput();
    if (!isVendorExecution && ['running', 'completed'].includes(status) && !hasCompleteAssignment) {
      setError(assignmentRequirementMessage);
      return;
    }
    if (['running', 'completed'].includes(status) && !canStartTrip) {
      setError(tripStartRequirementMessage);
    } else {
      setError('');
    }
    setForm((current) => ({
      ...current,
      status,
      runningAt: status === 'received' ? '' : ['running', 'completed'].includes(status) && !current.runningAt ? now : current.runningAt,
      completedAt: status === 'completed' ? (current.completedAt || now) : '',
    }));
  }

  function updateStatus(event) {
    updateStatusValue(event.target.value);
  }

  const activeStatusOption = statusOptions.find((option) => option.value === form.status) || statusOptions[0];

  function updateTruck(event) {
    if (!canEditAssignment) {
      setError('Driver dan truck tidak bisa diubah lagi setelah UJ ditransfer atau pekerjaan selesai.');
      return;
    }
    const plateNumber = event.target.value;
    const truck = trucks.find((item) => item.plateNumber === plateNumber);
    if (truck && !isTruckCompatibleForRepoPickup(truck, containerSize, isRepoComboPickupMode)) {
      setError(isRepoComboPickupMode
        ? `Combo 2x20 wajib memakai truck/chassis 40FT. ${truck.plateNumber} kapasitas ${truck.capacity || '-'} tidak bisa dipilih.`
        : `Truck ${truck.plateNumber} kapasitas ${truck.capacity || '-'} tidak sesuai untuk container ${containerSize || '-'}.`);
      return;
    }
    // Sopir cuma di-auto-fill dari default truck kalau belum ada sopir terpilih sama sekali --
    // begitu Operational sudah memilih sopir sendiri (independen dari truck), ganti truck tidak
    // boleh menimpa pilihan itu. Dicoba dulu lookup by id (default_driver_id, lebih akurat, tidak
    // rentan salah tangkap kalau ada nama kembar) baru fallback by name untuk truck lama yang
    // cuma pernah diisi lewat halaman Master Truck (belum punya defaultDriverId).
    const shouldAutoFillDriver = !String(form.driver || '').trim();
    const driverByIdFallback = shouldAutoFillDriver ? findDriverById(truck?.defaultDriverId) : null;
    const driverName = shouldAutoFillDriver ? (driverByIdFallback?.name || getTruckDefaultDriver(truck, localTruckRows)) : '';
    const selectedDriver = shouldAutoFillDriver ? (driverByIdFallback || findDriverByName(driverName)) : null;
    if (shouldAutoFillDriver && truck && isDriverBlacklisted(selectedDriver) && truck.plateNumber !== container.plateNumber) {
      setError(`Sopir ${selectedDriver.name} masuk blacklist dan tidak bisa di-assign.`);
      return;
    }
    const driverPayment = shouldAutoFillDriver ? getDriverPaymentInfo(selectedDriver) : null;
    setError('');
    setForm((current) => ({
      ...current,
      plateNumber,
      vehicleId: truck?.id || '',
      ...(shouldAutoFillDriver ? { driver: driverName, driverId: selectedDriver?.id || '', ...driverPayment } : {}),
      chassis: truck ? `${truck.unitCode} - ${truck.brand} ${truck.type}` : '',
      status: !plateNumber && current.status === 'running'
          ? 'received'
          : current.status,
      runningAt: !plateNumber && current.status === 'running'
          ? ''
          : current.runningAt,
      completedAt: !plateNumber && current.status === 'running' ? '' : current.completedAt,
    }));
  }

  function updateDriver(event) {
    if (!canEditAssignment) {
      setError('Driver dan truck tidak bisa diubah lagi setelah UJ ditransfer atau pekerjaan selesai.');
      return;
    }
    const driverName = event.target.value;
    const selectedDriver = findDriverByName(driverName);
    if (selectedDriver && isDriverBlacklisted(selectedDriver) && normalizeName(driverName) !== normalizeName(container.driver)) {
      setError(`Sopir ${selectedDriver.name} masuk blacklist dan tidak bisa di-assign.`);
      return;
    }
    const driverPayment = getDriverPaymentInfo(selectedDriver);
    setError('');
    setForm((current) => ({
      ...current,
      driver: driverName,
      driverId: selectedDriver?.id || '',
      ...driverPayment,
    }));
  }

  async function submitSetTruckDefaultDriver(event) {
    event.preventDefault();
    if (!canTriggerSetDefaultDriver || !selectedTruckForDefault) return;
    const trimmedReason = defaultDriverReason.trim();
    if (trimmedReason.length < 8) {
      setDefaultDriverError('Alasan wajib diisi minimal 8 karakter.');
      return;
    }
    const driver = findDriverByName(form.driver);
    if (!driver?.id) {
      setDefaultDriverError('Sopir aktual ritasi belum terdaftar di master driver.');
      return;
    }
    setDefaultDriverSaving(true);
    setDefaultDriverError('');
    try {
      await onSetTruckDefaultDriver(selectedTruckForDefault.id, { defaultDriverId: driver.id, reason: trimmedReason });
      setDefaultDriverFormOpen(false);
      setDefaultDriverReason('');
      setNotification({
        title: 'Default sopir truck diperbarui',
        message: 'Default sopir truck diperbarui. Berlaku untuk ritasi baru berikutnya.',
      });
    } catch (requestError) {
      setDefaultDriverError(requestError?.message || 'Default sopir truck gagal disimpan.');
    } finally {
      setDefaultDriverSaving(false);
    }
  }

  function updateFile(key, file) {
    if (!file) return;
    const label = documentFields.find(([field]) => field === key)?.[1] || 'Dokumen';
    const validationError = validateArchiveFile(file, {
      label,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setForm((current) => ({ ...current, [key]: fileMetadata(file) }));
  }

  function openOperationalFilePicker(fileField) {
    fileInputRefs.current[fileField]?.click();
  }

  async function handleGenerateSpk() {
    if (form.spkNumber) return;
    if (!hasCompleteAssignment) {
      setError(assignmentRequirementMessage);
      return;
    }
    if (!canGenerateSpk) {
      setError(spkRequirementMessage || 'SPK belum bisa dibuat.');
      return;
    }

    try {
      const generated = onGenerateSpk
        ? await onGenerateSpk(form)
        : { spkNumber: generateSpkNumber() };
      setError('');
      setForm((current) => ({
        ...current,
        spkNumber: generated?.spkNumber || current.spkNumber || generateSpkNumber(),
        spkGeneratedAt: generated?.spkGeneratedAt || new Date().toISOString(),
      }));
    } catch (requestError) {
      setError(requestError.message || 'SPK gagal digenerate.');
    }
  }

  function buildSpkDocumentData() {
    const selectedTruck = trucks.find((truck) => truck.plateNumber === form.plateNumber || truck.plateNumber === container.plateNumber);
    const truckCode = formatTruckUnitCode(selectedTruck?.unitCode || container.unitCode || container.truckCode);
    const plateNumber = form.plateNumber || container.plateNumber || '';
    const truckPlate = truckCode && plateNumber ? `${truckCode} - ${plateNumber}` : truckCode || plateNumber || '-';
    const driverCommissionLabel = driverCommissionAmountValue > 0 ? `${formatCurrency(driverCommissionAmountValue)} (dibayar mingguan)` : '-';
    const totalRpujLabel = ujAmount > 0 ? formatCurrency(ujAmount) : '-';
    const shipment = container.shipment || container.jobType || container.orderType;
    const terminal = spkValue(container.terminal);
    const depo = spkValue(container.origin);
    const destination = spkValue(container.destination);
    const containerNumber = form.containerNumber || container.containerNumber;
    const spkNumber = form.spkNumber || container.spkNumber;
    const companyAddressLines = [
      'Jl. Perjuangan No.11F, RT.1/RW.7, Kb. Jeruk, Kec. Kb. Jeruk,',
      'Kota Jakarta Barat, Daerah Khusus Ibukota Jakarta 11530',
    ];

    return {
      company: {
        logo: armadaLogo,
        name: 'PT Armada Logistik Indonesia',
        address: companyAddressLines.join(' '),
        addressLines: companyAddressLines,
      },
      effectiveDate: spkDateValue(new Date().toISOString()),
      systemGeneratedNote: 'SPK ini di-generate secara otomatis oleh sistem dan tidak memerlukan tanda tangan.',
      orderRows: [
        { label: 'Tujuan', value: destination },
        { label: 'No. SPK', value: spkValue(spkNumber) },
        { label: 'No. Container', value: containerNumber || '' },
        { label: 'Customer', value: spkValue(container.customer) },
        { label: 'Jenis Order', value: formatSpkShipment(shipment) },
        { label: 'Nama Kapal / Voyage', value: spkValue(container.vesselName || container.shipName || container.namaKapal || container.voyage) },
        { label: 'Container Size', value: spkValue(container.size || container.containerSize) },
        { label: 'Tanggal Jalan', value: spkDateValue(container.tripDate || container.runningAt) },
      ],
      driverRows: [
        { label: 'Truck / Plat', value: truckPlate },
        { label: 'Driver', value: spkValue(form.driver || container.driver) },
      ],
      operationalRows: [
        { label: 'Terminal', value: terminal },
        { label: 'Depo', value: depo },
      ],
      rpujRows: [
        { label: 'Total Biaya Perjalanan', value: totalRpujLabel, highlight: true },
        { label: 'Uang Jalan', value: ujAmount > 0 ? formatCurrency(ujAmount) : '-' },
        { label: 'Komisi Sopir', value: driverCommissionLabel },
      ],
      notes: [
        'SPK ini adalah perintah kerja resmi dan diselesaikan dengan penuh tanggung jawab.',
        'Jika terdapat perubahan rencana, segera hubungi tim operasional.',
        'Simpan dokumen ini sebagai arsip operasional.',
      ],
    };
  }

  function previewSpk() {
    const previewWindow = window.open('', '_blank', 'width=900,height=760');
    if (!previewWindow) return;
    previewWindow.opener = null;
    const documentData = buildSpkDocumentData();
    const renderRows = (rows) => rows
      .map((row) => `
        <tr class="${row.highlight ? 'is-highlight' : ''}">
          <th>${escapeHtml(row.label)}</th>
          <td class="separator">:</td>
          <td>${escapeHtml(row.value)}</td>
        </tr>
      `)
      .join('');
    const renderSection = (number, title, rows) => `
      <section class="spk-section">
        <h2>${number}. ${escapeHtml(title)}</h2>
        <table><tbody>${renderRows(rows)}</tbody></table>
      </section>
    `;
    previewWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Preview SPK ${form.spkNumber || ''}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 32px;
              background: #f3f4f6;
              color: #111827;
              font-family: Arial, sans-serif;
            }
            .sheet {
              width: 820px;
              max-width: 100%;
              margin: 0 auto;
              padding: 22px 24px 20px;
              border: 1px solid #9ca3af;
              background: #ffffff;
            }
            h1 {
              margin: 0;
              padding-bottom: 8px;
              border-bottom: 2px solid #9f141a;
              font-size: 25px;
              font-weight: 800;
              letter-spacing: 0;
              text-align: center;
            }
            .company {
              display: grid;
              grid-template-columns: 74px 1fr;
              gap: 14px;
              align-items: center;
              padding: 14px 0 10px;
              border-bottom: 1px solid #9ca3af;
            }
            .logo {
              width: 74px;
              height: 58px;
              object-fit: contain;
            }
            .company strong,
            .company span {
              display: block;
            }
            .company strong { font-size: 15px; }
            .company span { margin-top: 3px; color: #374151; font-size: 10px; }
            .spk-section { margin-top: 10px; }
            h2 {
              margin: 0;
              padding: 5px 8px;
              color: white;
              background: #9f141a;
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
            }
            th,
            td {
              padding: 7px 9px;
              border: 1px solid #d1d5db;
              vertical-align: top;
              text-align: left;
            }
            th {
              width: 190px;
              background: #f9fafb;
              font-weight: 700;
            }
            tr.is-highlight th,
            tr.is-highlight td {
              background: #f3f4f6;
              font-size: 13px;
              font-weight: 800;
            }
            tr.is-highlight td:last-child {
              font-size: 16px;
            }
            .separator {
              width: 22px;
              text-align: center;
            }
            .notes {
              display: grid;
              grid-template-columns: 1fr 190px;
              gap: 16px;
              margin-top: 10px;
              font-size: 9px;
            }
            .notes strong { color: #9f141a; }
            .doc-control {
              border: 1px solid #d1d5db;
              padding: 7px;
            }
            .system-note {
              margin: 12px 0 0;
              padding-top: 7px;
              border-top: 1px solid #d1d5db;
              color: #4b5563;
              font-size: 9px;
              font-style: italic;
            }
            @media print {
              body { padding: 0; background: #ffffff; }
              .sheet { width: 100%; border: 0; padding: 18px; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <h1>SURAT PERINTAH KERJA (SPK)</h1>
            <div class="company">
              <img class="logo" src="${escapeHtml(documentData.company.logo)}" alt="Logo Armada">
              <div>
                <strong>${escapeHtml(documentData.company.name)}</strong>
                <span>${escapeHtml(documentData.company.address)}</span>
              </div>
            </div>
            ${renderSection('1', 'Informasi SPK / Order', documentData.orderRows)}
            ${renderSection('2', 'Informasi Armada & Driver', documentData.driverRows)}
            ${renderSection('3', 'Informasi Operasional', documentData.operationalRows)}
            <div class="notes">
              <div>
                <strong>Catatan:</strong>
                <ol>
                  ${documentData.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
                </ol>
              </div>
              <div class="doc-control">
                <div>No. Dokumen : FM-OPS-09-01</div>
                <div>Rev : 01</div>
                <div>Tgl Berlaku : ${escapeHtml(documentData.effectiveDate)}</div>
              </div>
            </div>
            <p class="system-note">${escapeHtml(documentData.systemGeneratedNote)}</p>
          </div>
        </body>
      </html>
    `);
    previewWindow.document.close();
  }

  async function downloadSpk() {
    const documentData = buildSpkDocumentData();
    const logoImage = await createPdfImage(documentData.company.logo).catch(() => null);
    const blob = createSpkPdfBlob(documentData, logoImage);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.spkNumber || 'SPK'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleOperationalFileChange(fileField, label, file, validationError) {
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!file) return;
    setError('');
    updateFile(fileField, file);
  }

  function buildSubmitForm({ forceRpujStatus } = {}) {
    if (!isVendorExecution && assignmentChangeReasonRequired && !String(form.assignmentChangeReason || '').trim()) {
      return { error: 'Ritasi sudah berjalan -- alasan perubahan sopir/truck wajib diisi.' };
    }
    const hasDriverCommission = !isVendorExecution && Boolean(form.hasDriverCommission);
    const driverCommissionAmount = hasDriverCommission ? Number(form.driverCommissionAmount || 0) : 0;
    if (driverCommissionAmount < 0) {
      return { error: 'Nominal komisi sopir tidak boleh negatif.' };
    }
    if (hasDriverCommission && driverCommissionAmount <= 0) {
      return { error: 'Nominal komisi sopir belum tersedia. Lengkapi Master Lokasi Tujuan atau matikan checkbox komisi.' };
    }
    const currentRpujStatus = form.rpujStatus || 'pending';
    const hasRpujRequest = !isVendorExecution && ujAmount > 0;
    const nextRpujStatus = ['approved', 'paid'].includes(currentRpujStatus)
      ? currentRpujStatus
      : hasRpujRequest
        ? forceRpujStatus || 'pending'
        : 'pending';
    const submitForm = {
      ...form,
      executionSource: isVendorExecution ? 'vendor' : 'internal',
      rpujStatus: nextRpujStatus,
      hasDriverCommission,
      driverCommissionAmount,
      driverCommissionSourceDestinationId: hasDriverCommission ? form.driverCommissionSourceDestinationId || ujRecommendation.destinationId || '' : '',
      driverCommissionNote: hasDriverCommission ? form.driverCommissionNote || `Komisi ${ujRecommendation.destinationName || container.destination || 'tujuan'}` : '',
      runningAt: dateTimeInputToIso(form.runningAt),
      completedAt: dateTimeInputToIso(form.completedAt),
    };
    if (driverCommissionEditedRef.current) {
      submitForm.driverCommissionEdited = true;
    } else {
      delete submitForm.hasDriverCommission;
      delete submitForm.driverCommissionAmount;
      delete submitForm.driverCommissionSourceDestinationId;
      delete submitForm.driverCommissionNote;
    }
    delete submitForm.rpujNotes;
    if (canReviseLockedFields) {
      const correctionReason = String(form.adminCorrectionReason || '').trim();
      if (correctionReason.length < 8) {
        return { error: 'Alasan koreksi admin wajib diisi.' };
      }
      submitForm.adminCorrectionMode = true;
      submitForm.adminCorrectionReason = correctionReason;
    } else {
      delete submitForm.adminCorrectionMode;
      delete submitForm.adminCorrectionReason;
    }
    return { submitForm, hasRpujRequest, driverCommissionAmount };
  }

  function buildDocumentOnlySubmitForm() {
    const updatedBy = currentUser?.fullName || currentUser?.name || form.updatedBy || 'Sales';
    return {
      updatedBy,
      eirNumber: form.eirNumber,
      eirDocument: form.eirDocument,
      repoEirNumber: form.repoEirNumber,
      repoEirDocument: form.repoEirDocument,
      loadingVoucher: form.loadingVoucher,
      loadingVoucherDocument: form.loadingVoucherDocument,
      tilaGatepassDocument: form.tilaGatepassDocument,
      tilaGatepassDocumentFile: form.tilaGatepassDocumentFile,
      travelDocument: form.travelDocument,
      travelDocumentFile: form.travelDocumentFile,
      otherDocuments: form.otherDocuments,
    };
  }

  async function submitOnce(submitForm) {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setIsSaving(true);
    try {
      await onSubmit({
        ...submitForm,
      });
    } catch (requestError) {
      setError(requestError?.message || 'Proses gagal disimpan.');
      throw requestError;
    } finally {
      submitInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitInFlightRef.current) return;
    if (isDocumentOnlyMode) {
      setError('');
      await submitOnce(buildDocumentOnlySubmitForm());
      return;
    }
    const { submitForm, error: submitError } = buildSubmitForm({
      forceRpujStatus: activePhase === 'rpuj' ? 'submitted' : undefined,
    });
    if (submitError) {
      showSubmitNotification(submitError);
      return;
    }
    if (isRepoPickupMode && !hasCompleteAssignment) {
      showSubmitNotification('Ambil container titip wajib melengkapi truck dan sopir perjalanan lanjutan terlebih dahulu.');
      return;
    }
    if (isRepoPickupMode) {
      submitForm.containerNumber = container.containerNumber || submitForm.containerNumber;
      submitForm.status = 'running';
      submitForm.runningAt = submitForm.runningAt || nowForDateTimeInput();
    }
    const shouldStartTrip = activePhase === 'closing'
      && hasCompleteAssignment
      && submitForm.status === 'received'
      && canStartTrip
      && Boolean(submitForm.spkNumber || submitForm.spkDocument);
    if (shouldStartTrip) {
      submitForm.status = 'running';
      submitForm.runningAt = submitForm.runningAt || nowForDateTimeInput();
    }
    if (isVendorExecution && !String(submitForm.containerNumber || '').trim()) {
      showSubmitNotification('Nomor container wajib diisi untuk ritasi vendor.');
      return;
    }
    const selectedTruck = isVendorExecution ? null : trucks.find((truck) => truck.plateNumber === submitForm.plateNumber);
    if (selectedTruck && !isTruckCompatibleForRepoPickup(selectedTruck, containerSize, isRepoComboPickupMode)) {
      showSubmitNotification(isRepoComboPickupMode
        ? `Combo 2x20 wajib memakai truck/chassis 40FT. ${selectedTruck.plateNumber} kapasitas ${selectedTruck.capacity || '-'} tidak bisa dipilih.`
        : `Truck ${selectedTruck.plateNumber} kapasitas ${selectedTruck.capacity || '-'} tidak sesuai untuk container ${containerSize || '-'}.`);
      return;
    }
    if (selectedTruck && selectedTruck.plateNumber !== container.plateNumber && !isTruckAssignable(selectedTruck)) {
      showSubmitNotification(`Truck ${selectedTruck.plateNumber} sedang ${selectedTruck.status || 'tidak siap'} dan tidak bisa di-assign.`);
      return;
    }
    if (!isVendorExecution && ['running', 'completed'].includes(submitForm.status) && !canStartTrip) {
      showSubmitNotification(tripStartRequirementMessage);
      return;
    }
    if (!isVendorExecution && ['running', 'completed'].includes(submitForm.status) && !hasCompleteAssignment) {
      showSubmitNotification('Status perjalanan belum bisa Sedang Jalan. Lengkapi truck dan driver terlebih dahulu.');
      return;
    }
    if (!isVendorExecution && submitForm.status === 'running' && (!submitForm.driver || !submitForm.plateNumber || !submitForm.runningAt)) {
      showSubmitNotification('Truck, driver otomatis, dan waktu mulai wajib diisi untuk status Sedang Jalan.');
      return;
    }
    if (submitForm.status === 'completed') {
      const missingContainerNumber = !String(submitForm.containerNumber || '').trim();
      const missingAssignment = (!isVendorExecution && !hasCompleteAssignment) || !submitForm.runningAt || !submitForm.completedAt;
      const missingSpk = !isVendorExecution && !canReviseLockedFields && !submitForm.spkNumber && !submitForm.spkDocument;
      const missingRepoEirReceipt = !canReviseLockedFields && hasRepoHistory && !hasRepoEirReceipt;
      const missingEirDocument = !canReviseLockedFields && !submitForm.eirDocument;
      if (missingRepoEirReceipt) {
        showSubmitNotification('Pekerjaan belum dapat diselesaikan. Lengkapi EIR Titip dari depo penitipan terlebih dahulu.');
        return;
      }
      if (missingContainerNumber || missingAssignment || missingSpk || missingEirDocument) {
        showSubmitNotification(isVendorExecution
          ? 'Pekerjaan vendor belum dapat diselesaikan. Lengkapi nomor container, waktu jalan, waktu selesai, dan upload lampiran EIR.'
          : 'Pekerjaan belum dapat diselesaikan. Lengkapi nomor container, truck/driver, waktu jalan, waktu selesai, SPK, dan upload lampiran EIR.');
        return;
      }
      if (submitForm.completedAt && submitForm.runningAt && new Date(submitForm.completedAt) < new Date(submitForm.runningAt)) {
        showSubmitNotification('Waktu selesai tidak boleh lebih awal dari waktu mulai.');
        return;
      }
    }
    setError('');
    await submitOnce(submitForm);
  }

  const availableTrucks = trucks.filter((truck) => (
    (isTruckAssignable(truck) || truck.plateNumber === form.plateNumber)
    && isTruckCompatibleForRepoPickup(truck, containerSize, isRepoComboPickupMode)
    && !isTruckBusyForAnotherJob(truck, activeJobs, container.id)
    && (!isTruckDefaultDriverBlacklisted(truck) || truck.plateNumber === form.plateNumber)
  ));
  const currentTruckExists = availableTrucks.some((truck) => truck.plateNumber === form.plateNumber);
  const selectedTruckCanBeShown = !form.plateNumber || !isRepoComboPickupMode || isTruckCompatibleForRepoPickup(
    trucks.find((truck) => truck.plateNumber === form.plateNumber),
    containerSize,
    isRepoComboPickupMode,
  );
  const availableDrivers = drivers.filter((driver) => (
    (!isDriverBlacklisted(driver) || normalizeName(driver.name) === normalizeName(form.driver))
    && !isDriverBusyForAnotherJob(driver, activeJobs, container.id)
  ));
  const currentDriverExists = availableDrivers.some((driver) => normalizeName(driver.name) === normalizeName(form.driver));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={isSaving ? undefined : onClose}>
      <section className="order-modal operational-modal" role="dialog" aria-modal="true" aria-busy={isSaving} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><p className="eyebrow">Container Job</p><h2>{form.containerNumber || container.containerNumber}</h2><span>{container.soNumber} - {container.customer} - {container.origin} - {container.destination}</span></div>
          <button type="button" onClick={onClose} aria-label="Tutup form" disabled={isSaving}><X size={20} /></button>
        </header>
        <form className="operational-update-form" onSubmit={handleSubmit}>
          {error ? <div className="alert error operational-form-error">{error}</div> : null}
          {isRepoPickupMode ? (
            <div className="alert operational-form-repo-pickup">
              Container sedang diambil dari depo penitipan. Pastikan truck dan sopir perjalanan lanjutan sudah sesuai.
            </div>
          ) : null}
          {canAccessAdminCorrection ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
              <label className="flex items-start gap-2 font-bold">
                <input
                  checked={Boolean(form.adminCorrectionMode)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-red-600 focus:ring-red-200"
                  onChange={updateAdminCorrectionMode}
                  type="checkbox"
                />
                <span className="flex min-w-0 items-center gap-1.5">
                  <ShieldCheck size={14} />
                  Mode koreksi admin
                </span>
              </label>
              {form.adminCorrectionMode ? (
                <label className="mt-3 block font-bold">
                  Alasan koreksi
                  <textarea
                    className="mt-1 min-h-[74px] w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    name="adminCorrectionReason"
                    onChange={updateField}
                    placeholder="Contoh: koreksi salah input tanggal"
                    value={form.adminCorrectionReason}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {!isDocumentOnlyMode ? (
            <section className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3" aria-labelledby="execution-source-label">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 id="execution-source-label" className="text-sm font-bold text-slate-900">Pelaksanaan ritasi</h3>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Pilih sumber unit untuk container ini.</p>
                </div>
                <div className="inline-grid grid-cols-2 rounded-md border border-slate-300 bg-white p-1" role="group" aria-label="Pelaksanaan ritasi">
                  <button
                    className={`min-w-28 rounded px-3 py-2 text-xs font-bold ${!isVendorExecution ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                    type="button"
                    aria-pressed={!isVendorExecution}
                    onClick={() => updateExecutionSource('internal')}
                  >
                    Unit Sendiri
                  </button>
                  <button
                    className={`min-w-28 rounded px-3 py-2 text-xs font-bold ${isVendorExecution ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                    type="button"
                    aria-pressed={isVendorExecution}
                    onClick={() => updateExecutionSource('vendor')}
                  >
                    Vendor
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <div className="operational-mobile-job-summary" aria-label="Ringkasan container job">
            <div>
              <span>Customer</span>
              <strong>{container.customer || '-'}</strong>
            </div>
            <div>
              <span>Tujuan</span>
              <strong>{container.destination || '-'}</strong>
            </div>
            <div>
              <span>Truck</span>
              <strong>{isVendorExecution ? 'VENDOR' : form.plateNumber || '-'}</strong>
            </div>
            <div>
              <span>Sopir</span>
              <strong>{isVendorExecution ? 'VENDOR' : form.driver || '-'}</strong>
            </div>
          </div>

          {!isDocumentOnlyMode ? (
          <div className="operational-phase-tabs" role="tablist" aria-label="Phase Operational">
            {operationalPhaseOptions.filter((phase) => !isVendorExecution || phase.id !== 'rpuj').map((phase, index) => (
              <button
                aria-selected={activePhase === phase.id}
                className={activePhase === phase.id ? 'active' : ''}
                key={phase.id}
                onClick={() => setActivePhase(phase.id)}
                role="tab"
                title={phase.description}
                type="button"
              >
                <span>{index + 1}</span>
                <strong>{phase.label}</strong>
              </button>
            ))}
          </div>
          ) : null}

          <div className="operational-form-content">
          {activePhase === 'preparation' ? (
          <>
          <div className="form-section">
            <h3>{isVendorExecution ? 'Ritasi Vendor' : 'Assignment Aktual'}</h3>
            <p className="mb-2 text-[11px] font-medium text-slate-500">
              {isVendorExecution ? 'Cukup isi nomor container. Truck dan sopir dicatat sebagai VENDOR.' : 'Perubahan ini hanya berlaku untuk ritasi ini dan tidak mengubah master.'}
            </p>
            {isVendorExecution ? (
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,.7fr)]">
                <label>No. Container<input name="containerNumber" value={form.containerNumber} onChange={updateField} disabled={!canEditContainerNumber} placeholder="TCLU1234567" /></label>
                <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3" aria-label="Assignment vendor">
                  <div><span className="block text-[10px] font-bold uppercase text-slate-500">Truck</span><strong className="mt-1 block text-sm text-slate-900">VENDOR</strong></div>
                  <div><span className="block text-[10px] font-bold uppercase text-slate-500">Sopir</span><strong className="mt-1 block text-sm text-slate-900">VENDOR</strong></div>
                </div>
              </div>
            ) : (
            <div className="order-form-grid">
              <label>Truck<select name="plateNumber" value={selectedTruckCanBeShown ? form.plateNumber : ''} onChange={updateTruck} disabled={!canEditAssignment}><option value="">{isRepoComboPickupMode ? 'Pilih truck 40FT untuk combo' : `Pilih truck ${containerSize ? `${containerSize}` : ''}`}</option>{form.plateNumber && !currentTruckExists && selectedTruckCanBeShown ? <option value={form.plateNumber}>{form.plateNumber}</option> : null}{availableTrucks.map((truck) => <option key={truck.id} value={truck.plateNumber}>{truck.plateNumber} - {truck.unitCode} - {truck.capacity || '-'}</option>)}</select></label>
              <label>No. Container<input name="containerNumber" value={form.containerNumber} onChange={updateField} disabled={!canEditContainerNumber} placeholder="TCLU1234567" /></label>
              <label>
                Sopir Aktual Ritasi
                <SearchableDriverInput
                  currentDriverExists={currentDriverExists}
                  disabled={!canEditAssignment}
                  drivers={availableDrivers}
                  onChange={updateDriver}
                  value={form.driver}
                />
              </label>
              <label>Pembayaran UJ Driver<input value={form.driverBankAccount || 'Belum diisi di master driver'} readOnly /></label>
              <label>Detail Truck<input value={form.chassis} readOnly /></label>
              <label>Alasan Perubahan{assignmentChangeReasonRequired ? ' *' : ''}<input name="assignmentChangeReason" value={form.assignmentChangeReason} onChange={updateField} disabled={!canEditAssignment} placeholder="Contoh: sopir sakit, truck rusak di jalan" /></label>
              <label>Catatan<textarea name="assignmentChangeNote" value={form.assignmentChangeNote} onChange={updateField} disabled={!canEditAssignment} placeholder="Catatan tambahan (opsional)" rows={2} /></label>
            </div>
            )}
            {!isVendorExecution && selectedTruckForDefault ? (
              <p className="mt-2 text-[11px] font-medium text-slate-500">Default sopir truck saat ini: {getDriverDisplayName(selectedTruckForDefault.defaultDriver) || 'belum diset'}</p>
            ) : null}
            {!isVendorExecution && canSetTruckDefaultDriver ? (
              <div className="mt-2">
                {defaultDriverFormOpen ? (
                  <form className="grid gap-2 rounded-md border border-sky-200 bg-sky-50 p-3" onSubmit={submitSetTruckDefaultDriver}>
                    <p className="text-xs font-semibold text-sky-900">
                      Ini akan mengubah default sopir untuk {selectedTruckForDefault?.plateNumber} menjadi {form.driver}. Perubahan hanya berlaku untuk ritasi baru berikutnya dan tidak mengubah ritasi lama.
                    </p>
                    <label className="grid gap-1 text-[11px] font-bold text-slate-700">
                      Alasan
                      <textarea
                        className="min-h-14 w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-slate-500"
                        disabled={defaultDriverSaving}
                        onChange={(event) => setDefaultDriverReason(event.target.value)}
                        placeholder="Contoh: sopir tetap truck ini memang diganti"
                        value={defaultDriverReason}
                      />
                    </label>
                    {defaultDriverError ? <p className="text-xs font-semibold text-rose-700">{defaultDriverError}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <button className="primary-button" disabled={defaultDriverSaving} type="submit">{defaultDriverSaving ? 'Menyimpan...' : 'Konfirmasi'}</button>
                      <button
                        className="secondary-button"
                        disabled={defaultDriverSaving}
                        onClick={() => { setDefaultDriverFormOpen(false); setDefaultDriverReason(''); setDefaultDriverError(''); }}
                        type="button"
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="text-xs font-bold text-sky-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                    disabled={!canTriggerSetDefaultDriver}
                    onClick={() => { setDefaultDriverFormOpen(true); setDefaultDriverError(''); }}
                    type="button"
                  >
                    Jadikan sopir ini default truck
                  </button>
                )}
              </div>
            ) : null}
            {!canEditAssignment ? (
              <p className="mt-2 text-[11px] font-medium text-amber-700">Driver dan truck terkunci karena UJ sudah ditransfer atau pekerjaan selesai. Hubungi admin untuk revisi.</p>
            ) : assignmentChangeReasonRequired ? (
              <p className="mt-2 text-[11px] font-medium text-amber-700">Ritasi sudah berjalan -- alasan perubahan sopir/truck wajib diisi sebelum disimpan.</p>
            ) : null}
            {!canEditContainerNumber ? (
              <p className="mt-2 text-[11px] font-medium text-amber-700">{isRepoPickupMode ? 'No. Container terkunci saat ambil container titip. Operational hanya memastikan truck dan sopir perjalanan lanjutan.' : 'No. Container yang sudah tersimpan terkunci setelah pekerjaan berjalan, selesai, atau UJ ditransfer. Hubungi admin untuk revisi.'}</p>
            ) : !hasSavedContainerNumber && (form.status === 'running' || rpujStatus === 'paid') ? (
              <p className="mt-2 text-[11px] font-medium text-emerald-700">No. Container belum diketahui saat assignment. Nomor pertama tetap dapat diisi meskipun UJ sudah dikirim atau perjalanan sedang berjalan.</p>
            ) : null}
          </div>
          {!isVendorExecution ? <AssignmentHistorySection containerJobId={container.id} /> : null}
          </>
          ) : null}

          {activePhase === 'rpuj' && !isVendorExecution ? (
          <div className="form-section">
            <h3>Komisi Sopir & SPK</h3>
            <div className="mb-4">
              <UjRecommendationCard job={container} destinations={masterDestinations} />
            </div>
            <div className="operational-rpuj-spk-grid">
              <div className="operational-document-card operational-rpuj-card">
                <div className="operational-rpuj-card-head">
                  <span>Komisi Sopir</span>
                  <small>Komisi dihitung otomatis dari Master Lokasi Tujuan.</small>
                </div>

                {!canEditDriverCommission ? (
                  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {!commissionDataLoaded
                      ? 'Detail komisi belum dimuat lengkap. Tutup modal lalu buka kembali dari detail Container Job.'
                      : isRepoPickupMode
                        ? 'Komisi sopir terkunci saat ambil container titip. Operational hanya memastikan truck dan sopir perjalanan lanjutan.'
                        : 'Komisi sopir terkunci setelah pekerjaan selesai. Admin dapat membuka revisi jika diperlukan.'}
                  </div>
                ) : null}

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <label className="flex items-start gap-2 text-xs font-bold text-slate-800">
                    <input
                      checked={Boolean(form.hasDriverCommission)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-200"
                      disabled={!canEditDriverCommission}
                      onChange={updateDriverCommission}
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      Ada komisi sopir
                      <small className="mt-0.5 block text-[11px] font-medium text-slate-500">
                        {defaultDriverCommissionAmount > 0
                          ? `${formatCurrency(defaultDriverCommissionAmount)} dari Master Tujuan`
                          : 'Komisi tujuan belum diatur'}
                      </small>
                    </span>
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                      <span className="text-slate-400">Dicatat</span>
                      <strong className="font-semibold text-slate-800">{formatCurrency(driverCommissionAmountValue)}</strong>
                    </span>
                    {form.hasDriverCommission && !driverCommissionAmountValue ? (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">Master komisi kosong</span>
                    ) : null}
                  </div>
                </div>

                <div className="operational-cost-summary">
                  <div className="operational-cost-summary-head">
                    <div>
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Ringkasan Biaya</span>
                      <small className="block text-[11px] text-slate-400">Acuan tarif UJ</small>
                    </div>
                    <strong className="text-base font-semibold text-slate-900">{formatCurrency(ujAmount)}</strong>
                  </div>
                  <div className="operational-cost-pills">
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                      <span className="text-slate-400">UJ</span>
                      <strong className="font-semibold text-slate-800">{formatCurrency(ujAmount)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                      <span className="text-slate-400">Komisi Mingguan</span>
                      <strong className="font-semibold text-slate-800">{formatCurrency(driverCommissionAmountValue)}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="operational-document-card operational-spk-card">
                <span>SPK</span>
                <div className="operational-spk-head">
                  <strong>{form.spkNumber || 'SPK belum dibuat'}</strong>
                  {spkRequirementMessage ? (
                    <small className="operational-spk-note">{spkRequirementMessage}</small>
                  ) : null}
                </div>
                <div className="operational-spk-actions">
                  {!form.spkNumber ? (
                    <button
                      type="button"
                      className="secondary-button operational-spk-button"
                      onClick={handleGenerateSpk}
                      disabled={!canGenerateSpk}
                    >
                      {canGenerateSpk ? 'Generate SPK' : !hasCompleteAssignment ? 'Lengkapi Truck' : 'Lengkapi Biaya'}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="secondary-button operational-spk-button" onClick={previewSpk}>
                        Preview SPK
                      </button>
                      <button type="button" className="secondary-button operational-spk-button" onClick={downloadSpk}>
                        Download SPK
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          ) : null}

          {activePhase === 'closing' ? (
          <div className="operational-closing-phase">
            <div className="form-section operational-documents-section">
              <div className="form-section-heading">
                <div>
                  <h3>Dokumen Operasional</h3>
                  <p>Dokumen kosong masuk follow-up.</p>
                </div>
              </div>
              {isCompletedDocumentFollowUp ? (
                <p className="mb-3 text-[11px] font-medium text-amber-700">{isDocumentOnlyMode ? 'Mode dokumen: perubahan di sini hanya menyimpan dokumen dan tidak mengubah status perjalanan.' : 'Pekerjaan sudah selesai. Operational hanya dapat melengkapi data atau file yang masih kosong; revisi dokumen tersimpan hanya dapat dilakukan Admin.'}</p>
              ) : null}
              <div className="order-form-grid">
                {hasRepoHistory ? (
                  <div className="operational-document-card operational-repo-eir-card">
                    <span>EIR Titip</span>
                    <p className="operational-eir-note">Bukti container diterima di depo penitipan.</p>
                    <label className="operational-inline-label">
                      No. EIR Titip
                      <input
                        value={container.repoEirNumber || ''}
                        disabled
                        placeholder="Belum ada nomor"
                      />
                    </label>
                    <div className="operational-document-upload-row">
                      <span className={`operational-file-name ${hasDocumentFile(container.repoEirDocument) ? 'has-file' : 'is-empty'}`}>
                        {documentFileLabel(container.repoEirDocument)}
                      </span>
                    </div>
                    <small className="operational-document-helper">Dibuat saat container dititipkan.</small>
                  </div>
                ) : null}
                <div className="operational-document-card operational-eir-card">
                  <span>EIR</span>
                  <p className="operational-eir-note">Bukti akhir container sudah diserahkan.</p>
                  <label className="operational-inline-label">
                    No. EIR
                    <input
                      name="eirNumber"
                      value={form.eirNumber}
                      onChange={updateField}
                      disabled={!canEditDocumentValue('eirNumber')}
                      placeholder="EIR-2026-001"
                    />
                  </label>
                  <div className="operational-document-upload-row">
                    <input
                      ref={(node) => {
                        if (node) {
                          fileInputRefs.current.eirDocument = node;
                        }
                      }}
                      className="operational-document-hidden-input"
                      id="operational-eir-document"
                      type="file"
                      accept={OPERATIONAL_FILE_ACCEPT}
                      disabled={!canEditDocumentFile('eirDocument')}
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0];
                        if (!nextFile) return;
                        const validationError = validateArchiveFile(nextFile, { label: 'Lampiran EIR' });
                        if (validationError) {
                          event.target.value = '';
                          handleOperationalFileChange('eirDocument', 'Lampiran EIR', null, validationError);
                          return;
                        }
                        handleOperationalFileChange('eirDocument', 'Lampiran EIR', nextFile, '');
                        event.target.value = '';
                      }}
                    />
                    <button type="button" className="secondary-button operational-upload-button" onClick={() => openOperationalFilePicker('eirDocument')} disabled={!canEditDocumentFile('eirDocument')} aria-label="Pilih lampiran EIR">
                      {hasDocumentFile(form.eirDocument) ? 'Ubah File' : 'Pilih File'}
                    </button>
                    <span className={`operational-file-name ${hasDocumentFile(form.eirDocument) ? 'has-file' : 'is-empty'}`}>
                      {documentFileLabel(form.eirDocument)}
                    </span>
                  </div>
                  <small className="operational-document-helper">PDF maks. 5 MB, JPG/PNG maks. 10 MB</small>
                </div>
                {operationalDocumentFields.map((field) => (
                  <div className="operational-document-card" key={field.valueField}>
                    <span>{field.label}</span>
                    <input
                      className="operational-document-input"
                      name={field.valueField}
                      value={form[field.valueField]}
                      onChange={updateField}
                      disabled={!canEditDocumentValue(field.valueField)}
                    />
                    <div className="operational-document-upload-row">
                      <input
                        ref={(node) => {
                          if (node) {
                            fileInputRefs.current[field.fileField] = node;
                          }
                        }}
                        className="operational-document-hidden-input"
                        id={`operational-${field.fileField}`}
                        type="file"
                        accept={OPERATIONAL_FILE_ACCEPT}
                        disabled={!canEditDocumentFile(field.fileField)}
                        onChange={(event) => {
                          const nextFile = event.target.files?.[0];
                          if (!nextFile) return;
                          const validationError = validateArchiveFile(nextFile, { label: field.label });
                          if (validationError) {
                            event.target.value = '';
                            handleOperationalFileChange(field.fileField, field.label, null, validationError);
                            return;
                          }
                          handleOperationalFileChange(field.fileField, field.label, nextFile, '');
                          event.target.value = '';
                        }}
                      />
                      <button type="button" className="secondary-button operational-upload-button" onClick={() => openOperationalFilePicker(field.fileField)} disabled={!canEditDocumentFile(field.fileField)} aria-label={`Pilih ${field.label}`}>
                        {hasDocumentFile(form[field.fileField]) ? 'Ubah File' : 'Pilih File'}
                      </button>
                      <span className={`operational-file-name ${hasDocumentFile(form[field.fileField]) ? 'has-file' : 'is-empty'}`}>
                        {documentFileLabel(form[field.fileField])}
                      </span>
                    </div>
                    <small className="operational-document-helper">PDF maks. 5 MB, JPG/PNG maks. 10 MB</small>
                  </div>
                ))}
              </div>
              <div className="other-document-section">
                <div className="form-section-heading">
                  <div><h3>Other Documents</h3><p>Dokumen tambahan bersifat opsional.</p></div>
                  <button className="secondary-button" type="button" onClick={() => setForm((current) => ({ ...current, otherDocuments: [...current.otherDocuments, { name: '', file: null }] }))} disabled={!canEditOtherDocuments}><Plus size={15} /> Tambah</button>
                </div>
                {!canEditOtherDocuments ? (
                  <p className="mt-2 text-[11px] font-medium text-amber-700">Dokumen tambahan terkunci setelah pekerjaan selesai. Hubungi Admin untuk revisi.</p>
                ) : null}
                {form.otherDocuments.map((document, index) => (
                  <div className="other-document-row" key={`other-${index}`}>
                    <input value={document.name} onChange={(event) => setForm((current) => ({ ...current, otherDocuments: current.otherDocuments.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} disabled={!canEditOtherDocuments} placeholder="Nama dokumen" />
                    <AttachmentUploadField
                      id={`other-document-${index}`}
                      label="Dokumen tambahan"
                      value={document.file}
                        title={document.file?.name ? 'Ubah File' : 'Pilih File'}
                      helper="PDF maks. 5 MB, JPG/PNG maks. 10 MB"
                      accept={OPERATIONAL_FILE_ACCEPT}
                      validationOptions={{
                        label: 'Dokumen tambahan',
                      }}
                      disabled={!canEditOtherDocuments}
                      onSelect={(file, validationError) => {
                        if (validationError) return setError(validationError);
                        setError('');
                        setForm((current) => ({
                          ...current,
                          otherDocuments: current.otherDocuments.map((item, itemIndex) => (
                            itemIndex === index ? { ...item, file: fileMetadata(file) } : item
                          )),
                        }));
                        return undefined;
                      }}
                      onClear={() => setForm((current) => ({
                        ...current,
                        otherDocuments: current.otherDocuments.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, file: null } : item
                        )),
                      }))}
                    />
                    <button type="button" onClick={() => setForm((current) => ({ ...current, otherDocuments: current.otherDocuments.filter((_, itemIndex) => itemIndex !== index) }))} disabled={!canEditOtherDocuments}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-section operational-timeline-section">
              <h3>Status & Timeline</h3>
              <div className="operational-closing-checklist" aria-label="Checklist closing sebelum selesai">
                {closingChecklist.map((item) => (
                  <div className={item.ready ? 'ready' : ''} key={item.label}>
                    <span>{item.ready ? 'OK' : '!'}</span>
                    <strong>{item.label}</strong>
                  </div>
                ))}
              </div>
              {longTripNeedsInapReview ? (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800">
                  Durasi ritasi lebih dari 24 jam. Jika ritasi ini benar kena inap, gunakan aksi Tandai Inap di daftar Operational sebelum closing. Jika bukan inap, lanjutkan closing seperti biasa; pivot tidak akan menandai INP tanpa konfirmasi inap.
                </div>
              ) : null}
              <div className="operational-timeline-grid">
                <label className="operational-status-field">
                  Status Pekerjaan
                  <select name="status" value={form.status} onChange={updateStatus} style={activeStatusOption.selectStyle} disabled={isDocumentOnlyMode || (!canReviseLockedFields && container.status === 'completed')}>
                    {availableStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <span className={`mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${activeStatusOption.tone}`}>
                    {activeStatusOption.label}
                  </span>
                  <small className="text-[11px] font-semibold leading-snug text-slate-500">{activeStatusOption.description}</small>
                  {!isVendorExecution && !hasCompleteAssignment ? (
                    <small className="text-[11px] font-semibold leading-snug text-amber-700">
                      Truck dan driver wajib lengkap sebelum perjalanan berjalan.
                    </small>
                  ) : !canStartTrip ? (
                    <small className="text-[11px] font-semibold leading-snug text-amber-700">
                      Catatan biaya perjalanan perlu dilengkapi sebelum perjalanan berjalan.
                    </small>
                  ) : null}
                </label>
                <label className="operational-date-field operational-date-start">
                  Waktu Mulai
                  <DateTimeWibInput value={form.runningAt} onChange={(value) => setForm((current) => ({ ...current, runningAt: value }))} disabled={!canEditTimeline} dateLabel="Tanggal mulai" timeLabel="Jam mulai WIB" />
                </label>
                <label className="operational-date-field operational-date-end">
                  Waktu Selesai
                  <DateTimeWibInput value={form.completedAt} onChange={(value) => setForm((current) => ({ ...current, completedAt: value }))} disabled={!canEditTimeline} dateLabel="Tanggal selesai" timeLabel="Jam selesai WIB" />
                </label>
              </div>
            </div>
          </div>
          ) : null}
          </div>

          <footer className="operational-form-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={isSaving}>Batal</button><button className="primary-button" type="submit" aria-label={`Simpan Container Job - ${primaryActionLabel}`} disabled={isSaving}>{isSaving ? 'Menyimpan...' : primaryActionLabel}</button></footer>
        </form>
      </section>

      {notification ? (
        <div className="feedback-dialog-backdrop" role="presentation" onMouseDown={() => setNotification(null)}>
          <section
            className="feedback-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="operational-notification-title"
            aria-describedby="operational-notification-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span><AlertTriangle size={21} /></span>
              <div>
                <h2 id="operational-notification-title">{notification.title}</h2>
                <p id="operational-notification-description">{notification.message}</p>
              </div>
            </header>
            <footer>
              <button className="primary-button" type="button" autoFocus onClick={() => setNotification(null)}>
                Mengerti
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {executionSourceConfirmation ? (
        <div className="feedback-dialog-backdrop" role="presentation" onMouseDown={() => setExecutionSourceConfirmation(null)}>
          <section
            className="feedback-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="execution-source-confirmation-title"
            aria-describedby="execution-source-confirmation-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span><AlertTriangle size={21} /></span>
              <div>
                <h2 id="execution-source-confirmation-title">Ubah menjadi ritasi Vendor?</h2>
                <p id="execution-source-confirmation-description">
                  {executionSourceConfirmation.hasUjTransaction
                    ? 'Ritasi ini sudah memiliki data UJ atau transaksi biaya. Assignment truck dan sopir akan dikosongkan, tetapi perubahan masih dapat ditolak backend jika transaksi sudah terkunci.'
                    : 'Assignment truck dan sopir yang sudah dipilih akan dikosongkan dari ritasi ini.'}
                </p>
              </div>
            </header>
            <footer>
              <button className="secondary-button" type="button" autoFocus onClick={() => setExecutionSourceConfirmation(null)}>Batal</button>
              <button className="primary-button" type="button" onClick={() => applyExecutionSource('vendor')}>Ya, gunakan Vendor</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default OperationalForm;
