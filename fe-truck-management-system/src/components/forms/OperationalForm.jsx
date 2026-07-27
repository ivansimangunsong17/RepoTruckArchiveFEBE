import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Plus, Send, Trash2, X } from 'lucide-react';
import { fallbackDrivers, fallbackTruckUnits } from '../../data/truckData';
import AttachmentUploadField from '../common/AttachmentUploadField';
import UjRecommendationCard from '../operations/UjRecommendationCard';
import { calculateUjRecommendation } from '../../utils/ujRecommendation';
import { formatCurrency } from '../../utils/formatCurrency';
import { validateArchiveFile } from '../../utils/fileValidation';
import { parseOtherCost, serializeOtherCost } from '../../utils/otherCost';
import { formatDate } from '../../utils/formatDate';
import armadaLogo from '../../Assets/BGLogoArmada.png';

const documentFields = [
  ['spkDocument', 'Lampiran Biaya Lainnya'],
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
  { id: 'rpuj', label: 'Uang Jalan & SPK', description: 'Pengajuan RPUJ, biaya lainnya, dan SPK' },
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
  const defaultDriver = normalizeName(truck.defaultDriver);
  return (activeJobs || []).some((job) => {
    if (!isActiveAssignmentJob(job) || String(job.id) === String(currentJobId)) return false;
    const sameTruck = truckPlate && String(job.plateNumber || '').trim() === truckPlate;
    const sameDriver = defaultDriver && normalizeName(job.driver) === defaultDriver;
    return sameTruck || sameDriver;
  });
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
  return `${checked('import')} Import    ${checked('export')} Export    ${domesticChecked ? '[x]' : '[ ]'} Domestic`;
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
  y = drawSection('4. INFORMASI RPUJ / SPK', documentData.rpujRows, y);
  drawText('Catatan:', leftX, y, { bold: true, size: 6.4, color: '0.62 0.06 0.08' });
  documentData.notes.forEach((note, index) => drawText(`${index + 1}. ${note}`, leftX, y - 10 - (index * 9), { size: 5.7 }));
  commands.push('0.82 0.82 0.82 RG 430 44 131 50 re S');
  drawText('No. Dokumen : FM-OPS-09-01', 437, 82, { size: 5.8 });
  drawText('Rev         : 01', 437, 70, { size: 5.8 });
  drawText(`Tgl Berlaku : ${documentData.effectiveDate}`, 437, 58, { size: 5.8 });
  drawText(documentData.systemGeneratedNote, leftX, 30, { size: 5.8, color: '0.35 0.35 0.35' });

  return buildPdfFile(commands.join('\n'), logoImage);
}

