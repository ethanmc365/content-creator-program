-- 076: the points engine, scoped notifications, and per-market rooms.
--
-- Three things that have to land together, because the first one is what makes
-- the third one safe.
--
-- 1. NOTIFICATIONS BECOME SCOPE-AWARE.
--    `notify_all()` inserts a row for EVERY active profile. It is called by 15
--    triggers and is the single biggest single-tenant assumption left in the
--    schema. Creating an active Spanish challenge today would put "New
--    challenge: ..." in the bell of all 44 UK creators.
--    This migration does NOT rewrite notify_all (15 call sites, each needs its
--    own judgement). It adds `notify_community()` and switches exactly ONE
--    trigger, `on_challenge_live`, to use it when the challenge has a community.
--    For UK that is a no-op: every active profile is already a UK member, so
--    the same people get the same notification.
--
-- 2. POINTS. Challenges can score by prize (what UK runs) or by points (what
--    Spain runs). Rules are ROWS, not a hardcoded formula, so a manager can add
--    "post a video using this hook, 2 points" without a deploy.
--
-- 3. Every chapter gets its own #general and #announcements, alongside the
--    network-wide ones.
--
-- SAFETY: `challenges.scoring` defaults to 'prize', so every existing challenge
-- including the live UK one keeps its exact current behaviour. Nothing reads
-- the points tables unless a challenge opts in.

-- ------------------------------------------------------- scoped notification
create or replace function public.notify_community(
  p_community uuid, p_except uuid, p_type text, p_title text, p_body text, p_link text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link)
  select m.profile_id, p_type, p_title, p_body, p_link
  from public.community_members m
  join public.profiles p on p.id = m.profile_id
  where m.community_id = p_community
    and m.status = 'active'
    and p.status = 'active'
    and (p_except is null or p.id <> p_except);
end;
$$;

