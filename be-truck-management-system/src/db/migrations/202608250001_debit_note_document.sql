alter table sales_orders
  add column if not exists debit_note_document_uploaded_at timestamptz,
  add column if not exists debit_note_document_uploaded_by_name text;
