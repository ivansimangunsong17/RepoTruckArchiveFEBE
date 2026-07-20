import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { hostname } from 'node:os';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import {
  ensureFileDirectory,
  resolveUploadPath,
  sanitizeFileName,
  sanitizePathSegment,
} from '../attachments/attachment-storage.js';

export const STORAGE_FOLDERS = {
  temporary: join('File Sementara', 'File yang sedang diproses'),
  quarantine: join('File Karantina', 'File yang belum lolos pemeriksaan'),
  audit: join('File Karantina', 'Storage Audit'),
  trash: 'File Terhapus',
  replaced: join('File Terhapus', 'File Diganti'),
  salesExport: join('Export Laporan', 'Laporan Sales'),
  operationalExport: join('Export Laporan', 'Laporan Operational'),
  financeExport: join('Export Laporan', 'Laporan Finance'),
  utilizationExport: join('Export Laporan', 'Laporan Utilisasi'),
};
export const STORAGE_BACKUP_LOCK_PATH = join('File Sementara', 'backup-in-progress.lock');

const REQUIRED_STORAGE_FOLDERS = Object.values(STORAGE_FOLDERS);
let storageStructurePromise = null;
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

function fileError(message, code, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function dateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = Object.fromEntries(
    storageDateFormatter
      .formatToParts(safeDate)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    monthFolder: `${parts.month} - ${monthNames[Number(parts.month) - 1]}`,
  };
}

