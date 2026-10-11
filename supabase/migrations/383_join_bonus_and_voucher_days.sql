-- 383 (12 Oct 2026): two ways to get people posting in a challenge.
--
-- 1. JOINING BONUS. Ethan: "a bonus points thing for creators that haven't entered yet. Any creator that now joins the
--    challenge gets a bonus 10 points, just to kick them off... I can choose this to be 5 or 10 points." Two columns on the
--    challenge; `join_bonus_from` is stamped when the bonus is switched on (like welcome_from), and only a creator whose FIRST
--    entry is after that moment gets it, once. Scored inside recalc_challenge_points_internal as an award with no rule.
--
-- 2. VOUCHER DAYS. Ethan: "anyone that posts a video and achieves over 5k views on whatever date I choose, or multiple dates,
--    wins a 10 euro voucher, a 5 euro voucher, or 5 euro cash." A day is a date in the market's timezone, a view bar, and a
--    reward. A video POSTED on that day (posted_at, else submitted_at) that reaches the bar wins its creator one reward for that
--    day: a pending row in `rewards` (prize_slot 'voucher_day'), so the team's existing voucher alert / cash invoice path takes it
--    from there. Checked the moment an entry's views move (a cheap trigger, nothing on a timer), and swept when a day is saved.

alter table public.challenges add column if not exists join_bonus_points numeric;
alter table public.challenges add column if not exists join_bonus_from timestamptz;
alter table public.challenges drop constraint if exists challenges_join_bonus_points_check;
alter table public.challenges add constraint challenges_join_bonus_points_check check (join_bonus_points is null or (join_bonus_points > 0 and join_bonus_points <= 1000));

create or replace function public.trg_challenge_join_bonus_from() returns trigger language plpgsql as $$
begin
  if coalesce(new.join_bonus_points, 0) > 0 then
    if tg_op = 'INSERT' or coalesce(old.join_bonus_points, 0) <= 0 then new.join_bonus_from := now(); end if;
  else
    new.join_bonus_from := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_challenge_join_bonus_from on public.challenges;
create trigger trg_challenge_join_bonus_from before insert or update of join_bonus_points on public.challenges
  for each row execute function public.trg_challenge_join_bonus_from();

create or replace function public.trg_recalc_points_on_join_bonus() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scoring = 'points' then perform public.recalc_challenge_points_internal(new.id); end if;
  return new;
end $$;
drop trigger if exists trg_points_on_join_bonus on public.challenges;
create trigger trg_points_on_join_bonus after update of join_bonus_points, join_bonus_from on public.challenges
  for each row when (old.join_bonus_points is distinct from new.join_bonus_points or old.join_bonus_from is distinct from new.join_bonus_from)
  execute function public.trg_recalc_points_on_join_bonus();

