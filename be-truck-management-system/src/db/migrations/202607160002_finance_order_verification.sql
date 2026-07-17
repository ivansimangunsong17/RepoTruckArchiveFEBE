alter table sales_orders
  alter column so_number drop not null;

alter table sales_orders
  add column if not exists finance_verification_status text not null default 'pending_so',
  add column if not exists finance_verified_by_name text,
  add column if not exists finance_verified_at timestamptz;

alter table sales_orders
  drop constraint if exists sales_orders_finance_verification_status_check;

alter table sales_orders
  add constraint sales_orders_finance_verification_status_check
  check (finance_verification_status in ('pending_so', 'verified'));

update sales_orders
set finance_verification_status = case
      when nullif(btrim(so_number), '') is null then 'pending_so'
      else 'verified'
    end,
    finance_verified_at = case
      when nullif(btrim(so_number), '') is null then finance_verified_at
      else coalesce(finance_verified_at, updated_at)
    end,
    finance_verified_by_name = case
      when nullif(btrim(so_number), '') is null then finance_verified_by_name
      else coalesce(finance_verified_by_name, updated_by_name, created_by_name)
    end
where finance_verification_status is null
   or finance_verification_status = 'pending_so';

create index if not exists idx_sales_orders_finance_verification_status
  on sales_orders(finance_verification_status);
