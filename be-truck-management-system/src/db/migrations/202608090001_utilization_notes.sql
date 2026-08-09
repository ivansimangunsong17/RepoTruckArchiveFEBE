create table if not exists utilization_notes (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('truck', 'driver')),
  resource_id text not null,
  resource_label text not null,
  note_date date not null,
  reason_code text,
  reason_label text not null,
  notes text,
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_type, resource_id, note_date)
);

create index if not exists idx_utilization_notes_period
  on utilization_notes(resource_type, note_date);

create index if not exists idx_utilization_notes_reason
  on utilization_notes(resource_type, lower(reason_label));
