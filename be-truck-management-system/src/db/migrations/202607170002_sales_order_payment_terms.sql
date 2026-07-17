alter table sales_orders
  add column if not exists payment_type text not null default 'cash',
  add column if not exists payment_term_days integer not null default 0;

update sales_orders
set payment_type = case
    when lower(coalesce(payment_type, 'cash')) = 'tempo' then 'tempo'
    else 'cash'
  end,
  payment_term_days = case
    when lower(coalesce(payment_type, 'cash')) = 'tempo' then greatest(coalesce(payment_term_days, 0), 1)
    else 0
  end;

