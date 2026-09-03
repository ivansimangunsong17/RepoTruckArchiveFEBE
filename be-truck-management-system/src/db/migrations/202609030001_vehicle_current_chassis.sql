alter table vehicles add column if not exists current_chassis_id uuid references kir_chassis(id) on delete set null;
alter table vehicles add column if not exists current_chassis_code text;