-- Only the audience of the market the challenge belongs to. Falls back to the
-- old global broadcast when a challenge has no community, so nothing that
-- predates scoping silently stops notifying.
create or replace function public.on_challenge_live()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.community_id is not null then
      perform public.notify_community(
        new.community_id, null, 'challenge', 'New challenge: ' || new.title,
        'A new challenge is live — check the brief and get creating!',
        '/challenges/' || new.id
      );
    else
      perform public.notify_all(
        null, 'challenge', 'New challenge: ' || new.title,
        'A new challenge is live — check the brief and get creating!',
        '/challenges/' || new.id
      );
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------ challenge mode
alter table public.challenges
  add column if not exists scoring text not null default 'prize',
  -- How overlapping view thresholds combine. 'highest' means a video past 50k
  -- scores only the 50k tier; 'cumulative' means it also collects the 5k and
  -- 10k tiers. This is a real product decision with very different totals, so
  -- it is an explicit setting rather than an assumption baked into the query.
  add column if not exists threshold_mode text not null default 'highest';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'challenges_scoring_check') then
    alter table public.challenges add constraint challenges_scoring_check
      check (scoring in ('prize', 'points'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_threshold_mode_check') then
    alter table public.challenges add constraint challenges_threshold_mode_check
      check (threshold_mode in ('highest', 'cumulative'));
  end if;
end $$;

-- ----------------------------------------------------------------- the rules
-- A rule with challenge_id null is a MARKET TEMPLATE: it is what a new
-- challenge in that market starts with. That is how Spain becomes a template
-- other markets can be cloned from.
create table if not exists public.point_rules (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  challenge_id  uuid references public.challenges(id) on delete cascade,
  kind          text not null check (kind in ('per_post', 'views_threshold', 'bonus')),
  label         text not null,
  points        numeric(10,2) not null default 0,
  -- views_threshold only: the view count that must be passed.
  threshold     int,
  -- per_post only: the ceiling on what repetition can earn, so ten posts cannot
  -- become a hundred points.
  max_points    numeric(10,2),
  position      int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists point_rules_challenge_idx on public.point_rules (challenge_id, position);
create index if not exists point_rules_template_idx  on public.point_rules (community_id) where challenge_id is null;

alter table public.point_rules enable row level security;

-- ---------------------------------------------------------------- the ledger
-- Every point a creator holds, with its provenance. A ledger rather than a
-- running total on profiles: totals that cannot be explained get disputed, and
-- "why do I have 14 points" has to be answerable row by row.
create table if not exists public.point_awards (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  challenge_id  uuid references public.challenges(id) on delete cascade,
  creator_id    uuid not null references public.profiles(id) on delete cascade,
  rule_id       uuid references public.point_rules(id) on delete set null,
  submission_id uuid references public.submissions(id) on delete cascade,
  points        numeric(10,2) not null,
  reason        text not null default '',
  -- Auto awards are derived from rules and are wiped and rebuilt on every
  -- recalculation. Manual awards are a human decision and survive it.
  is_auto       boolean not null default true,
  awarded_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists point_awards_challenge_idx on public.point_awards (challenge_id, creator_id);
create index if not exists point_awards_creator_idx   on public.point_awards (creator_id);
create index if not exists point_awards_community_idx on public.point_awards (community_id, creator_id);

alter table public.point_awards enable row level security;

-- ------------------------------------------------------------- recalculation
-- Rebuilds the automatic awards for one challenge from its rules and its
-- submissions. Idempotent: safe to run after every view log, every new
-- submission, and every rule edit. Manual awards are never touched.
create or replace function public.recalc_challenge_points(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_community uuid;
  v_mode      text;
begin
  select community_id, threshold_mode into v_community, v_mode
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  delete from public.point_awards where challenge_id = p_challenge and is_auto;

  -- Per post, capped. `least` applies the ceiling; a null max_points means no
  -- ceiling, which coalesce turns into the uncapped total.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge
  where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)) > 0;

  -- View thresholds, per submission.
  if v_mode = 'cumulative' then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, s.creator_id, r.id, s.id, r.points, r.label, true
    from public.submissions s
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
     and coalesce(s.logged_views, 0) >= r.threshold
    where s.challenge_id = p_challenge;
  else
    -- Highest tier only: rank the matching rules per submission and keep one.
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
end;
$$;

-- Keep the standings honest without anyone remembering to press a button.
create or replace function public.trg_recalc_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_challenge uuid;
begin
  v_challenge := coalesce(new.challenge_id, old.challenge_id);
  -- Only spend the work on challenges that actually score by points.
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    perform public.recalc_challenge_points(v_challenge);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_points_on_submission on public.submissions;
create trigger trg_points_on_submission
  after insert or update or delete on public.submissions
  for each row execute function public.trg_recalc_points();

-- --------------------------------------------------------------- standings
-- Per challenge, per market, and network-wide lifetime. `security_invoker`
-- makes the views obey the querying user's RLS instead of the definer's, so a
-- view cannot become a way around a policy.
create or replace view public.challenge_standings
with (security_invoker = true) as
select a.challenge_id, a.community_id, a.creator_id,
       sum(a.points) as points,
       count(*) filter (where not a.is_auto) as manual_awards
from public.point_awards a
group by a.challenge_id, a.community_id, a.creator_id;

create or replace view public.community_standings
with (security_invoker = true) as
select a.community_id, a.creator_id, sum(a.points) as points
from public.point_awards a
group by a.community_id, a.creator_id;

-- The network-wide accumulation. Points are earned inside a market but they
-- add up across the whole network, which is what makes a creator who moves
-- from Spain to the UK keep their standing.
create or replace view public.network_standings
with (security_invoker = true) as
select a.creator_id, sum(a.points) as points, count(distinct a.community_id) as markets
from public.point_awards a
group by a.creator_id;

-- --------------------------------------------------------------------- RLS
create policy point_rules_read on public.point_rules
  for select to authenticated
  using (community_id in (select public.my_scopes()));

create policy point_rules_manage on public.point_rules
  for all to authenticated
  using (community_id in (select public.my_managed_scopes()))
  with check (community_id in (select public.my_managed_scopes()));

-- Standings are public within a market: a leaderboard nobody can see is not a
-- leaderboard. Only managers can write.
create policy point_awards_read on public.point_awards
  for select to authenticated
  using (community_id in (select public.my_scopes()));

create policy point_awards_manage on public.point_awards
  for all to authenticated
  using (community_id in (select public.my_managed_scopes()))
  with check (community_id in (select public.my_managed_scopes()));

-- ------------------------------------------------------- per-market rooms
-- Every chapter gets its own #general and #announcements, sitting above the
-- purposeful rooms. The network-wide pair created in 073 stays exactly as it
-- is: this is in addition to them, not instead of.
insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
select c.id, v.key, v.label, replace(v.hint, '{{market}}', c.name), v.icon, v.post_policy, v.visibility, v.position
from public.communities c
cross join (values
  ('general',       'General',       'Everything going on in {{market}}.',       'chat', 'all',   'scope', -2),
  ('announcements', 'Announcements', 'News for {{market}} from the team.',       'bell', 'staff', 'scope', -1)
) as v(key, label, hint, icon, post_policy, visibility, position)
where c.kind = 'chapter'
on conflict (community_id, key) do nothing;
