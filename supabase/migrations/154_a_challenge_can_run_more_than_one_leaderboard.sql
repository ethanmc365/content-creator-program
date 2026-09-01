-- A CHALLENGE CAN RUN MORE THAN ONE LEADERBOARD.
--
-- Ethan: "the way the Spanish community is currently run, they have two groups
-- inside the one challenge. We need to build this feature into challenges when
-- creating them... the admin creating the challenge would need to have the
-- ability to select which creators to add to each group, but also have an
-- option to split randomly... there would need to be prizes set for each group,
-- the creator would need to know what group they're in clearly... the analytics
-- page should combine the data as just the one challenge, but clicking in on
-- the challenge data should reveal more data from the different groups."
--
-- WHY GROUPS ARE NOT JUST TWO CHALLENGES. Spain already runs this by hand, and
-- the reason they do not simply create two challenges is that it is ONE brief,
-- one deadline, one set of rules and one announcement. Splitting it into two
-- rows would double every one of those, and would make the combined figure -
-- which is the number the programme is actually measured on - something
-- somebody has to add up by hand. So a group is a PARTITION OF THE ENTRANTS,
-- not a copy of the contest.
--
-- WHAT A GROUP OWNS: a name, an order, and its own prize. Nothing else. It does
-- not own the brief, the dates, the platforms, the scoring mode or the point
-- rules - those are the challenge's, and a group that could override them would
-- be a challenge wearing a smaller word.
--
-- ONE GROUP PER CREATOR PER CHALLENGE, enforced by the primary key. A creator
-- in two groups would appear on two leaderboards with the same views and could
-- win twice, which is not a thing anybody means by "split them in two".
--
-- A CHALLENGE WITH NO GROUP ROWS BEHAVES EXACTLY AS IT DOES TODAY. Every read
-- path below falls back to the single-leaderboard behaviour when
-- `challenge_groups` is empty for that challenge, so nothing that exists now
-- changes until an admin explicitly creates groups.

create table if not exists public.challenge_groups (
  id              uuid primary key default gen_random_uuid(),
  challenge_id    uuid not null references public.challenges(id) on delete cascade,
  name            text not null,
  position        int not null default 0,
  -- The group's own prize, in the same shape the challenge carries its own.
  -- Null means "whatever the challenge says", so a two-group challenge with one
  -- prize pot does not have to state it twice.
  prize_amount    numeric(10,2),
  prize_currency  text default 'EUR',
  prize_type      text,
  winners_count   int,
  prize_structure jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists challenge_groups_challenge_idx
  on public.challenge_groups (challenge_id, position);

create table if not exists public.challenge_group_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  group_id     uuid not null references public.challenge_groups(id) on delete cascade,
  creator_id   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- THE KEY IS (challenge, creator), NOT (group, creator). That is the whole
  -- rule: you are in at most one group of any given challenge.
  primary key (challenge_id, creator_id)
);

create index if not exists challenge_group_members_group_idx
  on public.challenge_group_members (group_id);
create index if not exists challenge_group_members_creator_idx
  on public.challenge_group_members (creator_id);

-- The saved leaderboard remembers which board a row was ranked on. Without it
-- `results` holds two rank-1 rows for one challenge and nothing can tell them
-- apart. Null is the single-leaderboard case and stays the default.
alter table public.results
  add column if not exists group_id uuid references public.challenge_groups(id) on delete set null;

create index if not exists results_group_idx on public.results (challenge_id, group_id, rank);

alter table public.challenge_groups        enable row level security;
alter table public.challenge_group_members enable row level security;

-- READABLE BY EVERY SIGNED-IN CREATOR, because a leaderboard nobody can see is
-- not a leaderboard and "which group am I in" is the first question this
-- feature has to answer. Challenges themselves are already readable this way.
-- Writable by admins only.
drop policy if exists challenge_groups_read on public.challenge_groups;
create policy challenge_groups_read on public.challenge_groups
  for select to authenticated using (true);

drop policy if exists challenge_groups_manage on public.challenge_groups;
create policy challenge_groups_manage on public.challenge_groups
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists challenge_group_members_read on public.challenge_group_members;
create policy challenge_group_members_read on public.challenge_group_members
  for select to authenticated using (true);

