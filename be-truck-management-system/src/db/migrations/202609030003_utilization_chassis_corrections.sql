create table if not exists utilization_chassis_corrections (
  id uuid primary key default gen_random_uuid(),
  source_vehicle_id uuid not null references vehicles(id) on delete restrict,
  target_vehicle_id uuid not null references vehicles(id) on delete restrict,
  effective_from date not null,
  effective_to date not null,
  reason text not null,
  note text,
  status text not null default 'active' check (status in ('active', 'void')),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_by_user_id uuid,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  voided_by_user_id uuid,
  voided_by_name text,
  voided_at timestamptz,
  void_reason text,
  check (source_vehicle_id <> target_vehicle_id),
  check (effective_to >= effective_from)
);

create index if not exists idx_utilization_chassis_corrections_source_period
  on utilization_chassis_corrections(source_vehicle_id, effective_from, effective_to)
  where status = 'active';

create index if not exists idx_utilization_chassis_corrections_target
  on utilization_chassis_corrections(target_vehicle_id)
  where status = 'active';

create extension if not exists btree_gist;

do $$
begin
  alter table utilization_chassis_corrections
    add constraint utilization_chassis_corrections_no_source_overlap
    exclude using gist (
      source_vehicle_id with =,
      daterange(effective_from, effective_to, '[]') with &&
    )
    where (status = 'active');
exception
  when duplicate_object then null;
end $$;
