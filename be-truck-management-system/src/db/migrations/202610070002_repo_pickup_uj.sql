-- Phase 3: UJ Repo manual, satu nilai per pergerakan fisik (single maupun combo 2x20).
-- Terpisah dari UJ Container Job asli (container_jobs.uj_amount_snapshot tidak disentuh).
-- Movement lama dibiarkan NULL (tidak di-backfill).
alter table container_pickup_movements
  add column if not exists repo_uj_amount numeric(14,0);

alter table container_pickup_movements
  drop constraint if exists chk_container_pickup_movements_repo_uj_amount;

alter table container_pickup_movements
  add constraint chk_container_pickup_movements_repo_uj_amount
  check (repo_uj_amount is null or repo_uj_amount >= 0);

-- Debit UJ Repo di rekening dropping memakai kolom generik source/source_ref_id:
-- source = 'repo_uj', source_ref_id = container_pickup_movements.id.
-- Satu movement hanya boleh punya satu debit UJ Repo yang posted.
create unique index if not exists uq_operational_fund_transactions_repo_uj
  on operational_fund_transactions (source_ref_id)
  where source = 'repo_uj' and status = 'posted';
