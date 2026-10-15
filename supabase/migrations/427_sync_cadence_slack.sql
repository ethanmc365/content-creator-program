-- 427: A SYNC INTERVAL MEANS WHAT IT SAYS (15 Oct 2026).
--
-- vip-sync runs at :37 every hour and reads videos "older than 2 hours". A video read at 13:37:20 is 1h59m40s old when
-- the 15:37:00 tick counts what is due, so it waited for 16:37: the 2-hour setting was a 3-hour cadence (measured: the
-- 15:37 run found nothing due and the 254 videos read at 13:37 sat until the next hour). view-sync's own stale filter
-- now allows a quarter of an hour of slack (supabase/functions/view-sync, STALE_SLACK_MS); this is the same allowance
-- in the SQL that decides whether to fire at all, so the two never disagree.

CREATE OR REPLACE FUNCTION public.vip_run_sync(p_force boolean DEFAULT false, p_programme uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions'
AS $function$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  v_hours numeric := coalesce((select (value ->> 'interval_hours')::numeric from public.app_settings where key = 'vip_sync'), 12);
  v_age interval;
  v_due int;
begin
  v_age := greatest(v_hours * interval '1 hour' - interval '15 minutes', v_hours * interval '30 minutes');
  select count(*) into v_due from public.vip_videos v
   where v.status = 'tracking' and (p_programme is null or v.programme_id = p_programme)
     and v.submitted_at >= public.vip_read_cutoff()
     and (p_force or v.views_synced_at is null or v.views_synced_at < now() - v_age);
  if v_due = 0 then return jsonb_build_object('fired', false, 'reason', 'nothing_due'); end if;
  perform net.http_post(
    url := public.edge_function_url('view-sync'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := jsonb_build_object('vip_only', true, 'force', p_force, 'vip_interval_hours', v_hours)
  );
  return jsonb_build_object('fired', true, 'due', v_due);
end $function$;

select lock_down_definer_functions();

-- ONE FACEBOOK PHOTO POST, CHECKED BY HAND. Evelin Salinas's /share/p/ entry in RETO OCTUBRE ESPAÑA is eighteen photos
-- and no video (read from a residential connection on 15 Oct: 18 "__typename":"Photo", 0 "Video"). From any server
-- Facebook shows the post only behind its login page, so the sync could never say so itself and asked all sixteen
-- regions every hour. A photo post has no view count anywhere; the team can type one from her Insights if it counts.
update public.submissions
   set views_sync_error = 'not_a_video'
 where id = 'a43539a7-0b05-4424-9063-9920a46d1fa4' and views_sync_error = 'blocked';
