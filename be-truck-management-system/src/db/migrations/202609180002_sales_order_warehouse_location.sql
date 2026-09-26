-- Phase 4: Integrasi Form Sales <-> Lokasi Gudang. sales_orders.warehouse_location_id adalah
-- pilihan Sales saat ini (bebas diedit seperti field SO lain). container_jobs.warehouse_location_id
-- adalah SNAPSHOT yang hanya diisi sekali saat container job dibuat -- pola dan alasannya sama
-- persis dengan kolom destination yang sudah ada di kedua tabel ini (lihat komentar di
-- sales-orders.repository.js / sales-orders.mapper.js), supaya histori container tidak diam-diam
-- berubah kalau Sales mengedit lokasi gudang di SO belakangan.
alter table sales_orders
  add column if not exists warehouse_location_id uuid references end_users(id) on delete set null;

alter table container_jobs
  add column if not exists warehouse_location_id uuid references end_users(id) on delete set null;

create index if not exists idx_sales_orders_warehouse_location_id
  on sales_orders(warehouse_location_id)
  where warehouse_location_id is not null;

create index if not exists idx_container_jobs_warehouse_location_id
  on container_jobs(warehouse_location_id)
  where warehouse_location_id is not null;
