// Biaya Titip/Repo Rp300.000 per Container Job, ditagihkan ke customer lewat item Reimbursement SO
// (container_job_expenses expense_group 'reimbursement' -> nominal Debit Note SO), BUKAN lewat
// invoice utama. Dicatat sekali saat job pertama kali berstatus repo_stored; Ambil Titip tidak
// membuat tagihan lagi.
//
// - Tepat sekali: idempotency_key deterministik per job (unique index uq_container_job_expenses_
//   idempotency_key) menahan retry, simpan ulang, request bersamaan, dan titip kedua; baris yang
//   sudah dibatalkan Finance tidak dibuat ulang.
// - Tidak menagih transaksi lama: input historis, job yang sudah pernah dititip sebelumnya, job yang
//   sudah punya Revenue Repo lama (manual_revenue_lines 'repo'), atau yang sudah punya reimbursement
//   titip/repo yang dicatat manual tidak mendapat item otomatis.
// - Debit Note SO sudah terbit (nomor/dokumen/pembayaran): Debit Note lama tidak diubah dan tidak ada
//   tagihan otomatis. Pengecualian dicatat persisten sebagai baris reimbursement berstatus 'batal'
//   (tidak ikut nominal Debit Note) dengan finance_check_status 'perlu_klarifikasi', sehingga Finance
//   menemukannya di Rekonsiliasi Biaya (filter Perlu Klarifikasi) dan rincian Debit Note SO.
// - Kategori ini hanya kanal tampilan penagihan (Debit Note); perlakuan akuntansi/pajak tidak diubah.
// - Tidak ada transaksi Rekening Dropping: tanpa bukti bayar, tidak pernah 'sudah_dibayar'.
export const REPO_STORAGE_FEE_AMOUNT = 300000;
export const REPO_STORAGE_FEE_SOURCE = 'repo_storage_fee';

const DEBIT_NOTE_ISSUED_FINANCE_NOTE = 'Tidak ditagih otomatis: Debit Note SO sudah terbit saat container dititip. '
  + 'Butuh keputusan Finance (penagihan susulan manual atau tidak ditagihkan).';

export function repoStorageFeeIdempotencyKey(jobId) {
  return `${REPO_STORAGE_FEE_SOURCE}:${jobId}`;
}

export function buildRepoStorageFeeDescription(containerNumber) {
  return ['Biaya Titip/Repo', containerNumber].filter(Boolean).join(' ');
}

// Kebijakan tanpa database: alasan job TIDAK mendapat Biaya Titip otomatis, atau null.
export function repoStorageFeeSkipReason({ job = {}, entrySource } = {}) {
  if (String(entrySource || job.entry_source || 'realtime') === 'historical') return 'historical_entry';
  if (job.repo_stored_at) return 'previously_stored';
  return null;
}

async function insertStorageFee(client, { job, actorName, idempotencyKey, debitNoteIssued }) {
  return client.query(
    `
      insert into container_job_expenses (
        sales_order_id, container_job_id, driver_id, category, expense_group, amount, description,
        recipient_type, recipient_name, payment_status, finance_check_status, finance_note,
        source, source_ref_id, input_source, idempotency_key, created_by_name, updated_by_name
      )
      values ($1, $2, null, 'reimbursement', 'reimbursement', $3, $4, 'customer', $5, $6, $7, $8,
        $9, $10, 'system', $11, $12, $12)
      on conflict (idempotency_key) where idempotency_key is not null do nothing
      returning id
    `,
    [
      job.sales_order_id,
      job.id,
      REPO_STORAGE_FEE_AMOUNT,
      debitNoteIssued
        ? `${buildRepoStorageFeeDescription(job.container_number)} (perlu keputusan Finance)`
        : buildRepoStorageFeeDescription(job.container_number),
      job.customer_name || null,
      debitNoteIssued ? 'batal' : 'belum_dibayar',
      debitNoteIssued ? 'perlu_klarifikasi' : 'belum_dicek',
      debitNoteIssued ? DEBIT_NOTE_ISSUED_FINANCE_NOTE : null,
      REPO_STORAGE_FEE_SOURCE,
      String(job.id),
      idempotencyKey,
      actorName || 'Operational',
    ],
  );
}

export async function recordRepoStorageFee(client, { job, actorName, entrySource }) {
  const skipReason = repoStorageFeeSkipReason({ job, entrySource });
  if (skipReason) return { status: 'skipped', reason: skipReason };

  // Kunci SO supaya keputusan "debit note sudah terbit" tidak balapan dengan input nomor DN.
  const orderResult = await client.query(
    `
      select so.id,
        nullif(btrim(coalesce(so.debit_note_number, '')), '') is not null
          or so.debit_note_document_uploaded_at is not null
          or exists (
            select 1 from debit_note_payments payment
            where payment.sales_order_id = so.id and payment.voided_at is null
          ) as debit_note_issued
      from sales_orders so
      where so.id = $1
      for update of so
    `,
    [job.sales_order_id],
  );
  const order = orderResult.rows[0];
  if (!order) return { status: 'skipped', reason: 'sales_order_not_found' };

  const idempotencyKey = repoStorageFeeIdempotencyKey(job.id);
  const existing = await client.query('select id from container_job_expenses where idempotency_key = $1', [idempotencyKey]);
  if (existing.rows[0]) return { status: 'already_recorded', expenseId: existing.rows[0].id };

  const legacyRevenue = await client.query(
    `select id from manual_revenue_lines where container_job_id = $1 and charge_type = 'repo' and status <> 'void' limit 1`,
    [job.id],
  );
  if (legacyRevenue.rows[0]) return { status: 'skipped', reason: 'legacy_repo_revenue' };

  // Reimbursement titip/repo yang sudah dicatat manual sebelum aturan ini: jangan ditagih dua kali.
  const manualReimbursement = await client.query(
    `
      select id from container_job_expenses
      where container_job_id = $1
        and expense_group = 'reimbursement'
        and payment_status <> 'batal'
        and (description ilike '%titip%' or description ilike '%repo%')
      limit 1
    `,
    [job.id],
  );
  if (manualReimbursement.rows[0]) return { status: 'skipped', reason: 'existing_reimbursement' };

  const debitNoteIssued = Boolean(order.debit_note_issued);
  const inserted = await insertStorageFee(client, { job, actorName, idempotencyKey, debitNoteIssued });
  if (!inserted.rows[0]) {
    const raced = await client.query('select id from container_job_expenses where idempotency_key = $1', [idempotencyKey]);
    return { status: 'already_recorded', expenseId: raced.rows[0]?.id || null };
  }
  if (debitNoteIssued) {
    return {
      status: 'pending_finance_decision',
      expenseId: inserted.rows[0].id,
      warning: {
        code: 'REPO_STORAGE_FEE_DEBIT_NOTE_ISSUED',
        message: `Debit Note SO ini sudah terbit, jadi Biaya Titip/Repo Rp${REPO_STORAGE_FEE_AMOUNT.toLocaleString('id-ID')} untuk ${job.container_number || 'container ini'} tidak ditagih otomatis. Tercatat di Rekonsiliasi Biaya Finance (Perlu Klarifikasi) untuk diputuskan Finance.`,
      },
    };
  }
  return { status: 'created', expenseId: inserted.rows[0].id };
}
