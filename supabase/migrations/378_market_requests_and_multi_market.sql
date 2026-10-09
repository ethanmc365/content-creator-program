-- 378: JOINING ANOTHER MARKET, AND PLACING A CREATOR IN SEVERAL (10 Oct 2026).
--
-- Ethan: "there is a Portuguese creator that also creates content in Spanish but currently she's only in the Portugal
-- community. We have the function for them to request to join other markets but it's quite hidden ... improve the page
-- and functionality so admins are notified, perhaps under applications but highlighted that it's relating to just join
-- another market ... approved and they'll have access to multiple markets, or declined." And: "the ability for admins to
-- manually add creators ... we have the ability for them to move but this seems to remove them from the community they
-- were in, we would need this function too but also the function to add them to multiple ... ensure VIP creators etc
-- don't see this."
--
-- On 10 Oct two requests had been waiting since 5 and 9 Oct: the notice linked to Global settings, where nobody looks.

-- One open request per creator per market (a second press is a no-op, not a second row).
create unique index if not exists market_join_requests_one_open on public.market_join_requests (community_id, profile_id) where status = 'pending';

-- A paid creator (VIP or official) is placed by the team, so they do not ask.
drop policy if exists "join requests: ask for yourself" on public.market_join_requests;
create policy "join requests: ask for yourself" on public.market_join_requests for insert
  with check (profile_id = (select auth.uid() as gate) and status = 'pending' and not (select public.is_active_vip() as gate));

