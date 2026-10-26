-- DRY-RUN audit pasangan sopir default truck (vehicles.default_driver_id vs default_driver_name).
-- READ ONLY: transaksi dibuka read only dan selalu di-rollback; tidak ada INSERT/UPDATE/DELETE.
-- Kolom "usulan" hanya kandidat untuk dikonfirmasi manusia -- BUKAN keputusan otomatis.
--
-- Jalankan (contoh): psql -h <host> -p <port> -U <user_readonly> -d <db> -f scripts/audit-truck-default-driver.sql

begin transaction read only;

with active_vehicles as (
  select v.id, v.unit_code, v.plate_number, v.operational_status,
         v.default_driver_id, nullif(btrim(v.default_driver_name), '') as stored_name
  from vehicles v
  where v.archived_at is null
),
id_holders as (
  select default_driver_id, count(*) as holder_count
  from active_vehicles
  where default_driver_id is not null
  group by default_driver_id
),
name_candidates as (
  select av.id as vehicle_id,
         count(d.id) as exact_name_matches,
         (array_agg(d.id order by d.created_at))[1] as single_candidate_id,
         string_agg(d.name || ' [' || coalesce(d.operational_status, '-') || ']', ', ' order by d.name) as candidate_names
  from active_vehicles av
  left join drivers d
    on d.archived_at is null
   and av.stored_name is not null
   and (lower(btrim(d.name)) = lower(av.stored_name) or lower(btrim(coalesce(d.nickname, ''))) = lower(av.stored_name))
  group by av.id
)
select
  av.unit_code                                   as unit,
  av.plate_number                                as plat,
  av.default_driver_id                           as id_tersimpan,
  id_driver.name                                 as nama_dari_id,
  id_driver.operational_status                   as status_sopir_id,
  av.stored_name                                 as nama_tersimpan,
  case
    when av.default_driver_id is null and av.stored_name is null then 'KOSONG'
    when av.default_driver_id is null then 'LEGACY_TANPA_ID'
    when id_driver.id is null then 'ID_TIDAK_DITEMUKAN_ATAU_ARSIP'
    when av.stored_name is null then 'NAMA_KOSONG'
    when lower(btrim(id_driver.name)) <> lower(av.stored_name)
     and lower(btrim(coalesce(id_driver.nickname, ''))) <> lower(av.stored_name) then 'NAMA_TIDAK_SESUAI_ID'
    else 'SINKRON'
  end                                            as kondisi,
  nc.exact_name_matches                          as jumlah_sopir_bernama_sama,
  nc.candidate_names                             as kandidat_dari_nama,
  case
    when av.default_driver_id is not null and id_driver.id is not null
      then 'Pertahankan ID -> nama ' || id_driver.name || ' (KONFIRMASI bila kondisi bukan SINKRON)'
    when av.default_driver_id is null and nc.exact_name_matches = 1
      then 'Kandidat ID ' || nc.single_candidate_id || ' (KONFIRMASI)'
    when av.default_driver_id is null and nc.exact_name_matches > 1
      then 'Ambigu: lebih dari satu sopir bernama sama (KONFIRMASI MANUAL)'
    when av.default_driver_id is null and av.stored_name is not null
      then 'Tidak ada sopir cocok: pilih sopir atau kosongkan (KONFIRMASI)'
    else '-'
  end                                            as usulan,
  concat_ws('; ',
    case when ih.holder_count > 1 then 'ID sopir dipakai ' || ih.holder_count || ' unit' end,
    case when id_driver.operational_status in ('Cuti', 'Tidak Aktif', 'Blacklist')
      then 'Sopir ID berstatus ' || id_driver.operational_status end,
    case when av.default_driver_id is null and nc.single_candidate_id is not null
           and exists (select 1 from active_vehicles other
                       where other.default_driver_id = nc.single_candidate_id)
      then 'Kandidat nama sudah menjadi default unit lain' end,
    case when av.default_driver_id is not null and nc.exact_name_matches >= 1
           and lower(btrim(id_driver.name)) <> lower(coalesce(av.stored_name, ''))
      then 'Nama tersimpan menunjuk sopir lain: ' || nc.candidate_names end,
    case when av.operational_status in ('Maintenance', 'Tidak Aktif')
      then 'Unit berstatus ' || av.operational_status end
  )                                              as konflik
from active_vehicles av
left join drivers id_driver on id_driver.id = av.default_driver_id and id_driver.archived_at is null
left join id_holders ih on ih.default_driver_id = av.default_driver_id
left join name_candidates nc on nc.vehicle_id = av.id
where not (
  av.default_driver_id is not null
  and id_driver.id is not null
  and (lower(btrim(id_driver.name)) = lower(coalesce(av.stored_name, ''))
       or lower(btrim(coalesce(id_driver.nickname, ''))) = lower(coalesce(av.stored_name, '')))
  and coalesce(ih.holder_count, 1) = 1
  and id_driver.operational_status not in ('Cuti', 'Tidak Aktif', 'Blacklist')
)
  and not (av.default_driver_id is null and av.stored_name is null)
order by av.unit_code, av.plate_number;

rollback;
