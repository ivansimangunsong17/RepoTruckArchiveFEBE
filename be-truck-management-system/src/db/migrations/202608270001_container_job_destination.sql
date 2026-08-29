-- Tujuan (destination) pindah jadi atribut per container job, bukan cuma per Sales Order.
-- sales_orders.destination tetap ada sebagai default untuk container baru; kolom ini adalah
-- snapshot yang HANYA diisi sekali saat container dibuat (lihat sales-orders.repository.js) --
-- tidak pernah ditulis ulang lewat edit SO biasa, kecuali lewat mode koreksi admin.
alter table container_jobs
  add column if not exists destination text not null default '';

update container_jobs cj
set destination = so.destination
from sales_orders so
where so.id = cj.sales_order_id
  and cj.destination = '';
