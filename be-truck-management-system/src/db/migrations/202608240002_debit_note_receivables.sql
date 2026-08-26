alter table sales_orders
  add column if not exists debit_note_number text;

alter table sales_orders
  add column if not exists debit_note_issued_at timestamptz;

alter table sales_orders
  add column if not exists debit_note_input_by_name text;

create table if not exists debit_note_payments (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  amount numeric(14, 0) not null,
  payment_date date not null default current_date,
  reference_number text,
  proof_attachment_id uuid references attachments(id) on delete set null,
  note text,
  recorded_by_user_id uuid,
  recorded_by_name text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table debit_note_payments
    add constraint chk_debit_note_payments_amount_positive
    check (amount > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table debit_note_payments
    add constraint uq_debit_note_payments_idempotency_key
    unique (idempotency_key);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_debit_note_payments_sales_order_id
  on debit_note_payments(sales_order_id);

create index if not exists idx_debit_note_payments_payment_date
  on debit_note_payments(payment_date);
