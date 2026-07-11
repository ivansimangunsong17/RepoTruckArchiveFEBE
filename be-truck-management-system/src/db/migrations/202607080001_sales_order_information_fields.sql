alter table sales_orders add column if not exists container_summary text;
alter table sales_orders add column if not exists line_items jsonb not null default '[]'::jsonb;
alter table sales_orders add column if not exists terminal text;
alter table sales_orders add column if not exists service_name text;
alter table sales_orders add column if not exists do20_quantity integer not null default 0;
alter table sales_orders add column if not exists do40_quantity integer not null default 0;
alter table sales_orders add column if not exists cargo_type text;
