alter table hino_vehicle_links
  drop constraint if exists hino_vehicle_links_vehicle_id_key;

alter table hino_vehicle_links
  drop constraint if exists hino_vehicle_links_hino_vehicle_id_key;

create unique index if not exists idx_hino_vehicle_links_active_vehicle
  on hino_vehicle_links(vehicle_id)
  where is_active;

create unique index if not exists idx_hino_vehicle_links_active_hino
  on hino_vehicle_links(hino_vehicle_id)
  where is_active;
