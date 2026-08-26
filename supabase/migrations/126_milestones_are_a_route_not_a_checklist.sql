-- A milestone is a stop with SEVERAL requirements, and the stops are in order.
--
-- WHAT WAS WRONG. A milestone had one `metric` and one `threshold`, so every
-- stop measured a different thing, and the "route" was eleven unrelated tests
-- drawn on one line. A creator with a million views and no referrals had passed
-- stops 4, 8 and 11 and failed 2 - so the flight path showed a plane parked at
-- stop 1 with three lit dots scattered ahead of it. That is not a route, it is a
-- checklist wearing a route's clothes.
--
-- WHAT IT IS NOW. Each stop carries a SET of requirements, all of which must be
-- met, and stop N is only reached once stop N-1 has been. So position on the
-- line means one thing: how far you have actually come. And a stop whose numbers
-- you have hit but whose predecessor you have not is `blocked` rather than
-- silently ignored - the creator is told exactly what is holding them up, which
-- is the case Ethan described: over 100k views but no referral yet, so the 100k
-- stop waits.

create table if not exists public.milestone_criteria (
  id           uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  metric       text not null check (metric in ('views','videos','referrals','challenges','days','podiums','best_video')),
  threshold    numeric not null check (threshold > 0),
  -- Only meaningful for `days`. The ladder stores days either way; this is how
  -- the admin typed it, so "6" and "months" comes back out as "6 months"
  -- rather than "183 days".
  unit         text not null default 'days' check (unit in ('days','months','years')),
  created_at   timestamptz not null default now()
);

create index if not exists milestone_criteria_by_milestone on public.milestone_criteria(milestone_id);
-- Two thresholds on one metric is never a requirement, it is a mistake: the
-- larger one wins and the smaller says nothing.
create unique index if not exists milestone_criteria_one_per_metric
  on public.milestone_criteria(milestone_id, metric);

alter table public.milestone_criteria enable row level security;

drop policy if exists "criteria readable" on public.milestone_criteria;
create policy "criteria readable" on public.milestone_criteria for select to authenticated using (true);
drop policy if exists "criteria admin" on public.milestone_criteria;
create policy "criteria admin" on public.milestone_criteria for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Carry the single metric each milestone already had into its first criterion,
-- so no ladder is lost and every existing stop keeps working unchanged.
insert into public.milestone_criteria (milestone_id, metric, threshold, unit)
select ms.id, ms.metric, ms.threshold,
       case when ms.metric <> 'days' then 'days'
            when ms.threshold >= 365 then 'years'
            when ms.threshold >= 60  then 'months'
            else 'days' end
from public.milestones ms
where not exists (select 1 from public.milestone_criteria c where c.milestone_id = ms.id)
on conflict do nothing;

-- REWARD KINDS, CUT DOWN TO WHAT THEY ACTUALLY ARE.
--
-- `access` promised early briefs and nothing in the product delivered it, so it
-- was a chip that meant nothing. `status` and `role` were the same thing said
-- twice. What is left is: a thing, money off a trip, a title, or something the
-- admin describes.
alter table public.milestones add column if not exists role_title text;

update public.milestones set reward_kind = 'role'  where reward_kind = 'status';
update public.milestones set reward_kind = 'other' where reward_kind = 'access';
-- The one existing role stop names its title in the reward text.
update public.milestones set role_title = reward
 where reward_kind = 'role' and role_title is null and reward is not null;

alter table public.milestones drop constraint if exists milestones_reward_kind_check;
alter table public.milestones add constraint milestones_reward_kind_check
  check (reward_kind in ('merch','voucher','role','other'));

-- THE TITLE A CREATOR EARNS, kept apart from the one the team hands out.
--
-- `role_title` is a Tryp.com job - "Spanish Country Manager" - set by an admin
-- and guarded by a trigger that stops anyone else touching it. An earned role is
-- the opposite: nobody types it, the ladder awards it. Sharing one column would
-- have meant either the ladder overwriting somebody's job title or the guard
-- refusing the ladder's own write. Two columns, one badge.
alter table public.profiles add column if not exists earned_role text;

