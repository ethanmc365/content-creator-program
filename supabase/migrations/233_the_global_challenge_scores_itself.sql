-- 233: THE GLOBAL CHALLENGE SCORES ITSELF (21 Sep 2026)
--
-- Everything the Global Challenge brief promises, made automatic, plus the bug
-- that stopped it being saved.
--
-- 1. CONSISTENCY BONUS. A new rule kind, `consistency`: "+5 for posting in
--    every week". `period_days` is the window (1 = every day, 7 = every week,
--    any number for anything else). Windows are counted from the challenge's
--    start date to its deadline, so a 28-day challenge on a 7-day window is
--    four weeks, and the points land by themselves on the submission that
--    covers the last missing window. Changing the dates rescores.
--
-- 2. A CAP ON EVERY BONUS. `point_rules.max_points` now applies to `bonus`
--    rules: "+3 a video, at most 9 from this bonus". Entries are counted in
--    the order they were submitted, so the first three qualifying videos earn
--    it and a fourth earns nothing from THIS bonus.
--
-- 3. ONE PATH FOR EVERY BONUS. An admin awarding a bonus used to write a
--    stored point row, which no view gate and no cap could touch. It now writes
--    a CLAIM on the creator's behalf - the same row a creator's tick box writes
--    - so `min_views` ("only once the video passes 2,000 views") and the cap
--    apply identically however the bonus was given. Legacy hand-given rows
--    (there are none in prod today) still count and still count towards a cap.
--
-- 4. THE PARTICIPATION PRIZE GROWS UP. `participation_cap` (only the first N
--    creators to reach the threshold earn it), `participation_reward_type`
--    (cash or voucher, chosen rather than guessed from the words), and
--    `participation_scope` (everyone, or only creators who did not win a
--    place). "First" means the moment their Nth entry went in.
--
-- 5. EXTRA AWARDS. `challenges.extra_awards` is a list; the first kind is
--    `most_committed`: the creator with the most entries who finished outside
--    the paid places (or outside a top N you choose, or anyone at all when
--    `scope` is 'anyone'). Ties go to the better
--    leaderboard position, then to whoever reached that many entries first.
--
-- 6. A REWARD KNOWS WHICH PRIZE IT IS. Rewards were deduplicated on (challenge,
--    creator, cash/voucher), so a winner who also earned a cash participation
--    prize, or a voucher winner who was also "most committed", was reported as
--    "already awarded" and never paid. `rewards.prize_slot` ('place',
--    'participation', 'award:<id>') is the key now. Legacy rows keep a null
--    slot and are still honoured by the old rule.
--
-- 7. PER-ROW PRIZE TYPE. A prize row may carry `type: 'cash' | 'voucher'`;
--    the words are only read when it does not.
--
-- 8. A CREATOR CAN ONLY CLAIM A REAL BONUS. The insert policy on
--    `submission_bonus_claims` compared `s.challenge_id = s.challenge_id` (a
--    tautology), so a claim could name a rule from another challenge. It now
--    has to be an active, askable bonus on the entry's own live challenge.
--
-- `challenge_prize_standings` is the ONE definition of who is earning the
-- participation prize and the extra awards; the payout reads it, the results
-- page reads it, and the challenge page reads it, so the three can never
-- disagree about who is in the first 33.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.challenges
  add column if not exists participation_cap integer,
  add column if not exists participation_reward_type text,
  add column if not exists participation_amount numeric,
  add column if not exists participation_scope text not null default 'everyone',
  add column if not exists extra_awards jsonb not null default '[]'::jsonb;

alter table public.challenges drop constraint if exists challenges_participation_cap_check;
alter table public.challenges add constraint challenges_participation_cap_check
  check (participation_cap is null or participation_cap > 0);
alter table public.challenges drop constraint if exists challenges_participation_reward_type_check;
alter table public.challenges add constraint challenges_participation_reward_type_check
  check (participation_reward_type is null or participation_reward_type in ('cash', 'voucher'));
alter table public.challenges drop constraint if exists challenges_participation_scope_check;
alter table public.challenges add constraint challenges_participation_scope_check
  check (participation_scope in ('everyone', 'outside_prizes'));
alter table public.challenges drop constraint if exists challenges_extra_awards_is_array;
alter table public.challenges add constraint challenges_extra_awards_is_array
  check (jsonb_typeof(extra_awards) = 'array');

