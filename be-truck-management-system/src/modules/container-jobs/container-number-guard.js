// Pengaman nomor container ganda. Nomor container boleh dipakai ulang (migrasi 202607200004), tetapi
// satu container fisik hanya bisa berada di satu Container Job aktif:
// - job lain yang masih aktif/dititip (received/running/inap/repo_stored) -> DITOLAK, tanpa opsi
//   konfirmasi. Container titip dilanjutkan lewat Ambil Titip pada job yang sama, bukan job kedua;
// - job lain yang baru selesai (atau sudah selesai di SO yang sama) -> peringatan yang boleh
//   dikonfirmasi user (confirmPossibleDuplicateContainer), karena pemakaian ulang ini sah secara bisnis.
// Dicek di dalam transaksi penyimpan dengan advisory lock per nomor container, sehingga dua
// penyimpanan bersamaan untuk nomor yang sama tidak bisa sama-sama lolos.
export const POSSIBLE_DUPLICATE_CONTAINER_LOOKBACK_DAYS = 7;
export const BLOCKING_CONTAINER_JOB_STATUSES = ['received', 'running', 'inap', 'repo_stored'];

const STATUS_LABELS = {
  received: 'Belum Jalan',
  running: 'Sedang Jalan',
  inap: 'Inap',
  repo_stored: 'Dititip',
};

function guardError(message, code, details) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = code;
  error.details = details;
  return error;
}

export function normalizeContainerNumber(value) {
  return String(value || '').trim().toUpperCase() || null;
}

// Wajib dipanggil di dalam transaksi: lock dilepas otomatis saat commit/rollback. Diurutkan supaya
// penyimpan beberapa nomor sekaligus tidak saling deadlock.
export async function lockContainerNumbers(db, containerNumbers = []) {
  const numbers = [...new Set(containerNumbers.map(normalizeContainerNumber).filter(Boolean))].sort();
  for (const number of numbers) {
    await db.query("select pg_advisory_xact_lock(hashtextextended('atms:container_number:' || $1, 0))", [number]);
  }
}

export async function findContainerNumberConflicts(db, { containerNumber, jobId = null, salesOrderId = null } = {}) {
  const normalized = normalizeContainerNumber(containerNumber);
  if (!normalized) return [];
  const result = await db.query(
    `
      select cj.id, cj.sales_order_id, cj.status, so.so_number, so.customer_name,
             nullif(cj.assignment_snapshot->>'driver', '') as driver_name,
             coalesce(cj.completed_at, cj.repo_stored_at, cj.running_at, cj.created_at) as activity_at
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where upper(btrim(cj.container_number)) = $1
        and ($2::uuid is null or cj.id <> $2::uuid)
        and cj.status <> 'cancelled'
        and so.status <> 'cancelled'
        and (
          cj.status = any($4::text[])
          or cj.sales_order_id = $3::uuid
          or cj.completed_at >= now() - make_interval(days => $5::int)
        )
      order by activity_at desc nulls last
      limit 5
    `,
    [normalized, jobId, salesOrderId, BLOCKING_CONTAINER_JOB_STATUSES, POSSIBLE_DUPLICATE_CONTAINER_LOOKBACK_DAYS],
  );
  return result.rows.map((row) => {
    const blocking = BLOCKING_CONTAINER_JOB_STATUSES.includes(row.status);
    const sameSalesOrder = String(row.sales_order_id) === String(salesOrderId || '');
    return {
      containerJobId: row.id,
      salesOrderId: row.sales_order_id,
      soNumber: row.so_number || '',
      customerName: row.customer_name || '',
      status: row.status,
      driverName: row.driver_name || '',
      activityAt: row.activity_at,
      blocking,
      reason: blocking
        ? (row.status === 'repo_stored' ? 'repo_stored' : 'active')
        : (sameSalesOrder ? 'same_sales_order' : 'recently_completed'),
    };
  });
}

export function buildContainerNumberInUseError(containerNumber, matches = []) {
  const stored = matches.find((match) => match.reason === 'repo_stored');
  const first = stored || matches[0] || {};
  const message = stored
    ? `Container ${containerNumber} masih dititip pada ${stored.soNumber || 'SO lain'}. Gunakan Ambil Titip pada job tersebut; container titip tidak boleh dibuat sebagai job kedua.`
    : `Container ${containerNumber} masih ${STATUS_LABELS[first.status] || 'aktif'} pada ${first.soNumber || 'job lain'}. Selesaikan atau batalkan job tersebut terlebih dahulu sebelum memakai nomor ini di job lain.`;
  return guardError(message, 'CONTAINER_NUMBER_IN_ACTIVE_JOB', { containerNumber, matches });
}

export function buildPossibleDuplicateContainerError(containerNumber, matches = []) {
  const first = matches[0] || {};
  return guardError(
    `Nomor container ${containerNumber} baru tercatat pada ${first.soNumber || 'job lain'}. Pastikan ini pemakaian ulang container, bukan input ganda, sebelum menyimpan.`,
    'CONTAINER_NUMBER_POSSIBLE_DUPLICATE',
    { containerNumber, lookbackDays: POSSIBLE_DUPLICATE_CONTAINER_LOOKBACK_DAYS, matches },
  );
}

function isConfirmed(value) {
  return value === true || String(value || '').toLowerCase() === 'true';
}

// Tidak melakukan apa pun bila nomor tidak berubah: edit job yang tidak mengganti nomor container
// (termasuk data lama yang sudah terlanjur ganda) tetap bisa disimpan.
export async function assertContainerNumberAllowed(db, {
  containerNumber,
  previousContainerNumber = null,
  jobId = null,
  salesOrderId = null,
  confirmed = false,
} = {}) {
  const next = normalizeContainerNumber(containerNumber);
  if (!next || next === normalizeContainerNumber(previousContainerNumber)) return [];
  await lockContainerNumbers(db, [next]);
  const matches = await findContainerNumberConflicts(db, { containerNumber: next, jobId, salesOrderId });
  const blocking = matches.filter((match) => match.blocking);
  if (blocking.length) throw buildContainerNumberInUseError(next, blocking);
  if (matches.length && !isConfirmed(confirmed)) throw buildPossibleDuplicateContainerError(next, matches);
  return matches;
}
