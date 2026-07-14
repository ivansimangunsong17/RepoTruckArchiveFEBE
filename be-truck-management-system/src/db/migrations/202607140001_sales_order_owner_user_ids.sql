alter table sales_orders
  add column if not exists created_by_user_id uuid references users(id),
  add column if not exists updated_by_user_id uuid references users(id);

create index if not exists idx_sales_orders_created_by_user_id
  on sales_orders(created_by_user_id);
