create table if not exists storage_trash (
  id uuid primary key default gen_random_uuid(),
  source_table text not null
    check (source_table in ('attachments', 'vehicle_documents')),
  source_id uuid not null,
  entity_type text,
  entity_id uuid,
  original_relative_path text,
  trash_relative_path text,
  file_name_original text,
  mime_type text,
  size_bytes bigint,
  record_data jsonb not null,
  deletion_reason text,
  deleted_by_name text,
  deleted_by_role text,
  deleted_at timestamptz not null default now(),
  unique (source_table, source_id)
);

create index if not exists idx_storage_trash_deleted_at
  on storage_trash(deleted_at desc);

create index if not exists idx_storage_trash_source
  on storage_trash(source_table, source_id);

create index if not exists idx_storage_trash_entity
  on storage_trash(entity_type, entity_id);
