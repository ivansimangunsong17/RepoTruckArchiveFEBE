-- Penanda "dikerjakan oleh vendor" di Sales Order (Phase 1: pencatatan saja).
-- Default false untuk semua order lama maupun baru -- Sales tidak perlu memilih apa pun,
-- order tetap berjalan seperti biasa (ritasi/UJ/rekening dropping/dll) kecuali dicentang manual.
alter table sales_orders
  add column if not exists is_vendor_order boolean not null default false,
  add column if not exists vendor_name text,
  add column if not exists vendor_note text;
