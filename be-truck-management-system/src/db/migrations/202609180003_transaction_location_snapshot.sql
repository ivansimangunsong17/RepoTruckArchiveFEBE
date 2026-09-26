-- Phase 5: Penyimpanan Lokasi pada Transaksi. warehouse_location_id (dari Phase 4) dilengkapi
-- dengan snapshot nama/alamat + destination_id lokasi tersebut pada saat DIPILIH -- supaya histori
-- transaksi lama TIDAK berubah kalau nama/alamat lokasi diedit belakangan di Master Lokasi (lihat
-- sales-orders.repository.js untuk logika "hanya di-snapshot ulang kalau warehouse_location_id
-- benar-benar berubah pada request ini", pola yang sama persis dengan snapshot customer_name/
-- pic/phone/address yang sudah ada). destination_id di sini adalah destination_id milik LOKASI yang
-- dipilih (dari end_users.destination_id), bukan hasil pencocokan ulang teks field "destination" --
-- keduanya independen dan tabel ini TIDAK mengubah mekanisme freeze UJ/komisi yang sudah ada
-- (uj_source_destination_id, uj_snapshot_source, dst).
alter table sales_orders
  add column if not exists warehouse_location_name_snapshot text,
  add column if not exists warehouse_location_address_snapshot text,
  add column if not exists destination_id uuid references destination_locations(id) on delete set null;

alter table container_jobs
  add column if not exists warehouse_location_name_snapshot text,
  add column if not exists warehouse_location_address_snapshot text,
  add column if not exists destination_id uuid references destination_locations(id) on delete set null;

create index if not exists idx_sales_orders_destination_id
  on sales_orders(destination_id)
  where destination_id is not null;

create index if not exists idx_container_jobs_destination_id
  on container_jobs(destination_id)
  where destination_id is not null;