function OperationalForm({ container, onClose, onSubmit, onGenerateSpk, masterTrucks, masterDrivers, masterDestinations, activeJobs = [], currentUser, initialPhase = 'preparation' }) {
  const [fallbackTruckRows] = useState(() => getMasterData('tms-master-trucks-v2', fallbackTruckUnits));
  const [fallbackDriverRows] = useState(() => getMasterData('tms-master-drivers-v2', fallbackDrivers));
  const fileInputRefs = useRef({});
  const trucks = (Array.isArray(masterTrucks) ? masterTrucks : fallbackTruckRows)
    .map((truck) => normalizeTruck(truck, fallbackTruckRows));
  const drivers = Array.isArray(masterDrivers) ? masterDrivers : fallbackDriverRows;
  const findDriverByName = (name) => drivers.find((driver) => normalizeName(driver.name) === normalizeName(name));
  const isTruckDefaultDriverBlacklisted = (truck) => isDriverBlacklisted(findDriverByName(getTruckDefaultDriver(truck, fallbackTruckRows)));
  const containerSize = normalizeSize(container.size || container.containerSize);
  const initialOtherCost = parseOtherCost(container.rpujNotes);
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
  const [form, setForm] = useState({
    containerNumber: container.containerNumber || '',
    rpujStatus: container.rpujStatus || 'pending',
    rpujNotes: container.rpujNotes || '',
    otherCostAmount: initialOtherCost.amount ? String(initialOtherCost.amount) : '',
    otherCostNotes: initialOtherCost.notes || '',
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
    ...initialDriverPayment,
    chassis: container.chassis || '',
    plateNumber: container.plateNumber || '',
    travelDocument: container.travelDocument || '',
    travelDocumentFile: container.travelDocumentFile || null,
    otherDocuments: container.otherDocuments || [],
    status: container.status || 'received',
    runningAt: toDateTimeInputValue(container.runningAt),
    completedAt: toDateTimeInputValue(container.completedAt),
  });
  const [activePhase, setActivePhase] = useState(initialPhase);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState(null);
  const ujRecommendation = calculateUjRecommendation(container, masterDestinations);
  const ujAmount = Number(ujRecommendation.currentContainerUj || 0);
  const otherCostAmountValue = Number(form.otherCostAmount || 0);
  const totalJourneyCost = ujAmount + otherCostAmountValue;
  const rpujStatus = form.rpujStatus || 'pending';
  const isRepoPickupMode = Boolean(container.repoPickupMode);
  const requiresFinanceApprovalForSpk = Boolean(onGenerateSpk);
  const hasCompleteAssignment = Boolean(String(form.plateNumber || '').trim() && String(form.driver || '').trim());
  const financeApprovedForSpk = !requiresFinanceApprovalForSpk || ['approved', 'paid'].includes(form.rpujStatus);
  const canGenerateSpk = !isRepoPickupMode && financeApprovedForSpk && hasCompleteAssignment;
  const assignmentRequirementMessage = 'Lengkapi truck dan driver terlebih dahulu.';
  const spkRequirementMessage = !form.spkNumber && !hasCompleteAssignment
    ? 'SPK bisa dibuat setelah truck dan driver lengkap.'
    : requiresFinanceApprovalForSpk && !form.spkNumber && !financeApprovedForSpk
      ? 'SPK bisa dibuat setelah Finance approve RPUJ.'
      : '';
  const canReviseLockedFields = String(currentUser?.role || '').toLowerCase() === 'admin';
  const canSubmitRpujRequest = !isRepoPickupMode && !['submitted', 'approved', 'paid'].includes(rpujStatus);
  const canEditOtherCost = !isRepoPickupMode && (canReviseLockedFields || !['approved', 'paid'].includes(rpujStatus));
  const canFillMissingAssignment = !hasCompleteAssignment && form.status !== 'completed';
  const canEditAssignment = canReviseLockedFields || canFillMissingAssignment || (rpujStatus !== 'paid' && form.status !== 'completed');
  const hasSavedContainerNumber = Boolean(String(container.containerNumber || '').trim());
  const canFillInitialContainerNumber = !hasSavedContainerNumber && !['completed', 'cancelled'].includes(container.status);
  const canEditContainerNumber = !isRepoPickupMode && (
    canReviseLockedFields
      || canFillInitialContainerNumber
      || (!['running', 'completed', 'cancelled'].includes(form.status) && rpujStatus !== 'paid')
  );
  const isCompletedDocumentFollowUp = !canReviseLockedFields && form.status === 'completed';
  const canEditDocumentValue = (field) => !isCompletedDocumentFollowUp || !String(container[field] || '').trim();
  const canEditDocumentFile = (field) => !isCompletedDocumentFollowUp || !container[field];
  const canEditOtherDocuments = !isCompletedDocumentFollowUp;
  const canEditTimeline = canReviseLockedFields || container.status !== 'completed';
  const rpujActionLabel = rpujStatus === 'submitted'
    ? 'Sudah Diajukan'
    : rpujStatus === 'approved'
      ? 'Disetujui Finance'
      : rpujStatus === 'paid'
        ? 'Sudah Dibayar'
        : 'Ajukan Uang Jalan';
  const canStartTrip = ['approved', 'paid'].includes(rpujStatus);
  const availableStatusOptions = statusOptions.filter((option) => {
    if (canReviseLockedFields) return true;
    if (container.status === 'completed') return option.value === 'completed';
    if (container.status === 'running') return option.value !== 'received';
    return true;
  });
  const tripStartRequirementMessage = 'Status perjalanan baru bisa Sedang Jalan setelah UJ disetujui Finance.';
  const hasEirDocument = Boolean(form.eirDocument);
  const hasRepoHistory = Boolean(container.repoLocation || container.repoStoredAt || container.repoEirNumber || container.repoPickedUpAt || container.repoEirDocument);
  const hasRepoEirReceipt = Boolean(String(container.repoEirNumber || '').trim() && container.repoEirDocument);
  const hasSpkDocument = Boolean(form.spkNumber || form.spkDocument);
  const isReadyToStart = form.status === 'received'
    && hasCompleteAssignment
    && canStartTrip
    && hasSpkDocument;
  const primaryActionLabel = activePhase === 'preparation'
    ? 'Simpan Assignment'
    : activePhase === 'rpuj'
      ? 'Simpan Uang Jalan & SPK'
      : isReadyToStart
        ? 'Mulai Jalan'
        : form.status === 'running'
          ? 'Simpan Update Perjalanan'
          : form.status === 'completed'
            ? 'Simpan Closing'
            : 'Simpan Dokumen & Status';
  const closingChecklist = [
    { label: 'Nomor container ada', ready: Boolean(String(form.containerNumber || '').trim()) },
    { label: 'Truck dan driver ada', ready: hasCompleteAssignment },
    { label: 'Waktu mulai dan selesai ada', ready: Boolean(form.runningAt && form.completedAt) },
    { label: 'UJ sudah disetujui/dikirim', ready: canStartTrip },
    { label: 'SPK ada', ready: hasSpkDocument },
    ...(hasRepoHistory ? [{ label: 'EIR Titip tersedia', ready: hasRepoEirReceipt }] : []),
    { label: 'Lampiran EIR sudah diupload', ready: hasEirDocument },
  ];

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
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
  }, [notification, onClose]);

  function showSubmitNotification(message, title = 'Data belum lengkap') {
    setError('');
    setNotification({ title, message });
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateStatusValue(status) {
    const now = nowForDateTimeInput();
    if (['running', 'completed'].includes(status) && !hasCompleteAssignment) {
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
    if (truck && !isTruckCompatibleWithContainer(truck, containerSize)) {
      setError(`Truck ${truck.plateNumber} kapasitas ${truck.capacity || '-'} tidak sesuai untuk container ${containerSize || '-'}.`);
      return;
    }
    const driverName = getTruckDefaultDriver(truck, fallbackTruckRows);
    const selectedDriver = findDriverByName(driverName);
    if (truck && isDriverBlacklisted(selectedDriver) && truck.plateNumber !== container.plateNumber) {
      setError(`Sopir ${selectedDriver.name} masuk blacklist dan tidak bisa di-assign.`);
      return;
    }
    const driverPayment = getDriverPaymentInfo(selectedDriver);
    setError('');
    setForm((current) => ({
      ...current,
      plateNumber,
      driver: driverName,
      ...driverPayment,
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
    const otherCostLabel = otherCostAmountValue > 0 ? formatCurrency(otherCostAmountValue) : '-';
    const totalRpujLabel = totalJourneyCost > 0 ? formatCurrency(totalJourneyCost) : '-';
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
        { label: 'Total RPUJ', value: totalRpujLabel, highlight: true },
        { label: 'Uang Jalan', value: ujAmount > 0 ? formatCurrency(ujAmount) : '-' },
        { label: 'Biaya Lainnya', value: otherCostLabel },
        { label: 'Catatan Biaya Lainnya', value: spkValue(form.otherCostNotes), maxLength: 64 },
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
            ${renderSection('4', 'Informasi RPUJ / SPK', documentData.rpujRows)}
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

  function buildSubmitForm({ forceRpujStatus, includeRpujNotes = activePhase === 'rpuj' && !isRepoPickupMode } = {}) {
    const otherCostAmount = Number(form.otherCostAmount || 0);
    if (otherCostAmount < 0) {
      return { error: 'Nominal biaya lainnya tidak boleh negatif.' };
    }
    const currentRpujStatus = form.rpujStatus || 'pending';
    const hasRpujRequest = ujAmount > 0 || otherCostAmount > 0 || Boolean(form.otherCostNotes.trim());
    const nextRpujStatus = ['approved', 'paid'].includes(currentRpujStatus)
      ? currentRpujStatus
      : forceRpujStatus || (hasRpujRequest
        ? 'submitted'
        : 'pending');
    const submitForm = {
      ...form,
      rpujStatus: nextRpujStatus,
      runningAt: dateTimeInputToIso(form.runningAt),
      completedAt: dateTimeInputToIso(form.completedAt),
    };
    if (includeRpujNotes) {
      submitForm.rpujNotes = serializeOtherCost({
        amount: otherCostAmount,
        notes: form.otherCostNotes,
      });
    } else {
      delete submitForm.rpujNotes;
    }
    return { submitForm, hasRpujRequest, otherCostAmount };
  }

  async function handleSubmitRpujRequest() {
    if (!canSubmitRpujRequest) return;
    if (!hasCompleteAssignment) {
      showSubmitNotification('RPUJ belum bisa diajukan. Lengkapi truck dan driver terlebih dahulu.');
      return;
    }
    const { submitForm, hasRpujRequest, error: submitError } = buildSubmitForm({ forceRpujStatus: 'submitted' });
    if (submitError) {
      showSubmitNotification(submitError);
      return;
    }
    if (!hasRpujRequest) {
      showSubmitNotification('Nominal uang jalan belum tersedia. Lengkapi tarif UJ atau biaya lainnya terlebih dahulu.');
      return;
    }
    setError('');
    setForm((current) => ({
      ...current,
      rpujStatus: 'submitted',
      rpujNotes: submitForm.rpujNotes,
    }));
    await onSubmit(submitForm);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const { submitForm, error: submitError } = buildSubmitForm();
    if (submitError) {
      showSubmitNotification(submitError);
      return;
    }
    if (isRepoPickupMode && !hasCompleteAssignment) {
      showSubmitNotification('Ambil container titip wajib assign ulang truck dan sopir terlebih dahulu.');
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
    const selectedTruck = trucks.find((truck) => truck.plateNumber === submitForm.plateNumber);
    if (selectedTruck && !isTruckCompatibleWithContainer(selectedTruck, containerSize)) {
      showSubmitNotification(`Truck ${selectedTruck.plateNumber} kapasitas ${selectedTruck.capacity || '-'} tidak sesuai untuk container ${containerSize || '-'}.`);
      return;
    }
    if (selectedTruck && selectedTruck.plateNumber !== container.plateNumber && !isTruckAssignable(selectedTruck)) {
      showSubmitNotification(`Truck ${selectedTruck.plateNumber} sedang ${selectedTruck.status || 'tidak siap'} dan tidak bisa di-assign.`);
      return;
    }
    if (['running', 'completed'].includes(submitForm.status) && !canStartTrip) {
      showSubmitNotification(tripStartRequirementMessage);
      return;
    }
    if (['running', 'completed'].includes(submitForm.status) && !hasCompleteAssignment) {
      showSubmitNotification('Status perjalanan belum bisa Sedang Jalan. Lengkapi truck dan driver terlebih dahulu.');
      return;
    }
    if (submitForm.status === 'running' && (!submitForm.driver || !submitForm.plateNumber || !submitForm.runningAt)) {
      showSubmitNotification('Truck, driver otomatis, dan waktu mulai wajib diisi untuk status Sedang Jalan.');
      return;
    }
    if (submitForm.status === 'completed') {
      const missingContainerNumber = !String(submitForm.containerNumber || '').trim();
      const missingAssignment = !hasCompleteAssignment || !submitForm.runningAt || !submitForm.completedAt;
      const missingSpk = !submitForm.spkNumber && !submitForm.spkDocument;
      const missingRepoEirReceipt = hasRepoHistory && !hasRepoEirReceipt;
      const missingEirDocument = !submitForm.eirDocument;
      if (missingRepoEirReceipt) {
        showSubmitNotification('Pekerjaan belum dapat diselesaikan. Lengkapi EIR Titip dari depo penitipan terlebih dahulu.');
        return;
      }
      if (missingContainerNumber || missingAssignment || missingSpk || missingEirDocument) {
        showSubmitNotification('Pekerjaan belum dapat diselesaikan. Lengkapi nomor container, truck/driver, waktu jalan, waktu selesai, SPK, dan upload lampiran EIR.');
        return;
      }
      if (submitForm.completedAt && submitForm.runningAt && new Date(submitForm.completedAt) < new Date(submitForm.runningAt)) {
        showSubmitNotification('Waktu selesai tidak boleh lebih awal dari waktu mulai.');
        return;
      }
    }
    setError('');
    onSubmit({
      ...submitForm,
    });
  }

  const availableTrucks = trucks.filter((truck) => (
    (isTruckAssignable(truck) || truck.plateNumber === form.plateNumber)
    && isTruckCompatibleWithContainer(truck, containerSize)
    && !isTruckBusyForAnotherJob(truck, activeJobs, container.id)
    && (!isTruckDefaultDriverBlacklisted(truck) || truck.plateNumber === form.plateNumber)
  ));
  const currentTruckExists = availableTrucks.some((truck) => truck.plateNumber === form.plateNumber);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="order-modal operational-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><p className="eyebrow">Container Job</p><h2>{form.containerNumber || container.containerNumber}</h2><span>{container.soNumber} - {container.customer} - {container.origin} - {container.destination}</span></div>
          <button type="button" onClick={onClose} aria-label="Tutup form"><X size={20} /></button>
        </header>
        <form onSubmit={handleSubmit}>
          {error ? <div className="alert error operational-form-error">{error}</div> : null}
          {isRepoPickupMode ? (
            <div className="alert operational-form-repo-pickup">
              Container sedang diambil dari depo penitipan. Pilih truck dan sopir baru untuk melanjutkan perjalanan ke tujuan akhir.
            </div>
          ) : null}

          <div className="operational-phase-tabs" role="tablist" aria-label="Phase Operational">
            {operationalPhaseOptions.map((phase, index) => (
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

          {activePhase === 'preparation' ? (
          <div className="form-section">
            <h3>Assignment</h3>
            <div className="order-form-grid">
              <label>Truck<select name="plateNumber" value={form.plateNumber} onChange={updateTruck} disabled={!canEditAssignment}><option value="">Pilih truck {containerSize ? `${containerSize}` : ''}</option>{form.plateNumber && !currentTruckExists ? <option value={form.plateNumber}>{form.plateNumber}</option> : null}{availableTrucks.map((truck) => <option key={truck.id} value={truck.plateNumber}>{truck.plateNumber} - {truck.unitCode} - {truck.capacity || '-'} - {truck.defaultDriver || 'Driver belum diset'}</option>)}</select></label>
              <label>No. Container<input name="containerNumber" value={form.containerNumber} onChange={updateField} disabled={!canEditContainerNumber} placeholder="TCLU1234567" /></label>
              <label>Driver Otomatis<input name="driver" value={form.driver || 'Pilih truck terlebih dahulu'} readOnly /></label>
              <label>Pembayaran UJ Driver<input value={form.driverBankAccount || 'Belum diisi di master driver'} readOnly /></label>
              <label>Detail Truck<input value={form.chassis} readOnly /></label>
            </div>
            {!canEditAssignment ? (
              <p className="mt-2 text-[11px] font-medium text-amber-700">Driver dan truck terkunci karena UJ sudah ditransfer atau pekerjaan selesai. Hubungi admin untuk revisi.</p>
            ) : null}
            {!canEditContainerNumber ? (
              <p className="mt-2 text-[11px] font-medium text-amber-700">{isRepoPickupMode ? 'No. Container terkunci saat ambil container titip. Operational hanya memilih truck dan sopir baru.' : 'No. Container yang sudah tersimpan terkunci setelah pekerjaan berjalan, selesai, atau UJ ditransfer. Hubungi admin untuk revisi.'}</p>
            ) : !hasSavedContainerNumber && (form.status === 'running' || rpujStatus === 'paid') ? (
              <p className="mt-2 text-[11px] font-medium text-emerald-700">No. Container belum diketahui saat assignment. Nomor pertama tetap dapat diisi meskipun UJ sudah dikirim atau perjalanan sedang berjalan.</p>
            ) : null}
          </div>
          ) : null}

          {activePhase === 'rpuj' ? (
          <div className="form-section">
            <h3>Biaya Lainnya & SPK</h3>
            <div className="mb-4">
              <UjRecommendationCard job={container} destinations={masterDestinations} />
            </div>
            <div className="operational-rpuj-spk-grid">
              <div className="operational-document-card operational-rpuj-card">
                <div className="operational-rpuj-card-head">
                  <span>Biaya Lainnya</span>
                  <small>Tambahkan biaya operasional di luar UJ utama.</small>
                </div>

                {!canEditOtherCost ? (
                  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {isRepoPickupMode ? 'Biaya lainnya terkunci saat ambil container titip. Operational hanya memilih truck dan sopir baru.' : 'Biaya lainnya terkunci karena UJ sudah disetujui Finance. Admin dapat membuka revisi jika diperlukan.'}
                  </div>
                ) : null}

                <div className="operational-cost-fields">
                  <label className="operational-inline-label">
                    Nominal Biaya
                    <input
                      name="otherCostAmount"
                      type="number"
                      min="0"
                      step="1000"
                      value={form.otherCostAmount}
                      onChange={updateField}
                      disabled={!canEditOtherCost}
                      placeholder="Contoh: 150000"
                    />
                  </label>
                  <label className="operational-inline-label">
                    Catatan Biaya
                    <input
                      name="otherCostNotes"
                      value={form.otherCostNotes}
                      onChange={updateField}
                      disabled={!canEditOtherCost}
                      placeholder="Contoh: tol, parkir, bongkar"
                    />
                  </label>
                </div>

                <div className="operational-cost-summary">
                  <div className="operational-cost-summary-head">
                    <div>
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Subtotal Perjalanan</span>
                      <small className="block text-[11px] text-slate-400">UJ + biaya lainnya</small>
                    </div>
                    <strong className="text-base font-semibold text-slate-900">{formatCurrency(totalJourneyCost)}</strong>
                  </div>
                  <div className="operational-cost-pills">
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                      <span className="text-slate-400">UJ</span>
                      <strong className="font-semibold text-slate-800">{formatCurrency(ujAmount)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                      <span className="text-slate-400">Lainnya</span>
                      <strong className="font-semibold text-slate-800">{formatCurrency(otherCostAmountValue)}</strong>
                    </span>
                  </div>
                </div>

                <div className="operational-rpuj-footer">
                  <div className="operational-rpuj-actions">
                    <button
                      type="button"
                      className="primary-button operational-rpuj-submit"
                      onClick={handleSubmitRpujRequest}
                      disabled={!canSubmitRpujRequest || !canEditOtherCost}
                    >
                      <Send size={14} />
                      {rpujActionLabel}
                    </button>
                    <small>
                      {canEditOtherCost && canSubmitRpujRequest
                        ? 'Kirim total UJ dan biaya lainnya ke Finance untuk approval.'
                        : !canEditOtherCost
                          ? isRepoPickupMode
                            ? 'Biaya lainnya tidak bisa diubah saat ambil container titip.'
                            : 'Biaya lainnya tidak bisa diubah setelah UJ disetujui Finance.'
                        : 'Pengajuan uang jalan sudah masuk ke alur Finance.'}
                    </small>
                  </div>
                  <div className="operational-rpuj-upload">
                    <AttachmentUploadField
                      id="operational-spk-document"
                      label="Lampiran Biaya Lainnya"
                      value={form.spkDocument}
                      title={form.spkDocument?.name ? 'Ubah File' : 'Pilih File'}
                      helper="PDF, JPG, PNG - Maks. 5 MB"
                      accept={OPERATIONAL_FILE_ACCEPT}
                      compact
                      disabled={!canEditOtherCost}
                      validationOptions={{
                        label: 'Lampiran Biaya Lainnya',
                      }}
                      onSelect={(file, validationError) => {
                        if (validationError) return setError(validationError);
                        setError('');
                        updateFile('spkDocument', file);
                      }}
                      onClear={() => setForm((current) => ({ ...current, spkDocument: null }))}
                    />
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
                      {canGenerateSpk ? 'Generate SPK' : !hasCompleteAssignment ? 'Lengkapi Truck' : 'Menunggu Finance'}
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
          <>
            <div className="form-section">
              <div className="form-section-heading">
                <div>
                  <h3>Dokumen Operasional</h3>
                  <p>Dokumen penyelesaian bersifat opsional dan dapat dikosongkan saat closing.</p>
                </div>
              </div>
              {isCompletedDocumentFollowUp ? (
                <p className="mb-3 text-[11px] font-medium text-amber-700">Pekerjaan sudah selesai. Operational hanya dapat melengkapi data atau file yang masih kosong; revisi dokumen tersimpan hanya dapat dilakukan Admin.</p>
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
                      <span className="operational-file-name">
                        {container.repoEirDocument?.name || 'Belum ada file'}
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
                    <button type="button" className="secondary-button operational-upload-button" onClick={() => openOperationalFilePicker('eirDocument')} disabled={!canEditDocumentFile('eirDocument')}>
                      {form.eirDocument?.name ? 'Ubah File' : 'Pilih File'}
                    </button>
                    <span className="operational-file-name">
                      {form.eirDocument?.name || 'Belum ada file'}
                    </span>
                  </div>
                  <small className="operational-document-helper">PDF, JPG, PNG - Maks. 5 MB</small>
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
                      <button type="button" className="secondary-button operational-upload-button" onClick={() => openOperationalFilePicker(field.fileField)} disabled={!canEditDocumentFile(field.fileField)}>
                        {form[field.fileField]?.name ? 'Ubah File' : 'Pilih File'}
                      </button>
                      <span className="operational-file-name">
                        {form[field.fileField]?.name || 'Belum ada file'}
                      </span>
                    </div>
                    <small className="operational-document-helper">PDF, JPG, PNG - Maks. 5 MB</small>
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
                      helper="PDF, JPG, atau PNG - Maksimal 5 MB"
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

            <div className="form-section">
              <h3>Status & Timeline</h3>
              <div className="operational-closing-checklist" aria-label="Checklist closing sebelum selesai">
                {closingChecklist.map((item) => (
                  <div className={item.ready ? 'ready' : ''} key={item.label}>
                    <span>{item.ready ? 'OK' : '!'}</span>
                    <strong>{item.label}</strong>
                  </div>
                ))}
              </div>
              <div className="operational-timeline-grid">
                <label className="operational-status-field">
                  Status Pekerjaan
                  <select name="status" value={form.status} onChange={updateStatus} style={activeStatusOption.selectStyle} disabled={!canReviseLockedFields && container.status === 'completed'}>
                    {availableStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <span className={`mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${activeStatusOption.tone}`}>
                    {activeStatusOption.label}
                  </span>
                  <small className="text-[11px] font-semibold leading-snug text-slate-500">{activeStatusOption.description}</small>
                  {!hasCompleteAssignment ? (
                    <small className="text-[11px] font-semibold leading-snug text-amber-700">
                      Truck dan driver wajib lengkap sebelum perjalanan berjalan.
                    </small>
                  ) : !canStartTrip ? (
                    <small className="text-[11px] font-semibold leading-snug text-amber-700">
                      UJ harus disetujui Finance sebelum perjalanan berjalan.
                    </small>
                  ) : null}
                </label>
                <label className="operational-date-field operational-date-start">Waktu Mulai<input name="runningAt" type="datetime-local" value={form.runningAt} onChange={updateField} disabled={!canEditTimeline} /></label>
                <label className="operational-date-field operational-date-end">Waktu Selesai<input name="completedAt" type="datetime-local" value={form.completedAt} onChange={updateField} disabled={!canEditTimeline} /></label>
              </div>
            </div>
          </>
          ) : null}

          <footer><button className="secondary-button" type="button" onClick={onClose}>Batal</button><button className="primary-button" type="submit" aria-label={`Simpan Container Job - ${primaryActionLabel}`}>{primaryActionLabel}</button></footer>
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
    </div>
  );
}

export default OperationalForm;
