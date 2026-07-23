-- ============================================================================
-- 060 - daily-puzzle reminders, public community map, prize baseline
--
--   * Two new push reminders for the daily puzzles (Guess the Country / Flight
--     Path), sent via the normal notifications pipeline:
--       - daily_streak  (6pm UK): "your streak is at risk" - only to creators
--         who have a streak going (played yesterday) and have NOT played today.
--         Default ON (opt-out).
--       - daily_reminder (10am UK): a plain "come play today's puzzle" nudge -
--         only to creators who explicitly opt in via the settings toggle.
--         Default OFF (opt-in).
--   * public_creator_map(): an anon-safe RPC for the landing page - active
--     creators with a home location (+ their current/upcoming trips) so the
--     public page can show the community world map.
--   * landing_stats(): prizes now start from a £500 baseline (challenges we ran
--     on WhatsApp before the platform) plus everything distributed on-platform;
--     the creator count now excludes test accounts.
-- ============================================================================
set check_function_bodies = off;

-- --- Allow the two new notification types -----------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'challenge','announcement','results','reward','deadline','connection','dm',
    'event','application','chat','submission','deletion','referral','new_member',
    'inactive','feedback','collab','mention','daily_streak','daily_reminder'
  ));

-- --- Daily-puzzle reminders --------------------------------------------------
-- "Today" in the same integer day-key the client stores (days since the epoch,
-- rolling at midnight Europe/London). The daily puzzles are the modes that carry
-- a day_key with no event: 'zip' (Flight Path) and 'pinpoint' (Guess the Country).
create or replace function public.send_daily_puzzle_reminders(kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   int := ((now() at time zone 'Europe/London')::date - date '1970-01-01');
  v_type    text;
  v_title   text;
  v_body    text;
begin
  if kind = 'streak' then
    v_type  := 'daily_streak';
    v_title := 'Keep your streak alive 🔥';
    v_body  := 'You have a daily puzzle streak going. Play today''s puzzle before midnight to keep it.';
  elsif kind = 'reminder' then
    v_type  := 'daily_reminder';
    v_title := 'Today''s puzzles are live 🧩';
    v_body  := 'Guess the Country and land the plane in Flight Path. Can you keep a perfect run going?';
  else
    return;
  end if;

  insert into public.notifications (recipient_id, type, title, body, link)
  select p.id, v_type, v_title, v_body, '/game'
  from public.profiles p
  where p.status = 'active'
    and not p.is_admin
    and coalesce(p.is_test, false) = false
    and p.deletion_requested_at is null
    -- Channel preference: streak defaults ON (opt-out), reminder defaults OFF
    -- (opt-in). We only ever insert a row (and thus a push) for eligible users.
    and (
      (kind = 'streak'   and coalesce((p.notif_prefs ->> 'daily_streak')::boolean, true)  = true)
      or
      (kind = 'reminder' and coalesce((p.notif_prefs ->> 'daily_reminder')::boolean, false) = true)
    )
    -- Not already played a daily puzzle today.
    and not exists (
      select 1 from public.game_scores g
      where g.player_id = p.id and g.event_id is null
        and g.mode in ('zip','pinpoint') and g.day_key = v_today
    )
    -- Streak reminder only: they must have a streak (played yesterday).
    and (
      kind <> 'streak'
      or exists (
        select 1 from public.game_scores g
        where g.player_id = p.id and g.event_id is null
          and g.mode in ('zip','pinpoint') and g.day_key = v_today - 1
      )
    )
    -- Guard against a double-send if the cron re-fires the same day.
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = p.id and n.type = v_type
        and n.created_at > now() - interval '20 hours'
    );
end;
$$;
revoke execute on function public.send_daily_puzzle_reminders(text) from public, anon, authenticated;

-- Schedule (pg_cron runs in UTC). Times chosen for UK summer (BST = UTC+1):
--   10:00 BST ≈ 09:00 UTC, 18:00 BST = 17:00 UTC. In winter they drift ~1h.
do $$ begin perform cron.unschedule('daily-puzzle-reminder'); exception when others then null; end $$;
select cron.schedule('daily-puzzle-reminder', '0 9 * * *',  $$select public.send_daily_puzzle_reminders('reminder')$$);
do $$ begin perform cron.unschedule('daily-streak-reminder'); exception when others then null; end $$;
select cron.schedule('daily-streak-reminder', '0 17 * * *', $$select public.send_daily_puzzle_reminders('streak')$$);

-- --- Public community map (anon-safe) ---------------------------------------
create or replace function public.public_creator_map()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'creators', coalesce((
      select json_agg(row_to_json(c)) from (
        select p.id, p.name, p.photo_url, p.bio, p.city, p.country,
               p.city_lat, p.city_lng,
               coalesce(array_length(p.countries_visited, 1), 0) as countries
        from public.profiles p
        where p.status = 'active' and not p.is_admin
          and coalesce(p.is_test, false) = false
          and p.deletion_requested_at is null
          and p.city_lat is not null and p.city_lng is not null
      ) c
    ), '[]'::json),
    'trips', coalesce((
      select json_object_agg(creator_id, trips) from (
        select cp.creator_id,
               json_agg(json_build_object(
                 'city', cp.city, 'country', cp.country,
                 'start_date', cp.start_date, 'end_date', cp.end_date
               ) order by cp.start_date) as trips
        from public.collab_posts cp
        join public.profiles p on p.id = cp.creator_id
        where cp.end_date >= current_date
          and p.status = 'active' and coalesce(p.is_test, false) = false
          and p.deletion_requested_at is null
        group by cp.creator_id
      ) t
    ), '{}'::json)
  );
$$;
grant execute on function public.public_creator_map() to anon, authenticated;

-- --- Prize baseline + accurate creator count --------------------------------
create or replace function public.landing_stats()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object(
    'creators',   (select count(*) from public.profiles
                   where status = 'active' and not is_admin and coalesce(is_test,false) = false
                     and deletion_requested_at is null),
    'challenges', (select count(*) from public.challenges where status <> 'draft'),
    -- £500 baseline from challenges we ran before the platform, plus everything
    -- distributed on-platform since.
    'prizes',     500 + (select coalesce(sum(amount), 0) from public.rewards where status = 'distributed')
  );
$$;
grant execute on function public.landing_stats() to anon, authenticated;
