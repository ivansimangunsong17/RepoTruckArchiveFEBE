-- ATMS Archive MVP authorization hardening.
-- Run after 202606220001_archive_mvp.sql and 202606220002_auth_hardening.sql.

-- All authenticated users previously inherited SELECT on every Sales Order
-- column. Keep the operational archive readable, but prevent direct reads of
-- commercial values from the REST table endpoint.
revoke select on public.sales_orders from authenticated;

grant select (
  id,
  so_number,
  do_number,
  so_date,
  received_at,
  customer_id,
  customer_snapshot,
  shipment_type,
  job_type,
  job_description,
  origin,
  destination,
  quantity,
  unit,
  status,
  notes,
  cancelled_at,
  cancelled_by,
  created_by,
  updated_by,
  created_at,
  updated_at
) on public.sales_orders to authenticated;

-- This RPC is the only frontend read path that exposes price and total.
-- Admin and Sales receive commercial values. Operational and Observer receive
-- NULL without relying on frontend-only hiding.
create or replace function public.get_archive_sales_orders()
returns table (
  id uuid,
  so_number text,
  do_number text,
  so_date date,
  received_at timestamptz,
  customer_id uuid,
  customer_snapshot jsonb,
  shipment_type text,
  job_type text,
  job_description text,
  origin text,
  destination text,
  price numeric,
  quantity numeric,
  unit text,
  total_amount numeric,
  status text,
  notes text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    so.id,
    so.so_number,
    so.do_number,
    so.so_date,
    so.received_at,
    so.customer_id,
    so.customer_snapshot,
    so.shipment_type,
    so.job_type,
    so.job_description,
    so.origin,
    so.destination,
    case
      when public.current_user_role() in ('admin', 'sales') then so.price
      else null
    end as price,
    so.quantity,
    so.unit,
    case
      when public.current_user_role() in ('admin', 'sales') then so.total_amount
      else null
    end as total_amount,
    so.status,
    so.notes,
    so.cancelled_at,
    so.cancelled_by,
    so.created_by,
    so.updated_by,
    so.created_at,
    so.updated_at
  from public.sales_orders so
  where auth.uid() is not null
  order by so.created_at desc;
$$;

revoke all on function public.get_archive_sales_orders() from public;
grant execute on function public.get_archive_sales_orders() to authenticated;

-- Storage access must follow attachment metadata, not merely bucket
-- membership. Observer has no internal document access.
drop policy if exists archive_storage_read on storage.objects;

create policy archive_storage_read on storage.objects
for select
using (
  bucket_id = 'archive-documents'
  and exists (
    select 1
    from public.attachments attachment
    where attachment.storage_path = storage.objects.name
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() = 'sales'
          and attachment.entity_type in ('customer', 'sales_order')
        )
        or (
          public.current_user_role() = 'operational'
          and attachment.entity_type in ('vehicle', 'driver', 'container_job')
        )
      )
  )
);

notify pgrst, 'reload schema';
