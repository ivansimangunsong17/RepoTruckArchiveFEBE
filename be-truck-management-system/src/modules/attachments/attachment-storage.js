import { randomUUID } from 'node:crypto';
import { dirname, extname, join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { env } from '../../config/env.js';

const uploadRoot = resolve(process.cwd(), env.uploadDir || 'uploads');

const SALES_ORDER_ROOT = 'Sales Order';
const SALES_DOCUMENTS_FOLDER = '01 - Dokumen Sales';
const CONTAINER_DOCUMENTS_FOLDER = '02 - Dokumen Container';
const FINANCE_DOCUMENTS_FOLDER = '03 - Dokumen Finance';
const MASTER_DATA_ROOT = 'Master Data';
const storageDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const monthNames = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const categoryFolders = {
  salesOrder: [SALES_DOCUMENTS_FOLDER, 'Dokumen Lainnya'],
  sales_order: [SALES_DOCUMENTS_FOLDER, 'Dokumen Lainnya'],
  'Delivery Order': [SALES_DOCUMENTS_FOLDER, 'Delivery Order'],
  'Customer SPK': [SALES_DOCUMENTS_FOLDER, 'SPK Customer'],
  'SPK Customer': [SALES_DOCUMENTS_FOLDER, 'SPK Customer'],
  'Email Instruction': [SALES_DOCUMENTS_FOLDER, 'Instruksi Customer'],
  'WhatsApp Instruction': [SALES_DOCUMENTS_FOLDER, 'Instruksi Customer'],
  customerInstruction: [SALES_DOCUMENTS_FOLDER, 'Instruksi Customer'],
  invoice: [FINANCE_DOCUMENTS_FOLDER, 'Invoice'],
  invoiceSupport: [FINANCE_DOCUMENTS_FOLDER, 'Invoice'],
  invoice_support: [FINANCE_DOCUMENTS_FOLDER, 'Invoice'],
  rpuj: [FINANCE_DOCUMENTS_FOLDER, 'RPUJ'],
  rpujDocument: [FINANCE_DOCUMENTS_FOLDER, 'RPUJ'],
  rpujTransferProof: [FINANCE_DOCUMENTS_FOLDER, 'Bukti Transfer'],
  transferProof: [FINANCE_DOCUMENTS_FOLDER, 'Bukti Transfer'],
  financeDocument: [FINANCE_DOCUMENTS_FOLDER, 'Dokumen Lainnya'],
};

const containerJobCategoryFolders = {
  containerJob: [CONTAINER_DOCUMENTS_FOLDER, 'Dokumen Lainnya'],
  container_job: [CONTAINER_DOCUMENTS_FOLDER, 'Dokumen Lainnya'],
  spkDocument: [CONTAINER_DOCUMENTS_FOLDER, 'SPK'],
  eirDocument: [CONTAINER_DOCUMENTS_FOLDER, 'EIR'],
  travelDocumentFile: [CONTAINER_DOCUMENTS_FOLDER, 'Surat Jalan'],
  loadingVoucherDocument: [CONTAINER_DOCUMENTS_FOLDER, 'Bon Muat Bongkar'],
  unloadingVoucherDocument: [CONTAINER_DOCUMENTS_FOLDER, 'Bon Muat Bongkar'],
  tilaGatepassDocumentFile: [CONTAINER_DOCUMENTS_FOLDER, 'TILA Delivery Card Gatepass SP2'],
  weighingDocumentFile: [CONTAINER_DOCUMENTS_FOLDER, 'TILA Delivery Card Gatepass SP2'],
  deliveryCard: [CONTAINER_DOCUMENTS_FOLDER, 'TILA Delivery Card Gatepass SP2'],
  gatepass: [CONTAINER_DOCUMENTS_FOLDER, 'TILA Delivery Card Gatepass SP2'],
  photo: [CONTAINER_DOCUMENTS_FOLDER, 'Foto'],
  photos: [CONTAINER_DOCUMENTS_FOLDER, 'Foto'],
  otherDocument: [CONTAINER_DOCUMENTS_FOLDER, 'Dokumen Lainnya'],
};

const masterEntityFolders = {
  truck: 'Truck',
  vehicle: 'Truck',
  chassis: 'Chassis',
  driver: 'Sopir',
  customer: 'Customer',
};

const masterCategoryFolders = {
  truck: {
    STNK: 'STNK',
    PAJAK: 'STNK',
    stnkDocument: 'STNK',
    KIR_HEAD: 'KIR dan Uji Berkala',
    KIR_BUNTUT: 'KIR dan Uji Berkala',
    kirDocument: 'KIR dan Uji Berkala',
    ASURANSI: 'Asuransi',
    insuranceDocument: 'Asuransi',
    KEPEMILIKAN: 'Dokumen Kepemilikan',
    ownershipDocument: 'Dokumen Kepemilikan',
    FOTO: 'Foto',
    photo: 'Foto',
    photoDocument: 'Foto',
    OTHER: 'Dokumen Lainnya',
    stidDocument: 'Dokumen Lainnya',
    otherDocument: 'Dokumen Lainnya',
  },
  chassis: {
    KIR_HEAD: 'KIR dan Uji Berkala',
    KIR_BUNTUT: 'KIR dan Uji Berkala',
    kirDocument: 'KIR dan Uji Berkala',
    STNK: 'Dokumen Identitas',
    PAJAK: 'Dokumen Identitas',
    identityDocument: 'Dokumen Identitas',
    KEPEMILIKAN: 'Dokumen Kepemilikan',
    ownershipDocument: 'Dokumen Kepemilikan',
    ASURANSI: 'Asuransi',
    insuranceDocument: 'Asuransi',
    FOTO: 'Foto',
    photo: 'Foto',
    photoDocument: 'Foto',
    OTHER: 'Dokumen Lainnya',
    otherDocument: 'Dokumen Lainnya',
  },
  driver: {
    identityDocument: 'KTP',
    licenseDocument: 'SIM',
    partnershipLetter: 'Kontrak',
    contractDocument: 'Kontrak',
    certificateDocument: 'Sertifikat',
    driverPhoto: 'Foto',
    photo: 'Foto',
    otherDocument: 'Dokumen Lainnya',
  },
  customer: {
    contractDocument: 'Kontrak',
    npwpDocument: 'NPWP',
    companyProfileDocument: 'Company Profile',
    legalDocument: 'Dokumen Legalitas',
    otherDocument: 'Dokumen Lainnya',
  },
};

function toDateKey(value) {
  const date = value ? new Date(value) : new Date();
  const resolvedDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = Object.fromEntries(
    storageDateFormatter
      .formatToParts(resolvedDate)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toMonthFolder(month) {
  const monthNumber = Math.max(1, Math.min(12, Number(month) || 1));
  return `${String(monthNumber).padStart(2, '0')} - ${monthNames[monthNumber - 1]}`;
}

function getCategoryFolderParts(payload = {}) {
  if (categoryFolders[payload.category]) {
    return categoryFolders[payload.category];
  }

  if (payload.entityType === 'container_job') {
    return containerJobCategoryFolders[payload.category]
      || containerJobCategoryFolders[payload.entityType]
      || [CONTAINER_DOCUMENTS_FOLDER, 'Dokumen Lainnya'];
  }

  if (payload.entityType === 'sales_order') {
    return [SALES_DOCUMENTS_FOLDER, 'Dokumen Lainnya'];
  }

  return ['Dokumen Lainnya'];
}

function toShortReference(prefix, value) {
  const normalizedValue = String(value || '')
    .trim()
    .toUpperCase();
  if (normalizedValue.startsWith(`${prefix}-`)) {
    return sanitizePathSegment(normalizedValue);
  }

  const compactValue = normalizedValue.replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return `${prefix}-${compactValue || 'UNKNOWN'}`;
}

function getOrderFolder(payload, context) {
  const soNumber = payload.soNumber || context.soNumber;
  if (soNumber) return sanitizePathSegment(soNumber);

  const salesOrderId = context.salesOrderId
    || (payload.entityType === 'sales_order' ? payload.entityId : null)
    || payload.salesOrderId
    || payload.entityId;
  return toShortReference('ORDER', salesOrderId);
}

function getContainerJobFolder(payload, context) {
  const containerJobId = context.containerJobId
    || (payload.entityType === 'container_job' ? payload.entityId : null);
  return toShortReference('JOB', containerJobId);
}

function getMasterStorageParts(payload) {
  const entityType = String(payload.entityType || '').toLowerCase();
  const masterFolder = masterEntityFolders[entityType];
  if (!masterFolder) return null;

  const normalizedEntityType = entityType === 'vehicle' ? 'truck' : entityType;
  const categoryFolder = masterCategoryFolders[normalizedEntityType]?.[payload.category]
    || 'Dokumen Lainnya';
  return [
    MASTER_DATA_ROOT,
    masterFolder,
    sanitizePathSegment(payload.entityId).toLowerCase(),
    categoryFolder,
  ];
}

export function sanitizePathSegment(value = 'unknown') {
  const safeValue = String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safeValue || 'unknown';
}

export function sanitizeFileName(fileName = 'document') {
  const safeName = sanitizePathSegment(fileName);
  return safeName === 'unknown' ? 'document' : safeName;
}

export function parseSalesOrderStorageRoot(relativePath) {
  const parts = String(relativePath || '').split(/[\\/]+/).filter(Boolean);
  if (
    parts.length < 4
    || parts[0] !== SALES_ORDER_ROOT
    || !/^\d{4}$/.test(parts[1])
    || !/^\d{2} - .+/.test(parts[2])
  ) {
    return null;
  }
  return parts.slice(0, 4);
}

export function resolveUploadPath(relativePath) {
  const resolvedRoot = resolve(uploadRoot);
  const resolvedPath = resolve(resolvedRoot, relativePath || '');
  const normalizedRoot = `${resolvedRoot}${process.platform === 'win32' ? '\\' : '/'}`;
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(normalizedRoot)) {
    const error = new Error('Path storage file tidak valid.');
    error.statusCode = 400;
    error.code = 'INVALID_STORAGE_PATH';
    throw error;
  }
  return resolvedPath;
}

export async function ensureFileDirectory(relativePath) {
  await mkdir(dirname(resolveUploadPath(relativePath)), { recursive: true });
}

export function buildAttachmentStorageDirectory(payload = {}, context = {}) {
  const masterStorageParts = getMasterStorageParts(payload);
  const isTransactionEntity = ['sales_order', 'container_job'].includes(payload.entityType);

  if (masterStorageParts) {
    return join(...masterStorageParts);
  }

  if (isTransactionEntity) {
    const dateKey = toDateKey(
      context.createdAt
      || context.receivedAt
      || payload.receivedAt
      || context.soDate
      || payload.documentDate,
    );
    const [year, month] = dateKey.split('-');
    const storageRootParts = Array.isArray(context.storageRootParts)
      ? context.storageRootParts
      : [SALES_ORDER_ROOT, year, toMonthFolder(month), getOrderFolder(payload, context)];
    const categoryFolderParts = getCategoryFolderParts(payload);
    const containerJobFolder = categoryFolderParts[0] === CONTAINER_DOCUMENTS_FOLDER
      ? [getContainerJobFolder(payload, context)]
      : [];

    return join(
      ...storageRootParts,
      categoryFolderParts[0],
      ...containerJobFolder,
      ...categoryFolderParts.slice(1),
    );
  }

  return join(
    'by-entity',
    sanitizePathSegment(payload.entityType).toLowerCase(),
    sanitizePathSegment(payload.entityId).toLowerCase(),
    sanitizePathSegment(payload.category).toLowerCase(),
  );
}

export function buildAttachmentStoragePath(payload = {}, context = {}) {
  const safeFileName = sanitizeFileName(payload.fileName);
  const extension = extname(safeFileName);
  const baseName = extension ? safeFileName : `${safeFileName}.bin`;
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  const storedName = `${timestamp}-${randomUUID().slice(0, 8)}-${baseName}`;
  return join(buildAttachmentStorageDirectory(payload, context), storedName);
}
