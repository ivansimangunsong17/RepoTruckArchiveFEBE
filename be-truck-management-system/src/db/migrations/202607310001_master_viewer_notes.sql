create table if not exists master_viewer_notes (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  entity_id uuid not null,
  note text not null default '',
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource, entity_id)
);

create index if not exists idx_master_viewer_notes_entity
  on master_viewer_notes(resource, entity_id);