CREATE OR REPLACE FUNCTION public.recalc_challenge_points_internal(p_challenge uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_community uuid;
  v_mode      text;
  v_scoring   text;
  v_start     timestamptz;
  v_end       timestamptz;
  v_join_pts  numeric;
  v_join_from timestamptz;
  v_removed   integer := 0;
  v_added     integer := 0;
begin
  select community_id, threshold_mode, scoring, start_date, end_date, join_bonus_points, join_bonus_from
    into v_community, v_mode, v_scoring, v_start, v_end, v_join_pts, v_join_from
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  -- 363: WORK OUT THE AWARDS FIRST, THEN WRITE ONLY THE DIFFERENCE. Every rescore used to delete and reinsert
  -- every auto award (29,000 rows in 14 hours for ~460 live awards), and realtime has to decode every one of
  -- those WAL records. The steps below are unchanged except that they fill pg_temp._pa_new.
  create temp table if not exists _pa_new (
    community_id uuid, challenge_id uuid, creator_id uuid, rule_id uuid, submission_id uuid,
    points numeric, reason text, is_auto boolean
  ) on commit delete rows;
  delete from pg_temp._pa_new where true;

  -- Per video posted, capped.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge and s.collab_of is null
  where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)) > 0;

  -- View milestones, per video.
  if v_mode = 'cumulative' then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, s.creator_id, r.id, s.id, r.points, r.label, true
    from public.submissions s
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
     and coalesce(s.logged_views, 0) >= r.threshold
    where s.challenge_id = p_challenge and s.collab_of is null;
  else
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, submission_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, s.creator_id,
             r.id as rule_id, s.id as submission_id, r.points, r.label,
             row_number() over (partition by s.id order by r.threshold desc) as rn
      from public.submissions s
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
       and coalesce(s.logged_views, 0) >= r.threshold
      where s.challenge_id = p_challenge and s.collab_of is null
    ) ranked
    where rn = 1;
  end if;

  -- Total-views milestones, per creator.
  if v_mode = 'cumulative' then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from (
      select s.creator_id, coalesce(sum(s.logged_views), 0) as views
      from public.submissions s where s.challenge_id = p_challenge and s.collab_of is null
      group by s.creator_id
    ) t
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
     and t.views >= r.threshold;
  else
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, t.creator_id,
             r.id as rule_id, r.points, r.label,
             row_number() over (partition by t.creator_id order by r.threshold desc) as rn
      from (
        select s.creator_id, coalesce(sum(s.logged_views), 0) as views
        from public.submissions s where s.challenge_id = p_challenge and s.collab_of is null
        group by s.creator_id
      ) t
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
       and t.views >= r.threshold
    ) ranked
    where rn = 1;
  end if;

  -- Per platform posted on, capped.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge and s.collab_of is null
  where r.challenge_id = p_challenge and r.kind = 'platform_spread' and r.is_active
    and coalesce(s.platform, '') <> ''
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)) > 0;

  -- BONUSES: every claim, whoever made it (the creator's tick box or an admin
  -- on their behalf), gated on the entry's views and capped per creator per
  -- rule in submission order. A legacy hand-given award for the same rule
  -- counts towards the cap first.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, q.creator_id, q.rule_id, q.submission_id, q.award, q.label, true
  from (
    select b.*,
           case
             when b.max_points is null then b.points
             else greatest(0, least(b.points, b.max_points - b.manual - coalesce(b.prior, 0)))
           end as award
    from (
      select c.creator_id, r.id as rule_id, c.submission_id, r.label, r.points, r.max_points,
             coalesce((
               select sum(a.points) from public.point_awards a
                where a.challenge_id = p_challenge and a.rule_id = r.id
                  and a.creator_id = c.creator_id and not a.is_auto
             ), 0) as manual,
             sum(r.points) over (
               partition by c.creator_id, r.id
               order by s.submitted_at, s.id
               rows between unbounded preceding and 1 preceding
             ) as prior
        from public.submission_bonus_claims c
        join public.point_rules r on r.id = c.rule_id
        join public.submissions s on s.id = c.submission_id
       where c.challenge_id = p_challenge
         and s.challenge_id = p_challenge and s.collab_of is null
         and r.challenge_id = p_challenge
         and r.kind = 'bonus'
         and r.is_active
         and coalesce(s.logged_views, 0) >= coalesce(r.min_views, 0)
         -- 256: a bonus can run for part of the challenge. It counts for the
         -- entries SUBMITTED inside its window; ending it keeps every point
         -- already earned inside it.
         and (r.starts_at is null or s.submitted_at >= r.starts_at)
         and (r.ends_at is null or s.submitted_at <= r.ends_at)
    ) b
  ) q
  where q.award > 0;

  -- BOOSTS (334): "double points for everything related to that specific video" inside a window. For every video entered while a boost
  -- is on, the extra is (multiplier - 1) times what that video earned: the per-video points and every award tied to the video (its view
  -- milestones and the bonuses claimed on it). Summed per creator and capped by the boost's own maximum, so an exploit has a ceiling.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, t.creator_id, null, null,
         least(t.extra, coalesce(b.max_extra_points, t.extra)),
         left(b.label, 80) || ' (x' || regexp_replace(b.multiplier::text, '\.?0+$', '') || ')', true
  from public.challenge_boosts b
  join lateral (
    select s.creator_id,
           round(sum((b.multiplier - 1) * (coalesce(pp.pts, 0) + coalesce(av.pts, 0)))) as extra
      from public.submissions s
      left join lateral (select sum(r.points) as pts from public.point_rules r
                          where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active) pp on true
      left join lateral (select sum(a.points) as pts from pg_temp._pa_new a
                          where a.challenge_id = p_challenge and a.submission_id = s.id and a.is_auto) av on true
     where s.challenge_id = p_challenge and s.collab_of is null and s.submitted_at >= b.starts_at and s.submitted_at < b.ends_at
     group by s.creator_id
  ) t on true
  where b.challenge_id = p_challenge and b.is_active and b.multiplier > 1 and t.extra > 0;

  -- CONSISTENCY: an entry in every window between the start and the deadline.
  -- An entry outside the range (published early, or in the minutes before the
  -- archive cron) is counted in the nearest window rather than dropped.
  if v_start is not null and v_end is not null and v_end > v_start then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from public.point_rules r
    cross join lateral (
      select greatest(1, ceil(extract(epoch from (v_end - v_start)) / (r.period_days * 86400.0)))::int as n
    ) np
    join lateral (
      select s.creator_id,
             count(distinct least(greatest(
               floor(extract(epoch from (s.submitted_at - v_start)) / (r.period_days * 86400.0))::int, 0), np.n - 1)) as covered
        from public.submissions s
       where s.challenge_id = p_challenge and s.collab_of is null
       group by s.creator_id
    ) t on t.covered >= np.n
    where r.challenge_id = p_challenge and r.kind = 'consistency' and r.is_active
      and coalesce(r.period_days, 0) > 0 and r.points > 0;
  end if;

  -- COLLABS (325, reshaped 334): an INSTAGRAM COLLAB POST. One creator enters it and names the other; the other confirms. Each side of every
  -- confirmed post earns the rule's points, capped per creator by the rule's maximum. The partner needs no entry of their own - the
  -- post is entered once, by one of them, and the views count once.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, t.creator_id, r.id, null,
         least(t.n * r.points, coalesce(r.max_points, t.n * r.points)), r.label, true
  from public.point_rules r
  join lateral (
    select x.creator_id, count(*)::int as n from (
      select c.requester_id as creator_id from public.challenge_collabs c where c.challenge_id = p_challenge and c.status = 'confirmed'
      union all
      select c.partner_id from public.challenge_collabs c where c.challenge_id = p_challenge and c.status = 'confirmed'
    ) x group by x.creator_id
  ) t on true
  where r.challenge_id = p_challenge and r.kind = 'collab' and r.is_active and r.points > 0;

  -- JOINING BONUS (383): a creator whose FIRST entry in this challenge came after the bonus was switched on gets it once.
  -- Not tied to a video, so a boost never multiplies it.
  if coalesce(v_join_pts, 0) > 0 and v_join_from is not null then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, f.creator_id, null, null, v_join_pts, 'Joining bonus', true
      from (
        select s.creator_id, min(s.submitted_at) as first_at
          from public.submissions s
         where s.challenge_id = p_challenge and s.collab_of is null
         group by s.creator_id
      ) f
     where f.first_at >= v_join_from;
  end if;

  -- THE DIFFERENCE. Rows are matched on everything that makes an award what it is; row_number() keeps two
  -- identical awards (two boosts with one label) counted as two.
  delete from public.point_awards d
   using (
     select a.id, a.creator_id, a.rule_id, a.submission_id, a.points, a.reason,
            row_number() over (partition by a.creator_id, a.rule_id, a.submission_id, a.points, a.reason order by a.id) as rn
       from public.point_awards a where a.challenge_id = p_challenge and a.is_auto
   ) o
   where d.id = o.id
     and not exists (
       select 1 from (
         select n.*, row_number() over (partition by n.creator_id, n.rule_id, n.submission_id, n.points, n.reason) as rn
           from pg_temp._pa_new n
       ) n
       where n.creator_id = o.creator_id and n.rule_id is not distinct from o.rule_id
         and n.submission_id is not distinct from o.submission_id and n.points = o.points
         and n.reason is not distinct from o.reason and n.rn = o.rn);
  get diagnostics v_removed = row_count;

  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select n.community_id, n.challenge_id, n.creator_id, n.rule_id, n.submission_id, n.points, n.reason, true
    from (
      select n.*, row_number() over (partition by n.creator_id, n.rule_id, n.submission_id, n.points, n.reason) as rn
        from pg_temp._pa_new n
    ) n
   where not exists (
     select 1 from (
       select a.creator_id, a.rule_id, a.submission_id, a.points, a.reason,
              row_number() over (partition by a.creator_id, a.rule_id, a.submission_id, a.points, a.reason order by a.id) as rn
         from public.point_awards a where a.challenge_id = p_challenge and a.is_auto
     ) o
     where n.creator_id = o.creator_id and n.rule_id is not distinct from o.rule_id
       and n.submission_id is not distinct from o.submission_id and n.points = o.points
       and n.reason is not distinct from o.reason and n.rn = o.rn);
  get diagnostics v_added = row_count;

  -- The participation marks used to ride the reinsert of every row on every pass. With nothing inserted
  -- the statement trigger does not fire, so ask once here (it is idempotent: first-N, never unmarks).
  if v_added = 0 then
    perform public.mark_points_participation(p_challenge);
  end if;

  if v_scoring = 'points' then
    perform public.rebuild_challenge_results(p_challenge);
  end if;
