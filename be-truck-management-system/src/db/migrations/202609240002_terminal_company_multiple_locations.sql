drop index if exists idx_terminals_name_unique;
drop index if exists idx_terminals_code_unique;

create unique index if not exists idx_terminals_company_name_unique
  on terminals (lower(trim(coalesce(code, ''))), lower(trim(name)))
  where archived_at is null;