alter table public.point_rules add column if not exists period_days integer;
alter table public.point_rules drop constraint if exists point_rules_period_days_check;
alter table public.point_rules add constraint point_rules_period_days_check
  check (period_days is null or period_days > 0);
alter table public.point_rules drop constraint if exists point_rules_kind_check;
alter table public.point_rules add constraint point_rules_kind_check
  check (kind = any (array['per_post','views_threshold','bonus','total_views_threshold','platform_spread','consistency']));

alter table public.rewards add column if not exists prize_slot text;
drop index if exists public.rewards_challenge_creator_kind_uniq;
create unique index if not exists rewards_challenge_creator_slot_uniq
  on public.rewards (challenge_id, creator_id, coalesce(prize_slot, reward_type))
  where source = 'challenge' and challenge_id is not null;

-- ---------------------------------------------------------------------------
-- Claims: only a real, askable bonus on the entry's own live challenge
-- ---------------------------------------------------------------------------
drop policy if exists submission_bonus_claims_own on public.submission_bonus_claims;
create policy submission_bonus_claims_own on public.submission_bonus_claims
  for insert to authenticated
  with check (
    creator_id = (select auth.uid())
    and exists (
      select 1
        from public.submissions s
        join public.point_rules r on r.id = submission_bonus_claims.rule_id
        join public.challenges c on c.id = s.challenge_id
       where s.id = submission_bonus_claims.submission_id
         and s.creator_id = (select auth.uid())
         and s.challenge_id = submission_bonus_claims.challenge_id
         and r.challenge_id = s.challenge_id
         and r.kind = 'bonus'
         and r.is_active
         and nullif(btrim(coalesce(r.prompt, '')), '') is not null
         and c.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- The scorer
-- ---------------------------------------------------------------------------
create or replace function public.recalc_challenge_points_internal(p_challenge uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_community uuid;
  v_mode      text;
  v_scoring   text;
  v_start     timestamptz;
  v_end       timestamptz;
begin
  select community_id, threshold_mode, scoring, start_date, end_date
    into v_community, v_mode, v_scoring, v_start, v_end
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  delete from public.point_awards where challenge_id = p_challenge and is_auto;

  -- Per video posted, capped.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge
  where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)) > 0;

  -- View milestones, per video.
  if v_mode = 'cumulative' then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, s.creator_id, r.id, s.id, r.points, r.label, true
    from public.submissions s
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
     and coalesce(s.logged_views, 0) >= r.threshold
    where s.challenge_id = p_challenge;
  else
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, submission_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, s.creator_id,
             r.id as rule_id, s.id as submission_id, r.points, r.label,
             row_number() over (partition by s.id order by r.threshold desc) as rn
      from public.submissions s
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
       and coalesce(s.logged_views, 0) >= r.threshold
      where s.challenge_id = p_challenge
    ) ranked
    where rn = 1;
  end if;

  -- Total-views milestones, per creator.
  if v_mode = 'cumulative' then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from (
      select s.creator_id, coalesce(sum(s.logged_views), 0) as views
      from public.submissions s where s.challenge_id = p_challenge
      group by s.creator_id
    ) t
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
     and t.views >= r.threshold;
  else
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, t.creator_id,
             r.id as rule_id, r.points, r.label,
             row_number() over (partition by t.creator_id order by r.threshold desc) as rn
      from (
        select s.creator_id, coalesce(sum(s.logged_views), 0) as views
        from public.submissions s where s.challenge_id = p_challenge
        group by s.creator_id
      ) t
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
       and t.views >= r.threshold
    ) ranked
    where rn = 1;
  end if;

  -- Per platform posted on, capped.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge
  where r.challenge_id = p_challenge and r.kind = 'platform_spread' and r.is_active
    and coalesce(s.platform, '') <> ''
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)) > 0;

  -- BONUSES: every claim, whoever made it (the creator's tick box or an admin
  -- on their behalf), gated on the entry's views and capped per creator per
  -- rule in submission order. A legacy hand-given award for the same rule
  -- counts towards the cap first.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
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
         and s.challenge_id = p_challenge
         and r.challenge_id = p_challenge
         and r.kind = 'bonus'
         and r.is_active
         and coalesce(s.logged_views, 0) >= coalesce(r.min_views, 0)
    ) b
  ) q
  where q.award > 0;

  -- CONSISTENCY: an entry in every window between the start and the deadline.
  -- An entry outside the range (published early, or in the minutes before the
  -- archive cron) is counted in the nearest window rather than dropped.
  if v_start is not null and v_end is not null and v_end > v_start then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
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
       where s.challenge_id = p_challenge
       group by s.creator_id
    ) t on t.covered >= np.n
    where r.challenge_id = p_challenge and r.kind = 'consistency' and r.is_active
      and coalesce(r.period_days, 0) > 0 and r.points > 0;
  end if;

  if v_scoring = 'points' then
    perform public.rebuild_challenge_results(p_challenge);
  end if;
