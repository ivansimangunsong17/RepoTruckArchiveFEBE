-- Backend pagination and filtering for the Archive Activity Log.
-- Run after 202606230001_archive_authorization_hardening.sql.

create or replace function public.get_activity_logs_page(
  p_query text default '',
  p_role text default '',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id bigint,
  activity_time timestamptz,
  actor_id uuid,
  user_name text,
  user_role text,
  action text,
  module text,
  target text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    log.id,
    log.created_at as activity_time,
    log.actor_id,
    coalesce(profile.full_name, 'System') as user_name,
    coalesce(profile.role::text, 'system') as user_role,
    log.action,
    log.module,
    log.description as target,
    count(*) over() as total_count
  from public.activity_logs log
  left join public.profiles profile on profile.id = log.actor_id
  where public.current_user_role() = 'admin'
    and (
      coalesce(trim(p_role), '') = ''
      or profile.role::text = lower(trim(p_role))
    )
    and (
      coalesce(trim(p_query), '') = ''
      or profile.full_name ilike '%' || trim(p_query) || '%'
      or log.action ilike '%' || trim(p_query) || '%'
      or log.module ilike '%' || trim(p_query) || '%'
      or log.description ilike '%' || trim(p_query) || '%'
    )
  order by log.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_activity_logs_page(text, text, integer, integer) from public;
grant execute on function public.get_activity_logs_page(text, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
