-- Phase 4: Revenue Repo Rp300.000 per container yang diambil dari depo titip.
-- Disimpan di manual_revenue_lines (model revenue tambahan per Sales Order yang sudah ada):
-- satu baris per container_pickup_items, charge_type 'repo', ter-link ke job + SO asli.
-- Baris dibuat berstatus 'draft' sehingga TIDAK masuk billing_amount/invoice sampai keputusan
-- kebijakan invoice Repo ditetapkan. Tidak ada backfill movement lama.
alter table manual_revenue_lines
  drop constraint if exists chk_manual_revenue_lines_charge_type;

alter table manual_revenue_lines
  add constraint chk_manual_revenue_lines_charge_type
  check (charge_type in ('inap', 'waiting_charge', 'extra_trip', 'storage', 'other', 'repo'));

-- Default NO ACTION: pickup item yang sudah punya revenue Repo tidak bisa terhapus diam-diam;
-- penghapusan Sales Order tetap ikut menghapus barisnya lewat cascade sales_order_id.
alter table manual_revenue_lines
  add column if not exists container_pickup_item_id uuid references container_pickup_items(id);

alter table manual_revenue_lines
  drop constraint if exists chk_manual_revenue_lines_repo_source;

alter table manual_revenue_lines
  add constraint chk_manual_revenue_lines_repo_source
  check (charge_type <> 'repo' or container_pickup_item_id is not null);

-- Satu revenue Repo per pickup item (termasuk yang sudah void, supaya tidak dibuat ulang).
create unique index if not exists uq_manual_revenue_lines_pickup_item
  on manual_revenue_lines(container_pickup_item_id)
  where container_pickup_item_id is not null;