end $function$;

-- Moving the dates moves the consistency windows.
create or replace function public.trg_recalc_points_on_dates()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.scoring = 'points' then
    perform public.recalc_challenge_points_internal(new.id);
  end if;
  return new;
end $function$;

drop trigger if exists trg_points_on_challenge_dates on public.challenges;
create trigger trg_points_on_challenge_dates
  after update of start_date, end_date, threshold_mode on public.challenges
  for each row
  when (old.start_date is distinct from new.start_date
        or old.end_date is distinct from new.end_date
        or old.threshold_mode is distinct from new.threshold_mode)
  execute function public.trg_recalc_points_on_dates();

-- ---------------------------------------------------------------------------
-- An admin's bonus is a claim made for the creator
-- ---------------------------------------------------------------------------
create or replace function public.award_bonus(p_submission uuid, p_rule uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s record;
  r record;
begin
  if not public.is_admin() then raise exception 'Only admins can award bonus points'; end if;

  select id, challenge_id, creator_id into s from public.submissions where id = p_submission;
  if s is null then raise exception 'No such entry'; end if;

  select id, challenge_id, kind into r from public.point_rules where id = p_rule;
  if r is null then raise exception 'No such rule'; end if;
  if r.kind <> 'bonus' then raise exception 'That rule is not a bonus'; end if;
  if r.challenge_id <> s.challenge_id then raise exception 'That bonus belongs to another challenge'; end if;

  insert into public.submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id)
  values (s.id, r.id, s.creator_id, s.challenge_id)
  on conflict (submission_id, rule_id) do nothing;
end $function$;

