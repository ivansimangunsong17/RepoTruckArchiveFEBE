alter table depots
  add column if not exists depot_type text;

alter table depots drop constraint if exists depots_depot_type_check;

alter table depots
  add constraint depots_depot_type_check
  check (
    depot_type is null
    or depot_type in ('destination', 'storage')
  );
