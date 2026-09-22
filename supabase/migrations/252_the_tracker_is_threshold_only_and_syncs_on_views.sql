-- 252: THE VIDEO TRACKER IS THRESHOLD-ONLY, AND RUNS WHEN VIEWS ACTUALLY SYNC.
--
-- Ethan: "it updates every 10 mins which is not necessary, it should only
-- update when views are synced in a challenge. Also it's tracking disqualified
-- videos too, but they should not be tracked... scrap what I said about podium
-- videos, it should only be videos that get over 10k views that appear here."
--
-- Three changes, reversing part of migration 249:
--
-- 1. NO MORE PODIUM. `tracked_video_candidates` drops the `podium_place` /
--    `seats` / `ended` / board-rank machinery entirely - a video qualifies on
--    ONE rule now, `views >= threshold`. `top_per_challenge` is no longer read
--    from `app_settings.video_tracker` or written into `tracked_videos.rank`.
--
-- 2. NO MORE TIMER. The `*/10 * * * *` cron is unscheduled. Instead,
--    `trg_track_video_on_views_synced` fires `sync_tracked_videos_internal()`
--    the moment a submission's `logged_views` actually changes - the hourly
--    sweep, a forced "Sync now", and a manual view-count edit all go through
--    that one column, so the tracker is never more than one sync behind
--    reality without polling for one. `trg_challenge_tracker_sync` (a
--    challenge ending / winners publishing) stays - that is still a real
--    reason to resync and is not a timer.
--
-- 3. A DISQUALIFIED VIDEO STOPS BEING TRACKED IMMEDIATELY. `disqualify_submission`
--    deletes the `submissions` row, which already makes the video fail to be a
--    CANDIDATE on the next sync - the gap was that nothing ran that sync right
--    away once the cron was removed. Both `disqualify_submission` and
--    `reinstate_submission` now call the sync directly, in the same
--    exception-swallowing style as the rest of this file (a bookkeeping side
--    effect must never abort the action it follows).
--
-- Ends by running the sync once, so the historical UK entries that only
-- qualified as "podium" (and were always under 10k) drop off immediately
-- rather than waiting for the next views update.

drop function if exists public.tracked_video_candidates(bigint, integer);

