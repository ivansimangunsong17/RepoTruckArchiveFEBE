alter table sales_orders
  add column if not exists accurate_so_number text;

update sales_orders
set accurate_so_number = so_number
where nullif(btrim(accurate_so_number), '') is null
  and nullif(btrim(so_number), '') is not null
  and finance_verification_status = 'verified';

create unique index if not exists sales_orders_accurate_so_number_unique
  on sales_orders(lower(accurate_so_number))
  where nullif(btrim(accurate_so_number), '') is not null;
