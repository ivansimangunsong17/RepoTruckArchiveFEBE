alter table drivers
  add column if not exists blacklist_reason text,
  add column if not exists blacklisted_at date,
  add column if not exists blacklisted_by_name text,
  add column if not exists blacklist_notes text;
