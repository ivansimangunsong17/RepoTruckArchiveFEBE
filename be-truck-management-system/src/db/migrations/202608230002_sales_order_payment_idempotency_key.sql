alter table sales_order_payments
  add column if not exists idempotency_key text;

create unique index if not exists uq_sales_order_payments_idempotency_key
  on sales_order_payments(idempotency_key)
  where idempotency_key is not null;
