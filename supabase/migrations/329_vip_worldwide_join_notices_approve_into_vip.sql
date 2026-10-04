-- 329 (4 Oct 2026): A WORLDWIDE VIP MARKET, VIP SIGN-UPS ONLY ANNOUNCED WHEN THE PROFILE IS SENT, AND APPROVING INTO A VIP MARKET.
--
-- Ethan, testing the one VIP link:
--  1. "as soon as someone starts to sign up, you get a notification" - the notice fired when the VIP row was written (the link is
--     claimed the moment the creator has a session), not when they had finished their profile. It now waits for the profile to be
--     submitted (`profiles.onboarded` turning true).
--  2. "if I select Poland it still shows up as Spain, Switzerland" - the one default programme was VIP Spain, so every country
--     with no VIP market of its own was told it was joining Spain. There is now a VIP WORLDWIDE market (on the worldwide
--     community every creator already belongs to) and IT is the default: any country without a VIP market of its own lands there
--     until a market opens for it.
--  3. "it shows 'Approved in Germany', not VIP Spain / VIP Romania / VIP Worldwide" - a VIP applicant is approved INTO A VIP
--     MARKET, so there is a function that does exactly that and a list of the options.

-- ----------------------------------------------------------------------------------------------- 1. the worldwide VIP market
do $$
declare v_world uuid; v_prog uuid;
begin
  select id into v_world from public.communities where kind = 'network' limit 1;
  if v_world is null then return; end if;
  select id into v_prog from public.vip_programmes where community_id = v_world;
  if v_prog is null then
    insert into public.vip_programmes (community_id, name, currency, cpm, tagline, welcome_message, active)
    values (v_world, 'VIP Worldwide', 'EUR', 0.25,
            'VIP creators from every country that does not have a VIP market of its own yet.',
            'Welcome to the VIP creators. You are paid by the views your videos bring. Add your first video to start your month.', true)
    returning id into v_prog;
    perform public.vip_ensure_rooms(v_prog);
    insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
    values (v_world, 'vip_announcements', 'VIP announcements', 'News for the VIP creators of this market, from the team.',
            'megaphone', 'staff', 'vip', 4)
    on conflict do nothing;
    perform public.vip_ensure_month(v_prog);
  end if;
  update public.vip_programmes set is_default = false where is_default and id <> v_prog;
  update public.vip_programmes set is_default = true where id = v_prog;
end $$;

-- A VIP market with no countries of its own is the worldwide one. The hint is carried in the answer so the client can draw a globe.
create or replace function public.vip_home_for(p_country_code text)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object('programme_id', pr.id, 'name', pr.name, 'slug', c.slug, 'country_codes', c.country_codes,
                            'worldwide', c.kind = 'network',
                            'matched', c.kind = 'chapter' and upper(coalesce(p_country_code, '')) = any (coalesce(c.country_codes, '{}')))
    from public.vip_programmes pr join public.communities c on c.id = pr.community_id
   where pr.active
   order by (c.kind = 'chapter' and upper(coalesce(p_country_code, '')) = any (coalesce(c.country_codes, '{}'))) desc, pr.is_default desc, pr.name
   limit 1
$$;