-- ASKING: through one function, so the reasons a request cannot be made are said in words.
create or replace function public.request_join_market(p_community uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.communities; me public.profiles; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into me from public.profiles where id = auth.uid();
  if me.status not in ('active', 'muted') then raise exception 'Your account needs to be approved first.'; end if;
  if public.is_active_vip() then raise exception 'Your market is set by the team. Message them if you want to change it.'; end if;
  select * into c from public.communities where id = p_community;
  if c.id is null or c.kind <> 'chapter' or c.retired_at is not null then raise exception 'That market is not open.'; end if;
  if not c.is_active then raise exception '% is not open yet.', c.name; end if;
  if exists (select 1 from public.community_members where community_id = c.id and profile_id = me.id and status = 'active') then
    raise exception 'You are already in %.', c.name;
  end if;
  select id into v_id from public.market_join_requests where community_id = c.id and profile_id = me.id and status = 'pending';
  if v_id is not null then
    update public.market_join_requests set note = coalesce(nullif(left(btrim(coalesce(p_note, '')), 500), ''), note) where id = v_id;
    return v_id;
  end if;
  insert into public.market_join_requests (community_id, profile_id, note, status)
  values (c.id, me.id, nullif(left(btrim(coalesce(p_note, '')), 500), ''), 'pending')
  returning id into v_id;
  return v_id;
end $$;

-- THE TEAM HEARS ABOUT IT WHERE THEY ACT ON IT: Applications, on the market requests tab.
create or replace function public.on_market_join_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_market text; v_challenge text; v_body text; v_now text;
begin
  select name into v_name from public.profiles where id = new.profile_id;
  select name into v_market from public.communities where id = new.community_id;
  select title into v_challenge from public.challenges where id = new.challenge_id;
  select string_agg(c.name, ' and ' order by c.name) into v_now
    from public.community_members cm join public.communities c on c.id = cm.community_id and c.kind = 'chapter'
   where cm.profile_id = new.profile_id and cm.status = 'active' and cm.role = 'creator';
  v_body := concat_ws(' ',
    case when v_now is not null then format('Already in %s.', v_now) end,
    case when v_challenge is not null then format('Through the challenge "%s".', v_challenge) end,
    case when coalesce(btrim(new.note), '') <> '' then format('Why: "%s"', left(btrim(new.note), 280)) end,
    'Approve or decline it in Applications.');
  perform public.notify_user(
    p.id, 'community',
    format('%s asked to join %s', coalesce(v_name, 'A creator'), coalesce(v_market, 'a market')),
    v_body, '/admin/applications?tab=markets')
  from public.profiles p
  where p.is_admin and not p.is_test and not coalesce(p.is_sandbox, false)
    and (p.platform_role = 'owner'
         or exists (select 1 from public.community_members m
                     where m.community_id = new.community_id and m.profile_id = p.id
                       and m.role = 'manager' and m.status = 'active')
         or (p.platform_role = 'global_admin' and not exists (
               select 1 from public.community_members m join public.profiles q on q.id = m.profile_id
                where m.community_id = new.community_id and m.role = 'manager' and m.status = 'active'
                  and q.platform_role <> 'owner' and not q.is_test and not coalesce(q.is_sandbox, false))));
  return null;
end $$;

-- DECIDING: the same as before, plus the room links say where to go, and the creator keeps every market they had.
create or replace function public.decide_join_request(p_request uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_name text; v_slug text;
begin
  if not public.is_admin() then raise exception 'Only admins can decide a join request'; end if;
  select * into r from public.market_join_requests where id = p_request;
  if r is null then raise exception 'No such request'; end if;
  if r.status <> 'pending' then raise exception 'That request has already been decided'; end if;
  select name, slug into v_name, v_slug from public.communities where id = r.community_id;
  if p_accept then
    insert into public.community_members (community_id, profile_id, role, status)
    values (r.community_id, r.profile_id, 'creator', 'active')
    on conflict (community_id, profile_id) do update set status = 'active';
    update public.market_join_requests
       set status = 'accepted', decided_by = auth.uid(), decided_at = now(), decision_note = null
     where id = p_request;
    insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
    select auth.uid(), (select name from public.profiles where id = auth.uid()),
           'Accepted a request to join ' || coalesce(v_name, 'a market'), r.profile_id, (select name from public.profiles where id = r.profile_id);
    perform public.notify_user(
      r.profile_id, 'community',
      format('You are in: %s', coalesce(v_name, 'a new market')),
      'Your request was accepted. You keep your other markets too. Say hello in the introductions room.',
      case when v_slug is not null then '/c/' || v_slug else '/global' end);
  else
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Give a reason when declining, so the creator knows why';
    end if;
    update public.market_join_requests
       set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = btrim(p_reason)
     where id = p_request;
    perform public.notify_user(
      r.profile_id, 'community',
      format('About joining %s', coalesce(v_name, 'that market')),
      btrim(p_reason),
      '/global/markets');
  end if;
end $$;

-- PLACING A CREATOR: exactly these markets. Adds what is new, takes away what is not ticked (their points, entries and
-- connections stay, as with a move), never touches a market they MANAGE, and keeps one home. A move is this call with
-- one market; "add to Spain as well" is this call with both.
create or replace function public.admin_set_creator_markets(p_profile uuid, p_markets uuid[], p_home uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_want uuid[]; v_added text[] := '{}'; v_removed text[] := '{}'; v_home uuid; c record; v_name text; v_who text;
begin
  if not public.is_global_admin() then raise exception 'Only the Tryp.com team can place creators in markets.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_want
    from unnest(coalesce(p_markets, '{}'::uuid[])) x
    join public.communities cc on cc.id = x and cc.kind = 'chapter' and cc.retired_at is null;
  if cardinality(v_want) = 0 then raise exception 'Pick at least one market.'; end if;
  select name into v_who from public.profiles where id = p_profile;
  if v_who is null then raise exception 'No such creator.'; end if;

  -- Taken out of: the creator rows for chapters that are not ticked.
  for c in select cm.community_id, co.name from public.community_members cm join public.communities co on co.id = cm.community_id
            where cm.profile_id = p_profile and co.kind = 'chapter' and cm.role = 'creator' and cm.status = 'active'
              and not (cm.community_id = any (v_want)) loop
    delete from public.community_members where community_id = c.community_id and profile_id = p_profile and role = 'creator';
    v_removed := v_removed || c.name;
  end loop;

  -- Put in: the ticked chapters they are not active in yet.
  for c in select co.id, co.name from public.communities co where co.id = any (v_want)
              and not exists (select 1 from public.community_members cm where cm.community_id = co.id and cm.profile_id = p_profile and cm.status = 'active') loop
    insert into public.community_members (community_id, profile_id, role, status)
    values (c.id, p_profile, 'creator', 'active')
    on conflict (community_id, profile_id) do update set status = 'active';
    v_added := v_added || c.name;
    update public.market_join_requests set status = 'accepted', decided_by = auth.uid(), decided_at = now()
     where community_id = c.id and profile_id = p_profile and status = 'pending';
  end loop;

  -- One home: the one asked for, else the one they had if it is still ticked, else the first ticked.
  v_home := coalesce(
    case when p_home = any (v_want) then p_home end,
    (select cm.community_id from public.community_members cm where cm.profile_id = p_profile and cm.is_home and cm.community_id = any (v_want) limit 1),
    v_want[1]);
  update public.community_members cm set is_home = (cm.community_id = v_home)
   where cm.profile_id = p_profile and cm.community_id in (select id from public.communities where kind = 'chapter');

  if cardinality(v_added) > 0 or cardinality(v_removed) > 0 then
    insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
    select auth.uid(), (select name from public.profiles where id = auth.uid()),
           concat_ws('; ',
             case when cardinality(v_added) > 0 then 'Added to ' || array_to_string(v_added, ', ') end,
             case when cardinality(v_removed) > 0 then 'Taken out of ' || array_to_string(v_removed, ', ') end),
           p_profile, v_who;
  end if;
  if cardinality(v_added) > 0 then
    select string_agg(n, ' and ') into v_name from unnest(v_added) n;
    perform public.notify_user(p_profile, 'community', 'You are in: ' || v_name,
      'The team added you. Its rooms, briefs and challenges are open to you now, alongside your other markets.', '/global');
  end if;
  return jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed), 'home', v_home);
end $$;

revoke all on function public.request_join_market(uuid, text) from anon;
revoke all on function public.admin_set_creator_markets(uuid, uuid[], uuid) from anon;
