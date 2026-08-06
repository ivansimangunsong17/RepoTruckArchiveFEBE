create table if not exists historical_entry_periods (
  period text primary key,
  status text not null default 'draft',
  notes text,
  locked_by_name text,
  locked_at timestamptz,
  unlocked_by_name text,
  unlocked_at timestamptz,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint historical_entry_periods_status_check
    check (status in ('draft', 'locked'))
);

create index if not exists idx_historical_entry_periods_status
  on historical_entry_periods(status);
