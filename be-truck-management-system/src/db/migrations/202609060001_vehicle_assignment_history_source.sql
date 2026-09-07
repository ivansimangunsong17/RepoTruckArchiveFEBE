alter table vehicle_assignment_history
  add column if not exists source text not null default 'fleet_assignment'
  check (source in ('fleet_assignment', 'master_truck'));
