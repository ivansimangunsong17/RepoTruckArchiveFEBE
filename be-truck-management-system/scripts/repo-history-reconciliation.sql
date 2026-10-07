-- Rekonsiliasi historis Container Titip / Repo (Phase 5) -- READ ONLY.
-- Jalankan dengan psql; seluruh isi berada di transaksi read-only dan diakhiri rollback,
-- jadi tidak ada data yang berubah. Tujuannya membantu memutuskan perlu tidaknya backfill.
-- Data sebelum Phase 3 (UJ Repo) / Phase 4 (Revenue Repo) wajar tidak punya record tersebut.
begin read only;

-- 1. Detail per movement.
select
  cpm.id as movement_id,
  cpm.pickup_type,
  cpm.started_at,
  cpm.created_at,
  cpm.status,
  coalesce(nullif(cpm.assignment_snapshot->>'plateNumber', ''), v.plate_number) as truck,
  coalesce(nullif(cpm.assignment_snapshot->>'driver', ''), d.name) as driver,
  count(cpi.id) as containers,
  string_agg(cj.container_number || ':' || cj.status, ', ' order by cpi.sequence_no) as linked_jobs,
  1 as expected_repo_trips,
  case when cpm.status <> 'cancelled' and cpm.started_at is not null then 1 else 0 end as current_utilization_trips,
  cpm.repo_uj_amount,
  (select count(*) from operational_fund_transactions o
    where o.source = 'repo_uj' and o.source_ref_id = cpm.id::text and o.status = 'posted') as repo_uj_debits,
  (select count(*) from manual_revenue_lines m
    join container_pickup_items i on i.id = m.container_pickup_item_id
    where i.movement_id = cpm.id and m.status <> 'void') as repo_revenue_lines,
  string_agg(distinct coalesce(so.billing_status, 'belum_invoice'), ', ') as so_billing_status
from container_pickup_movements cpm
left join container_pickup_items cpi on cpi.movement_id = cpm.id
left join container_jobs cj on cj.id = cpi.container_job_id
left join sales_orders so on so.id = cj.sales_order_id
left join vehicles v on v.id = cpm.vehicle_id
left join drivers d on d.id = cpm.driver_id
group by cpm.id, v.plate_number, d.name
order by cpm.created_at;

-- 2. Ringkasan jumlah per kategori.
with movement_items as (
  select cpm.id, cpm.status, cpm.started_at, cpm.pickup_type, cpm.repo_uj_amount,
    count(cpi.id) as items,
    bool_or(cj.repo_picked_up_at is not null or cj.status in ('running', 'completed')) as looks_physical
  from container_pickup_movements cpm
  left join container_pickup_items cpi on cpi.movement_id = cpm.id
  left join container_jobs cj on cj.id = cpi.container_job_id
  group by cpm.id
)
select '1. movement tanpa started_at' as category, count(*) as total
  from movement_items where started_at is null
union all
select '2. movement cancelled yang tampaknya sudah terjadi fisik', count(*)
  from movement_items where status = 'cancelled' and (started_at is not null or looks_physical)
union all
select '3. movement Repo yang tidak terhitung utilisasi (cancelled atau tanpa started_at)', count(*)
  from movement_items where status = 'cancelled' or started_at is null
union all
select '4. combo 2x20 (laporan lama berbasis job menghitungnya 2 trip)', count(*)
  from movement_items where pickup_type = 'combo_2x20'
union all
select '5. movement tanpa UJ Repo (repo_uj_amount kosong)', count(*)
  from movement_items where repo_uj_amount is null
union all
select '5b. movement dengan UJ Repo > 0 tapi tanpa debit rekening dropping', count(*)
  from movement_items mi
  where mi.repo_uj_amount > 0
    and not exists (select 1 from operational_fund_transactions o
      where o.source = 'repo_uj' and o.source_ref_id = mi.id::text and o.status = 'posted')
union all
select '6. pickup item tanpa Revenue Repo Rp300.000 (non-void)', count(*)
  from container_pickup_items cpi
  where not exists (select 1 from manual_revenue_lines m
    where m.container_pickup_item_id = cpi.id and m.status <> 'void')
union all
select '7a. job repo_stored tanpa repo_stored_at (tidak layak Finance, leg asli tidak terhitung)', count(*)
  from container_jobs where status = 'repo_stored' and repo_stored_at is null
union all
select '7b. job sudah di-pickup (repo_picked_up_at) tanpa pickup item / movement', count(*)
  from container_jobs cj
  where cj.repo_picked_up_at is not null
    and not exists (select 1 from container_pickup_items i where i.container_job_id = cj.id)
union all
-- Indikasi saja: UJ asli juga sah tercatat pertama kali saat job selesai (setelah pickup).
select '7c. INDIKASI (cek manual): UJ otomatis asli job titip bertanggal bayar >= pickup', count(*)
  from container_jobs cj
  join container_job_expenses e on e.container_job_id = cj.id
  where cj.repo_picked_up_at is not null
    and e.source = 'auto_uj_order'
    and e.payment_status <> 'batal'
    and e.paid_at >= cj.repo_picked_up_at
union all
-- Revenue transport job titip diatribusikan ke assignment yang dilepas saat titip; tanpa itu
-- (dan tanpa riwayat pickup) laporan jatuh ke snapshot/assignment job yang ada (fallback).
select '7e. job titip tanpa assignment asli yang tercatat (atribusi revenue transport memakai fallback)', count(*)
  from container_jobs cj
  where cj.repo_stored_at is not null
    and (cj.repo_released_vehicle_id is null or cj.repo_released_driver_id is null)
    and not exists (select 1 from container_job_assignment_history h
      where h.container_job_id = cj.id and h.change_source in ('repo_pickup', 'repo_combo_pickup'))
union all
select '7d. job titip dengan dua job aktif berbagi sopir/truck di luar satu grup combo', count(*)
  from container_jobs a
  join container_jobs b on b.id > a.id
    and b.status not in ('completed', 'cancelled', 'repo_stored')
    and (b.driver_id = a.driver_id or b.vehicle_id = a.vehicle_id)
    and coalesce(b.assignment_group_id, b.id) <> coalesce(a.assignment_group_id, a.id)
  where a.status not in ('completed', 'cancelled', 'repo_stored')
    and a.repo_stored_at is not null;

rollback;