create or replace function public.withdraw_bonus(p_submission uuid, p_rule uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then raise exception 'Only admins can withdraw bonus points'; end if;
  delete from public.submission_bonus_claims where submission_id = p_submission and rule_id = p_rule;
  delete from public.point_awards
   where submission_id = p_submission and rule_id = p_rule and not is_auto;
end $function$;

-- ---------------------------------------------------------------------------
-- Who is earning the participation prize and the extra awards
-- ---------------------------------------------------------------------------
create or replace function public.challenge_prize_standings_internal(p_challenge uuid)
 returns table(
   slot text, label text, creator_id uuid, creator_name text, photo_url text,
   entries integer, reached_at timestamptz, board_rank integer, status text,
   reward_type text, prize text, amount numeric, currency text, seat integer
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch    record;
  v_award jsonb;
begin
  select * into v_ch from public.challenges where id = p_challenge;
  if v_ch is null then return; end if;

  -- PARTICIPATION
  return query
  with per_creator as (
    select s.creator_id as cid,
           gm.group_id as gid,
           count(*)::int as n,
           array_agg(s.submitted_at order by s.submitted_at, s.id) as times
      from public.submissions s
      left join public.challenge_group_members gm
             on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
     where s.challenge_id = p_challenge
     group by s.creator_id, gm.group_id
  ),
  boarded as (
    select pc.*,
           coalesce(g.participation_threshold, v_ch.participation_threshold) as threshold,
           coalesce(nullif(btrim(coalesce(g.participation_prize, '')), ''), v_ch.participation_prize) as ptext,
           coalesce(g.prize_currency, v_ch.prize_currency) as cur,
           jsonb_array_length(coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb)) as places,
           r.rank as brank,
           pr.name as pname, pr.photo_url as pphoto,
           coalesce(pr.is_test, false) as is_test
      from per_creator pc
      left join public.challenge_groups g on g.id = pc.gid
      left join public.results r on r.challenge_id = p_challenge and r.creator_id = pc.cid
      join public.profiles pr on pr.id = pc.cid
  ),
  qualified as (
    select b.*,
           b.times[b.threshold] as at,
           (b.brank is not null and b.brank <= b.places) as won_place
      from boarded b
     where b.threshold is not null and coalesce(b.ptext, '') <> '' and b.n >= b.threshold
  ),
  ordered as (
    select q.*,
           case
             when q.is_test then null
             when v_ch.participation_scope = 'outside_prizes' and q.won_place then null
             else row_number() over (
               partition by (q.is_test or (v_ch.participation_scope = 'outside_prizes' and q.won_place))
               order by q.at, q.cid)
           end as seat
      from qualified q
  )
  select 'participation'::text,
         case when o.gid is null then 'Participation'
              else 'Participation - ' || coalesce((select g.name from public.challenge_groups g where g.id = o.gid), 'group') end,
         o.cid, o.pname, o.pphoto, o.n, o.at, o.brank,
         case
           when o.is_test then 'test'
           when o.seat is null then 'excluded'
           when v_ch.participation_cap is not null and o.seat > v_ch.participation_cap then 'waitlisted'
           else 'earned'
         end,
         coalesce(v_ch.participation_reward_type, public.prize_kind_of(o.ptext)),
         o.ptext,
         coalesce(v_ch.participation_amount, public.prize_amount_of(o.ptext)),
         public.prize_currency_of(o.ptext, o.cur),
         o.seat::int
    from ordered o
   order by o.seat nulls last, o.at;

  -- EXTRA AWARDS
  for v_award in select * from jsonb_array_elements(coalesce(v_ch.extra_awards, '[]'::jsonb)) loop
    continue when coalesce(v_award ->> 'kind', '') <> 'most_committed';
    continue when coalesce(v_award ->> 'id', '') = '';

    return query
    with per_creator as (
      select s.creator_id as cid,
             gm.group_id as gid,
             count(*)::int as n,
             max(s.submitted_at) as last_at
        from public.submissions s
        left join public.challenge_group_members gm
               on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
       where s.challenge_id = p_challenge
       group by s.creator_id, gm.group_id
    ),
    boarded as (
      select pc.*,
             r.rank as brank,
             -- `scope: 'anyone'` lets a prize winner take it too (Ethan:
             -- "admins should have the opportunity to choose").
             case when v_award ->> 'scope' = 'anyone' then 0
                  else coalesce(
                    nullif(v_award ->> 'exclude_top', '')::int,
                    jsonb_array_length(coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb)))
             end as cutoff,
             coalesce(g.prize_currency, v_ch.prize_currency) as cur,
             pr.name as pname, pr.photo_url as pphoto,
             coalesce(pr.is_test, false) as is_test
        from per_creator pc
        left join public.challenge_groups g on g.id = pc.gid
        left join public.results r on r.challenge_id = p_challenge and r.creator_id = pc.cid
        join public.profiles pr on pr.id = pc.cid
    ),
    eligible as (
      select b.*,
             row_number() over (order by b.n desc, b.brank asc nulls last, b.last_at asc, b.cid) as pos
        from boarded b
       where not b.is_test
         and (b.brank is null or b.brank > b.cutoff)
    )
    select 'award:' || (v_award ->> 'id'),
           coalesce(nullif(v_award ->> 'label', ''), 'Most committed'),
           e.cid, e.pname, e.pphoto, e.n, e.last_at, e.brank,
           case when e.pos = 1 then 'earned' else 'contender' end,
           coalesce(nullif(v_award ->> 'type', ''), public.prize_kind_of(v_award ->> 'prize')),
           v_award ->> 'prize',
           coalesce(nullif(v_award ->> 'amount', '')::numeric, public.prize_amount_of(v_award ->> 'prize')),
           public.prize_currency_of(v_award ->> 'prize', e.cur),
           e.pos::int
      from eligible e
     where e.pos <= 3
     order by e.pos;
  end loop;
end $function$;

create or replace function public.challenge_prize_standings(p_challenge uuid)
 returns table(
   slot text, label text, creator_id uuid, creator_name text, photo_url text,
   entries integer, reached_at timestamptz, board_rank integer, status text,
   reward_type text, prize text, amount numeric, currency text, seat integer
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.challenges c
     where c.id = p_challenge
       and (public.is_admin()
            or c.status = 'archived'
            or c.community_id in (select public.my_scopes()))
  ) then
    return;
  end if;
  return query select * from public.challenge_prize_standings_internal(p_challenge);
end $function$;

