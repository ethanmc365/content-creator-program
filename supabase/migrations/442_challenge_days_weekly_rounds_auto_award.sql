-- ============================================================================
-- 442 - a challenge runs on whole days, in its own timezone
--
-- Ethan, 20 Oct 2026, planning the Winter/Autumn Global Challenge:
--   "For the start date and the end date, I don't think we necessarily need to have a time. The start date is just the
--    beginning of that day, and the end date is going to be the end of that date."
--   Video of the Week: "make it even clearer and have the ability to adjust how it is" and "at the end of the week, it
--    will pay out the reward or create the reward that I can then pay out."
--
-- What was wrong underneath:
--   * The form said "Times are London" but the picker was never saved; the Global market's timezone is UTC, the
--     archive cron used the market's clock, the countdown used the VIEWER's clock, and the streak bonus and the weekly
--     rounds used the raw timestamps. Four definitions of when a challenge starts and ends.
--   * The streak bonus counted windows of exactly N x 24h from the start TIMESTAMP and rounded the count UP. Over a
--     clock change (25 Oct) a 29-day challenge became 30 daily windows, the last one an hour long, so "post every day"
--     was unwinnable; "every week" over 29 days asked for 5 weeks (the last one a single day). It also counted the day a
--     video was ENTERED, not the day it was posted.
--   * Video of the Week rounds were 7 x 24h from the start timestamp, so after the clock change a "week" ended at 23:00.
--
-- Now:
--   challenges.timezone            the challenge's own clock (the form's picker), else the market's, else London.
--   challenges.opens_at/closes_at  start of the start date / end of the end date in that clock, kept by a trigger. The
--                                  archive cron, the countdown, the streak bonus and the weekly rounds all read these.
--   challenge_days(id)             tz, first day, number of days: the one definition of the challenge's calendar.
--   Streak bonus                   windows of N calendar days from the first day; a remainder shorter than half a window
--                                  joins the last one (the weekly prize's rule); a video counts on the day it was POSTED.
--   weekly_rounds                  whole days; `weekly_prize.round_ends` (last day of each round but the final one,
--                                  'YYYY-MM-DD') sets custom rounds; otherwise every `every_days`.
--   Auto award                     `weekly_prize.auto_award` (default true): when a round is frozen the reward is
--                                  created by itself, owed on Rewards & Payouts, and the team is told.
--   weekly_round_entries           skips the second half of a collab and test accounts.
--   weekly_prize_board             also returns the entry's thumbnail and platform id (the creator card shows the videos).
-- ============================================================================

-- ---------------------------------------------------------------- columns
alter table public.challenges add column if not exists timezone text;
alter table public.challenges add column if not exists opens_at timestamptz;
alter table public.challenges add column if not exists closes_at timestamptz;

create or replace function public.challenge_zone(p_tz text, p_community uuid)
returns text
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    nullif(trim(p_tz), ''),
    (select nullif(trim(m.timezone), '') from public.communities m where m.id = p_community),
    'Europe/London')
$$;

create or replace function public.challenge_set_days()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_tz text;
begin
  v_tz := public.challenge_zone(new.timezone, new.community_id);
  begin
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'Unknown timezone: %', v_tz;
  end;
  new.opens_at := case when new.start_date is null then null
                       else date_trunc('day', new.start_date at time zone v_tz) at time zone v_tz end;
  new.closes_at := case when new.end_date is null then null
                        else (date_trunc('day', new.end_date at time zone v_tz) + interval '1 day') at time zone v_tz end;
  return new;
end $$;

-- zz_: BEFORE triggers run in name order, so this sees any date another trigger set.
drop trigger if exists zz_challenge_days on public.challenges;
create trigger zz_challenge_days
  before insert or update of start_date, end_date, timezone, community_id on public.challenges
  for each row execute function public.challenge_set_days();

-- Five rows. Only the two new columns change, and no trigger listens to them.
update public.challenges c
   set opens_at = date_trunc('day', c.start_date at time zone public.challenge_zone(c.timezone, c.community_id))
                    at time zone public.challenge_zone(c.timezone, c.community_id),
       closes_at = (date_trunc('day', c.end_date at time zone public.challenge_zone(c.timezone, c.community_id)) + interval '1 day')
                    at time zone public.challenge_zone(c.timezone, c.community_id)
 where c.start_date is not null or c.end_date is not null;

