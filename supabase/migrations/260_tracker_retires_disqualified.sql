-- 260: A DISQUALIFIED VIDEO LEAVES THE TRACKER (24 Sep 2026)
--
-- Ethan: "The video tracker seems to be still showing the disqualified video...
-- ensure that only the live videos are actually showing up."
--
-- Disqualifying moves the entry to submission_disqualifications and DELETES the
-- submission. tracked_videos.submission_id is ON DELETE SET NULL, so the row
-- lost its link - and the retire step only looked at rows that still HAD one
-- (`t.submission_id is not null`). A disqualified video therefore kept
-- qualifying for ever: four were on the tracker, including a 288.9k one.
--
-- An automatic row (not 'manual', not from the historical log) whose entry no
-- longer exists stops qualifying now, on every sync, and the four already
-- stranded are retired below.

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

  -- Rows that no longer qualify: dropped under the line, OR their entry is gone
  -- (a disqualification deletes it and the FK nulls submission_id). Rows from
  -- the historical log and rows added by hand are never touched here.
  update public.tracked_videos t
     set qualifies = false
   where t.reason <> 'manual'
     and t.history_id is null
     and t.qualifies
     and (t.submission_id is null
          or not exists (select 1 from _tv_picked pk where pk.submission_id = t.submission_id));
  get diagnostics v_dropped = row_count;

  return json_build_object(
    'threshold', v_threshold,
    'added',     v_added,
    'updated',   v_updated,
    'dropped',   v_dropped
  );
end;
$function$;

update public.tracked_videos
   set qualifies = false
 where submission_id is null and history_id is null and reason <> 'manual' and qualifies;
