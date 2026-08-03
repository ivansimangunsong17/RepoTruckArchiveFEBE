alter table sales_orders
  add column if not exists invoice_document_status text not null default 'belum_upload',
  add column if not exists invoice_document_uploaded_at timestamptz,
  add column if not exists invoice_document_uploaded_by_name text,
  add column if not exists tax_invoice_document_uploaded_at timestamptz,
  add column if not exists tax_invoice_document_uploaded_by_name text,
  add column if not exists invoice_document_sent_at timestamptz,
  add column if not exists invoice_document_sent_by_name text,
  add column if not exists invoice_document_delivery_method text,
  add column if not exists invoice_document_delivery_notes text;

update sales_orders
set invoice_document_status = 'belum_upload'
where invoice_document_status is null
   or btrim(invoice_document_status) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_orders_invoice_document_status_check'
  ) then
    alter table sales_orders
      add constraint sales_orders_invoice_document_status_check
      check (invoice_document_status in ('belum_upload', 'siap_dikirim', 'terkirim'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_orders_invoice_document_delivery_method_check'
  ) then
    alter table sales_orders
      add constraint sales_orders_invoice_document_delivery_method_check
      check (
        invoice_document_delivery_method is null
        or invoice_document_delivery_method in ('email', 'whatsapp', 'lainnya')
      );
  end if;
end $$;

create index if not exists idx_sales_orders_invoice_document_status
  on sales_orders(invoice_document_status);

create index if not exists idx_sales_orders_invoice_document_sent_at
  on sales_orders(invoice_document_sent_at);
