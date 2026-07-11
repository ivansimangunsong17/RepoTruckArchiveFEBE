alter table sales_orders add column if not exists billing_status text not null default 'pending_invoice';
