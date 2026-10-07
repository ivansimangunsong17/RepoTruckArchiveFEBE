// UJ Repo: satu nilai manual per pergerakan fisik Repo (single maupun combo 2x20), terpisah dari
// UJ Container Job asli. Diposting sebagai SATU debit rekening dropping dengan
// source = 'repo_uj' dan source_ref_id = container_pickup_movements.id.
export const REPO_UJ_SOURCE = 'repo_uj';
const MAX_REPO_UJ_AMOUNT = 99_999_999_999_999; // numeric(14,0)

function repoUjError(message, code) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

export function normalizeRepoUjAmount(payload = {}) {
  const raw = payload.repoUjAmount;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw repoUjError('Total UJ Repo wajib diisi (boleh 0).', 'REPO_UJ_AMOUNT_REQUIRED');
  }
  const amount = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw repoUjError('Total UJ Repo harus berupa angka rupiah bulat.', 'REPO_UJ_AMOUNT_INVALID');
  }
  if (amount < 0) {
    throw repoUjError('Total UJ Repo tidak boleh negatif.', 'REPO_UJ_AMOUNT_NEGATIVE');
  }
  if (amount > MAX_REPO_UJ_AMOUNT) {
    throw repoUjError('Total UJ Repo melebihi batas nilai yang diizinkan.', 'REPO_UJ_AMOUNT_INVALID');
  }
  return amount;
}

export function buildRepoUjDescription({ pickupType, plateNumber, containerNumbers = [] }) {
  return [
    pickupType === 'combo_2x20' ? 'UJ Repo Combo 2x20' : 'UJ Repo',
    plateNumber,
    containerNumbers.filter(Boolean).join(' + '),
  ].filter(Boolean).join(' - ');
}

// Dipanggil di dalam transaksi pembuatan movement. UJ 0 sah tetapi tidak menghasilkan debit
// (ledger hanya menerima amount > 0). Unique index uq_operational_fund_transactions_repo_uj
// menjamin satu debit per movement; insert ulang untuk movement yang sama tidak menggandakan.
export async function postRepoUjToDroppingAccount(client, {
  movementId,
  amount,
  batchDate,
  ensureBatch,
  description,
  driverName,
  actorName,
}) {
  if (!movementId) throw new Error('Movement Repo wajib ada sebelum UJ Repo diposting.');
  if (!(Number(amount) > 0)) return null;

  const batch = await ensureBatch(client, batchDate, actorName);
  const inserted = await client.query(
    `
      insert into operational_fund_transactions (
        batch_id,
        transaction_date,
        transaction_type,
        category,
        amount,
        description,
        top_name,
        driver_name,
        source,
        source_ref_id,
        created_by_name,
        updated_by_name
      )
      values ($1, coalesce($2::date, current_date), 'debit', 'uj_order', $3, $4, $5, $6, $7, $8, $5, $5)
      on conflict (source_ref_id) where source = 'repo_uj' and status = 'posted'
      do nothing
      returning id, batch_id, transaction_date, amount, source, source_ref_id
    `,
    [batch.id, batchDate || null, amount, description || null, actorName, driverName || null, REPO_UJ_SOURCE, String(movementId)],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await client.query(
    `
      select id, batch_id, transaction_date, amount, source, source_ref_id
      from operational_fund_transactions
      where source = $1 and source_ref_id = $2 and status = 'posted'
      limit 1
    `,
    [REPO_UJ_SOURCE, String(movementId)],
  );
  return existing.rows[0] || null;
}
