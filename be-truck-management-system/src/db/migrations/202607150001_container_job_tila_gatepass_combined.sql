alter table container_jobs
  add column if not exists tila_gatepass_document_number text,
  add column if not exists tila_gatepass_migration_note text;

update container_jobs
set tila_gatepass_document_number = coalesce(
      nullif(btrim(tila_gatepass_document_number), ''),
      nullif(btrim(unloading_voucher_number), ''),
      nullif(btrim(weighing_document_number), '')
    ),
    tila_gatepass_migration_note = case
      when nullif(btrim(unloading_voucher_number), '') is not null
        and nullif(btrim(weighing_document_number), '') is not null
        and nullif(btrim(unloading_voucher_number), '') <> nullif(btrim(weighing_document_number), '')
      then concat(
        'Migrasi TILA/Gatepass: nilai lama No. TILA / Delivery Card = ',
        unloading_voucher_number,
        '; nilai lama No. Gatepass / SP2 = ',
        weighing_document_number
      )
      else tila_gatepass_migration_note
    end
where nullif(btrim(tila_gatepass_document_number), '') is null;
