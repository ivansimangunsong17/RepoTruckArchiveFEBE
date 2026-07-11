alter table attachments
  add column if not exists module text,
  add column if not exists do_number text,
  add column if not exists file_name_original text,
  add column if not exists file_name_stored text,
  add column if not exists relative_path text,
  add column if not exists size_bytes bigint,
  add column if not exists uploaded_by text,
  add column if not exists uploaded_at timestamptz not null default now();

update attachments
set module = coalesce(module, entity_type),
    file_name_original = coalesce(file_name_original, file_name),
    file_name_stored = coalesce(file_name_stored, regexp_replace(storage_path, '^.*[\\/]', '')),
    relative_path = coalesce(relative_path, storage_path),
    size_bytes = coalesce(size_bytes, file_size),
    uploaded_by = coalesce(uploaded_by, uploaded_by_name),
    uploaded_at = coalesce(uploaded_at, created_at)
where module is null
   or file_name_original is null
   or file_name_stored is null
   or relative_path is null
   or size_bytes is null
   or uploaded_by is null;

create index if not exists idx_attachments_do_number on attachments(do_number);
