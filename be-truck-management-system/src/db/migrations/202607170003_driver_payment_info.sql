alter table drivers
  add column if not exists payment_method text not null default 'bank',
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_holder text,
  add column if not exists emoney_provider text,
  add column if not exists emoney_number text;

update drivers
set payment_method = case
    when lower(coalesce(payment_method, 'bank')) = 'emoney' then 'emoney'
    else 'bank'
  end;
