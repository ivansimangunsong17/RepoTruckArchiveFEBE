-- UJ (uang jalan/journey money) sebelumnya SELALU dihitung live dari destination_locations
-- setiap kali query finance/RPUJ dijalankan, untuk semua job selesai tanpa batas umur -- artinya
-- mengedit rate UJ destinasi hari ini diam-diam mengubah margin/UJ job yang sudah lama selesai.
-- Kolom di bawah membekukan UJ satu kali per job (biasanya saat pertama kali masuk running),
-- supaya nilai historis tidak lagi ikut berubah kalau master destination diedit belakangan.
alter table container_jobs
  add column if not exists uj_amount_snapshot numeric(14, 0),
  add column if not exists uj_source_destination_id uuid references destination_locations(id),
  add column if not exists uj_snapshot_at timestamptz,
  add column if not exists uj_snapshot_source text;
-- uj_snapshot_source: 'destination_master' (dibekukan otomatis dari master saat freeze)
--   atau 'admin_correction' (dikoreksi manual lewat mode koreksi admin). null = job lama,
--   belum pernah punya snapshot -- dashboard/invoice akan fallback ke rate master saat ini
--   dan menandainya perlu review.
