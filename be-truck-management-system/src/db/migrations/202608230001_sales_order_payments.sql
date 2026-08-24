create table if not exists sales_order_payments (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  amount numeric(14, 0) not null,
  payment_date date not null default current_date,
  reference_number text,
  proof_attachment_id uuid references attachments(id) on delete set null,
  note text,
  recorded_by_user_id uuid,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table sales_order_payments
    add constraint chk_sales_order_payments_amount_positive
    check (amount > 0);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_sales_order_payments_sales_order_id
  on sales_order_payments(sales_order_id);

create index if not exists idx_sales_order_payments_payment_date
  on sales_order_payments(payment_date);

-- Data lama tidak bisa diasumsikan lengkap (invoice_number/payment_type banyak yang default),
-- jadi kolom penanda ini dipakai untuk membedakan SO yang datanya cukup untuk dihitung akurat
-- di Customer Outstanding vs yang perlu ditinjau manual dulu sebelum masuk perhitungan.
alter table sales_orders
  add column if not exists ots_data_review_status text not null default 'ok';

do $$
begin
  alter table sales_orders
    add constraint chk_sales_orders_ots_data_review_status
    check (ots_data_review_status in ('ok', 'perlu_dicek'));
exception
  when duplicate_object then null;
end $$;

update sales_orders
set ots_data_review_status = 'perlu_dicek'
where status = 'completed'
  and (
    nullif(btrim(invoice_number), '') is null
    or invoice_issued_at is null
  );
