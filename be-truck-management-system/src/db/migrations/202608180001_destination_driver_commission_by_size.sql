alter table destination_locations
  add column if not exists driver_commission_20ft_amount numeric(14, 0) not null default 0,
  add column if not exists driver_commission_40ft_amount numeric(14, 0) not null default 0;

update destination_locations
set driver_commission_20ft_amount = coalesce(nullif(driver_commission_20ft_amount, 0), driver_commission_amount, 0),
    driver_commission_40ft_amount = coalesce(nullif(driver_commission_40ft_amount, 0), driver_commission_amount, 0)
where coalesce(driver_commission_amount, 0) > 0
  and (coalesce(driver_commission_20ft_amount, 0) = 0 or coalesce(driver_commission_40ft_amount, 0) = 0);

do $$
begin
  alter table destination_locations
    add constraint chk_destination_locations_driver_commission_20ft_non_negative
    check (driver_commission_20ft_amount >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table destination_locations
    add constraint chk_destination_locations_driver_commission_40ft_non_negative
    check (driver_commission_40ft_amount >= 0);
exception
  when duplicate_object then null;
end $$;