-- THE GLOBAL CHALLENGE BEING PLANNED NOW is a London one (the form always said so); its market's clock is UTC.
update public.challenges set timezone = 'Europe/London'
 where id = '9f42a5f6-d4e4-4d50-8e5e-2fabab99dd63' and timezone is null;

-- The calendar of a challenge: its clock, its first day and how many days it runs (end date inclusive).
create or replace function public.challenge_days(p_challenge uuid)
returns table(tz text, d0 date, days integer, opens_at timestamptz, closes_at timestamptz)
language sql
stable
set search_path to 'public'
as $$
  select z.tz,
         (c.opens_at at time zone z.tz)::date,
         ((c.closes_at at time zone z.tz)::date - (c.opens_at at time zone z.tz)::date)::int,
         c.opens_at, c.closes_at
    from public.challenges c
    cross join lateral (select public.challenge_zone(c.timezone, c.community_id) as tz) z
   where c.id = p_challenge and c.opens_at is not null and c.closes_at is not null
$$;
revoke all on function public.challenge_days(uuid) from public, anon;
grant execute on function public.challenge_days(uuid) to authenticated;

-- ---------------------------------------------------------------- the archive closes at the end of the end date
create or replace function public.archive_ended_challenges()
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.challenges c
     set status = 'archived'
   where c.status = 'active'
     and c.closes_at is not null
     and now() >= c.closes_at;
$$;

