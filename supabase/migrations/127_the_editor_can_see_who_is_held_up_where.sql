-- WHO IS STANDING AT EACH STOP, for the person editing the ladder.
--
-- Ordering a gated route wrong is silent and expensive. The live ladder puts
-- "refer a creator" second, so a creator with fourteen videos and 23,000 views
-- has four stops earned and none of them awarded - and nothing on the editing
-- page said so. This is the number that makes that visible: `blocked` on a stop
-- means "this many people have already done this and cannot have it", and a
-- large number there is always an argument about where the stop sits.
create or replace function public.milestone_overview()
returns table(milestone_id uuid, reached int, blocked int, working int)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not public.is_admin() then return; end if;

  return query
  with people as (
    select p.id from public.profiles p
     where p.status = 'active'
       and p.is_test = false
       and p.is_admin = false
       and coalesce(p.is_sandbox, false) = false
  ),
  st as (
    select pe.id as profile_id, g.*
    from people pe
    cross join lateral public.milestone_state(pe.id) g
  ),
  nxt as (
    select s.profile_id, min(s.sort_order) as next_sort
    from st s where not s.reached group by s.profile_id
  )
  select s.id,
         count(*) filter (where s.reached)::int,
         count(*) filter (where s.blocked)::int,
         count(*) filter (where n.next_sort = s.sort_order)::int
  from st s
  left join nxt n on n.profile_id = s.profile_id
  group by s.id;
end;
$function$;

grant execute on function public.milestone_overview() to authenticated;

-- ---- data corrections to what 126 migrated ----

-- "Featured in the community newsletter" was a `status` reward. 126 mapped
-- status -> role and copied the reward text into role_title, which is right for
-- "Tryp.com Senior Creator" and plainly wrong for this one: nobody wears a
-- newsletter mention beside their name. It is a reward, not a title.
update public.milestones
   set reward_kind = 'other', role_title = null
 where role_title = 'Featured in the community newsletter';

-- 126 tagged thresholds over 60 days as "months" but left the raw day count
-- alone, so "Six months in" was stored as 180 and rendered as "5.91 months".
-- Anything created through the form is exact by construction; this snaps the
-- rows that predate the form.
update public.milestone_criteria
   set threshold = round(threshold / 30.4375) * 30.4375
 where metric = 'days' and unit = 'months'
   and threshold <> round(round(threshold / 30.4375) * 30.4375);

update public.milestone_criteria set threshold = round(threshold) where metric = 'days';
