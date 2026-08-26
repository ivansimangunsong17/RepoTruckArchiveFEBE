-- Data lama/historical adalah backfill arsip, bukan booking resource live.
-- Jadi driver/truck yang sedang dipakai operasional hari ini tetap boleh dicatat
-- sebagai snapshot pada container job historical tanpa menabrak unique index assignment aktif.
drop index if exists uq_container_jobs_driver_active;
drop index if exists uq_container_jobs_vehicle_active;

create unique index uq_container_jobs_driver_active
  on container_jobs(driver_id)
  where driver_id is not null
    and coalesce(entry_source, 'realtime') <> 'historical'
    and status not in ('completed', 'cancelled', 'repo_stored');

create unique index uq_container_jobs_vehicle_active
  on container_jobs(vehicle_id)
  where vehicle_id is not null
    and coalesce(entry_source, 'realtime') <> 'historical'
    and status not in ('completed', 'cancelled', 'repo_stored');