-- ----------------------------------------------------------------------------------------------- 2. the link, claimed
-- The membership shortcut only looks at MARKETS (chapters). Everybody belongs to the worldwide community, so without this every
-- creator would "already be in" VIP Worldwide the moment it existed.
create or replace function public.claim_vip_invite(p_token text)
returns boolean
language plpgsql security definer set search_path to 'public'
as $$
declare i public.vip_invites; v_prog uuid; v_comm uuid; v_auto boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.vip_members where profile_id = auth.uid() and status = 'active') then return true; end if;
  select * into i from public.vip_invites where token = p_token;
  if i.id is null then return false; end if;
  if not i.is_global and (i.revoked_at is not null or (i.expires_at is not null and i.expires_at < now())
     or (i.max_uses is not null and i.uses >= i.max_uses)) then
    return false;
  end if;
  if i.programme_id is null then
    select pr.id into v_prog from public.community_members cm
      join public.communities cc on cc.id = cm.community_id and cc.kind = 'chapter'
      join public.vip_programmes pr on pr.community_id = cm.community_id and pr.active
     where cm.profile_id = auth.uid() and cm.status = 'active' and cm.role <> 'manager' limit 1;
    if v_prog is null then
      select id into v_prog from public.vip_programmes where is_default and active;
      v_auto := true;
    end if;
    if v_prog is null then select id into v_prog from public.vip_programmes where active order by name limit 1; v_auto := true; end if;
  else
    v_prog := i.programme_id;
  end if;
  if v_prog is null then return false; end if;
  insert into public.vip_members (profile_id, programme_id, status, source, created_by, auto_home)
  values (auth.uid(), v_prog, 'active', 'invite', i.created_by, v_auto)
  on conflict (profile_id) do update set programme_id = excluded.programme_id, status = 'active', left_on = null, auto_home = excluded.auto_home;
  if i.programme_id is not null then
    select community_id into v_comm from public.vip_programmes where id = v_prog;
    insert into public.community_members (community_id, profile_id, role, status)
    values (v_comm, auth.uid(), 'creator', 'active')
    on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';
  end if;
  update public.vip_invites set uses = uses + 1 where id = i.id;
  perform public.vip_ensure_month(v_prog);
  return true;
end $$;

-- Once the country is saved: the VIP market that covers it, or VIP Worldwide. Either way they are HOME, not "waiting to be placed".
create or replace function public.vip_settle_home()
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare m public.vip_members; v_cc text; v_home jsonb; v_prog uuid; v_comm uuid;
begin
  select * into m from public.vip_members where profile_id = auth.uid() and status = 'active';
  if m.profile_id is null then return null; end if;
  select country_code into v_cc from public.profiles where id = auth.uid();
  v_prog := m.programme_id;
  if m.auto_home and v_cc is not null and v_cc <> '' then
    v_home := public.vip_home_for(v_cc);
    v_prog := (v_home ->> 'programme_id')::uuid;
    update public.vip_members set programme_id = v_prog, auto_home = false where profile_id = auth.uid();
  end if;
  select community_id into v_comm from public.vip_programmes where id = v_prog;
  insert into public.community_members (community_id, profile_id, role, status)
  values (v_comm, auth.uid(), 'creator', 'active')
  on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';
  perform public.vip_ensure_month(v_prog);
  return (select jsonb_build_object('programme_id', pr.id, 'name', pr.name) from public.vip_programmes pr where pr.id = v_prog);
end $$;

-- ----------------------------------------------------------------------------------------------- 3. told when the profile is sent
alter table public.vip_members add column if not exists join_notice_pending boolean not null default false;

