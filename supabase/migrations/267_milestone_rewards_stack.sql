-- A MILESTONE CAN GIVE SEVERAL THINGS AT ONCE (26 Sep 2026).
--
-- Ethan: "One function I need that we don't have currently is the ability to
-- give multiple rewards. For example, I want to give a new title as a reward
-- and also a watch as a reward ... Also, add merch as well."
--
-- `reward_kind` was one choice, and the engine paid the voucher only when it
-- said 'voucher' and granted the title only when it said 'role' - so a stop
-- could never do both, even though `role_title` and `voucher_amount` were
-- already separate columns. Now:
--   * the title is granted whenever `role_title` is set,
--   * the voucher is minted whenever `voucher_amount` > 0,
--   * physical things (merch, a prize such as a watch, anything else) live in
--     `items`, a list of { kind, label }, and each creator who reaches the stop
--     lands on the team's "to send" list until `items_sent_at` is stamped.
-- `reward_kind` stays as the stop's headline kind for older clients.

alter table public.milestones add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.creator_milestones add column if not exists items_sent_at timestamptz;
alter table public.creator_milestones add column if not exists items_sent_by uuid references public.profiles(id);

-- A stop that already promised merch or "something else" in its sentence keeps
-- that promise as an item, so nothing it said disappears.
update public.milestones
   set items = jsonb_build_array(jsonb_build_object('kind', reward_kind, 'label', coalesce(nullif(reward, ''), initcap(reward_kind))))
 where reward_kind in ('merch', 'other') and items = '[]'::jsonb;

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
  v_gets text;
  m      record;
  a      record;
begin
  if v_me is null then return; end if;

  -- AN EMPTY STATE MEANS "COULD NOT COMPUTE", NOT "EARNED NOTHING". See 185.
  select count(*) into v_rows from public.milestone_state_internal(v_me);
  if v_rows = 0 and exists (select 1 from public.milestones where is_active) then
    return;
  end if;

  for a in
    insert into public.creator_milestones (profile_id, milestone_id)
    select v_me, g.id from public.milestone_state_internal(v_me) g where g.reached
    on conflict do nothing
    returning milestone_id
  loop
    select ms.title, ms.role_title, ms.voucher_amount, ms.voucher_currency, ms.items
      into m
      from public.milestones ms where ms.id = a.milestone_id;

    -- Everything the stop gives, said once: "the title Senior Creator, a EUR 20
    -- voucher and a Tryp.com hoodie".
    select string_agg(x, ', ') into v_gets from (
      select 'the title ' || m.role_title as x where coalesce(m.role_title, '') <> ''
      union all
      select 'a ' || case when m.voucher_currency = 'GBP' then '£' else '€' end || trim(to_char(m.voucher_amount, 'FM999999990.##')) || ' Tryp.com voucher'
       where coalesce(m.voucher_amount, 0) > 0
      union all
      select i ->> 'label' from jsonb_array_elements(coalesce(m.items, '[]'::jsonb)) i where coalesce(i ->> 'label', '') <> ''
    ) parts;

    perform public.notify_user(
      v_me, 'reward',
      'Milestone reached: ' || m.title,
      case when v_gets is not null
        then 'You earned ' || v_gets || '.'
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

  -- The voucher, whatever the stop's headline kind says.
  for m in
    select g.id as ms_id, g.title as ms_title, ms.voucher_amount as amt, ms.voucher_currency as cur
    from public.milestone_state_internal(v_me) g
    join public.milestones ms on ms.id = g.id
    where g.reached
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

  -- The title, whatever the stop's headline kind says.
  select g.role_title into v_role
    from public.milestone_state_internal(v_me) g
   where g.reached and coalesce(g.role_title, '') <> ''
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

-- WHO IS OWED SOMETHING PHYSICAL. Admins only; the page ticks rows off.
create or replace function public.milestone_items_to_send()
 returns table(profile_id uuid, name text, photo_url text, country text, milestone_id uuid, milestone_title text, items jsonb, reached_at timestamptz, sent_at timestamptz)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.name, p.photo_url, p.country, ms.id, ms.title, ms.items, cm.reached_at, cm.items_sent_at
    from public.creator_milestones cm
    join public.milestones ms on ms.id = cm.milestone_id
    join public.profiles p on p.id = cm.profile_id
   where public.is_admin()
     and jsonb_array_length(coalesce(ms.items, '[]'::jsonb)) > 0
     and not coalesce(p.is_test, false)
   order by (cm.items_sent_at is not null), cm.reached_at desc
$function$;
revoke all on function public.milestone_items_to_send() from public, anon;
grant execute on function public.milestone_items_to_send() to authenticated;
