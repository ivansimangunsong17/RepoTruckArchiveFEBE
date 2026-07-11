-- Backend pagination and filtering for Archive Sales Orders and Container Jobs.
-- Run after 202606230002_archive_activity_pagination.sql.

create or replace function public.get_archive_sales_orders_page(
  p_query text default '',
  p_status text default '',
  p_limit integer default 8,
  p_offset integer default 0
)
returns table (
  id uuid,
  so_number text,
  do_number text,
  so_date date,
  received_at timestamptz,
  customer_id uuid,
  customer_snapshot jsonb,
  customer_name text,
  customer_pic text,
  customer_phone text,
  customer_address text,
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
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  containers jsonb,
  reference_documents jsonb,
  total_count bigint,
  total_orders bigint,
  total_containers bigint,
  completed_containers bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_orders as (
    select
      so.*,
      coalesce(customer.name, so.customer_snapshot ->> 'name') as resolved_customer_name,
      coalesce(so.customer_snapshot ->> 'pic', customer.pic_name) as resolved_customer_pic,
      coalesce(so.customer_snapshot ->> 'phone', customer.phone) as resolved_customer_phone,
      coalesce(so.customer_snapshot ->> 'address', customer.address) as resolved_customer_address
    from public.sales_orders so
    left join public.customers customer on customer.id = so.customer_id
    where auth.uid() is not null
      and (
        coalesce(trim(p_status), '') = ''
        or so.status = trim(p_status)
      )
      and (
        coalesce(trim(p_query), '') = ''
        or so.so_number ilike '%' || trim(p_query) || '%'
        or coalesce(so.do_number, '') ilike '%' || trim(p_query) || '%'
        or coalesce(customer.name, so.customer_snapshot ->> 'name', '') ilike '%' || trim(p_query) || '%'
      )
  ),
  archive_metrics as (
    select
      (select count(*) from public.sales_orders) as total_orders,
      (select count(*) from public.container_jobs) as total_containers,
      (select count(*) from public.container_jobs where status = 'completed') as completed_containers
  )
  select
    so.id,
    so.so_number,
    so.do_number,
    so.so_date,
    so.received_at,
    so.customer_id,
    so.customer_snapshot,
    so.resolved_customer_name,
    so.resolved_customer_pic,
    so.resolved_customer_phone,
    so.resolved_customer_address,
    so.shipment_type,
    so.job_type,
    so.job_description,
    so.origin,
    so.destination,
    case when public.current_user_role() in ('admin', 'sales') then so.price else null end,
    so.quantity,
    so.unit,
    case when public.current_user_role() in ('admin', 'sales') then so.total_amount else null end,
    so.status,
    so.notes,
    so.created_by,
    creator.full_name,
    so.updated_by,
    updater.full_name,
    so.created_at,
    so.updated_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', job.id,
          'container_number', job.container_number,
          'container_size', job.container_size,
          'container_type', job.container_type,
          'container_notes', job.container_notes,
          'driver_id', job.driver_id,
          'vehicle_id', job.vehicle_id,
          'assignment_snapshot', job.assignment_snapshot,
          'rpuj_status', job.rpuj_status,
          'rpuj_notes', job.rpuj_notes,
          'spk_number', job.spk_number,
          'loading_voucher_number', job.loading_voucher_number,
          'unloading_voucher_number', job.unloading_voucher_number,
          'travel_document_number', job.travel_document_number,
          'weighing_document_number', job.weighing_document_number,
          'status', job.status,
          'hold_reason', job.hold_reason,
          'received_at', job.received_at,
          'running_at', job.running_at,
          'completed_at', job.completed_at,
          'updated_by_name', job_updater.full_name,
          'updated_at', job.updated_at
        )
        order by job.created_at
      )
      from public.container_jobs job
      left join public.profiles job_updater on job_updater.id = job.updated_by
      where job.sales_order_id = so.id
    ), '[]'::jsonb),
    case
      when public.current_user_role() in ('admin', 'sales') then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', attachment.id,
            'category', attachment.category,
            'reference_number', attachment.reference_number,
            'document_date', attachment.document_date,
            'notes', attachment.notes,
            'file_name', attachment.file_name,
            'storage_path', attachment.storage_path,
            'mime_type', attachment.mime_type,
            'file_size', attachment.file_size
          )
          order by attachment.created_at desc
        )
        from public.attachments attachment
        where attachment.entity_type = 'sales_order'
          and attachment.entity_id = so.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,
    count(*) over(),
    metrics.total_orders,
    metrics.total_containers,
    metrics.completed_containers
  from visible_orders so
  left join public.profiles creator on creator.id = so.created_by
  left join public.profiles updater on updater.id = so.updated_by
  cross join archive_metrics metrics
  order by so.created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_archive_sales_orders_page(text, text, integer, integer) from public;