-- The old single-metric pair is now duplicated data, and duplicated data drifts.
alter table public.milestones drop column if exists metric;
alter table public.milestones drop column if exists threshold;

-- Two more things worth measuring, both about the work rather than the volume.
-- Both functions change shape, and Postgres will not replace a function whose
-- return type moved, so they are dropped rather than replaced.
drop function if exists public.milestone_progress(uuid);
drop function if exists public.creator_metrics(uuid);

create or replace function public.creator_metrics(p_profile uuid)
returns table(videos numeric, views numeric, referrals numeric, challenges numeric,
              days numeric, podiums numeric, best_video numeric)
language sql stable security definer set search_path to 'public'
as $function$
  select
    (select count(*) from public.submissions where creator_id = p_profile)::numeric,
    (select coalesce(sum(coalesce(logged_views, 0)), 0) from public.submissions where creator_id = p_profile)::numeric,
    (select count(distinct r.id) from public.profiles r
       join public.submissions s on s.creator_id = r.id
      where r.referred_by = p_profile and r.status = 'active')::numeric,
    (select count(distinct challenge_id) from public.submissions where creator_id = p_profile)::numeric,
    (select greatest(0, extract(epoch from (now() - coalesce(accepted_at, created_at))) / 86400)
       from public.profiles where id = p_profile)::numeric,
    (select count(*) from public.results where creator_id = p_profile and rank between 1 and 3)::numeric,
    (select coalesce(max(coalesce(logged_views, 0)), 0) from public.submissions where creator_id = p_profile)::numeric;
$function$;

-- WHERE ONE CREATOR STANDS ON THE LADDER, gating included.
--
-- Split out from `milestone_progress` because the progress call needs the same
-- answer three times - to award, to withdraw, and to return it - and computing
-- it once per use in one place is the only way those three can never disagree.
create or replace function public.milestone_state(p_profile uuid)
returns table(
  id uuid, title text, description text, reward text, reward_kind text,
  role_title text, icon text, sort_order int,
  criteria jsonb, met boolean, reached boolean, blocked boolean
)
language sql stable security definer set search_path to 'public'
as $function$
  with k as (select * from public.creator_metrics(p_profile)),
  scored as (
    select ms.id, ms.title, ms.description, ms.reward, ms.reward_kind,
           ms.role_title, ms.icon, ms.sort_order,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'metric', c.metric, 'threshold', c.threshold, 'unit', c.unit,
                 'value', case c.metric
                            when 'videos' then k.videos
                            when 'views' then k.views
                            when 'referrals' then k.referrals
                            when 'challenges' then k.challenges
                            when 'days' then k.days
                            when 'podiums' then k.podiums
                            when 'best_video' then k.best_video
                          end,
                 'done', case c.metric
                            when 'videos' then k.videos
                            when 'views' then k.views
                            when 'referrals' then k.referrals
                            when 'challenges' then k.challenges
                            when 'days' then k.days
                            when 'podiums' then k.podiums
                            when 'best_video' then k.best_video
                          end >= c.threshold
               ) order by c.threshold desc
             ) filter (where c.id is not null),
             '[]'::jsonb
           ) as criteria,
           -- A stop with no requirements at all is NOT met. It cannot be: there
           -- is nothing to have done. It therefore also holds up everything
           -- behind it, which is loud enough that the admin will notice and
           -- finish setting it up.
           coalesce(bool_and(
             case c.metric
               when 'videos' then k.videos
               when 'views' then k.views
               when 'referrals' then k.referrals
               when 'challenges' then k.challenges
               when 'days' then k.days
               when 'podiums' then k.podiums
               when 'best_video' then k.best_video
             end >= c.threshold
           ), false) as met
    from public.milestones ms
    cross join k
    left join public.milestone_criteria c on c.milestone_id = ms.id
    where ms.is_active
    group by ms.id
  )
  select s.id, s.title, s.description, s.reward, s.reward_kind,
         s.role_title, s.icon, s.sort_order, s.criteria, s.met,
         -- THE GATE, in one window function: reached means every stop up to and
         -- including this one is met. That is what makes the drawing honest -
         -- the lit part of the line is always a prefix of it, never a scatter.
         bool_and(s.met) over (order by s.sort_order, s.id
                               rows between unbounded preceding and current row) as reached,
         s.met and not bool_and(s.met) over (order by s.sort_order, s.id
                               rows between unbounded preceding and current row) as blocked
  from scored s
  order by s.sort_order, s.id;
