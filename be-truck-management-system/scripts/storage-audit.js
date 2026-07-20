import 'dotenv/config';
import { join } from 'node:path';
import { closePool, query } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import {
  deleteStorageFile,
  ensureStorageStructure,
  getStorageRootPath,
  listStorageFiles,
  quarantineStorageFile,
  storageFileExists,
  STORAGE_FOLDERS,
  writeStorageBufferAtomic,
} from '../src/modules/storage/storage-files.js';
import { purgeExpiredStorageTrash } from '../src/modules/storage/storage-trash.service.js';

const applyChanges = process.argv.includes('--apply');
const managedRoots = ['Sales Order', 'Master Data'];

function normalizePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function olderThan(date, cutoff) {
  return new Date(date).getTime() < cutoff.getTime();
}

async function loadReferences() {
  const active = await query(`
    select 'attachments' as source_table, id as source_id, storage_path as relative_path
    from attachments
    where storage_path is not null and storage_path <> ''
    union all
    select 'vehicle_documents', id, relative_path
    from vehicle_documents
    where relative_path is not null and relative_path <> ''
  `);
  const trash = await query(`
    select id, source_table, source_id, trash_relative_path, deleted_at
    from storage_trash
    order by deleted_at, id
  `);
  return { active: active.rows, trash: trash.rows };
}

async function findMissingReferences(rows, pathField) {
  const checks = await Promise.all(rows.map(async (row) => ({
    ...row,
    present: await storageFileExists(row[pathField]),
  })));
  return checks.filter((row) => row[pathField] && !row.present);
}

async function run() {
  await ensureStorageStructure();
  const references = await loadReferences();
  const activePathSet = new Set(references.active.map((row) => normalizePath(row.relative_path)));
  const trashPathSet = new Set(references.trash
    .map((row) => row.trash_relative_path)
    .filter(Boolean)
    .map(normalizePath));

  const managedFileGroups = await Promise.all(managedRoots.map((root) => listStorageFiles(root)));
  const managedFiles = managedFileGroups.flat();
  const orphanActiveFiles = managedFiles.filter((file) => !activePathSet.has(normalizePath(file.relativePath)));
  const missingActiveReferences = await findMissingReferences(references.active, 'relative_path');
  const missingTrashReferences = await findMissingReferences(
    references.trash.filter((row) => row.trash_relative_path),
    'trash_relative_path',
  );

  const now = new Date();
  const temporaryCutoff = new Date(now.getTime() - env.storageTemporaryMaxHours * 60 * 60 * 1000);
  const trashCutoff = new Date(now.getTime() - env.fileTrashRetentionDays * 24 * 60 * 60 * 1000);
  const temporaryFiles = await listStorageFiles(STORAGE_FOLDERS.temporary);
  const staleTemporaryFiles = temporaryFiles.filter((file) => olderThan(file.modifiedAt, temporaryCutoff));
  const replacedFiles = await listStorageFiles(STORAGE_FOLDERS.replaced);
  const expiredReplacedFiles = replacedFiles.filter((file) => olderThan(file.modifiedAt, trashCutoff));
  const expiredTrashRecords = references.trash.filter((row) => olderThan(row.deleted_at, trashCutoff));
  const trashFiles = await listStorageFiles(STORAGE_FOLDERS.trash);
  const orphanTrashFiles = trashFiles.filter((file) => (
    !normalizePath(file.relativePath).startsWith(`${normalizePath(STORAGE_FOLDERS.replaced)}/`)
    && !trashPathSet.has(normalizePath(file.relativePath))
  ));

  const actions = {
    quarantinedActiveOrphans: [],
    quarantinedTemporaryFiles: [],
    quarantinedTrashOrphans: [],
    purgedTrashRecords: [],
    failedTrashPurges: [],
    purgedReplacedFiles: [],
  };

  if (applyChanges) {
    for (const file of orphanActiveFiles) {
      const destination = await quarantineStorageFile(file.relativePath, 'File tanpa referensi database');
      if (destination) actions.quarantinedActiveOrphans.push(destination);
    }
    for (const file of staleTemporaryFiles) {
      const destination = await quarantineStorageFile(file.relativePath, 'File sementara kedaluwarsa');
      if (destination) actions.quarantinedTemporaryFiles.push(destination);
    }
    for (const file of orphanTrashFiles) {
      const destination = await quarantineStorageFile(file.relativePath, 'File recycle bin tanpa metadata');
      if (destination) actions.quarantinedTrashOrphans.push(destination);
    }
    const purgeResult = await purgeExpiredStorageTrash(trashCutoff);
    actions.purgedTrashRecords = purgeResult.purged.map((row) => row.id);
    actions.failedTrashPurges = purgeResult.failed;
    for (const file of expiredReplacedFiles) {
      if (await deleteStorageFile(file.relativePath)) {
        actions.purgedReplacedFiles.push(file.relativePath);
      }
    }
  }

  const report = {
    mode: applyChanges ? 'apply' : 'dry-run',
    generatedAt: now.toISOString(),
    storageRoot: getStorageRootPath(),
    retention: {
      trashDays: env.fileTrashRetentionDays,
      temporaryMaxHours: env.storageTemporaryMaxHours,
    },
    summary: {
      activeReferences: references.active.length,
      missingActiveReferences: missingActiveReferences.length,
      managedFiles: managedFiles.length,
      orphanActiveFiles: orphanActiveFiles.length,
      trashRecords: references.trash.length,
      missingTrashReferences: missingTrashReferences.length,
      orphanTrashFiles: orphanTrashFiles.length,
      expiredTrashRecords: expiredTrashRecords.length,
      temporaryFiles: temporaryFiles.length,
      staleTemporaryFiles: staleTemporaryFiles.length,
      replacedFiles: replacedFiles.length,
      expiredReplacedFiles: expiredReplacedFiles.length,
    },
    samples: {
      missingActiveReferences: missingActiveReferences.slice(0, 20).map((row) => row.relative_path),
      orphanActiveFiles: orphanActiveFiles.slice(0, 20).map((row) => row.relativePath),
      missingTrashReferences: missingTrashReferences.slice(0, 20).map((row) => row.trash_relative_path),
      orphanTrashFiles: orphanTrashFiles.slice(0, 20).map((row) => row.relativePath),
    },
    actions,
  };

  if (applyChanges) {
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const reportPath = join(STORAGE_FOLDERS.audit, `storage-audit-${timestamp}.json`);
    await writeStorageBufferAtomic(reportPath, Buffer.from(`${JSON.stringify(report, null, 2)}\n`));
    report.reportPath = reportPath;
  }

  console.log(JSON.stringify(report, null, 2));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
