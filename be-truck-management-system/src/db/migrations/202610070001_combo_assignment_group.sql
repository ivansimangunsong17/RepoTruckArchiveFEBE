-- Combo 2x20 Repo: satu perjalanan fisik (satu truck + satu sopir) membawa dua Container Job,
-- jadi kedua job aktif boleh memakai driver_id/vehicle_id yang sama. Unique index lama
-- (202608250003/202608260001) menolak ini.
--
-- Perlindungan "satu driver/truck hanya di satu perjalanan aktif" dipertahankan, tetapi
-- unit-nya sekarang adalah grup assignment fisik:
-- - assignment_group_id NULL  -> job berdiri sendiri (grup = id job itu sendiri), perilaku lama;
-- - assignment_group_id = id container_pickup_movements combo -> kedua job combo satu grup.
-- Exclusion constraint menolak dua job aktif dengan driver/vehicle sama tetapi grup BERBEDA.
-- Seperti unique index, exclusion constraint dicek Postgres secara atomik sehingga request
-- bersamaan tidak bisa lolos berdua.
alter table container_jobs
  add column if not exists assignment_group_id uuid;

-- Grup hanya berlaku selama driver/truck job tidak diganti. Begitu driver_id atau vehicle_id
-- berubah tanpa grup baru yang eksplisit (misal koreksi assignment satu job combo), job keluar
-- dari grup sehingga tidak bisa "menumpang" driver/truck pasangan combo-nya lagi.
create or replace function container_jobs_clear_stale_assignment_group()
returns trigger
language plpgsql
as $$
begin
  if (new.driver_id is distinct from old.driver_id or new.vehicle_id is distinct from old.vehicle_id)
     and new.assignment_group_id is not distinct from old.assignment_group_id then
    new.assignment_group_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_container_jobs_clear_stale_assignment_group on container_jobs;
create trigger trg_container_jobs_clear_stale_assignment_group
  before update of driver_id, vehicle_id on container_jobs
  for each row
  execute function container_jobs_clear_stale_assignment_group();

create extension if not exists btree_gist;

-- Predicate sama persis dengan unique index lama (realtime, status aktif).
alter table container_jobs
  add constraint ex_container_jobs_driver_active
  exclude using gist (driver_id with =, (coalesce(assignment_group_id, id)) with <>)
  where (
    driver_id is not null
    and coalesce(entry_source, 'realtime') <> 'historical'
    and status not in ('completed', 'cancelled', 'repo_stored')
  );

alter table container_jobs
  add constraint ex_container_jobs_vehicle_active
  exclude using gist (vehicle_id with =, (coalesce(assignment_group_id, id)) with <>)
  where (
    vehicle_id is not null
    and coalesce(entry_source, 'realtime') <> 'historical'
    and status not in ('completed', 'cancelled', 'repo_stored')
  );

-- Exclusion constraint di atas sudah mencakup semua yang dijaga unique index lama
-- (job tanpa grup tetap unik per driver/truck), jadi index lama baru di-drop setelahnya.
drop index if exists uq_container_jobs_driver_active;
drop index if exists uq_container_jobs_vehicle_active;
