import { randomUUID } from 'node:crypto';
import { dirname, extname, join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { env } from '../../config/env.js';

const uploadRoot = resolve(process.cwd(), env.uploadDir || 'uploads');

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
  salesOrder: ['01-order-info'],
  sales_order: ['01-order-info'],
  'Delivery Order': ['02-customer-documents', 'delivery-order'],
  'Customer SPK': ['02-customer-documents', 'customer-spk'],
  'Email Instruction': ['02-customer-documents', 'email-instruction'],
  'WhatsApp Instruction': ['02-customer-documents', 'whatsapp-instruction'],
  invoice: ['04-billing'],
  invoiceSupport: ['04-billing'],
  invoice_support: ['04-billing'],
  photo: ['04-photos'],
  photos: ['04-photos'],
  containerJob: ['03-container-jobs'],
  container_job: ['03-container-jobs'],
  spkDocument: ['03-container-jobs', 'spk'],
  loadingVoucherDocument: ['03-container-jobs', 'bon-muat'],
  unloadingVoucherDocument: ['03-container-jobs', 'bon-bongkar'],
  travelDocumentFile: ['03-container-jobs', 'surat-jalan'],
  weighingDocumentFile: ['03-container-jobs', 'surat-timbang'],
  eirDocument: ['03-container-jobs', 'eir'],
  deliveryCard: ['03-container-jobs', 'tila-delivery-card'],
  gatepass: ['03-container-jobs', 'gatepass-sp2'],
  otherDocument: ['99-other-documents'],
};

const containerJobCategoryFolders = {
  otherDocument: ['03-container-jobs', '99-other-documents'],
  photo: ['03-container-jobs', 'photos'],
  photos: ['03-container-jobs', 'photos'],
};

function toDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function toMonthFolder(month) {
  const monthIndex = Math.max(0, Math.min(11, Number(month) - 1));
  return monthNames[monthIndex];
}

function getCategoryFolderParts(payload = {}) {
  if (payload.entityType === 'container_job') {
    return containerJobCategoryFolders[payload.category]
      || categoryFolders[payload.category]
      || ['03-container-jobs', '99-other-documents'];
  }

  return categoryFolders[payload.category]
    || categoryFolders[payload.entityType]
    || ['99-other-documents'];
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

export function buildAttachmentStoragePath(payload = {}, context = {}) {
  const safeFileName = sanitizeFileName(payload.fileName);
  const extension = extname(safeFileName);
  const baseName = extension ? safeFileName : `${safeFileName}.bin`;
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  const storedName = `${timestamp}-${randomUUID().slice(0, 8)}-${baseName}`;
  const soNumber = payload.soNumber || context.soNumber;

  if (soNumber) {
    const dateKey = toDateKey(context.receivedAt || payload.receivedAt || context.soDate || payload.documentDate);
    const [year, month] = dateKey.split('-');
    const categoryFolderParts = getCategoryFolderParts(payload);
    const containerFolder = payload.entityType === 'container_job' || context.containerNumber
      ? [sanitizePathSegment(context.containerNumber || payload.containerNumber || 'unassigned-container')]
      : [];
    return join(
      'sales-orders',
      year,
      toMonthFolder(month),
      dateKey,
      sanitizePathSegment(soNumber),
      categoryFolderParts[0],
      ...containerFolder,
      ...categoryFolderParts.slice(1),
      storedName,
    );
  }

  return join(
    'by-entity',
    sanitizePathSegment(payload.entityType).toLowerCase(),
    sanitizePathSegment(payload.entityId).toLowerCase(),
    sanitizePathSegment(payload.category).toLowerCase(),
    storedName,
  );
}
