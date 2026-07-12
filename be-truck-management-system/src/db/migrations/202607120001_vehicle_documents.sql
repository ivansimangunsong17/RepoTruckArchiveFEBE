alter table vehicles add column if not exists unit_kind text not null default 'TRUCK';
alter table vehicles add column if not exists chassis_size text;

alter table vehicles drop constraint if exists vehicles_unit_kind_check;
alter table vehicles add constraint vehicles_unit_kind_check
  check (unit_kind in ('HEAD', 'TRAILER', 'CHASSIS', 'TRUCK'));

alter table vehicles drop constraint if exists vehicles_chassis_size_check;
alter table vehicles add constraint vehicles_chassis_size_check
  check (chassis_size is null or chassis_size in ('20FT', '40FT', 'COMBO'));

alter table vehicles drop constraint if exists vehicles_chassis_size_required_check;
alter table vehicles add constraint vehicles_chassis_size_required_check
  check (
    (unit_kind in ('TRAILER', 'CHASSIS') and chassis_size is not null)
    or (unit_kind not in ('TRAILER', 'CHASSIS'))
  );

alter table vehicles drop constraint if exists vehicles_container_size_check;
alter table vehicles add constraint vehicles_container_size_check
  check (container_size in ('20FT', '40FT', 'COMBO'));

create table if not exists vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  document_type text not null check (document_type in ('KIR_HEAD', 'KIR_BUNTUT', 'STNK', 'PAJAK', 'ASURANSI', 'OTHER')),
  document_number text,
  issued_date date,
  expired_date date,
  file_name_original text,
  file_name_stored text,
  relative_path text,
  mime_type text,
  size_bytes bigint,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vehicle_documents_vehicle_id on vehicle_documents(vehicle_id);
create index if not exists idx_vehicle_documents_expired_date on vehicle_documents(expired_date);
