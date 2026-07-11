alter table customers add column if not exists npwp text;
alter table customers add column if not exists email text;
alter table customers add column if not exists contract_number text;
alter table customers add column if not exists contract_start date;
alter table customers add column if not exists contract_end date;
alter table customers add column if not exists npwp_document jsonb;
alter table customers add column if not exists contract_document jsonb;

alter table drivers add column if not exists driver_photo jsonb;
alter table drivers add column if not exists identity_document jsonb;
alter table drivers add column if not exists license_document jsonb;
alter table drivers add column if not exists partnership_letter jsonb;

alter table vehicles add column if not exists vin text;
alter table vehicles add column if not exists engine_number text;
alter table vehicles add column if not exists kir_number text;
alter table vehicles add column if not exists stnk_number text;
alter table vehicles add column if not exists stnk_expiry_date date;
alter table vehicles add column if not exists stnk_document jsonb;
alter table vehicles add column if not exists kir_document jsonb;

create unique index if not exists idx_customers_npwp_unique on customers(npwp) where npwp is not null and archived_at is null;
create unique index if not exists idx_customers_contract_number_unique on customers(contract_number) where contract_number is not null and archived_at is null;
create unique index if not exists idx_vehicles_vin_unique on vehicles(vin) where vin is not null and archived_at is null;
create unique index if not exists idx_vehicles_engine_number_unique on vehicles(engine_number) where engine_number is not null and archived_at is null;
create unique index if not exists idx_vehicles_kir_number_unique on vehicles(kir_number) where kir_number is not null and archived_at is null;
