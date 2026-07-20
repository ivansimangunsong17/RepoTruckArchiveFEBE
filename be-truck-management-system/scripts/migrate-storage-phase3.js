import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream, constants as fsConstants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  buildAttachmentStorageDirectory,
  parseSalesOrderStorageRoot,
  sanitizeFileName,
} from '../src/modules/attachments/attachment-storage.js';
import { closePool, query, withTransaction } from '../src/db/client.js';

const applyChanges = process.argv.includes('--apply');

function readOption(name, fallback = '') {
  const prefixed = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefixed));
  if (inline) return inline.slice(prefixed.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const sourceRoot = resolve(readOption('--source', join(process.cwd(), 'uploads')));
const configuredUploadTarget = isAbsolute(String(process.env.UPLOAD_DIR || '').trim())
  ? process.env.UPLOAD_DIR
  : '';
const targetRoot = resolve(readOption(
  '--target',
  process.env.STORAGE_MIGRATION_TARGET
    || configuredUploadTarget
    || 'D:\\ARMADA_SYSTEM\\storage',
));
const migrationLogDirectory = join(targetRoot, 'File Karantina', 'Migration Logs');
const latestManifestPath = join(migrationLogDirectory, 'phase3-latest.json');

function normalizeAbsolutePath(value) {
  const normalized = resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isInside(root, candidate) {
  const normalizedRoot = normalizeAbsolutePath(root);
  const normalizedCandidate = normalizeAbsolutePath(candidate);
  return normalizedCandidate === normalizedRoot
    || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function resolveRelativePath(root, storedPath) {
  const rawPath = String(storedPath || '').trim();
  if (!rawPath || isAbsolute(rawPath)) throw new Error(`Path relatif tidak valid: ${rawPath || '(kosong)'}`);
  const normalizedRelativePath = rawPath.split(/[\\/]+/).filter(Boolean).join(sep);
  const absolutePath = resolve(root, normalizedRelativePath);
  if (!isInside(root, absolutePath)) throw new Error(`Path keluar dari storage root: ${rawPath}`);
  return absolutePath;
}

async function readFileStat(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() ? fileStat : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function calculateSha256(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function listFiles(root) {
  const rootStat = await readFileStat(root).catch(() => null);
  if (rootStat) return [root];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const entryPath = join(root, entry.name);
      if (entry.isDirectory()) return listFiles(entryPath);
      return entry.isFile() ? [entryPath] : [];
    }));
    return nested.flat();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readPreviousManifest() {
  try {
    return JSON.parse(await readFile(latestManifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function originalSourcePaths(manifest) {
  const entries = [
    ...(manifest?.attachments || []),
    ...(manifest?.vehicleDocuments || []),
  ];
  return new Set([
    ...(manifest?.preservedSourcePaths || []),
    ...entries.map((entry) => entry.sourceRelativePath),
  ]
    .filter(Boolean)
    .map((storedPath) => normalizeAbsolutePath(resolveRelativePath(sourceRoot, storedPath))));
}

function collectPreservedSourcePaths(previousManifest, ...plans) {
  const previousEntries = [
    ...(previousManifest?.attachments || []),
    ...(previousManifest?.vehicleDocuments || []),
  ];
  return [...new Set([
    ...(previousManifest?.preservedSourcePaths || []),
    ...previousEntries.map((entry) => entry.sourceRelativePath),
    ...plans.flat().map((entry) => entry.sourceRelativePath),
  ].filter(Boolean))].sort();
}

async function loadAttachmentRows() {
  const result = await query(`
    select
      attachment.id,
      attachment.entity_type,
      attachment.entity_id,
      attachment.category,
      attachment.file_name,
      attachment.file_name_original,
      attachment.storage_path,
      coalesce(direct_order.id, job_order.id) as sales_order_id,
      coalesce(direct_order.so_number, job_order.so_number) as so_number,
      coalesce(direct_order.received_at, job_order.received_at) as received_at,
      coalesce(direct_order.so_date, job_order.so_date) as so_date,
      coalesce(direct_order.created_at, job_order.created_at) as sales_order_created_at,
      container_job.id as container_job_id
    from attachments attachment
    left join sales_orders direct_order
      on attachment.entity_type = 'sales_order'
     and direct_order.id = attachment.entity_id
    left join container_jobs container_job
      on attachment.entity_type = 'container_job'
     and container_job.id = attachment.entity_id
    left join sales_orders job_order on job_order.id = container_job.sales_order_id
    where attachment.storage_path is not null
      and attachment.storage_path <> ''
    order by attachment.created_at, attachment.id
  `);
  return result.rows;
}

async function loadVehicleDocumentRows() {
  const result = await query(`
    select
      document.id,
      document.vehicle_id,
      document.document_type,
      document.file_name_original,
      document.relative_path,
      vehicle.unit_kind
    from vehicle_documents document
    join vehicles vehicle on vehicle.id = document.vehicle_id
    where document.relative_path is not null
      and document.relative_path <> ''
    order by document.created_at, document.id
  `);
  return result.rows;
}

function findSalesOrderStorageRoots(rows) {
  const roots = new Map();
  rows.forEach((row) => {
    if (!row.sales_order_id || roots.has(row.sales_order_id)) return;
    const rootParts = parseSalesOrderStorageRoot(row.storage_path);
    if (rootParts) roots.set(row.sales_order_id, rootParts);
  });
  return roots;
}

async function findExistingFile(storedPath) {
  const sourcePath = resolveRelativePath(sourceRoot, storedPath);
  if (await readFileStat(sourcePath)) return { absolutePath: sourcePath, location: 'source' };
  const currentTargetPath = resolveRelativePath(targetRoot, storedPath);
  if (await readFileStat(currentTargetPath)) return { absolutePath: currentTargetPath, location: 'target' };
  return null;
}

async function buildAttachmentPlan(rows) {
  const salesOrderRoots = findSalesOrderStorageRoots(rows);
  return Promise.all(rows.map(async (row) => {
    try {
      const existingFile = await findExistingFile(row.storage_path);
      const fileName = sanitizeFileName(
        row.file_name_original || row.file_name || basename(row.storage_path),
      );
      const context = {
        salesOrderId: row.sales_order_id,
        containerJobId: row.container_job_id,
        soNumber: row.so_number,
        receivedAt: row.received_at,
        soDate: row.so_date,
        createdAt: row.sales_order_created_at,
        storageRootParts: salesOrderRoots.get(row.sales_order_id) || null,
      };
      const directory = buildAttachmentStorageDirectory({
        entityType: row.entity_type,
        entityId: row.entity_id,
        category: row.category,
        fileName,
      }, context);
      const destinationRelativePath = join(directory, `${row.id}-${fileName}`);
      return {
        table: 'attachments',
        id: row.id,
        entityType: row.entity_type,
        category: row.category,
        sourceRelativePath: row.storage_path,
        destinationRelativePath,
        sourceAbsolutePath: existingFile?.absolutePath || null,
        sourceLocation: existingFile?.location || null,
        destinationAbsolutePath: resolveRelativePath(targetRoot, destinationRelativePath),
        fileNameStored: basename(destinationRelativePath),
        status: existingFile ? 'ready' : 'missing',
      };
    } catch (error) {
      return {
        table: 'attachments',
        id: row.id,
        sourceRelativePath: row.storage_path,
        destinationRelativePath: null,
        status: 'unsafe',
        error: error.message,
      };
    }
  }));
}

async function buildVehicleDocumentPlan(rows) {
  return Promise.all(rows.map(async (row) => {
    try {
      const existingFile = await findExistingFile(row.relative_path);
      const fileName = sanitizeFileName(row.file_name_original || basename(row.relative_path));
      const entityType = ['CHASSIS', 'TRAILER'].includes(row.unit_kind) ? 'chassis' : 'truck';
      const directory = buildAttachmentStorageDirectory({
        entityType,
        entityId: row.vehicle_id,
        category: row.document_type,
        fileName,
      });
      const destinationRelativePath = join(directory, `${row.id}-${fileName}`);
      return {
        table: 'vehicle_documents',
        id: row.id,
        vehicleId: row.vehicle_id,
        category: row.document_type,
        sourceRelativePath: row.relative_path,
        destinationRelativePath,
        sourceAbsolutePath: existingFile?.absolutePath || null,
        sourceLocation: existingFile?.location || null,
        destinationAbsolutePath: resolveRelativePath(targetRoot, destinationRelativePath),
        fileNameStored: basename(destinationRelativePath),
        status: existingFile ? 'ready' : 'missing',
      };
    } catch (error) {
      return {
        table: 'vehicle_documents',
        id: row.id,
        sourceRelativePath: row.relative_path,
        destinationRelativePath: null,
        status: 'unsafe',
        error: error.message,
      };
    }
  }));
}

async function buildOrphanPlan(referencePlans, previousManifest) {
  const knownSourceFiles = originalSourcePaths(previousManifest);
  referencePlans.forEach((entry) => {
    if (entry.sourceLocation === 'source' && entry.sourceAbsolutePath) {
      knownSourceFiles.add(normalizeAbsolutePath(entry.sourceAbsolutePath));
    }
  });
  const files = await listFiles(sourceRoot);
  return files
    .filter((filePath) => !knownSourceFiles.has(normalizeAbsolutePath(filePath)))
    .map((filePath) => {
      const sourceRelativePath = relative(sourceRoot, filePath);
      const destinationRelativePath = join(
        'File Karantina',
        'File tanpa referensi database',
        sourceRelativePath,
      );
      return {
        table: null,
        id: null,
        sourceRelativePath,
        destinationRelativePath,
        sourceAbsolutePath: filePath,
        sourceLocation: 'source',
        destinationAbsolutePath: resolveRelativePath(targetRoot, destinationRelativePath),
        fileNameStored: basename(destinationRelativePath),
        status: 'orphan',
      };
    });
}

async function copyAndVerify(entry) {
  const sourceStat = await readFileStat(entry.sourceAbsolutePath);
  if (!sourceStat) throw new Error(`File sumber hilang saat migrasi: ${entry.sourceRelativePath}`);
  const sourceSha256 = await calculateSha256(entry.sourceAbsolutePath);
  const sameFile = normalizeAbsolutePath(entry.sourceAbsolutePath)
    === normalizeAbsolutePath(entry.destinationAbsolutePath);

  if (!sameFile) {
    const destinationStat = await readFileStat(entry.destinationAbsolutePath);
    if (destinationStat) {
      const destinationSha256 = await calculateSha256(entry.destinationAbsolutePath);
      if (destinationStat.size !== sourceStat.size || destinationSha256 !== sourceSha256) {
        throw new Error(`Konflik file tujuan: ${entry.destinationRelativePath}`);
      }
    } else {
      await mkdir(dirname(entry.destinationAbsolutePath), { recursive: true });
      await copyFile(
        entry.sourceAbsolutePath,
        entry.destinationAbsolutePath,
        fsConstants.COPYFILE_EXCL,
      );
    }
  }

  const verifiedStat = await readFileStat(entry.destinationAbsolutePath);
  const verifiedSha256 = await calculateSha256(entry.destinationAbsolutePath);
  if (!verifiedStat || verifiedStat.size !== sourceStat.size || verifiedSha256 !== sourceSha256) {
    throw new Error(`Verifikasi checksum gagal: ${entry.destinationRelativePath}`);
  }
  return {
    ...entry,
    status: sameFile ? 'already_migrated' : 'verified',
    sizeBytes: sourceStat.size,
    sha256: sourceSha256,
  };
}

async function updateDatabase(attachmentRows, vehicleRows, attachmentPlans, vehiclePlans) {
  const attachmentUpdates = attachmentPlans.filter((entry) => (
    ['verified', 'already_migrated'].includes(entry.status)
    && entry.sourceRelativePath !== entry.destinationRelativePath
  ));
  const vehicleUpdates = vehiclePlans.filter((entry) => (
    ['verified', 'already_migrated'].includes(entry.status)
    && entry.sourceRelativePath !== entry.destinationRelativePath
  ));

  await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('armada-storage-phase3'))");
    const attachmentCount = await client.query("select count(*)::int as total from attachments where storage_path is not null and storage_path <> ''");
    const vehicleCount = await client.query("select count(*)::int as total from vehicle_documents where relative_path is not null and relative_path <> ''");
    if (attachmentCount.rows[0].total !== attachmentRows.length || vehicleCount.rows[0].total !== vehicleRows.length) {
      throw new Error('Data dokumen berubah selama migrasi. Database tidak diperbarui; jalankan ulang migrator.');
    }

    for (const entry of attachmentUpdates) {
      const result = await client.query(
        `
          update attachments
          set storage_path = $1,
              relative_path = $1,
              file_name_stored = $2
          where id = $3 and storage_path = $4
          returning id
        `,
        [entry.destinationRelativePath, entry.fileNameStored, entry.id, entry.sourceRelativePath],
      );
      if (result.rowCount !== 1) throw new Error(`Attachment berubah saat migrasi: ${entry.id}`);
    }

    for (const entry of vehicleUpdates) {
      const result = await client.query(
        `
          update vehicle_documents
          set relative_path = $1,
              file_name_stored = $2,
              updated_at = now()
          where id = $3 and relative_path = $4
          returning id
        `,
        [entry.destinationRelativePath, entry.fileNameStored, entry.id, entry.sourceRelativePath],
      );
      if (result.rowCount !== 1) throw new Error(`Dokumen kendaraan berubah saat migrasi: ${entry.id}`);
    }
  });
}

function publicEntry(entry) {
  return {
    table: entry.table,
    id: entry.id,
    entityType: entry.entityType,
    category: entry.category,
    sourceRelativePath: entry.sourceRelativePath,
    destinationRelativePath: entry.destinationRelativePath,
    sourceLocation: entry.sourceLocation,
    status: entry.status,
    sizeBytes: entry.sizeBytes,
    sha256: entry.sha256,
    error: entry.error,
  };
}

function summarize(attachmentPlans, vehiclePlans, orphanPlans) {
  const references = [...attachmentPlans, ...vehiclePlans];
  const count = (status) => references.filter((entry) => entry.status === status).length;
  return {
    referenceCount: references.length,
    ready: count('ready'),
    verified: count('verified'),
    alreadyMigrated: count('already_migrated'),
    missing: count('missing'),
    unsafe: count('unsafe'),
    quarantinedOrphans: orphanPlans.filter((entry) => (
      ['verified', 'already_migrated', 'orphan'].includes(entry.status)
    )).length,
  };
}

async function writeManifest(manifest, timestampKey) {
  await mkdir(migrationLogDirectory, { recursive: true });
  const versionedPath = join(migrationLogDirectory, `phase3-${timestampKey}.json`);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(versionedPath, serialized, 'utf8');
  await writeFile(latestManifestPath, serialized, 'utf8');
  return versionedPath;
}

async function run() {
  if (!isInside(dirname(sourceRoot), sourceRoot)) throw new Error('Source storage tidak valid.');
  if (normalizeAbsolutePath(sourceRoot) === normalizeAbsolutePath(targetRoot)) {
    throw new Error('Source dan target storage tidak boleh sama.');
  }
  if (isInside(sourceRoot, targetRoot) || isInside(targetRoot, sourceRoot)) {
    throw new Error('Source dan target storage tidak boleh berada di dalam satu sama lain.');
  }

  const sourceDirectoryStat = await stat(sourceRoot).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!sourceDirectoryStat?.isDirectory()) throw new Error(`Source storage tidak ditemukan: ${sourceRoot}`);

  if (applyChanges) {
    try {
      await mkdir(targetRoot, { recursive: true });
      await access(targetRoot, fsConstants.W_OK);
    } catch (error) {
      throw new Error(`Target storage tidak dapat ditulis: ${targetRoot}. ${error.message}`);
    }
  }

  const previousManifest = await readPreviousManifest();
  const attachmentRows = await loadAttachmentRows();
  const vehicleRows = await loadVehicleDocumentRows();
  let attachmentPlans = await buildAttachmentPlan(attachmentRows);
  let vehiclePlans = await buildVehicleDocumentPlan(vehicleRows);
  let orphanPlans = await buildOrphanPlan([...attachmentPlans, ...vehiclePlans], previousManifest);
  const initialSummary = summarize(attachmentPlans, vehiclePlans, orphanPlans);

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    sourceRoot,
    targetRoot,
    ...initialSummary,
  }, null, 2));

  if (!applyChanges) {
    const missingSamples = [...attachmentPlans, ...vehiclePlans]
      .filter((entry) => ['missing', 'unsafe'].includes(entry.status))
      .slice(0, 10)
      .map(publicEntry);
    if (missingSamples.length) console.log(JSON.stringify({ missingSamples }, null, 2));
    console.log('Dry-run selesai. Jalankan kembali dengan --apply untuk menyalin file dan memperbarui database.');
    return;
  }

  attachmentPlans = await Promise.all(attachmentPlans.map((entry) => (
    entry.status === 'ready' ? copyAndVerify(entry) : entry
  )));
  vehiclePlans = await Promise.all(vehiclePlans.map((entry) => (
    entry.status === 'ready' ? copyAndVerify(entry) : entry
  )));
  orphanPlans = await Promise.all(orphanPlans.map((entry) => copyAndVerify(entry)));

  const timestamp = new Date().toISOString();
  const timestampKey = timestamp.replace(/[:.]/g, '-');
  let manifest = {
    phase: 3,
    status: 'files_verified_database_pending',
    createdAt: timestamp,
    sourceRoot,
    targetRoot,
    sourcePreserved: true,
    preservedSourcePaths: collectPreservedSourcePaths(
      previousManifest,
      attachmentPlans,
      vehiclePlans,
    ),
    summary: summarize(attachmentPlans, vehiclePlans, orphanPlans),
    attachments: attachmentPlans.map(publicEntry),
    vehicleDocuments: vehiclePlans.map(publicEntry),
    quarantinedFiles: orphanPlans.map(publicEntry),
  };
  const manifestPath = await writeManifest(manifest, timestampKey);

  await updateDatabase(attachmentRows, vehicleRows, attachmentPlans, vehiclePlans);
  manifest = {
    ...manifest,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };
  await writeManifest(manifest, timestampKey);

  console.log(JSON.stringify({
    status: manifest.status,
    manifestPath,
    ...manifest.summary,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
