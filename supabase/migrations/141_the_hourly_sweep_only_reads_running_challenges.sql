-- THE DEADLINE ENDS THE AUTOMATIC READING.
--
-- Ethan: "whenever a challenge ends, it shouldn't automatically sync the view
-- counts anymore. Although pressing the sync button should still sync them."
--
-- The sweep used to POST `{}`, which tells the view-sync function "work out for
-- yourself what is worth reading" - and its rule is "not published, and ended
-- less than a month ago". So an ended challenge kept being re-read for thirty
-- days, and the figure somebody screenshotted on Monday was not the figure they
-- were judged on by Wednesday.
--
-- WHICH challenges to read is a scheduling decision, so it belongs to the
-- scheduler rather than to the reader - which is also why this needed no edge
-- function redeploy. It now names each still-running challenge explicitly. A run
-- that NAMES a challenge bypasses the function's own eligibility rule entirely
-- (it filters submissions by that id directly), which is what keeps "Sync now"
-- working on an ENDED challenge - exactly the moment an admin wants one last
-- read before publishing winners.
--
-- One POST per live challenge rather than one for everything: they chunk and
-- chain independently, so with several markets running at once no challenge can
-- starve behind another's backlog. The shared progress row is last-writer-wins,
-- which is cosmetic - counts are written per submission and are idempotent.
--
-- `supabase/functions/view-sync/index.ts` carries the same rule now as a second
-- line of defence, and will pick it up whenever that function is next deployed.
create or replace function public.run_view_sync(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'extensions'
as $function$
declare
  cfg     jsonb := coalesce((select value from public.app_settings where key = 'view_sync'), '{}'::jsonb);
  enabled boolean := coalesce((cfg ->> 'enabled')::boolean, true);
  secret  text := (select value from private.config where key = 'webhook_secret');
  v_ch    record;
  v_fired int := 0;
begin
  if not p_force and not enabled then
    return jsonb_build_object('fired', false, 'reason', 'disabled');
  end if;

  if not p_force and public.view_sync_running() then
    return jsonb_build_object('fired', false, 'reason', 'already_running');
  end if;

  for v_ch in
    select id from public.challenges
     where winners_published_at is null
       and end_date >= current_date          -- ending TODAY still counts as running
       and coalesce(status, '') <> 'draft'
     order by end_date
  loop
    perform net.http_post(
      url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/view-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(secret, '')
      ),
      body := jsonb_build_object('challenge_id', v_ch.id)
    );
    v_fired := v_fired + 1;
  end loop;

  if v_fired = 0 then
    return jsonb_build_object('fired', false, 'reason', 'no_running_challenge');
  end if;
  return jsonb_build_object('fired', true, 'challenges', v_fired);
end;
$function$;

notify pgrst, 'reload schema';
