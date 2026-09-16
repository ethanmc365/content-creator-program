-- A CERTIFICATE DESIGN BUILT TODAY HAS TO BE ABLE TO REACH LAST MONTH.
--
-- APPLIED 16 Sep 2026 as `a_certificate_design_can_reach_backwards`.
--
-- `award_challenge_certificates_internal` (222) fires on
-- `winners_published_at`, so a design only ever catches challenges published
-- AFTER it was made. That is correct for the trigger and useless for the first
-- one: the programme has forty-nine finished challenges, and an admin who
-- builds "Challenge winner" expects the people who won to have it. Without this
-- they would have to re-publish every old challenge's winners, which re-runs
-- prize awards.
--
-- ONE MATCHING FUNCTION, TWO USES. `certificate_candidates` is the read-only
-- half - it answers "who would get this?" in the builder, before anything is
-- written - and `backfill_certificate_design` is the same query with an INSERT
-- on the front. They cannot disagree about who qualifies, because there is only
-- one of them.
create or replace function public.certificate_candidates(p_design uuid)
returns table (profile_id uuid, creator_name text, challenge_title text, place integer, facts jsonb, already boolean)
language sql stable security definer set search_path to 'public' as $$
  with d as (select * from public.certificate_designs where id = p_design)
  select r.creator_id, p.name, c.title, r.rank,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', c.title, 'market', com.name,
           'place', r.rank, 'views', nullif(r.final_views, 0),
           'date', coalesce(c.end_date, now())
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = r.creator_id
                   and a.challenge_id = c.id)
  from d
  join public.challenges c on c.winners_published_at is not null
  join public.results r on r.challenge_id = c.id
  join public.profiles p on p.id = r.creator_id
  left join public.communities com on com.id = c.community_id
  where d.award_on = 'challenge_rank'
    and r.rank = any(d.ranks)
    and (cardinality(d.community_ids) = 0 or c.community_id = any(d.community_ids))
  union all
  select s.creator_id, p.name, c.title, null::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', c.title, 'market', com.name,
           'date', coalesce(c.end_date, now())
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = s.creator_id
                   and a.challenge_id = c.id)
  from d
  join public.challenges c on c.winners_published_at is not null
  join (select distinct creator_id, challenge_id from public.submissions) s on s.challenge_id = c.id
  join public.profiles p on p.id = s.creator_id
  left join public.communities com on com.id = c.community_id
  where d.award_on = 'challenge_entry'
    and (cardinality(d.community_ids) = 0 or c.community_id = any(d.community_ids))
  union all
  select cm.profile_id, p.name, m.title, null::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'milestone', m.title, 'date', cm.reached_at
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = cm.profile_id
                   and a.milestone_id = cm.milestone_id)
  from d
  join public.creator_milestones cm on cm.milestone_id = d.milestone_id
  join public.profiles p on p.id = cm.profile_id
  join public.milestones m on m.id = cm.milestone_id
  where d.award_on = 'milestone' and d.milestone_id is not null;
$$;

-- AWARD EVERY ONE OF THEM THAT IS NOT ALREADY AWARDED.
--
-- Admins only, and `on conflict do nothing` on top of the `already` flag, so
-- pressing it twice is a no-op. The two guards are not redundant: `already`
-- makes the BUTTON honest about how many it will create, and the constraint
-- makes the WRITE safe if two admins press it at once.
--
-- VERIFIED that the admin check works: called with no `auth.uid()` (the service
-- role, from a SQL console) it raises rather than awarding.
create or replace function public.backfill_certificate_design(p_design uuid)
returns integer language plpgsql volatile security definer set search_path to 'public' as $$
declare
  made integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can award certificates';
  end if;
  with cand as (
    select * from public.certificate_candidates(p_design) where not already
  ), ins as (
    insert into public.certificate_awards
      (design_id, profile_id, challenge_id, milestone_id, community_id, facts, serial, awarded_by)
    select p_design, c.profile_id,
           (select ch.id from public.challenges ch where ch.title = c.challenge_title
              and ch.winners_published_at is not null limit 1),
           (select d.milestone_id from public.certificate_designs d where d.id = p_design),
           (select ch.community_id from public.challenges ch where ch.title = c.challenge_title
              and ch.winners_published_at is not null limit 1),
           c.facts, public.certificate_serial(), auth.uid()
    from cand c
    on conflict do nothing
    returning 1
  )
  select count(*) into made from ins;
  return made;
end $$;