end $function$;

-- ------------------------------------------------------------------------------------------------------------ voucher days
create table if not exists public.challenge_voucher_days (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  day date not null,
  tz text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  min_views integer not null default 5000 check (min_views > 0),
  reward_type text not null default 'voucher' check (reward_type in ('voucher', 'cash')),
  amount numeric not null check (amount > 0 and amount <= 1000),
  currency text not null default 'EUR',
  max_winners integer check (max_winners is null or max_winners > 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (challenge_id, day)
);
create index if not exists challenge_voucher_days_challenge on public.challenge_voucher_days (challenge_id) where is_active;

create table if not exists public.challenge_voucher_day_wins (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.challenge_voucher_days(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete set null,
  reward_id uuid references public.rewards(id) on delete set null,
  views integer,
  created_at timestamptz not null default now(),
  unique (day_id, creator_id)
);
create index if not exists challenge_voucher_day_wins_challenge on public.challenge_voucher_day_wins (challenge_id);

-- The window is the whole day in the market's own timezone, worked out here so the client never has to.
create or replace function public.trg_voucher_day_window() returns trigger language plpgsql security definer set search_path = public as $$
declare v_tz text;
begin
  select coalesce(nullif(m.timezone, ''), 'Europe/London') into v_tz
    from public.challenges c left join public.communities m on m.id = c.community_id where c.id = new.challenge_id;
  -- The team can name a zone; otherwise the market's own.
  new.tz := coalesce(nullif(new.tz, ''), v_tz, 'Europe/London');
  new.starts_at := (new.day::timestamp) at time zone new.tz;
  new.ends_at := ((new.day + 1)::timestamp) at time zone new.tz;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_voucher_day_window on public.challenge_voucher_days;
create trigger trg_voucher_day_window before insert or update of day, tz, challenge_id on public.challenge_voucher_days
  for each row execute function public.trg_voucher_day_window();

alter table public.challenge_voucher_days enable row level security;
alter table public.challenge_voucher_day_wins enable row level security;
drop policy if exists "voucher days: read" on public.challenge_voucher_days;
create policy "voucher days: read" on public.challenge_voucher_days for select to authenticated using (true);
drop policy if exists "voucher days: admins write" on public.challenge_voucher_days;
create policy "voucher days: admins write" on public.challenge_voucher_days for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "voucher day wins: read" on public.challenge_voucher_day_wins;
create policy "voucher day wins: read" on public.challenge_voucher_day_wins for select to authenticated using (true);
grant select, insert, update, delete on public.challenge_voucher_days to authenticated;
grant select on public.challenge_voucher_day_wins to authenticated;

-- Award every creator who has qualified on one day and has not won it yet. Returns how many were awarded.
create or replace function public.voucher_day_award_internal(p_day uuid, p_creator uuid default null)
 returns integer language plpgsql security definer set search_path = public as $$
declare d public.challenge_voucher_days; ch public.challenges; v_room int; v_n int := 0; r record; v_reward uuid; v_label text;
begin
  select * into d from public.challenge_voucher_days where id = p_day;
  if d.id is null or not d.is_active or d.starts_at > now() then return 0; end if;
  select * into ch from public.challenges where id = d.challenge_id;
  if ch.id is null or ch.status not in ('active', 'archived') then return 0; end if;
  v_room := case when d.max_winners is null then 1000000
                 else greatest(0, d.max_winners - (select count(*) from public.challenge_voucher_day_wins w where w.day_id = d.id)::int) end;
  if v_room = 0 then return 0; end if;
  v_label := to_char(d.day, 'FMDD Mon');
  for r in
    select distinct on (s.creator_id) s.creator_id, s.id as submission_id, s.community_id, coalesce(s.logged_views, 0) as views
      from public.submissions s
      join public.profiles p on p.id = s.creator_id and p.status = 'active' and not coalesce(p.is_admin, false) and not coalesce(p.is_test, false)
     where s.challenge_id = d.challenge_id
       and s.collab_of is null
       and (p_creator is null or s.creator_id = p_creator)
       and coalesce(s.posted_at, s.submitted_at) >= d.starts_at
       and coalesce(s.posted_at, s.submitted_at) < d.ends_at
       and coalesce(s.logged_views, 0) >= d.min_views
       and not exists (select 1 from public.challenge_voucher_day_wins w where w.day_id = d.id and w.creator_id = s.creator_id)
     order by s.creator_id, s.logged_views desc nulls last
     limit v_room
  loop
    insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency, status, community_id, source, prize_slot, payment_notes)
    values (r.creator_id, d.challenge_id, d.reward_type, d.amount, d.currency, 'pending', coalesce(r.community_id, ch.community_id), 'challenge', 'voucher_day',
            'Voucher day ' || v_label || ': a video posted that day passed ' || to_char(d.min_views, 'FM999,999,999') || ' views')
    returning id into v_reward;
    insert into public.challenge_voucher_day_wins (day_id, challenge_id, creator_id, submission_id, reward_id, views)
    values (d.id, d.challenge_id, r.creator_id, r.submission_id, v_reward, r.views)
    on conflict (day_id, creator_id) do nothing;
    perform public.notify_user(r.creator_id, 'reward',
      case when d.reward_type = 'voucher' then 'You won a voucher day reward' else 'You won a voucher day cash prize' end,
      'Your video posted on ' || v_label || ' passed ' || to_char(d.min_views, 'FM999,999,999') || ' views. Your reward is on its way and appears under Rewards.',
      '/rewards');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- The team's "Award now" for one challenge: every day that has started.
create or replace function public.voucher_days_award(p_challenge uuid)
 returns integer language plpgsql security definer set search_path = public as $$
declare v_n int := 0; d record;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  for d in select id from public.challenge_voucher_days where challenge_id = p_challenge and is_active and starts_at <= now() loop
    v_n := v_n + public.voucher_day_award_internal(d.id);
  end loop;
  return v_n;
end $$;

-- An entry's views or post time moved: does it win a voucher day? A challenge with no days costs one indexed lookup.
create or replace function public.trg_submission_voucher_day() returns trigger language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if new.collab_of is not null or coalesce(new.logged_views, 0) <= 0 then return null; end if;
  for d in
    select v.id from public.challenge_voucher_days v
     where v.challenge_id = new.challenge_id and v.is_active and v.starts_at <= now()
       and coalesce(new.posted_at, new.submitted_at) >= v.starts_at and coalesce(new.posted_at, new.submitted_at) < v.ends_at
       and coalesce(new.logged_views, 0) >= v.min_views
  loop
    perform public.voucher_day_award_internal(d.id, new.creator_id);
  end loop;
  return null;
exception when others then
  perform public.report_system_error('notify', 'voucher-day', 'Could not check a voucher day', sqlerrm, '/admin/rewards');
  return null;
end $$;
drop trigger if exists trg_submission_voucher_day on public.submissions;
create trigger trg_submission_voucher_day after insert or update of logged_views, posted_at on public.submissions
  for each row execute function public.trg_submission_voucher_day();

-- Saving or switching on a day sweeps it (videos that already passed the bar before the day was added).
create or replace function public.trg_voucher_day_sweep() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active and new.starts_at <= now() then perform public.voucher_day_award_internal(new.id); end if;
  return null;
end $$;
drop trigger if exists trg_voucher_day_sweep on public.challenge_voucher_days;
create trigger trg_voucher_day_sweep after insert or update on public.challenge_voucher_days
  for each row execute function public.trg_voucher_day_sweep();

-- Who is on each day, for the challenge page: every entry posted on a day, best first, with whether it has won.
-- SECURITY INVOKER, so a reader sees exactly the entries their own access allows.
create or replace function public.voucher_day_board(p_challenge uuid)
 returns table(day_id uuid, creator_id uuid, name text, photo_url text, submission_id uuid, views integer, won boolean)
 language sql stable set search_path = public as $$
  select distinct on (v.id, s.creator_id) v.id, s.creator_id, p.name, p.photo_url, s.id, coalesce(s.logged_views, 0)::int,
         exists (select 1 from public.challenge_voucher_day_wins w where w.day_id = v.id and w.creator_id = s.creator_id)
    from public.challenge_voucher_days v
    join public.submissions s on s.challenge_id = v.challenge_id and s.collab_of is null
     and coalesce(s.posted_at, s.submitted_at) >= v.starts_at and coalesce(s.posted_at, s.submitted_at) < v.ends_at
    join public.profiles p on p.id = s.creator_id
   where v.challenge_id = p_challenge and v.is_active
   order by v.id, s.creator_id, s.logged_views desc nulls last
$$;
grant execute on function public.voucher_day_board(uuid) to authenticated;

insert into public.owner_only_rpcs (proname, why) values
  ('voucher_day_award_internal', 'awards voucher day rewards; reached only from triggers and voucher_days_award'),
  ('trg_submission_voucher_day', 'trigger'),
  ('trg_voucher_day_sweep', 'trigger'),
  ('trg_voucher_day_window', 'trigger'),
  ('trg_recalc_points_on_join_bonus', 'trigger')
on conflict do nothing;
select public.lock_down_definer_functions();