create or replace function public.vip_send_join_notices(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.vip_members; v_prog text; v_name text;
begin
  select * into m from public.vip_members where profile_id = p_profile and status = 'active';
  if m.profile_id is null then return; end if;
  select name into v_prog from public.vip_programmes where id = m.programme_id;
  select name into v_name from public.profiles where id = p_profile;
  if m.auto_home then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (m.profile_id, 'vip', 'Welcome to the Tryp.com VIP creators',
            'Your application is with the team. Once you are approved you are placed in your VIP market.', '/vip');
    insert into public.notifications (recipient_id, type, title, body, link)
    select pf.id, 'vip', coalesce(v_name, 'Someone') || ' sent in a VIP application', 'They are waiting in the applications list, marked as a VIP.', '/admin/applications'
      from public.profiles pf where pf.platform_role = 'owner' and not pf.is_test and pf.id <> m.profile_id;
  else
    insert into public.notifications (recipient_id, type, title, body, link)
    values (m.profile_id, 'vip', 'Welcome to ' || coalesce(v_prog, 'the VIP programme'),
            coalesce(nullif((select welcome_message from public.vip_programmes where id = m.programme_id), ''),
                     'You are paid by the views your videos bring. Add your first video to start your month.'), '/vip');
    if m.source = 'invite' then
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', coalesce(v_name, 'Someone') || ' sent in a VIP application for ' || coalesce(v_prog, 'the VIP programme'),
             'They signed up with a VIP link and are waiting in the applications list.', '/admin/applications'
        from public.vip_manager_ids(m.programme_id) mgr where mgr <> m.profile_id;
    end if;
  end if;
  update public.vip_members set join_notice_pending = false where profile_id = p_profile;
end $$;
revoke all on function public.vip_send_join_notices(uuid) from public, anon, authenticated;

create or replace function public.vip_notify_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prog text; v_name text; v_sent boolean;
begin
  select name into v_prog from public.vip_programmes where id = new.programme_id;
  select name, coalesce(onboarded, false) into v_name, v_sent from public.profiles where id = new.profile_id;

  -- JOINING (a new VIP, a returning one, or one placed in a market): said once the PROFILE IS SENT, not when the link is opened.
  if (tg_op = 'INSERT' and new.status = 'active')
     or (tg_op = 'UPDATE' and new.status = 'active' and (old.status = 'left' or old.programme_id is distinct from new.programme_id)) then
    if not coalesce(v_sent, false) then
      update public.vip_members set join_notice_pending = true where profile_id = new.profile_id;
      return null;
    end if;
    if tg_op = 'UPDATE' and old.auto_home and not new.auto_home and new.programme_id is distinct from old.programme_id then
      insert into public.notifications (recipient_id, type, title, body, link)
      values (new.profile_id, 'vip', 'You are in ' || coalesce(v_prog, 'your VIP programme'),
              'Your VIP place now sits with your own market, so your rooms, board and payouts are theirs.', '/vip');
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'), 'They signed up with the VIP link and were approved into your market.', '/admin/vip?tab=members'
        from public.vip_manager_ids(new.programme_id) mgr where mgr <> new.profile_id;
      return null;
    end if;
    perform public.vip_send_join_notices(new.profile_id);
  elsif tg_op = 'UPDATE' and new.status = 'left' and old.status <> 'left' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'You are back with the community creators',
            'Your VIP place has ended. The challenges, points and leaderboard are yours again, and past payouts are still paid.', '/challenges');
  elsif tg_op = 'UPDATE' and new.status = 'paused' and old.status = 'active' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'Your VIP place is paused', 'New views are not being counted while it is paused. Ask your market lead if that is a surprise.', '/vip');
  end if;
  return null;
end $$;

-- The profile being sent is the moment the held notices go out.
create or replace function public.vip_profile_sent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.vip_members where profile_id = new.id and join_notice_pending and status = 'active') then
    perform public.vip_send_join_notices(new.id);
  end if;
  return null;
end $$;
revoke all on function public.vip_profile_sent() from public, anon, authenticated;

drop trigger if exists trg_vip_profile_sent on public.profiles;
create trigger trg_vip_profile_sent after update of onboarded on public.profiles
  for each row when (new.onboarded and not coalesce(old.onboarded, false))
  execute function public.vip_profile_sent();

-- ----------------------------------------------------------------------------------------------- 4. approve into a VIP market
create or replace function public.vip_programme_options()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'slug', c.slug, 'country_codes', c.country_codes,
                                        'worldwide', c.kind = 'network', 'is_default', pr.is_default)
                     order by (c.kind = 'network'), pr.name)
      from public.vip_programmes pr join public.communities c on c.id = pr.community_id
     where pr.active), '[]'::jsonb);
end $$;

create or replace function public.admin_approve_vip_application(target uuid, p_programme uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pr record; v_res jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select p.id, p.name, c.slug, c.kind into pr
    from public.vip_programmes p join public.communities c on c.id = p.community_id
   where p.id = p_programme and p.active;
  if pr.id is null then raise exception 'Pick a VIP market to approve them into.'; end if;
  -- The market side (a market's community, or only the worldwide community for VIP Worldwide), then the VIP side.
  v_res := public.admin_approve_application(target, case when pr.kind = 'chapter' then array[pr.slug] else '{}'::text[] end);
  update public.vip_members set programme_id = p_programme, auto_home = false, status = 'active', left_on = null
   where profile_id = target and status in ('active', 'paused');
  insert into public.community_members (community_id, profile_id, role, status)
  select p.community_id, target, 'creator', 'active' from public.vip_programmes p where p.id = p_programme
  on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';
  perform public.vip_ensure_month(p_programme);
  return v_res || jsonb_build_object('summary', pr.name);
end $$;

revoke all on function public.vip_programme_options() from public, anon;
revoke all on function public.admin_approve_vip_application(uuid, uuid) from public, anon;
grant execute on function public.vip_programme_options() to authenticated;
grant execute on function public.admin_approve_vip_application(uuid, uuid) to authenticated;