-- ---------------------------------------------------------------- the streak bonus counts calendar days
do $patch$
declare
  d text := pg_get_functiondef('public.recalc_challenge_points_internal(uuid)'::regprocedure);
  pairs text[][] := array[
    array[
      E'  v_added     integer := 0;\nbegin',
      E'  v_added     integer := 0;\n  v_tz        text;\n  v_d0        date;\n  v_days      integer;\nbegin'
    ],
    array[
      E'  if v_community is null then return; end if;\n',
      E'  if v_community is null then return; end if;\n  -- 442: the challenge''s calendar (its clock, first day, number of days).\n  select x.tz, x.d0, x.days into v_tz, v_d0, v_days from public.challenge_days(p_challenge) x;\n'
    ],
    array[
      E'  if v_start is not null and v_end is not null and v_end > v_start then\n    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)\n    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true\n    from public.point_rules r',
      E'  -- 442: windows of N CALENDAR days in the challenge''s clock, counted by the day a video was POSTED; a remainder\n  -- shorter than half a window joins the last one.\n  if v_d0 is not null and coalesce(v_days, 0) > 0 then\n    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)\n    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true\n    from public.point_rules r'
    ],
    array[
      E'      select greatest(1, ceil(extract(epoch from (v_end - v_start)) / (r.period_days * 86400.0)))::int as n',
      E'      select greatest(1, v_days / r.period_days\n        + case when v_days >= r.period_days and (v_days % r.period_days) * 2 >= r.period_days then 1 else 0 end)::int as n'
    ],
    array[
      E'               floor(extract(epoch from (s.submitted_at - v_start)) / (r.period_days * 86400.0))::int, 0), np.n - 1)) as covered',
      E'               ((coalesce(s.posted_at, s.submitted_at) at time zone v_tz)::date - v_d0) / r.period_days, 0), np.n - 1)) as covered'
    ]
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    if position(pairs[i][1] in d) = 0 then
      raise exception '442: recalc_challenge_points_internal drifted, piece % not found', i;
    end if;
    if position(pairs[i][1] in substr(d, position(pairs[i][1] in d) + 1)) > 0 then
      raise exception '442: recalc_challenge_points_internal piece % is not unique', i;
    end if;
    d := replace(d, pairs[i][1], pairs[i][2]);
  end loop;
  execute d;
end $patch$;

-- ---------------------------------------------------------------- Video of the Week: rounds on whole days, adjustable
create or replace function public.weekly_rounds(p_challenge uuid)
returns table(round integer, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_tz text; v_d0 date; v_days int; v_step int; v_n int; v_i int; v_raw jsonb; v_ends date[]; v_from date; v_to date;
begin
  select d.tz, d.d0, d.days, greatest(1, least(31, coalesce((c.weekly_prize ->> 'every_days')::int, 7))), c.weekly_prize -> 'round_ends'
    into v_tz, v_d0, v_days, v_step, v_raw
    from public.challenges c
    cross join lateral public.challenge_days(c.id) d
   where c.id = p_challenge and c.weekly_prize is not null;
  if v_d0 is null or coalesce(v_days, 0) <= 0 then return; end if;

  -- CUSTOM ROUNDS: the last day of every round but the final one. Days outside the challenge are ignored.
  if jsonb_typeof(v_raw) = 'array' then
    select array_agg(distinct q.e order by q.e) into v_ends
      from (select (x #>> '{}')::date as e from jsonb_array_elements(v_raw) x
             where (x #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$') q
     where q.e >= v_d0 and q.e < v_d0 + v_days - 1;
  end if;
  if coalesce(array_length(v_ends, 1), 0) > 0 then
    v_from := v_d0;
    for v_i in 1 .. array_length(v_ends, 1) + 1 loop
      v_to := case when v_i <= array_length(v_ends, 1) then v_ends[v_i] + 1 else v_d0 + v_days end;
      round := v_i;
      starts_at := v_from::timestamp at time zone v_tz;
      ends_at := v_to::timestamp at time zone v_tz;
      return next;
      v_from := v_to;
    end loop;
    return;
  end if;

  v_n := greatest(1, v_days / v_step);
  if v_days >= v_step and (v_days % v_step) * 2 >= v_step then v_n := v_n + 1; end if;
  for v_i in 1 .. v_n loop
    round := v_i;
    starts_at := (v_d0 + v_step * (v_i - 1))::timestamp at time zone v_tz;
    ends_at := (case when v_i = v_n then v_d0 + v_days else v_d0 + v_step * v_i end)::timestamp at time zone v_tz;
    return next;
  end loop;
end $$;

create or replace function public.weekly_round_entries(p_challenge uuid, p_group uuid, p_from timestamptz, p_to timestamptz)
returns table(submission_id uuid, creator_id uuid, views bigint, posted timestamptz)
language sql
stable
set search_path to 'public'
as $$
  select s.id, s.creator_id, coalesce(s.logged_views, 0)::bigint, coalesce(s.posted_at, s.submitted_at)
    from public.submissions s
   where s.challenge_id = p_challenge
     and s.collab_of is null
     and coalesce(s.posted_at, s.submitted_at) >= p_from
     and coalesce(s.posted_at, s.submitted_at) < p_to
     and not exists (select 1 from public.profiles p where p.id = s.creator_id and coalesce(p.is_test, false))
     and (p_group is null or exists (
           select 1 from public.challenge_group_members gm
            where gm.challenge_id = p_challenge and gm.creator_id = s.creator_id and gm.group_id = p_group))
   order by coalesce(s.logged_views, 0) desc, coalesce(s.posted_at, s.submitted_at) asc, s.id
$$;

-- The board gains the entry's thumbnail and platform id (appended, so nothing positional moves).
drop function if exists public.weekly_prize_board(uuid, int);
create function public.weekly_prize_board(p_challenge uuid, p_top integer default 5)
returns table(round integer, starts_at timestamptz, ends_at timestamptz, group_id uuid, group_name text, state text,
              place integer, submission_id uuid, creator_id uuid, name text, photo_url text, views bigint, platform text,
              video_url text, row_id uuid, reward_id uuid, awarded_at timestamptz, thumbnail_url text,
              platform_video_id text)
language sql
stable
set search_path to 'public'
as $$
  with boards as (
    select g.id as gid, g.name as gname from public.challenge_groups g where g.challenge_id = p_challenge
    union all
    select null::uuid, null::text where not exists (select 1 from public.challenge_groups g where g.challenge_id = p_challenge)
  ),
  rounds as (select * from public.weekly_rounds(p_challenge)),
  cells as (
    select r.round, r.starts_at, r.ends_at, b.gid, b.gname, w.id as wid, w.locked_at, w.submission_id as wsub,
           w.creator_id as wcreator, w.views as wviews, w.reward_id as wreward, w.awarded_at as wawarded,
           case when w.awarded_at is not null then 'awarded'
                when w.locked_at is not null then 'ready'
                when r.ends_at <= now() then 'reading'
                when r.starts_at <= now() then 'live'
                else 'upcoming' end as state
      from rounds r cross join boards b
      left join public.challenge_weekly_winners w
        on w.challenge_id = p_challenge and w.round = r.round and w.group_id is not distinct from b.gid
  ),
  picks as (
    select c.*, 1 as place, c.wsub as sid, c.wcreator as cid, c.wviews as v
      from cells c where c.locked_at is not null
    union all
    select c.*, e.place::int, e.submission_id, e.creator_id, e.views
      from cells c
      cross join lateral (
        select x.*, row_number() over (order by x.views desc, x.posted asc, x.submission_id) as place
          from public.weekly_round_entries(p_challenge, c.gid, c.starts_at, c.ends_at) x
         limit greatest(1, least(p_top, 20))
      ) e
     where c.locked_at is null and c.state <> 'upcoming'
    union all
    select c.*, null::int, null::uuid, null::uuid, null::bigint
      from cells c where c.state = 'upcoming'
  )
  select p.round, p.starts_at, p.ends_at, p.gid, p.gname, p.state, p.place, p.sid, p.cid,
         pr.name, pr.photo_url, p.v, s.platform, s.video_url, p.wid, p.wreward, p.wawarded, s.thumbnail_url,
         s.platform_video_id
    from picks p
    left join public.profiles pr on pr.id = p.cid
    left join public.submissions s on s.id = p.sid
   order by p.round, p.gname nulls first, p.place nulls last
$$;
revoke all on function public.weekly_prize_board(uuid, int) from public, anon;
grant execute on function public.weekly_prize_board(uuid, int) to authenticated;

-- ---------------------------------------------------------------- awarding: one body, two doors
create or replace function public.award_weekly_prize_internal(p_row uuid, p_type text, p_by uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare w record; c record; v_type text; v_amount numeric; v_cur text; v_reward uuid;
begin
  select * into w from public.challenge_weekly_winners where id = p_row for update;
  if w.id is null then raise exception 'No such round.'; end if;
  if w.awarded_at is not null then return w.reward_id; end if;
  if w.locked_at is null then raise exception 'This round is still being read. Try again in a few minutes.'; end if;
  if w.creator_id is null then raise exception 'Nobody posted in this round.'; end if;
  select * into c from public.challenges where id = w.challenge_id;
  v_type := coalesce(nullif(p_type, ''), c.weekly_prize ->> 'type', 'voucher');
  if v_type not in ('cash', 'voucher') then raise exception 'A prize is cash or a voucher.'; end if;
  v_amount := coalesce((c.weekly_prize ->> 'amount')::numeric, 0);
  v_cur := coalesce(c.weekly_prize ->> 'currency', c.prize_currency, 'EUR');
  if v_amount <= 0 then raise exception 'Set the Video of the Week amount on the challenge first.'; end if;
  insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency, status, payment_notes,
                              community_id, source, prize_slot)
  values (w.creator_id, w.challenge_id, v_type, v_amount, v_cur, 'pending',
          format('Video of the Week, week %s - %s', w.round, c.title), c.community_id, 'challenge', 'weekly')
  returning id into v_reward;
  update public.challenge_weekly_winners set reward_id = v_reward, awarded_at = now(), awarded_by = p_by where id = p_row;
  perform public.notify_user(w.creator_id, 'reward', 'You won the Video of the Week! 🏆',
    format('Your video had the most views in week %s of %s. A %s %s is on its way to your Rewards page.',
           w.round, c.title, regexp_replace(to_char(v_amount, 'FM999990.00'), '\.00$', '') || ' ' || v_cur,
           case when v_type = 'cash' then 'cash prize' else 'Tryp.com voucher' end),
    '/rewards');
  return v_reward;
end $$;

create or replace function public.award_weekly_prize(p_row uuid, p_type text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_global_admin() then raise exception 'Only the team can award prizes.'; end if;
  return public.award_weekly_prize_internal(p_row, p_type, auth.uid());
end $$;

-- ---------------------------------------------------------------- the tick awards by itself
create or replace function public.weekly_prize_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'extensions'
as $$
declare
  c record; r record; b record; w record;
  v_new int := 0; v_locked int := 0; v_awarded int := 0; v_ids jsonb;
  secret text := (select value from private.config where key = 'webhook_secret');
  v_admin record; v_who text; v_title text; v_body text; v_link text; v_auto boolean; v_reward uuid; v_creator uuid;
begin
  for c in
    select ch.id, ch.title from public.challenges ch
     where ch.weekly_prize is not null and coalesce(ch.status, '') <> 'draft'
       and coalesce(ch.opens_at, ch.start_date) <= now()
       and coalesce(ch.closes_at, ch.end_date) > now() - interval '3 days'
  loop
    for r in select * from public.weekly_rounds(c.id) x where x.ends_at <= now() loop
      for b in
        select g.id as gid from public.challenge_groups g where g.challenge_id = c.id
        union all
        select null::uuid where not exists (select 1 from public.challenge_groups g where g.challenge_id = c.id)
      loop
        if exists (select 1 from public.challenge_weekly_winners x
                    where x.challenge_id = c.id and x.round = r.round and x.group_id is not distinct from b.gid) then
          continue;
        end if;
        insert into public.challenge_weekly_winners (challenge_id, group_id, round, starts_at, ends_at, read_requested_at)
        values (c.id, b.gid, r.round, r.starts_at, r.ends_at, now());
        v_new := v_new + 1;
        select coalesce(jsonb_agg(e.submission_id), '[]'::jsonb) into v_ids
          from (select submission_id from public.weekly_round_entries(c.id, b.gid, r.starts_at, r.ends_at) limit 40) e;
        if jsonb_array_length(v_ids) > 0 then
          begin
            perform net.http_post(
              url := public.edge_function_url('view-sync'),
              headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
              body := jsonb_build_object('submission_ids', v_ids)
            );
          exception when others then null;
          end;
        end if;
      end loop;
    end loop;
  end loop;

  for w in
    select x.*, ch.title, ch.weekly_prize from public.challenge_weekly_winners x join public.challenges ch on ch.id = x.challenge_id
     where x.locked_at is null and x.read_requested_at < now() - interval '50 minutes'
  loop
    perform public.weekly_prize_lock_internal(w.id);
    v_locked := v_locked + 1;
    select x.creator_id, pr.name into v_creator, v_who
      from public.challenge_weekly_winners x left join public.profiles pr on pr.id = x.creator_id where x.id = w.id;
    v_auto := coalesce((w.weekly_prize ->> 'auto_award')::boolean, true);
    v_reward := null;
    if v_auto and v_creator is not null then
      begin
        v_reward := public.award_weekly_prize_internal(w.id, null, null);
        v_awarded := v_awarded + 1;
      exception when others then v_reward := null;
      end;
    end if;
    if v_reward is not null then
      v_title := 'Video of the Week, week ' || w.round || ': ' || coalesce(v_who, 'winner') || ' won';
      v_body := coalesce(v_who, 'The winner') || ' has the most viewed video of week ' || w.round || ' in ' || w.title
                || '. The reward is on Rewards & Payouts, ready to pay out.';
      v_link := '/admin/rewards';
    else
      v_title := 'Video of the Week ready: week ' || w.round;
      v_body := coalesce(v_who || ' has the most viewed video of week ' || w.round || ' in ' || w.title || '. Check it and award it.',
                         'Nobody posted in week ' || w.round || ' of ' || w.title || '.');
      v_link := '/admin/challenges/' || w.challenge_id || '/results#weekly';
    end if;
    for v_admin in select id from public.profiles where platform_role in ('global_admin', 'owner') and coalesce(is_test, false) = false loop
      perform public.notify_user(v_admin.id, 'reward', v_title, v_body, v_link);
    end loop;
  end loop;
  return jsonb_build_object('rounds_opened', v_new, 'locked', v_locked, 'awarded', v_awarded);
end $$;

-- ---------------------------------------------------------------- grants
insert into public.owner_only_rpcs (proname, why)
select x.p, x.w from (values
  ('award_weekly_prize_internal', '442: the award body; reached through award_weekly_prize and the tick'),
  ('challenge_set_days', '442: trigger on challenges')
) x(p, w)
where not exists (select 1 from public.owner_only_rpcs o where o.proname = x.p);
select public.lock_down_definer_functions();
revoke all on function public.challenge_zone(text, uuid) from public, anon;
grant execute on function public.challenge_zone(text, uuid) to authenticated;
