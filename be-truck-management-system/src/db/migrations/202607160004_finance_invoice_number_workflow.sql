alter table sales_orders
  add column if not exists invoice_issued_at timestamptz,
  add column if not exists invoice_input_by_name text;

update sales_orders
set invoice_issued_at = coalesce(invoice_issued_at, updated_at, now())
where nullif(btrim(invoice_number), '') is not null
  and invoice_issued_at is null;

create index if not exists idx_finance_sales_orders_invoice_issued_at
  on sales_orders(invoice_issued_at);