-- ---------------------------------------------------------------------------
-- The payout
-- ---------------------------------------------------------------------------
create or replace function public.award_challenge_prizes_internal(p_challenge_id uuid, p_dry_run boolean default false)
 returns table(place text, creator_id uuid, creator_name text, reward_type text, amount numeric, currency text, outcome text, detail text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch      record;
  v_board   record;
  v_row     record;
  v_amount  numeric;
  v_cur     text;
  v_kind    text;
  v_exists  boolean;
  v_label   text;
  v_reward  uuid;
  v_invoice boolean;
begin
  if not public.award_prizes_caller_is_allowed() then
    raise exception 'Only the team can award prizes.';
  end if;
  select * into v_ch from public.challenges where id = p_challenge_id;
  if v_ch is null then raise exception 'No such challenge.'; end if;

  if not exists (select 1 from public.results where challenge_id = p_challenge_id) then
    return query select null::text, null::uuid, null::text, null::text, null::numeric, null::text,
                        'blocked'::text, 'No leaderboard has been generated for this challenge.'::text;
    return;
  end if;

  -- PLACES, per leaderboard.
  for v_board in
    select distinct
           r.group_id as gid,
           g.name     as gname,
           coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb) as prizes,
           coalesce(g.prize_currency, v_ch.prize_currency) as gcur
      from public.results r
      left join public.challenge_groups g on g.id = r.group_id
     where r.challenge_id = p_challenge_id
     order by 2 nulls first
  loop
    for v_row in
      select p.ord::int as ord,
             coalesce(p.value ->> 'place', p.ord || '') as label,
             p.value ->> 'prize' as prize,
             nullif(p.value ->> 'type', '') as ptype,
             nullif(p.value ->> 'amount', '') as pamount,
             r.creator_id as cid,
             pr.name as cname,
             coalesce(pr.is_test, false) as is_test
        from jsonb_array_elements(v_board.prizes) with ordinality p(value, ord)
        left join public.results r
               on r.challenge_id = p_challenge_id
              and r.rank = p.ord
              and r.group_id is not distinct from v_board.gid
        left join public.profiles pr on pr.id = r.creator_id
       order by p.ord
    loop
      v_label  := case when v_board.gid is null then v_row.label
                       else v_row.label || ' - ' || coalesce(v_board.gname, 'group') end;
      v_amount := coalesce(nullif(regexp_replace(coalesce(v_row.pamount, ''), '[^0-9.]', '', 'g'), '')::numeric,
                           public.prize_amount_of(v_row.prize));
      v_cur    := public.prize_currency_of(v_row.prize, v_board.gcur);
      v_kind   := case when v_row.ptype in ('cash', 'voucher') then v_row.ptype
                       else public.prize_kind_of(v_row.prize) end;

      if v_row.cid is null then
        return query select v_label, null::uuid, null::text, v_kind, v_amount, v_cur,
                            'skipped'::text, 'Nobody finished in this place.'::text;
        continue;
      end if;
      if v_amount <= 0 then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'skipped'::text, format('No amount could be read from "%s".', coalesce(v_row.prize, ''));
        continue;
      end if;
      if v_row.is_test then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'skipped'::text, 'Test account.'::text;
        continue;
      end if;

      select exists (
        select 1 from public.rewards w
         where w.challenge_id = p_challenge_id and w.creator_id = v_row.cid and w.source = 'challenge'
           and (w.prize_slot = 'place' or (w.prize_slot is null and w.reward_type = v_kind))
      ) into v_exists;
      if v_exists then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'already awarded'::text, 'A reward for this place already exists.'::text;
        continue;
      end if;

      v_reward := null;
      if not p_dry_run then
        insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                    status, payment_notes, community_id, source, prize_slot)
        values (v_row.cid, p_challenge_id, v_kind, v_amount, v_cur, 'pending',
                format('%s place - %s', v_label, v_ch.title), v_ch.community_id, 'challenge', 'place')
        returning id into v_reward;
      end if;

      if v_kind <> 'cash' then
        v_invoice := null;
      elsif p_dry_run then
        v_invoice := public.invoice_is_payable(public.payment_snapshot(v_row.cid, v_cur));
      else
        v_invoice := exists (select 1 from public.invoices where reward_id = v_reward);
      end if;

      return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                          case when p_dry_run then 'would create' else 'created' end::text,
                          case
                            when v_kind <> 'cash' then 'Voucher to issue.'
                            when v_invoice and p_dry_run then 'Draft invoice will be raised.'
                            when v_invoice then 'Draft invoice raised.'
                            else 'No payment details on file, so no invoice yet. They have been asked for them, and it raises itself when they are added.'
                          end::text;
    end loop;
  end loop;

  -- PARTICIPATION AND EXTRA AWARDS, from the one standings definition.
  for v_row in
    select * from public.challenge_prize_standings_internal(p_challenge_id) st
     where st.status in ('earned', 'waitlisted')
  loop
    if v_row.status = 'waitlisted' then
      return query select v_row.label, v_row.creator_id, v_row.creator_name, v_row.reward_type, v_row.amount, v_row.currency,
                          'skipped'::text,
                          format('Qualified after the first %s places were taken.', v_ch.participation_cap);
      continue;
    end if;
    if coalesce(v_row.amount, 0) <= 0 then
      return query select v_row.label, v_row.creator_id, v_row.creator_name, v_row.reward_type, v_row.amount, v_row.currency,
                          'skipped'::text, format('No amount could be read from "%s".', coalesce(v_row.prize, ''));
      continue;
    end if;

    select exists (
      select 1 from public.rewards w
       where w.challenge_id = p_challenge_id and w.creator_id = v_row.creator_id and w.source = 'challenge'
         and (w.prize_slot = v_row.slot
              or (w.prize_slot is null and v_row.slot = 'participation' and w.reward_type = v_row.reward_type))
    ) into v_exists;
    if v_exists then
      return query select v_row.label, v_row.creator_id, v_row.creator_name, v_row.reward_type, v_row.amount, v_row.currency,
                          'already awarded'::text, 'This prize has already been awarded.'::text;
      continue;
    end if;

    v_reward := null;
    if not p_dry_run then
      insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                  status, payment_notes, community_id, source, prize_slot)
      values (v_row.creator_id, p_challenge_id, v_row.reward_type, v_row.amount, v_row.currency, 'pending',
              format('%s: %s - %s (%s entries)', v_row.label, coalesce(v_row.prize, ''), v_ch.title, v_row.entries),
              v_ch.community_id, 'challenge', v_row.slot)
      returning id into v_reward;
    end if;

    if v_row.reward_type <> 'cash' then
      v_invoice := null;
    elsif p_dry_run then
      v_invoice := public.invoice_is_payable(public.payment_snapshot(v_row.creator_id, v_row.currency));
    else
      v_invoice := exists (select 1 from public.invoices where reward_id = v_reward);
    end if;

    return query select v_row.label, v_row.creator_id, v_row.creator_name, v_row.reward_type, v_row.amount, v_row.currency,
                        case when p_dry_run then 'would create' else 'created' end::text,
                        format('%s entries. %s', v_row.entries,
                          case
                            when v_row.reward_type <> 'cash' then 'Voucher to issue.'
                            when v_invoice and p_dry_run then 'Draft invoice will be raised.'
                            when v_invoice then 'Draft invoice raised.'
                            else 'No payment details on file yet.'
                          end);
  end loop;
