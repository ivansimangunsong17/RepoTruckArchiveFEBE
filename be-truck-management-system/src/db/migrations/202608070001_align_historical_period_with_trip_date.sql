update sales_orders
set historical_period = to_char(trip_date, 'YYYY-MM'),
    updated_at = now()
where entry_source = 'historical'
  and trip_date is not null
  and historical_period is distinct from to_char(trip_date, 'YYYY-MM');

update container_jobs cj
set historical_period = so.historical_period,
    updated_at = now()
from sales_orders so
where cj.sales_order_id = so.id
  and so.entry_source = 'historical'
  and so.historical_period is not null
  and cj.historical_period is distinct from so.historical_period;
