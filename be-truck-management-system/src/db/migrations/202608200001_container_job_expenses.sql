create table if not exists container_job_expenses (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid references sales_orders(id) on delete cascade,
  container_job_id uuid not null references container_jobs(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  category text not null,
  amount numeric(14, 0) not null default 0,
  description text,
  recipient_type text not null default 'driver',
  recipient_name text,
  payment_status text not null default 'belum_dibayar',
  paid_at timestamptz,
  paid_by_name text,
  proof_attachment_id uuid references attachments(id) on delete set null,
  finance_check_status text not null default 'belum_dicek',
  finance_checked_by_name text,
  finance_checked_at timestamptz,
  finance_note text,
  source text not null default 'manual',
  source_ref_id text,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table container_job_expenses
    add constraint chk_container_job_expenses_category
    check (category in (
      'uj_awal',
      'top_up_uj',
      'tol',
      'parkir',
      'bongkar',
      'muat',
      'lolo',
      'inap',
      'terminal_depo',
      'tunggu',
      'reimbursement',
      'lainnya'
    ));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table container_job_expenses
    add constraint chk_container_job_expenses_amount_non_negative
    check (amount >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table container_job_expenses
    add constraint chk_container_job_expenses_payment_status
    check (payment_status in (
      'belum_dibayar',
      'pending_pembayaran',
      'sudah_dibayar',
      'batal',
      'ditahan_sopir',
      'dipakai_job_berikutnya'
    ));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table container_job_expenses
    add constraint chk_container_job_expenses_finance_check_status
    check (finance_check_status in (
      'belum_dicek',
      'sudah_dicek',
      'perlu_klarifikasi',
      'dikoreksi'
    ));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_container_job_expenses_job
  on container_job_expenses(container_job_id, created_at desc);

create index if not exists idx_container_job_expenses_order
  on container_job_expenses(sales_order_id, created_at desc);

create index if not exists idx_container_job_expenses_payment_status
  on container_job_expenses(payment_status);

create index if not exists idx_container_job_expenses_finance_check_status
  on container_job_expenses(finance_check_status);

create unique index if not exists uq_container_job_expenses_legacy_source
  on container_job_expenses(container_job_id, category, source, source_ref_id)
  where source = 'legacy_rpuj' and source_ref_id is not null;

with legacy_rows as (
  select
    cj.id as container_job_id,
    cj.sales_order_id,
    cj.driver_id,
    cj.container_size,
    cj.rpuj_status,
    cj.rpuj_notes,
    cj.rpuj_transfer_uploaded_at,
    cj.rpuj_transfer_uploaded_by_name,
    cj.rpuj_requested_by_name,
    cj.created_by_name,
    cj.updated_by_name,
    cj.assignment_snapshot,
    so.destination,
    case
      when upper(replace(cj.container_size, ' ', '')) = '40FT' then nullif(dl.uj_40ft, 0)
      else nullif(dl.uj_20ft, 0)
    end as journey_money,
    coalesce(((regexp_match(coalesce(cj.rpuj_notes, ''), '"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)'))[1])::numeric, 0) as additional_amount,
    coalesce(((regexp_match(coalesce(cj.rpuj_notes, ''), '"notes"\s*:\s*"([^"]*)"'))[1]), '') as additional_notes,
    rpuj_proof.id as rpuj_proof_attachment_id,
    additional_proof.id as additional_proof_attachment_id
  from container_jobs cj
  join sales_orders so on so.id = cj.sales_order_id
  left join destination_locations dl on lower(trim(dl.name)) = lower(trim(so.destination)) and dl.archived_at is null
  left join lateral (
    select id
    from attachments
    where entity_type = 'container_job'
      and entity_id = cj.id
      and category = 'rpujTransferProof'
    order by created_at desc
    limit 1
  ) rpuj_proof on true
  left join lateral (
    select id
    from attachments
    where entity_type = 'container_job'
      and entity_id = cj.id
      and category = 'additionalCostDocument'
    order by created_at desc
    limit 1
  ) additional_proof on true
  where cj.rpuj_status <> 'pending'
)
insert into container_job_expenses (
  sales_order_id,
  container_job_id,
  driver_id,
  category,
  amount,
  description,
  recipient_type,
  recipient_name,
  payment_status,
  paid_at,
  paid_by_name,
  proof_attachment_id,
  finance_check_status,
  source,
  source_ref_id,
  created_by_name,
  updated_by_name
)
select
  sales_order_id,
  container_job_id,
  driver_id,
  'uj_awal',
  journey_money,
  concat('Migrasi legacy RPUJ: UJ ', coalesce(container_size, 'Container')),
  'driver',
  nullif(assignment_snapshot->>'driver', ''),
  case when rpuj_status = 'paid' then 'sudah_dibayar' else 'belum_dibayar' end,
  case when rpuj_status = 'paid' then rpuj_transfer_uploaded_at else null end,
  case when rpuj_status = 'paid' then rpuj_transfer_uploaded_by_name else null end,
  rpuj_proof_attachment_id,
  'belum_dicek',
  'legacy_rpuj',
  container_job_id::text,
  coalesce(rpuj_requested_by_name, created_by_name),
  updated_by_name
from legacy_rows
where coalesce(journey_money, 0) > 0
on conflict do nothing;

with legacy_rows as (
  select
    cj.id as container_job_id,
    cj.sales_order_id,
    cj.driver_id,
    cj.rpuj_status,
    cj.rpuj_notes,
    cj.rpuj_transfer_uploaded_at,
    cj.rpuj_transfer_uploaded_by_name,
    cj.rpuj_requested_by_name,
    cj.created_by_name,
    cj.updated_by_name,
    cj.assignment_snapshot,
    coalesce(((regexp_match(coalesce(cj.rpuj_notes, ''), '"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)'))[1])::numeric, 0) as additional_amount,
    coalesce(((regexp_match(coalesce(cj.rpuj_notes, ''), '"notes"\s*:\s*"([^"]*)"'))[1]), '') as additional_notes,
    rpuj_proof.id as rpuj_proof_attachment_id,
    additional_proof.id as additional_proof_attachment_id
  from container_jobs cj
  left join lateral (
    select id
    from attachments
    where entity_type = 'container_job'
      and entity_id = cj.id
      and category = 'rpujTransferProof'
    order by created_at desc
    limit 1
  ) rpuj_proof on true
  left join lateral (
    select id
    from attachments
    where entity_type = 'container_job'
      and entity_id = cj.id
      and category = 'additionalCostDocument'
    order by created_at desc
    limit 1
  ) additional_proof on true
  where cj.rpuj_status <> 'pending'
)
insert into container_job_expenses (
  sales_order_id,
  container_job_id,
  driver_id,
  category,
  amount,
  description,
  recipient_type,
  recipient_name,
  payment_status,
  paid_at,
  paid_by_name,
  proof_attachment_id,
  finance_check_status,
  source,
  source_ref_id,
  created_by_name,
  updated_by_name
)
select
  sales_order_id,
  container_job_id,
  driver_id,
  'lainnya',
  additional_amount,
  nullif(additional_notes, ''),
  'vendor',
  nullif(assignment_snapshot->>'driver', ''),
  case when rpuj_status = 'paid' then 'sudah_dibayar' else 'belum_dibayar' end,
  case when rpuj_status = 'paid' then rpuj_transfer_uploaded_at else null end,
  case when rpuj_status = 'paid' then rpuj_transfer_uploaded_by_name else null end,
  coalesce(additional_proof_attachment_id, rpuj_proof_attachment_id),
  'belum_dicek',
  'legacy_rpuj',
  container_job_id::text,
  coalesce(rpuj_requested_by_name, created_by_name),
  updated_by_name
from legacy_rows
where additional_amount > 0
on conflict do nothing;