async function readFileStat(relativePath) {
  try {
    const fileStat = await stat(resolveUploadPath(relativePath));
    return fileStat.isFile() ? fileStat : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function safeSourceFolder(sourceTable) {
  if (sourceTable === 'vehicle_documents') return 'Dokumen Kendaraan';
  if (sourceTable === 'attachments') return 'Attachment';
  return sanitizePathSegment(sourceTable || 'Dokumen');
}

function safeRecordFolder(sourceId) {
  return sanitizePathSegment(sourceId || randomUUID()).toLowerCase();
}

function safeStoredFileName(relativePath) {
  return sanitizeFileName(basename(String(relativePath || 'document')));
}

export function buildTrashStoragePath({
  sourceTable,
  sourceId,
  originalRelativePath,
  deletedAt = new Date(),
} = {}) {
  if (!originalRelativePath) return '';
  const date = dateParts(deletedAt);
  return join(
    STORAGE_FOLDERS.trash,
    date.year,
    date.monthFolder,
    date.dateKey,
    safeSourceFolder(sourceTable),
    safeRecordFolder(sourceId),
    safeStoredFileName(originalRelativePath),
  );
}

export function buildQuarantineStoragePath({
  sourceRelativePath,
  reason = 'Belum lolos pemeriksaan',
  quarantinedAt = new Date(),
} = {}) {
  const date = dateParts(quarantinedAt);
  return join(
    STORAGE_FOLDERS.quarantine,
    date.dateKey,
    sanitizePathSegment(reason),
    `${randomUUID().slice(0, 8)}-${safeStoredFileName(sourceRelativePath)}`,
  );
}

export function buildReplacedStoragePath({
  sourceTable,
  sourceId,
  originalRelativePath,
  replacedAt = new Date(),
} = {}) {
  if (!originalRelativePath) return '';
  const date = dateParts(replacedAt);
  return join(
    STORAGE_FOLDERS.replaced,
    date.year,
    date.monthFolder,
    date.dateKey,
    safeSourceFolder(sourceTable),
    safeRecordFolder(sourceId),
    `${randomUUID().slice(0, 8)}-${safeStoredFileName(originalRelativePath)}`,
  );
}

export async function ensureStorageStructure() {
  if (!storageStructurePromise) {
    storageStructurePromise = Promise.all(REQUIRED_STORAGE_FOLDERS.map((folder) => (
      mkdir(resolveUploadPath(folder), { recursive: true })
    ))).then(() => [...REQUIRED_STORAGE_FOLDERS]);
  }
  try {
    return await storageStructurePromise;
  } catch (error) {
    storageStructurePromise = null;
    throw error;
  }
}

export function getStorageRootPath() {
  return resolveUploadPath('');
}

export async function storageFileExists(relativePath) {
  return Boolean(relativePath && await readFileStat(relativePath));
}

function isLocalProcessRunning(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function archiveStaleBackupLock() {
  const archivedRelativePath = join(
    STORAGE_FOLDERS.audit,
    `stale-backup-lock-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
  );
  await ensureFileDirectory(archivedRelativePath);
  try {
    await rename(
      resolveUploadPath(STORAGE_BACKUP_LOCK_PATH),
      resolveUploadPath(archivedRelativePath),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function isStorageBackupInProgress() {
  if (!await storageFileExists(STORAGE_BACKUP_LOCK_PATH)) return false;

  let lock;
  try {
    lock = JSON.parse(await readFile(resolveUploadPath(STORAGE_BACKUP_LOCK_PATH), 'utf8'));
  } catch {
    return true;
  }

  const lockComputer = String(lock.computerName || '').trim().toLowerCase();
  const localComputer = String(process.env.COMPUTERNAME || hostname()).trim().toLowerCase();
  const lockProcessId = Number(lock.processId);
  if (
    !lockComputer
    || lockComputer !== localComputer
    || !Number.isSafeInteger(lockProcessId)
    || lockProcessId <= 0
  ) {
    return true;
  }
  if (isLocalProcessRunning(lockProcessId)) return true;

  await archiveStaleBackupLock();
  return false;
}

export async function moveStorageFile(sourceRelativePath, destinationRelativePath, options = {}) {
  if (!sourceRelativePath || !destinationRelativePath) return false;
  const sourceStat = await readFileStat(sourceRelativePath);
  if (!sourceStat) {
    if (options.allowMissing) return false;
    throw fileError(
      `File storage tidak ditemukan: ${sourceRelativePath}`,
      'STORAGE_FILE_MISSING',
      404,
    );
  }
  if (await readFileStat(destinationRelativePath)) {
    throw fileError(
      `Tujuan storage sudah berisi file: ${destinationRelativePath}`,
      'STORAGE_FILE_CONFLICT',
      409,
    );
  }
  await ensureFileDirectory(destinationRelativePath);
  await rename(
    resolveUploadPath(sourceRelativePath),
    resolveUploadPath(destinationRelativePath),
  );
  return true;
}

export async function quarantineStorageFile(sourceRelativePath, reason) {
  if (!sourceRelativePath || !await storageFileExists(sourceRelativePath)) return null;
  const destinationRelativePath = buildQuarantineStoragePath({
    sourceRelativePath,
    reason,
  });
  await moveStorageFile(sourceRelativePath, destinationRelativePath);
  return destinationRelativePath;
}

export async function writeStorageBufferAtomic(relativePath, buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw fileError('Isi file storage harus berupa Buffer.', 'INVALID_STORAGE_BUFFER', 400);
  }
  await ensureStorageStructure();
  const temporaryRelativePath = join(
    STORAGE_FOLDERS.temporary,
    `${Date.now()}-${randomUUID().slice(0, 8)}-${safeStoredFileName(relativePath)}.tmp`,
  );
  await ensureFileDirectory(temporaryRelativePath);
  const temporaryPath = resolveUploadPath(temporaryRelativePath);
  let handle;
  try {
    handle = await open(temporaryPath, 'wx');
    await handle.writeFile(buffer);
    await handle.sync();
  } catch (error) {
    await handle?.close().catch(() => {});
    await quarantineStorageFile(temporaryRelativePath, 'Penulisan file gagal').catch(() => {});
    throw error;
  }
  await handle.close();

  try {
    if (await storageFileExists(relativePath)) {
      throw fileError(
        `File tujuan sudah tersedia: ${relativePath}`,
        'STORAGE_FILE_CONFLICT',
        409,
      );
    }
    await ensureFileDirectory(relativePath);
    await rename(temporaryPath, resolveUploadPath(relativePath));
  } catch (error) {
    await quarantineStorageFile(temporaryRelativePath, 'Promosi file gagal').catch(() => {});
    throw error;
  }
  return relativePath;
}

export async function moveStorageFileToTrash(payload = {}) {
  const destinationRelativePath = buildTrashStoragePath(payload);
  if (!destinationRelativePath) return null;
  const moved = await moveStorageFile(
    payload.originalRelativePath,
    destinationRelativePath,
    { allowMissing: true },
  );
  return moved ? destinationRelativePath : null;
}

export async function restoreStorageFile(trashRelativePath, originalRelativePath) {
  if (!trashRelativePath || !originalRelativePath) return false;
  return moveStorageFile(trashRelativePath, originalRelativePath);
}

export async function archiveReplacedStorageFile(payload = {}) {
  if (!payload.originalRelativePath || !await storageFileExists(payload.originalRelativePath)) {
    return null;
  }
  const destinationRelativePath = buildReplacedStoragePath(payload);
  await moveStorageFile(payload.originalRelativePath, destinationRelativePath);
  return destinationRelativePath;
}

export async function deleteStorageFile(relativePath) {
  if (!relativePath) return false;
  try {
    await unlink(resolveUploadPath(relativePath));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function listStorageFilesFromAbsolute(rootPath) {
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const rows = await Promise.all(entries.map(async (entry) => {
    const absolutePath = join(rootPath, entry.name);
    if (entry.isDirectory()) return listStorageFilesFromAbsolute(absolutePath);
    if (!entry.isFile()) return [];
    const fileStat = await stat(absolutePath);
    return [{
      relativePath: relative(getStorageRootPath(), absolutePath),
      absolutePath,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime,
    }];
  }));
  return rows.flat();
}

export function listStorageFiles(relativeRoot = '') {
  return listStorageFilesFromAbsolute(resolveUploadPath(relativeRoot));
}

export function createStorageReadStream(relativePath) {
  return createReadStream(resolveUploadPath(relativePath));
}
