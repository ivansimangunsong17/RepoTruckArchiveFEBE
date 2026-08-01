alter table master_viewer_notes
  add column if not exists document_key text not null default 'general';

alter table master_viewer_notes
  drop constraint if exists master_viewer_notes_resource_entity_id_key;

create unique index if not exists idx_master_viewer_notes_unique_document
  on master_viewer_notes(resource, entity_id, document_key);
