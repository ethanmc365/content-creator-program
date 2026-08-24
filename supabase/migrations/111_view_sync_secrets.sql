-- ============================================================================
-- 111 - one place for the two credentials automatic views needs
--
-- YouTube joined the list of platforms that cannot be read from a server. It is
-- readable from a normal connection, but YouTube bot-blocks datacenter ranges:
-- from Deno Deploy the watch page comes back as a 1.2 MB shell with an empty
-- <title> and no count, and every innertube client answers "Sign in to confirm
-- you're not a bot". The fix is the official Data API v3, which is free, needs
-- no review, and costs 1 unit of a 10,000/day quota per lookup - so roughly
-- 10,000 entries a day against a programme that has forty.
--
-- That makes two admin-supplied credentials (Instagram session, YouTube key),
-- so migration 109's single-purpose pair of functions becomes a small keyed
-- store. Same guarantees: written by admins, read only by service_role, never
-- readable back through the API.
-- ============================================================================
set check_function_bodies = off;

-- Only these names may be written. An allowlist rather than free-form keys so a
-- definer function that writes to a private table can never be pointed at
-- something it was not meant to touch.
create or replace function public.set_view_sync_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can set view sync credentials';
  end if;
  if p_name not in ('instagram_sessionid', 'youtube_api_key') then
    raise exception 'Unknown credential %', p_name;
  end if;

  insert into private.config (key, value)
  values (p_name, nullif(btrim(p_value), ''))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke execute on function public.set_view_sync_secret(text, text) from public, anon;
grant execute on function public.set_view_sync_secret(text, text) to authenticated;

-- Read both in one round trip. service_role only: it bypasses RLS but still
-- cannot reach the `private` schema over PostgREST, which is not exposed, so a
-- definer function in `public` is the only doorway and only the Edge Function
-- holds the key to it.
create or replace function public.get_view_sync_secrets()
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (where value is not null),
    '{}'::jsonb
  )
  from private.config
  where key in ('instagram_sessionid', 'youtube_api_key');
$$;

revoke execute on function public.get_view_sync_secrets() from public, anon, authenticated;
grant execute on function public.get_view_sync_secrets() to service_role;

-- The status readout gains the YouTube key, still reporting only PRESENCE.
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
    'youtube_key',       coalesce((select btrim(value) <> '' from private.config where key = 'youtube_api_key'), false),
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

-- Superseded by the keyed pair above.
drop function if exists public.set_instagram_session(text);
drop function if exists public.get_instagram_session();
