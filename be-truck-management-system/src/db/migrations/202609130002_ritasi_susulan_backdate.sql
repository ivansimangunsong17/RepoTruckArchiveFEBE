-- Ritasi susulan/backdate (Phase 2): penanda untuk ritasi yang benar-benar terjadi tapi baru
-- dicatat belakangan -- independen dari entry_source historis (backfill massal, admin-only) yang
-- sudah ada. Default false untuk semua ritasi lama maupun baru, tidak mengubah perilaku existing.
alter table container_jobs
  add column if not exists is_backdate_entry boolean not null default false,
  add column if not exists backdate_reason text,
  add column if not exists created_as_correction boolean not null default false;

-- Phase 4: penanda item komisi sopir yang masuk sebagai "komisi susulan" karena periode
-- mingguan aslinya sudah approved/paid saat ritasi susulan ini baru selesai dicatat. Item ini
-- tetap dimasukkan ke batch yang sedang dibuat (bukan membuka lagi batch lama), tapi ditandai
-- terpisah supaya tampil dengan label "Ritasi Susulan" dan mudah dibedakan dari item batch normal.
alter table driver_commission_items
  add column if not exists is_backdate_commission boolean not null default false;
