alter table sales_orders
  add column if not exists billing_status text not null default 'belum_invoice',
  add column if not exists invoice_number text;

update sales_orders
set billing_status = case
  when billing_status = 'pending_invoice' then 'belum_invoice'
  when billing_status = 'invoice_issued' then 'belum_dikirim'
  when billing_status = 'waiting_payment' then 'menunggu_pembayaran'
  when billing_status = 'paid' then 'lunas'
  when billing_status is null or btrim(billing_status) = '' then 'belum_invoice'
  else billing_status
end;

create index if not exists idx_finance_container_jobs_completed
  on container_jobs(completed_at desc, sales_order_id)
  where status = 'completed';

create index if not exists idx_finance_sales_orders_billing_status
  on sales_orders(billing_status);