create or replace function public.tracked_video_candidates(p_threshold bigint)
 returns table(
   submission_id uuid, challenge_id uuid, community_id uuid, creator_id uuid,
   creator_name text, creator_handle text, platform text, video_url text,
   platform_video_id text, views bigint, views_source text,
   views_synced_at timestamptz, posted_at timestamptz, caption text
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select
    s.id as submission_id,
    s.challenge_id,
    coalesce(s.community_id, c.community_id) as community_id,
    s.creator_id,
    p.name as creator_name,
    case s.platform
      when 'Instagram' then public.handle_from_url(p.instagram_url)
      when 'TikTok'    then public.handle_from_url(p.tiktok_url)
      when 'YouTube'   then public.handle_from_url(p.youtube_url)
      when 'Facebook'  then public.handle_from_url(p.facebook_url)
      else null
    end as creator_handle,
    s.platform,
    s.video_url,
    s.platform_video_id,
    s.logged_views::bigint as views,
    s.views_source,
    s.views_synced_at,
    s.submitted_at as posted_at,
    s.caption
  from public.submissions s
  join public.challenges c on c.id = s.challenge_id
  left join public.profiles p on p.id = s.creator_id
  where s.logged_views is not null
    and s.logged_views >= p_threshold
$function$;
revoke all on function public.tracked_video_candidates(bigint) from public, anon, authenticated;

-- The arithmetic, unguarded, for the trigger.
create or replace function public.sync_tracked_videos_internal()
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_threshold bigint;
  v_added int := 0;
  v_updated int := 0;
  v_dropped int := 0;
begin
  -- One at a time: several submissions can sync in close succession.
  if not pg_try_advisory_xact_lock(hashtext('sync_tracked_videos')) then
    return json_build_object('skipped', 'already_running');
  end if;

  select coalesce((value->>'view_threshold')::bigint, 10000)
    into v_threshold
  from public.app_settings
  where key = 'video_tracker';
  v_threshold := coalesce(v_threshold, 10000);

  create temporary table if not exists _tv_picked on commit drop as
    select * from public.tracked_video_candidates(v_threshold) limit 0;
  truncate _tv_picked;
  insert into _tv_picked select * from public.tracked_video_candidates(v_threshold);

  with upserted as (
    insert into public.tracked_videos as t (
      submission_id, challenge_id, community_id, creator_id, creator_name, creator_handle,
      platform, video_url, platform_video_id, views, views_source, views_synced_at,
      posted_at, caption, hook, reason, rank, qualifies
    )
    select
      pk.submission_id, pk.challenge_id, pk.community_id, pk.creator_id, pk.creator_name, pk.creator_handle,
      pk.platform, pk.video_url, pk.platform_video_id, pk.views, pk.views_source, pk.views_synced_at,
      pk.posted_at, pk.caption, public.hook_from_caption(pk.caption),
      'threshold', null, true
    from _tv_picked pk
    on conflict (submission_id) do update set
      challenge_id      = excluded.challenge_id,
      community_id      = excluded.community_id,
      creator_id        = excluded.creator_id,
      creator_name      = excluded.creator_name,
      creator_handle    = coalesce(excluded.creator_handle, t.creator_handle),
      platform          = excluded.platform,
      video_url         = excluded.video_url,
      platform_video_id = coalesce(excluded.platform_video_id, t.platform_video_id),
      views             = excluded.views,
      views_source      = excluded.views_source,
      views_synced_at   = excluded.views_synced_at,
      posted_at         = coalesce(t.posted_at, excluded.posted_at),
      caption           = coalesce(excluded.caption, t.caption),
      hook              = case when t.hook_source = 'manual' then t.hook
                               else coalesce(excluded.hook, t.hook) end,
      reason            = case when t.reason = 'manual' then 'manual' else excluded.reason end,
      rank              = null,
      qualifies         = true
    -- Only rows that actually changed are written, so a quiet sync is a
    -- no-op rather than rewriting everything that already qualifies.
    where (t.views, t.views_synced_at, t.reason, t.rank, t.qualifies, t.caption, t.creator_name)
          is distinct from (excluded.views, excluded.views_synced_at, case when t.reason = 'manual' then 'manual' else excluded.reason end,
                            null, true, coalesce(excluded.caption, t.caption), excluded.creator_name)
    returning (xmax = 0) as was_insert
  )
  select
    count(*) filter (where was_insert),
    count(*) filter (where not was_insert)
  into v_added, v_updated
  from upserted;

  -- Rows that no longer qualify (dropped under the line, or their submission
  -- was deleted by a disqualification) keep everything and stop qualifying.
  update public.tracked_videos t
     set qualifies = false
   where t.submission_id is not null
     and t.reason <> 'manual'
     and t.qualifies
     and not exists (select 1 from _tv_picked pk where pk.submission_id = t.submission_id);
  get diagnostics v_dropped = row_count;

  return json_build_object(
    'threshold', v_threshold,
    'added',     v_added,
    'updated',   v_updated,
    'dropped',   v_dropped
  );
end;
$function$;
revoke all on function public.sync_tracked_videos_internal() from public, anon, authenticated;

-- THE MOMENT A VIDEO'S VIEWS ACTUALLY CHANGE - the hourly sweep, a forced
-- "Sync now", or an admin's own view-count edit all go through this column,
-- so this is the one signal for "views were synced" whichever path did it.
create or replace function public.trg_track_video_on_views_synced()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    perform public.sync_tracked_videos_internal();
  exception when others then
    raise warning 'video tracker sync after views changed on submission %: %', new.id, sqlerrm;
  end;
  return null;
end;
$function$;
revoke all on function public.trg_track_video_on_views_synced() from public, anon, authenticated;

drop trigger if exists trg_track_video_on_views_synced on public.submissions;
create trigger trg_track_video_on_views_synced
  after update of logged_views on public.submissions
  for each row
  when (old.logged_views is distinct from new.logged_views)
  execute function public.trg_track_video_on_views_synced();

-- NO MORE TEN-MINUTE TIMER.
select cron.unschedule(jobid) from cron.job where jobname = 'sync-video-tracker';

-- A DISQUALIFIED VIDEO DROPS OFF THE TRACKER RIGHT AWAY, not on the next
-- views sync (which might be a while, now that nothing polls on a timer).
create or replace function public.disqualify_submission(p_submission uuid, p_reason text, p_notify boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; v_title text;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    raise exception 'SANDBOX_READ_ONLY: this demo account cannot disqualify entries.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select * into s from public.submissions where id = p_submission for update;
  if not found then raise exception 'That entry no longer exists.'; end if;

  insert into public.submission_disqualifications (id, challenge_id, creator_id, snapshot, reason, disqualified_by)
  values (s.id, s.challenge_id, s.creator_id, to_jsonb(s), trim(p_reason), auth.uid())
  on conflict (id) do update set snapshot = excluded.snapshot, reason = excluded.reason,
    disqualified_by = excluded.disqualified_by, disqualified_at = now();

  delete from public.submissions where id = s.id;

  begin
    perform public.sync_tracked_videos_internal();
  exception when others then
    raise warning 'video tracker sync after disqualifying %: %', s.id, sqlerrm;
  end;

  if p_notify then
    select title into v_title from public.challenges where id = s.challenge_id;
    perform public.notify_user(s.creator_id, 'submission',
      'An entry was removed from ' || coalesce(v_title, 'the challenge'),
      left(trim(p_reason), 200),
      '/challenges/' || s.challenge_id);
  end if;
end;
$$;
revoke all on function public.disqualify_submission(uuid, text, boolean) from public, anon;
grant execute on function public.disqualify_submission(uuid, text, boolean) to authenticated;

create or replace function public.reinstate_submission(p_submission uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.submission_disqualifications%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    raise exception 'SANDBOX_READ_ONLY: this demo account cannot reinstate entries.';
  end if;
  select * into d from public.submission_disqualifications where id = p_submission for update;
  if not found then raise exception 'No disqualified entry with that id.'; end if;
  insert into public.submissions select * from jsonb_populate_record(null::public.submissions, d.snapshot);
  delete from public.submission_disqualifications where id = d.id;

  begin
    perform public.sync_tracked_videos_internal();
  exception when others then
    raise warning 'video tracker sync after reinstating %: %', d.id, sqlerrm;
  end;
end;
$$;
revoke all on function public.reinstate_submission(uuid) from public, anon;
grant execute on function public.reinstate_submission(uuid) to authenticated;

-- And once now, so the podium-only stragglers drop off immediately.
select public.sync_tracked_videos_internal();
