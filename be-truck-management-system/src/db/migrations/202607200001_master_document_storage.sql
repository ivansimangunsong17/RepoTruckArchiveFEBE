alter table vehicle_documents drop constraint if exists vehicle_documents_document_type_check;
alter table vehicle_documents add constraint vehicle_documents_document_type_check
  check (document_type in (
    'KIR_HEAD',
    'KIR_BUNTUT',
    'STNK',
    'PAJAK',
    'ASURANSI',
    'KEPEMILIKAN',
    'FOTO',
    'OTHER'
  ));

alter table vehicles add column if not exists insurance_company text;
alter table vehicles add column if not exists insurance_policy_number text;
alter table vehicles add column if not exists insurance_expiry_date date;
alter table vehicles add column if not exists insurance_document jsonb;
alter table vehicles add column if not exists ownership_document jsonb;
alter table vehicles add column if not exists photo_document jsonb;
alter table vehicles add column if not exists other_document jsonb;

alter table kir_chassis add column if not exists identity_document jsonb;
alter table kir_chassis add column if not exists ownership_document jsonb;
alter table kir_chassis add column if not exists insurance_document jsonb;
alter table kir_chassis add column if not exists photo_document jsonb;
alter table kir_chassis add column if not exists other_document jsonb;

alter table drivers add column if not exists certificate_document jsonb;
alter table drivers add column if not exists other_document jsonb;

alter table customers add column if not exists company_profile_document jsonb;
alter table customers add column if not exists legal_document jsonb;
alter table customers add column if not exists other_document jsonb;
