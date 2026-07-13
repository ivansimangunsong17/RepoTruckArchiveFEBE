alter table vehicles add column if not exists stid_expiry_date date;
alter table vehicles add column if not exists stid_document jsonb;
