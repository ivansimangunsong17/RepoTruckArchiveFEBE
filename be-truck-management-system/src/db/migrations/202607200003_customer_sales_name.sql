alter table customers add column if not exists sales_name text;

with latest_customer_sales as (
  select distinct on (lower(btrim(customer_name)))
    lower(btrim(customer_name)) as customer_key,
    coalesce(nullif(btrim(sales_name), ''), nullif(btrim(created_by_name), '')) as sales_name
  from sales_orders
  where nullif(btrim(customer_name), '') is not null
    and coalesce(nullif(btrim(sales_name), ''), nullif(btrim(created_by_name), '')) is not null
  order by lower(btrim(customer_name)), updated_at desc, created_at desc
)
update customers customer
set sales_name = latest.sales_name
from latest_customer_sales latest
where lower(btrim(customer.name)) = latest.customer_key
  and nullif(btrim(customer.sales_name), '') is null;
