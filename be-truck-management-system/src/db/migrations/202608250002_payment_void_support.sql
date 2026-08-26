alter table sales_order_payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_name text,
  add column if not exists void_reason text;

alter table debit_note_payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_name text,
  add column if not exists void_reason text;

alter table driver_commission_payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_name text,
  add column if not exists void_reason text;

-- Bug fix: constraint ini sebelumnya UNIQUE biasa (bukan partial index), tidak cocok dengan
-- klausa "on conflict (idempotency_key) where idempotency_key is not null" yang dipakai
-- recordDebitNotePayment(), sehingga setiap pembayaran Debit Note yang membawa idempotency key
-- (selalu dikirim frontend) gagal dengan error Postgres 42P10.
alter table debit_note_payments
  drop constraint if exists uq_debit_note_payments_idempotency_key;

create unique index if not exists uq_debit_note_payments_idempotency_key
  on debit_note_payments(idempotency_key)
  where idempotency_key is not null;