$function$;

create or replace function public.milestone_progress(p_profile uuid default null)
returns table(
  id uuid, title text, description text, reward text, reward_kind text,
  role_title text, icon text, sort_order int,
  criteria jsonb, met boolean, reached boolean, blocked boolean,
  reached_at timestamptz
)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_me uuid := coalesce(p_profile, auth.uid());
  v_role text;
begin
  if v_me is null then return; end if;

  -- Award anything newly reached.
  insert into public.creator_milestones (profile_id, milestone_id)
  select v_me, g.id from public.milestone_state(v_me) g where g.reached
  on conflict do nothing;

  -- WITHDRAW ANYTHING NO LONGER REACHED, and yes, that is deliberate.
  --
  -- The ladder is editable: an admin can raise a threshold, add a requirement to
  -- a stop, or slot a new stop in front of one somebody had passed. A record
  -- that survives all of that is not a record of anything - it would light a dot
  -- on a route the creator can no longer be standing on. `reached_at` on a stop
  -- that is STILL reached is never touched, so real history keeps its date.
  delete from public.creator_milestones cm
  where cm.profile_id = v_me
    and exists (select 1 from public.milestones ms where ms.id = cm.milestone_id and ms.is_active)
    and not exists (select 1 from public.milestone_state(v_me) g where g.id = cm.milestone_id and g.reached);

  -- The title, if the ladder hands out one. The furthest stop reached wins, so
  -- overtaking "Senior Creator" with something better replaces it rather than
  -- leaving the creator wearing both.
  select g.role_title into v_role
    from public.milestone_state(v_me) g
   where g.reached and g.reward_kind = 'role' and g.role_title is not null
   order by g.sort_order desc limit 1;

  update public.profiles p set earned_role = v_role
   where p.id = v_me and p.earned_role is distinct from v_role;

  return query
  select g.id, g.title, g.description, g.reward, g.reward_kind,
         g.role_title, g.icon, g.sort_order, g.criteria, g.met, g.reached, g.blocked,
         cm.reached_at
  from public.milestone_state(v_me) g
  left join public.creator_milestones cm
    on cm.milestone_id = g.id and cm.profile_id = v_me
  order by g.sort_order, g.id;
end;
$function$;

-- The standings counted a LEFT JOIN'd row rather than the join's own key, so an
-- inactive milestone somebody had reached still added one to their count - the
-- filter was written but never applied.
create or replace function public.milestone_standings()
returns table(id uuid, name text, photo_url text, reached integer, latest_at timestamptz)
language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.name, p.photo_url,
         count(ms.id)::int as reached,
         max(cm.reached_at) as latest_at
  from public.profiles p
  left join public.creator_milestones cm on cm.profile_id = p.id
  left join public.milestones ms on ms.id = cm.milestone_id and ms.is_active
  where p.status = 'active' and p.is_test = false and p.is_admin = false
  group by p.id
  order by reached desc, latest_at asc nulls last, p.name;
$function$;

grant execute on function public.milestone_state(uuid) to authenticated;
grant execute on function public.milestone_progress(uuid) to authenticated;
grant execute on function public.creator_metrics(uuid) to authenticated;
