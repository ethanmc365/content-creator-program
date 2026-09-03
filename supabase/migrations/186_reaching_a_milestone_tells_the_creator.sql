-- ============================================================================
-- 186 - reaching a milestone told you only if it paid a voucher.
--       APPLIED 3 Sep 2026. Carries the live body of milestone_progress_internal.
--
-- Once 185 made the engine able to see anybody, five real creators were awarded
-- "Getting Started" and none of them was told, because the only notification in
-- `milestone_progress_internal` sat inside the VOUCHER loop. "Getting Started"
-- pays a role, so it silently set `earned_role` on their profile and stopped.
--
-- A ladder nobody is told they have climbed is a ladder nobody climbs. The
-- notification follows the AWARD now rather than the reward kind, and says what
-- they actually got: a title, a voucher on its way, or the stop itself.
--
-- IT FIRES ON THE INSERT AND ONLY ON THE INSERT. `returning` gives exactly the
-- rows that were new, so a creator is told once, on the pass that awards them,
-- and the ten-minute reconcile never tells anybody twice. The five awarded by
-- 185 are already in the table and so are correctly not notified about
-- something that happened before this existed.
--
-- VERIFIED in a rolled-back transaction: a reachable role stop produced
-- "You are now a Trailblazer" and set earned_role; a second pass produced no
-- second notification; a voucher stop produced "You have earned a Tryp.com
-- voucher" AND minted the reward row.
-- ============================================================================
create or replace function public.milestone_progress_internal(p_profile uuid)
returns table(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean, reached_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me   uuid := p_profile;
  v_role text;
  v_home uuid;
  v_rows int;
  m      record;
  a      record;
begin
  if v_me is null then return; end if;

  -- AN EMPTY STATE MEANS "COULD NOT COMPUTE", NOT "EARNED NOTHING". Without
  -- this, a state that comes back empty for any reason takes every earned
  -- milestone and every pending milestone voucher with it. See 185.
  select count(*) into v_rows from public.milestone_state_internal(v_me);
  if v_rows = 0 and exists (select 1 from public.milestones where is_active) then
    return;
  end if;

  -- THE AWARD, AND THE ONE MOMENT IT IS NEW. `returning` is what makes the
  -- notification below fire once rather than every ten minutes for ever.
  for a in
    insert into public.creator_milestones (profile_id, milestone_id)
    select v_me, g.id from public.milestone_state_internal(v_me) g where g.reached
    on conflict do nothing
    returning milestone_id
  loop
    select ms.title, ms.reward_kind, ms.role_title, ms.voucher_amount
      into m
      from public.milestones ms where ms.id = a.milestone_id;

    perform public.notify_user(
      v_me, 'reward',
      case
        when m.reward_kind = 'role' and coalesce(m.role_title, '') <> ''
          then 'You are now a ' || m.role_title
        when m.reward_kind = 'voucher' and coalesce(m.voucher_amount, 0) > 0
          then 'You have earned a Tryp.com voucher'
        else 'Milestone reached: ' || m.title
      end,
      case
        when m.reward_kind = 'voucher' and coalesce(m.voucher_amount, 0) > 0
          then 'Reaching "' || m.title || '" earned you a voucher. It is on its way.'
        else 'You reached "' || m.title || '". Have a look at what is next.'
      end,
      '/milestones'
    );
  end loop;

  delete from public.creator_milestones cm
  where cm.profile_id = v_me
    and exists (select 1 from public.milestones ms where ms.id = cm.milestone_id and ms.is_active)
    and not exists (select 1 from public.milestone_state_internal(v_me) g where g.id = cm.milestone_id and g.reached);

  select cm2.community_id into v_home
    from public.community_members cm2
   where cm2.profile_id = v_me and cm2.role = 'creator'
   order by cm2.joined_at nulls last limit 1;

  -- The voucher itself. Its notification is handled above with every other
  -- award, so this loop only mints money now.
  for m in
    select g.id as ms_id, g.title as ms_title, ms.voucher_amount as amt, ms.voucher_currency as cur
    from public.milestone_state_internal(v_me) g
    join public.milestones ms on ms.id = g.id
    where g.reached
      and g.reward_kind = 'voucher'
      and coalesce(ms.voucher_amount, 0) > 0
      and not exists (
        select 1 from public.rewards r
         where r.creator_id = v_me and r.milestone_id = g.id
      )
  loop
    insert into public.rewards
      (creator_id, challenge_id, community_id, milestone_id, reward_type, amount,
       currency, status, source, payment_notes)
    values
      (v_me, null, v_home, m.ms_id, 'voucher', m.amt,
       coalesce(m.cur, 'EUR'), 'pending', 'milestone',
       'Milestone reward: ' || m.ms_title)
    on conflict do nothing;
  end loop;

  delete from public.rewards r
  where r.creator_id = v_me
    and r.source = 'milestone'
    and r.status = 'pending'
    and r.distributed_at is null
    and r.milestone_id is not null
    and not exists (
      select 1 from public.milestone_state_internal(v_me) g where g.id = r.milestone_id and g.reached
    );

  select g.role_title into v_role
    from public.milestone_state_internal(v_me) g
   where g.reached and g.reward_kind = 'role' and g.role_title is not null
   order by g.sort_order desc limit 1;

  update public.profiles p set earned_role = v_role
   where p.id = v_me and p.earned_role is distinct from v_role;

  return query
  select g.id, g.title, g.description, g.reward, g.reward_kind,
         g.role_title, g.icon, g.sort_order, g.criteria, g.met, g.reached, g.blocked,
         cm.reached_at
  from public.milestone_state_internal(v_me) g
  left join public.creator_milestones cm
    on cm.milestone_id = g.id and cm.profile_id = v_me
  order by g.sort_order, g.id;
end;
$function$;

revoke all on function public.milestone_progress_internal(uuid) from public, anon, authenticated;