drop policy if exists challenge_group_members_manage on public.challenge_group_members;
create policy challenge_group_members_manage on public.challenge_group_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------- the random split is CLIENT SIDE
--
-- "Have an option to split randomly, so the amount of creators would be
-- randomly split in two groups or however many groups the admin created."
--
-- There is deliberately no RPC for this. The split has to be VISIBLE BEFORE IT
-- IS SAVED: an admin presses the button, reads the two lists of names, and
-- moves the three people they want moved before committing to anything. A
-- function that dealt the rows server-side would make the button an
-- irreversible action whose result you can only inspect afterwards, which is
-- the wrong shape for a decision somebody wants to adjust.
--
-- So the deal lives in `lib/challengeGroups.dealEvenly`, where it is pure and
-- unit-tested, and the form writes the membership rows it produced along with
-- everything else it is saving.
--
-- WHAT THAT FUNCTION GETS RIGHT AND A NAIVE VERSION DOES NOT: it shuffles once
-- and deals round-robin rather than picking a random group per creator.
-- Independent choices give 13/7 out of 20 about one time in eight, and a split
-- that can come out lopsided is not what anybody means by splitting evenly.

-- ------------------------------------------------- the leaderboard, per group
--
-- `rebuild_challenge_results` ranked every entrant against every other entrant.
-- With groups it has to rank them WITHIN their group, which is one `partition
-- by` - and the identical query with no groups produces exactly the ranking it
-- produced before, because every row lands in the same null partition.
--
-- A creator who has entered but is in NO group still gets ranked, in that null
-- partition. That is deliberate: dropping their entry off the board entirely
-- because an admin forgot to deal them in would be the platform silently
-- disqualifying somebody. The UI shows them under "Not in a group", which is a
-- problem an admin can see and fix.
create or replace function public.rebuild_challenge_results(p_challenge uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mode      text;
  v_community uuid;
  v_rows      integer;
begin
  select scoring, community_id into v_mode, v_community
  from public.challenges where id = p_challenge;

  if v_mode is null then
    return 0;
  end if;

  -- A points leaderboard is not a view ranking. Leave it alone entirely.
  if v_mode = 'points' then
    return 0;
  end if;

  with scored as (
    select
      s.creator_id,
      gm.group_id,
      case
        when v_mode = 'total_views' then sum(coalesce(s.logged_views, 0))
        else max(coalesce(s.logged_views, 0))
      end::integer as score
    from public.submissions s
    left join public.challenge_group_members gm
      on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
    where s.challenge_id = p_challenge
      and s.logged_views is not null
    group by s.creator_id, gm.group_id
  ),
  ranked as (
    select creator_id, group_id, score,
           row_number() over (partition by group_id order by score desc, creator_id) as rank
    from scored
  ),
  wiped as (
    delete from public.results where challenge_id = p_challenge returning 1
  ),
  inserted as (
    insert into public.results (challenge_id, creator_id, final_views, rank, community_id, group_id)
    select p_challenge, r.creator_id, r.score, r.rank::integer, v_community, r.group_id
    from ranked r
    where (select count(*) from wiped) >= 0
    returning 1
  )
  select count(*) into v_rows from inserted;

  update public.challenges
     set results_updated_at = now(),
         results_status = case when results_status = 'none' then 'interim' else results_status end
   where id = p_challenge;

  return coalesce(v_rows, 0);
end;
$$;

-- ------------------------------------------------------ the numbers, combined
--
-- "The analytics page should combine the data as just the one challenge, but
-- clicking in on the challenge data should reveal more data and analytics from
-- the different groups and comparing each."
--
-- One row per group per challenge, with the totals the analytics page compares
-- them on. The COMBINED figure is the sum of these rows, which is what makes
-- the two views agree by construction rather than by two queries being kept in
-- step: a challenge's total views is the sum of its groups' views, always,
-- including the unassigned pseudo-group.
--
-- `security_invoker` so the view obeys the caller's RLS on submissions rather
-- than becoming a way around it.
create or replace view public.challenge_group_totals
with (security_invoker = true) as
select
  s.challenge_id,
  gm.group_id,
  count(distinct s.creator_id)                  as creators,
  count(s.id)                                   as entries,
  coalesce(sum(coalesce(s.logged_views, 0)), 0) as views,
  coalesce(max(coalesce(s.logged_views, 0)), 0) as best_video,
  max(s.submitted_at)                           as last_entry_at
from public.submissions s
left join public.challenge_group_members gm
  on gm.challenge_id = s.challenge_id and gm.creator_id = s.creator_id
group by s.challenge_id, gm.group_id;

notify pgrst, 'reload schema';