end $function$;

-- Reporting: a capped participation prize counts the vouchers actually earned.
create or replace function public.challenge_voucher_counts()
 returns table(challenge_id uuid, vouchers integer, source text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    c.id,
    case
      when c.participation_threshold is null then coalesce(c.vouchers_given, 0)
      else coalesce((
        select count(*) from public.challenge_prize_standings_internal(c.id) st
         where st.slot = 'participation' and st.status = 'earned'
      ), 0)
    end::integer,
    case when c.participation_threshold is null then 'recorded' else 'counted' end
  from public.challenges c;
$function$;

-- ---------------------------------------------------------------------------
-- Grants: definer functions are not callable by default
-- ---------------------------------------------------------------------------
revoke all on function public.challenge_prize_standings_internal(uuid) from public, anon, authenticated;
revoke all on function public.trg_recalc_points_on_dates() from public, anon, authenticated;
revoke all on function public.recalc_challenge_points_internal(uuid) from public, anon, authenticated;
revoke all on function public.award_challenge_prizes_internal(uuid, boolean) from public, anon, authenticated;
revoke all on function public.challenge_prize_standings(uuid) from public, anon;
grant execute on function public.challenge_prize_standings(uuid) to authenticated;
revoke all on function public.award_bonus(uuid, uuid) from public, anon;
grant execute on function public.award_bonus(uuid, uuid) to authenticated;
revoke all on function public.withdraw_bonus(uuid, uuid) from public, anon;
grant execute on function public.withdraw_bonus(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
