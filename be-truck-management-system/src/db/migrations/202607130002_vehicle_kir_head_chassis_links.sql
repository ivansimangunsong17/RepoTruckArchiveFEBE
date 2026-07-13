alter table vehicles add column if not exists kir_head_number text;
alter table vehicles add column if not exists kir_chassis_number text;

update vehicles
set kir_head_number = coalesce(nullif(btrim(kir_head_number), ''), nullif(btrim(kir_number), ''))
where coalesce(nullif(btrim(kir_number), ''), '') <> '';
