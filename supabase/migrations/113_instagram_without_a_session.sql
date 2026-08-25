-- ============================================================================
-- 113 - Instagram without a session, and the session deleted
--
-- Instagram showed the Tryp.com UK account a warning that it suspected
-- automated behaviour and that the account could be disabled. The account is
-- not worth a view count, so the session cookie is DELETED here, the field is
-- gone from the admin panel, and nothing replaces it.
--
-- What replaces the ROUTE is the data a signed-out visitor already sees: the
-- public reels tab of a public profile states a view count under every reel.
-- The Edge Function now reads Meta's own logged-out desktop query for that tab
-- (POST /api/graphql, one header - Sec-Fetch-Site: same-origin - and no cookie
-- of any kind), matches the entry by its shortcode, and takes `play_count`.
-- Measured exact against seven known entries and against a creator whose public
-- page hides its counts.
--
-- The only thing left to keep is Meta's persisted-query ids, which rotate. They
-- are not secrets, but they live in the same keyed store so that a rotation is
-- a paste into the connections panel instead of a redeploy. Each accepts a
-- COMMA-SEPARATED list, tried in order, so a new id can be added before the old
-- one dies.
-- ============================================================================
set check_function_bodies = off;

-- The cookie itself, gone. Not blanked - removed.
delete from private.config where key = 'instagram_sessionid';

-- Allowlist follows: the session name is no longer writable at all, so the
-- field cannot come back by accident.
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
  if p_name not in ('youtube_api_key', 'instagram_reels_doc_id', 'instagram_post_doc_id') then
    raise exception 'Unknown credential %', p_name;
  end if;

  insert into private.config (key, value)
  values (p_name, nullif(btrim(p_value), ''))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke execute on function public.set_view_sync_secret(text, text) from public, anon;
grant execute on function public.set_view_sync_secret(text, text) to authenticated;

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
  where key in ('youtube_api_key', 'instagram_reels_doc_id', 'instagram_post_doc_id');
$$;

revoke execute on function public.get_view_sync_secrets() from public, anon, authenticated;
grant execute on function public.get_view_sync_secrets() to service_role;

-- The status readout loses `instagram_session` and gains `instagram_auth`, which
-- is a constant. It is reported rather than dropped so the panel can say "none
-- needed" out loud, instead of leaving a silent gap where a credential used to
-- be and letting an admin wonder what they forgot to paste.
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
    'run',       coalesce((select value from public.app_settings where key = 'view_sync_run'), '{"running": false}'::jsonb),
    'instagram_auth', 'none_required',
    'instagram_query_pinned', coalesce((select btrim(value) <> '' from private.config where key = 'instagram_reels_doc_id'), false),
    'youtube_key',    coalesce((select btrim(value) <> '' from private.config where key = 'youtube_api_key'), false),
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

-- Entries parked on a dead session should be retried now, not left claiming a
-- credential problem that no longer exists. Clearing the error is enough: the
-- sweep reads by staleness, and these are the stalest rows there are.
update public.submissions
   set views_sync_error = null
 where views_sync_error in ('needs_session', 'session_expired', 'trial_reel');

comment on column public.submissions.views_sync_error is
  'Why the last read produced nothing: no_video_id, not_a_video, not_on_reels_tab, blocked, no_count_in_page, needs_key, fetch_failed, unsupported, bad_url. Null when the last read was clean.';