grant execute on function public.get_archive_sales_orders_page(text, text, integer, integer) to authenticated;

create or replace function public.get_archive_container_jobs_page(
  p_query text default '',
  p_status text default '',
  p_limit integer default 8,
  p_offset integer default 0
)
returns table (
  id uuid,
  sales_order_id uuid,
  so_number text,
  do_number text,
  customer_name text,
  shipment_type text,
  job_type text,
  origin text,
  destination text,
  order_created_by_name text,
  container_number text,
  container_size text,
  container_type text,
  container_notes text,
  driver_id uuid,
  vehicle_id uuid,
  assignment_snapshot jsonb,
  rpuj_status text,
  rpuj_notes text,
  spk_number text,
  loading_voucher_number text,
  unloading_voucher_number text,
  travel_document_number text,
  weighing_document_number text,
  status text,
  hold_reason text,
  received_at timestamptz,
  running_at timestamptz,
  completed_at timestamptz,
  updated_by_name text,
  updated_at timestamptz,
  documents jsonb,
  total_count bigint,
  received_count bigint,
  running_count bigint,
  hold_count bigint,
  completed_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with active_jobs as (
    select
      job.*,
      so.so_number,
      so.do_number,
      so.shipment_type,
      so.job_type,
      so.origin,
      so.destination,
      coalesce(customer.name, so.customer_snapshot ->> 'name') as resolved_customer_name,
      creator.full_name as order_creator_name,
      updater.full_name as job_updater_name
    from public.container_jobs job
    join public.sales_orders so on so.id = job.sales_order_id
    left join public.customers customer on customer.id = so.customer_id
    left join public.profiles creator on creator.id = so.created_by
    left join public.profiles updater on updater.id = job.updated_by
    where auth.uid() is not null
      and so.status <> 'cancelled'
  ),
  filtered_jobs as (
    select *
    from active_jobs job
    where (
        coalesce(trim(p_status), '') = ''
        or job.status = trim(p_status)
      )
      and (
        coalesce(trim(p_query), '') = ''
        or job.so_number ilike '%' || trim(p_query) || '%'
        or coalesce(job.do_number, '') ilike '%' || trim(p_query) || '%'
        or coalesce(job.resolved_customer_name, '') ilike '%' || trim(p_query) || '%'
        or job.container_number ilike '%' || trim(p_query) || '%'
        or coalesce(job.assignment_snapshot ->> 'driver', '') ilike '%' || trim(p_query) || '%'
        or coalesce(job.assignment_snapshot ->> 'plateNumber', '') ilike '%' || trim(p_query) || '%'
      )
  ),
  job_metrics as (
    select
      count(*) filter (where active_jobs.status = 'received') as received_count,
      count(*) filter (where active_jobs.status = 'running') as running_count,
      count(*) filter (where active_jobs.status = 'hold') as hold_count,
      count(*) filter (where active_jobs.status = 'completed') as completed_count
    from active_jobs
  )
  select
    job.id,
    job.sales_order_id,
    job.so_number,
    job.do_number,
    job.resolved_customer_name,
    job.shipment_type,
    job.job_type,
    job.origin,
    job.destination,
    job.order_creator_name,
    job.container_number,
    job.container_size,
    job.container_type,
    job.container_notes,
    job.driver_id,
    job.vehicle_id,
    job.assignment_snapshot,
    job.rpuj_status,
    job.rpuj_notes,
    job.spk_number,
    job.loading_voucher_number,
    job.unloading_voucher_number,
    job.travel_document_number,
    job.weighing_document_number,
    job.status,
    job.hold_reason,
    job.received_at,
    job.running_at,
    job.completed_at,
    job.job_updater_name,
    job.updated_at,
    case
      when public.current_user_role() in ('admin', 'operational') then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', attachment.id,
            'category', attachment.category,
            'notes', attachment.notes,
            'file_name', attachment.file_name,
            'storage_path', attachment.storage_path,
            'mime_type', attachment.mime_type,
            'file_size', attachment.file_size
          )
          order by attachment.created_at desc
        )
        from public.attachments attachment
        where attachment.entity_type = 'container_job'
          and attachment.entity_id = job.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,
    count(*) over(),
    metrics.received_count,
    metrics.running_count,
    metrics.hold_count,
    metrics.completed_count
  from filtered_jobs job
  cross join job_metrics metrics
  order by job.created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_archive_container_jobs_page(text, text, integer, integer) from public;
grant execute on function public.get_archive_container_jobs_page(text, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
