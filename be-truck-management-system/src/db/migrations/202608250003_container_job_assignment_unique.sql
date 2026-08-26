-- Race condition: pengecekan "driver/truck sudah aktif di job lain" sebelumnya hanya SELECT biasa
-- (requireAssignmentAvailable) tanpa jaminan di level database, jadi dua request assignment yang
-- datang nyaris bersamaan bisa lolos berdua (TOCTOU) dan satu driver/truck ter-assign ke 2 job aktif.
-- Partial unique index ini adalah jaring pengaman terakhir di level DB: Postgres akan menolak UPDATE
-- kedua dengan error 23505 kalau driver_id/vehicle_id yang sama sudah dipakai job aktif lain,
-- terlepas dari kondisi race apa pun di level aplikasi.
create unique index if not exists uq_container_jobs_driver_active
  on container_jobs(driver_id)
  where driver_id is not null and status not in ('completed', 'cancelled', 'repo_stored');

create unique index if not exists uq_container_jobs_vehicle_active
  on container_jobs(vehicle_id)
  where vehicle_id is not null and status not in ('completed', 'cancelled', 'repo_stored');
