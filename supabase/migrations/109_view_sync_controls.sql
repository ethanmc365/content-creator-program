-- ============================================================================
-- 109 - the controls for automatic views: Instagram session + status readout
--
-- The Instagram sessionid lives in private.config rather than as an Edge
-- Function secret. Both are equally hidden from the API (private.config is RLS
-- on with zero policies, so it is service-role only, exactly like the webhook
-- secret it sits beside), but a cookie EXPIRES, and a value an admin can
-- replace from /admin/challenges without a redeploy is the difference between
-- a two minute fix and a job for whoever has the Supabase login.
-- ============================================================================
set check_function_bodies = off;

-- Admin writes it; nobody reads it back through the API.
create or replace function public.set_instagram_session(p_session text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can set the Instagram session';
  end if;
  insert into private.config (key, value)
  values ('instagram_sessionid', nullif(btrim(p_session), ''))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke execute on function public.set_instagram_session(text) from public, anon;
grant execute on function public.set_instagram_session(text) to authenticated;

-- Read it back for the Edge Function only. service_role bypasses RLS but still
-- cannot reach the `private` schema over PostgREST, which is not exposed - so a
-- definer function in `public` is the doorway, and only service_role holds the
-- key to it.
create or replace function public.get_instagram_session()
returns text
language sql
security definer
set search_path = public, private
as $$
  select value from private.config where key = 'instagram_sessionid';
$$;

revoke execute on function public.get_instagram_session() from public, anon, authenticated;
grant execute on function public.get_instagram_session() to service_role;

-- One admin-only readout for the panel: the schedule, the last sweep, whether a
-- session is present (never the cookie itself) and how the entries are doing.
create or replace function public.view_sync_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can read the view sync status';
  end if;

  select jsonb_build_object(
    'settings',  coalesce((select value from public.app_settings where key = 'view_sync'), '{"enabled": true, "interval_hours": 24}'::jsonb),
    'last_run',  (select value from public.app_settings where key = 'view_sync_last_run'),
    'instagram_session', coalesce((select btrim(value) <> '' from private.config where key = 'instagram_sessionid'), false),
    'entries', (
      select jsonb_build_object(
        'total',      count(*),
        'automatic',  count(*) filter (where views_source <> 'manual'),
        'needing_attention', count(*) filter (where views_sync_error is not null)
      )
      from public.submissions s
      join public.challenges c on c.id = s.challenge_id
      where c.winners_published_at is null and c.end_date >= now() - interval '30 days'
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.view_sync_status() from public, anon;
grant execute on function public.view_sync_status() to authenticated;
