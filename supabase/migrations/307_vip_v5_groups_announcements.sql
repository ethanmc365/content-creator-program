-- 307: VIP fifth pass and the two-group challenge (1 Oct 2026).
--
--  1. THE SANDBOX VIP IS NOBODY'S NEIGHBOUR. "Test VIP Account" (is_sandbox) is what "See it as a VIP" opens; it was
--     counted in VIP Spain's standings, members, board, map and brief standings for everybody on the access list
--     (Ethan: "the test VIP icon is showing up under the VIP Spain"). A sandbox profile is now only ever seen by itself.
--  2. ONE MONTH, ONE MONTH'S VIDEOS. "Only videos in the month period should be accepted when submitted for that
--     period." A video is taken only if it was posted in the month now open, and it earns only in the month it was
--     posted. No minimum payout ("there is no minimum payout ... remove that"): min_payout is 0.
--  3. VIEWS ARE READ THE MOMENT A VIDEO IS ADDED, then on the team's interval (app_settings vip_sync, default 6h).
--  4. "SHOW ME ON THE VIP MAP" HAS ITS OWN SWITCH (vip_set_on_map), so the map tab can flip it without touching the
--     headline or goal.
--  5. VIPS HAVE THEIR OWN ANNOUNCEMENTS. "VIP creators shouldn't see the worldwide announcements chat ... they should
--     also be removed from the Spain announcements and just have their own announcements." Each VIP market gets a
--     staff-only "VIP announcements" room; an active VIP (who is not on the team) cannot read or be notified about the
--     community announcement rooms; posting from VIP tools > Announcements also posts into the room, and the room is
--     what notifies (once).
--  6. A VIP SIGN-UP LANDS IN A VIP MARKET, NOT A COMMUNITY ONE. The claim ran before the creator had picked a country,
--     so everybody on the one link went to the default programme and was never made a member of its market - which
--     also meant they could read the VIP room but not post in it. `vip_home_for` says which VIP market a country
--     belongs to (for the onboarding screen) and `vip_settle_home` puts the creator there once their country is saved.
--  7. THE TWO-GROUP CHALLENGE. A group can have its own participation reward with its own value and type, earned by
--     videos or by points like the challenge's; points marks are taken even when only the groups set a threshold; and
--     a group's own reward is paid at the group's value, not the challenge's.

-- ---------------------------------------------------------------------------------------------------- 1. sandbox
create or replace function public.vip_hidden_profile(p_profile uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select pf.is_sandbox from public.profiles pf where pf.id = p_profile), false)
     and p_profile is distinct from auth.uid()
$$;

create or replace function public.vip_board()
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_prog uuid; mo public.vip_months;
begin
  select programme_id into v_prog from public.vip_members where profile_id = auth.uid() and status = 'active';
  if v_prog is null then return '[]'::jsonb; end if;
  mo := public.vip_ensure_month(v_prog);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'rank', z.rk, 'name', split_part(pr.name, ' ', 1), 'photo', pr.photo_url, 'views', z.views, 'videos', z.videos,
        'me', z.profile_id = auth.uid()) order by z.rk)
      from (
        select s.profile_id, s.views, s.videos, row_number() over (order by s.views desc, s.profile_id) rk
          from public.vip_month_stats(mo.id) s
          join public.vip_members vm on vm.profile_id = s.profile_id and vm.status = 'active'
         where not public.vip_hidden_profile(s.profile_id)
      ) z join public.profiles pr on pr.id = z.profile_id
  ), '[]'::jsonb);
end $$;

create or replace function public.vip_map()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_all boolean := public.vip_has_access();
begin
  if not (v_all or public.is_active_vip()) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', pf.id, 'name', pf.name, 'photo_url', pf.photo_url, 'city', pf.city, 'country', pf.country,
        'city_lat', pf.city_lat, 'city_lng', pf.city_lng, 'countries_visited', pf.countries_visited,
        'headline', m.headline, 'programme', pr.name, 'accent', m.accent))
      from public.vip_members m
      join public.vip_programmes pr on pr.id = m.programme_id
      join public.profiles pf on pf.id = m.profile_id
     where m.status = 'active' and m.show_on_map and pf.show_on_map is not false and pf.status = 'active'
       and (not pf.is_test or v_all)
       and not public.vip_hidden_profile(pf.id)), '[]'::jsonb);
end $$;

create or replace function public.vip_market_standings()
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_all boolean := public.vip_has_access(); p record; mo public.vip_months; pm public.vip_months;
  v_members int; v_videos int; v_views bigint; v_prev bigint; v_spend numeric; v_top_name text; v_top_views bigint;
  v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not (v_all or public.is_active_vip()) then return '[]'::jsonb; end if;
  for p in select pr.*, c.slug as cslug, c.country_codes as ccodes, c.language as clang
             from public.vip_programmes pr join public.communities c on c.id = pr.community_id
            where (pr.active or public.is_owner()) order by pr.name loop
    mo := public.vip_ensure_month(p.id);
    select * into pm from public.vip_months where programme_id = p.id and (year * 12 + month) = (mo.year * 12 + mo.month) - 1;
    select count(*) filter (where m.status = 'active'), coalesce(sum(s.videos), 0), coalesce(sum(s.views), 0),
           coalesce(sum(least(coalesce(m.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(coalesce(s.views, 0), p.cpm, p.tiers, m.cpm))), 0)
      into v_members, v_videos, v_views, v_spend
      from public.vip_members m
      join public.profiles pf on pf.id = m.profile_id and (not pf.is_test or v_all) and not public.vip_hidden_profile(pf.id)
      left join public.vip_month_stats(mo.id) s on s.profile_id = m.profile_id
     where m.programme_id = p.id and m.status <> 'left';
    v_prev := 0;
    if pm.id is not null then
      select coalesce(sum(s.views), 0) into v_prev from public.vip_month_stats(pm.id) s
       where not public.vip_hidden_profile(s.profile_id);
    end if;
    v_top_name := null; v_top_views := null;
    select split_part(pf.name, ' ', 1), s.views into v_top_name, v_top_views
      from public.vip_month_stats(mo.id) s
      join public.profiles pf on pf.id = s.profile_id and (not pf.is_test or v_all) and not public.vip_hidden_profile(pf.id)
      join public.vip_members m on m.profile_id = s.profile_id and m.status = 'active' and m.programme_id = p.id
     order by s.views desc limit 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'programme_id', p.id, 'name', p.name, 'slug', p.cslug, 'country_codes', p.ccodes, 'language', p.clang,
      'accent', p.accent, 'tagline', p.tagline, 'mine', p.id = public.vip_my_programme(),
      'members', v_members, 'videos', v_videos, 'views', v_views, 'prev_views', v_prev,
      'avg_views', case when v_members > 0 then round(v_views::numeric / v_members) else 0 end,
      'month', mo.month, 'year', mo.year,
      'top_name', v_top_name, 'top_views', coalesce(v_top_views, 0),
      'spend', case when v_all then v_spend end, 'budget', case when v_all then p.budget_monthly end, 'currency', p.currency));
  end loop;
  return v_out;
end $$;

create or replace function public.vip_admin_overview(p_programme uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.vip_programmes; mo public.vip_months; v_members jsonb; v_views bigint; v_spend numeric; v_f numeric;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  select * into p from public.vip_programmes where id = p_programme;
  mo := public.vip_ensure_month(p_programme);
  v_f := greatest(0.0001, least(1, extract(epoch from (now() - mo.starts_at)) / nullif(extract(epoch from (mo.ends_at - mo.starts_at)), 0)));

  select coalesce(jsonb_agg(row_json order by (row_json ->> 'views')::bigint desc), '[]'::jsonb) into v_members from (
    select jsonb_build_object(
      'profile_id', vm.profile_id, 'name', pr.name, 'photo', pr.photo_url, 'status', vm.status,
      'cpm', vm.cpm, 'cap', vm.monthly_cap, 'target_videos', vm.target_videos, 'target_views', vm.target_views,
      'joined_on', vm.joined_on, 'source', vm.source, 'notes', vm.notes,
      'terms_ok', vm.terms_accepted_at is not null and coalesce(vm.terms_version, 0) >= p.terms_version,
      'videos', coalesce(s.videos, 0), 'views', coalesce(s.views, 0),
      'base', least(coalesce(vm.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(coalesce(s.views, 0), p.cpm, p.tiers, vm.cpm)),
      'projected_base', case when v_f >= 0.08 then least(coalesce(vm.monthly_cap, p.monthly_cap, 1e12),
                         public.vip_views_pay(round(coalesce(s.views, 0) / v_f)::bigint, p.cpm, p.tiers, vm.cpm)) end,
      'payment_ready', public.vip_payment_ready(vm.profile_id, p.currency),
      'lifetime_views', coalesce((select sum(x.views) from public.vip_statements x where x.profile_id = vm.profile_id and x.status <> 'void' and x.month_id <> mo.id), 0) + coalesce(s.views, 0)
    ) as row_json
    from public.vip_members vm
    join public.profiles pr on pr.id = vm.profile_id
    left join public.vip_month_stats(mo.id) s on s.profile_id = vm.profile_id
   where vm.programme_id = p_programme and vm.status <> 'left' and not public.vip_hidden_profile(vm.profile_id)
  ) q;

  select coalesce(sum((x ->> 'views')::bigint), 0),
         coalesce(sum((x ->> 'base')::numeric), 0)
    into v_views, v_spend from jsonb_array_elements(v_members) x;

  return jsonb_build_object(
    'programme', to_jsonb(p),
    'month', to_jsonb(mo),
    'members', v_members,
    'totals', jsonb_build_object('views', v_views, 'spend_so_far', v_spend,
        'spend_projected', case when v_f >= 0.08 then (select coalesce(sum((x ->> 'projected_base')::numeric), 0) from jsonb_array_elements(v_members) x) end,
        'budget', p.budget_monthly));
end $$;

create or replace function public.vip_brief_standings(p_brief uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare b public.vip_briefs; v_all boolean := public.vip_has_access();
begin
  select * into b from public.vip_briefs where id = p_brief;
  if b.id is null then return '[]'::jsonb; end if;
  if not v_all and not (public.is_active_vip() and (b.programme_id is null or b.programme_id = public.vip_my_programme())) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('rank', y.rk, 'name', case when v_all then pf.name else split_part(pf.name, ' ', 1) end,
             'photo', pf.photo_url, 'value', y.val, 'me', y.profile_id = auth.uid(), 'programme', y.pname) order by y.rk)
      from (
        select z.*, row_number() over (order by z.val desc, z.profile_id) rk
          from (
            select s.profile_id, pr.name as pname,
                   case b.metric
                     when 'videos' then s.videos::bigint
                     when 'best_video' then coalesce((select max(public.vip_video_counted(v, mo)) from public.vip_videos v
                                                      where v.profile_id = s.profile_id and v.status = 'tracking'), 0)
                     else s.views end as val
              from public.vip_months mo
              join public.vip_programmes pr on pr.id = mo.programme_id
              cross join lateral public.vip_month_stats(mo.id) s
              join public.vip_members vm on vm.profile_id = s.profile_id and vm.status = 'active' and vm.programme_id = mo.programme_id
              join public.profiles pf2 on pf2.id = s.profile_id
             where mo.year = b.year and mo.month = b.month and (b.programme_id is null or mo.programme_id = b.programme_id)
               and (not pf2.is_test or v_all) and not public.vip_hidden_profile(pf2.id)) z
         where z.val > 0) y
      join public.profiles pf on pf.id = y.profile_id
     where y.rk <= 25), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------------------------------- 2 + 3. one month
create or replace function public.vip_video_counted(v public.vip_videos, m public.vip_months)
returns bigint
language plpgsql stable security definer set search_path to 'public'
as $$
declare b bigint; e bigint;
begin
  if v.status <> 'tracking' then return 0; end if;
  if v.submitted_at >= m.ends_at then return 0; end if;
  -- A video earns in the month it was posted, and in no other.
  if coalesce(v.posted_at, v.submitted_at) < m.starts_at or coalesce(v.posted_at, v.submitted_at) >= m.ends_at then
    return 0;
  end if;

  select views into b from public.vip_view_readings
   where video_id = v.id and read_at <= m.starts_at order by read_at desc limit 1;
  if b is null then
    if v.posted_at is not null and v.posted_at >= m.starts_at then
      b := 0;
    else
      select views into b from public.vip_view_readings
       where video_id = v.id and read_at >= v.submitted_at order by read_at asc limit 1;
    end if;
  end if;
  if b is null then return 0; end if;

  if m.status = 'open' and now() < m.ends_at then
    e := v.logged_views;
  else
    select views into e from public.vip_view_readings
     where video_id = v.id and read_at <= m.ends_at + interval '90 minutes' order by read_at desc limit 1;
  end if;
  if e is null then return 0; end if;
  return greatest(0, e - b);
end $$;

create or replace function public.vip_submit_video(p_url text, p_platform text, p_caption text default null)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare m public.vip_members; p public.vip_programmes; mo public.vip_months; v_id uuid; v_posted timestamptz;
        v_url text := btrim(coalesce(p_url, ''));
begin
  select * into m from public.vip_members where profile_id = auth.uid() and status = 'active';
  if m is null then raise exception 'Only VIP creators can add a video here.'; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  if m.terms_accepted_at is null or coalesce(m.terms_version, 0) < p.terms_version then
    raise exception 'Please accept the VIP terms first.';
  end if;
  if v_url !~* '^https?://' then raise exception 'Paste the full link to your video.'; end if;
  if p_platform not in ('Instagram', 'TikTok', 'YouTube', 'Facebook', 'Other') then raise exception 'Unknown platform.'; end if;
  mo := public.vip_ensure_month(m.programme_id);
  v_posted := public.video_posted_at(p_platform, v_url, null);
  if v_posted is not null and v_posted < mo.starts_at then
    raise exception 'That video was posted before this month started, so it cannot count for this month.';
  end if;
  insert into public.vip_videos (profile_id, programme_id, platform, video_url, caption)
  values (auth.uid(), m.programme_id, p_platform, v_url, nullif(btrim(coalesce(p_caption, '')), ''))
  returning id into v_id;
  -- Read it now (the request leaves after this transaction commits), not at the next hourly pass.
  begin
    perform public.vip_run_sync(false, m.programme_id);
  exception when others then null; -- a failed nudge must never lose the video; the hourly pass reads it anyway
  end;
  return v_id;
end $$;

update public.vip_programmes set min_payout = 0 where min_payout <> 0;
insert into public.app_settings (key, value) values ('vip_sync', '{"interval_hours": 6}'::jsonb)
on conflict (key) do update set value = jsonb_build_object('interval_hours', 6)
 where coalesce((public.app_settings.value ->> 'interval_hours')::numeric, 12) = 12;

-- ---------------------------------------------------------------------------------------------------- 4. map switch
create or replace function public.vip_set_on_map(p_on boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.vip_members set show_on_map = coalesce(p_on, true) where profile_id = auth.uid();
  if not found then raise exception 'You are not in the VIP programme.'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------------- 5. announcements
insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
select pr.community_id, 'vip_announcements', 'VIP announcements', 'News for the VIP creators of this market, from the team.', 'megaphone', 'staff', 'vip', 4
  from public.vip_programmes pr
 where not exists (select 1 from public.channels c where c.community_id = pr.community_id and c.key = 'vip_announcements');

-- An active VIP who is not on the team reads their own announcements, not the community's.
create or replace function public.vip_hides_announcements()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.is_active_vip() and not public.is_admin()
     and not exists (select 1 from public.vip_managers vm where vm.profile_id = auth.uid())
$$;

drop policy if exists "vips have their own announcements" on public.channels;
create policy "vips have their own announcements" on public.channels as restrictive for select to authenticated
  using (key <> 'announcements' or not (select public.vip_hides_announcements()));

drop policy if exists "vips have their own announcements" on public.messages;
create policy "vips have their own announcements" on public.messages as restrictive for select to authenticated
  using (public.channel_key(channel) <> 'announcements' or not (select public.vip_hides_announcements()));

-- Only the team posts in a VIP announcements room.
drop policy if exists "vip announcements are the team's" on public.messages;
create policy "vip announcements are the team's" on public.messages as restrictive for insert to authenticated
  with check (public.channel_key(channel) <> 'vip_announcements' or public.vip_has_access() or public.is_admin());

create or replace function public.on_announcement()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  place_name text;
  route      text;
  rec        record;
  v_key      text := public.channel_key(coalesce(new.channel, ''));
begin
  if v_key not in ('announcements', 'vip_announcements') then return new; end if;
  if coalesce(new.deleted, false) then return new; end if;
  if coalesce(new.body, '') = '' and new.image_url is null and new.video_url is null then
    return new;
  end if;

  route := public.channel_route(new.channel);
  select name into place_name from public.communities where id = new.community_id;

  if v_key = 'vip_announcements' then
    -- The VIPs of this market (active or paused), and nobody else.
    for rec in
      select vm.profile_id as id
        from public.vip_members vm
        join public.vip_programmes pr on pr.id = vm.programme_id
        join public.profiles p on p.id = vm.profile_id
       where pr.community_id = new.community_id and vm.status in ('active', 'paused')
         and vm.profile_id is distinct from new.sender_id
         and p.status = 'active' and not coalesce(p.is_test, false)
    loop
      perform public.notify_user(rec.id, 'announcement', 'New VIP announcement',
        left(coalesce(nullif(trim(regexp_replace(new.body, '\*\*', '', 'g')), ''), 'Open the room to read it'), 140), route);
    end loop;
    return new;
  end if;

  -- NOT notify_all: an announcement in a market is an announcement to that market. And not to its active VIPs,
  -- who have their own announcements room (migration 307).
  for rec in
    select p.id
    from public.profiles p
    where p.id is distinct from new.sender_id
      and p.status = 'active'
      and not coalesce(p.is_test, false)
      and (p.is_admin or not exists (select 1 from public.vip_members vm where vm.profile_id = p.id and vm.status = 'active'))
      and (
        new.community_id is null
        or exists (
          select 1 from public.community_members cm
          where cm.community_id = new.community_id
            and cm.profile_id = p.id
            and cm.status = 'active'
        )
      )
  loop
    perform public.notify_user(
      rec.id,
      'announcement',
      case when place_name is null or place_name = 'Worldwide'
        then 'New announcement'
        else 'New announcement in ' || place_name end,
      left(coalesce(nullif(trim(new.body), ''), 'Open the room to read it'), 140),
      route
    );
  end loop;

  return new;
end;
$$;

-- Posting from VIP tools > Announcements also posts in the market's VIP announcements room, and the room notifies.
create or replace function public.vip_announce(p_programme uuid, p_title text, p_body text, p_pinned boolean default false)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_recent int; v_ch record;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the team members who manage this programme can post to its VIPs.'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then raise exception 'Write a title and a message.'; end if;
  select count(*) into v_recent from public.vip_announcements where programme_id = p_programme and created_at > now() - interval '1 hour';
  if v_recent >= 10 then raise exception 'That is a lot of announcements in an hour. Please wait a little.'; end if;
  insert into public.vip_announcements (programme_id, title, body, pinned, created_by)
  values (p_programme, left(btrim(p_title), 120), left(btrim(p_body), 2000), coalesce(p_pinned, false), auth.uid())
  returning id into v_id;

  select c.id, c.community_id, co.slug, co.kind into v_ch
    from public.vip_programmes pr
    join public.channels c on c.community_id = pr.community_id and c.key = 'vip_announcements'
    join public.communities co on co.id = c.community_id
   where pr.id = p_programme;
  if v_ch.id is not null then
    insert into public.messages (channel, channel_id, community_id, sender_id, body)
    values (case when v_ch.kind = 'network' then 'vip_announcements' else v_ch.slug || ':vip_announcements' end,
            v_ch.id, v_ch.community_id, auth.uid(),
            '**' || left(btrim(p_title), 120) || '**' || E'\n' || left(btrim(p_body), 2000));
  else
    insert into public.notifications (recipient_id, type, title, body, link)
    select m.profile_id, 'vip', left(btrim(p_title), 120), left(btrim(p_body), 140), '/vip'
      from public.vip_members m where m.programme_id = p_programme and m.status in ('active', 'paused');
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------------- 6. VIP home
-- The VIP market a country belongs to: the programme whose market covers it, or the default one.
create or replace function public.vip_home_for(p_country_code text)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object('programme_id', pr.id, 'name', pr.name, 'slug', c.slug, 'country_codes', c.country_codes,
                            'matched', upper(coalesce(p_country_code, '')) = any (coalesce(c.country_codes, '{}')))
    from public.vip_programmes pr join public.communities c on c.id = pr.community_id
   where pr.active
   order by (upper(coalesce(p_country_code, '')) = any (coalesce(c.country_codes, '{}'))) desc, pr.is_default desc, pr.name
   limit 1
$$;

-- Once the creator's country is saved: move a VIP who was placed by default into the market that covers them, and
-- make them a member of their VIP market (which is what lets them post in its VIP room).
create or replace function public.vip_settle_home()
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare m public.vip_members; v_cc text; v_home jsonb; v_prog uuid; v_comm uuid;
begin
  select * into m from public.vip_members where profile_id = auth.uid() and status = 'active';
  if m.profile_id is null then return null; end if;
  select country_code into v_cc from public.profiles where id = auth.uid();
  v_home := public.vip_home_for(v_cc);
  v_prog := m.programme_id;
  if m.auto_home and (v_home ->> 'matched')::boolean then
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

-- ---------------------------------------------------------------------------------------------------- 7. groups
alter table public.challenge_groups add column if not exists participation_amount numeric;
alter table public.challenge_groups add column if not exists participation_reward_type text
  check (participation_reward_type is null or participation_reward_type in ('cash', 'voucher'));

create or replace function public.mark_points_participation(p_challenge uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ch record;
begin
  select id, participation_basis, participation_threshold into v_ch
    from public.challenges where id = p_challenge;
  if v_ch.id is null or v_ch.participation_basis <> 'points' then return; end if;
  -- A threshold on the challenge, or on any of its groups (a two-group challenge may set them only per group).
  if v_ch.participation_threshold is null
     and not exists (select 1 from public.challenge_groups g where g.challenge_id = p_challenge and g.participation_threshold is not null) then
    return;
  end if;
  insert into public.challenge_participation_marks (challenge_id, creator_id, threshold, reached_at)
  select p_challenge, t.creator_id, coalesce(g.participation_threshold, v_ch.participation_threshold), clock_timestamp()
    from (
      select a.creator_id, sum(a.points) as pts
        from public.point_awards a
       where a.challenge_id = p_challenge
       group by a.creator_id
    ) t
    left join public.challenge_group_members gm
           on gm.challenge_id = p_challenge and gm.creator_id = t.creator_id
    left join public.challenge_groups g on g.id = gm.group_id
   where t.pts >= coalesce(g.participation_threshold, v_ch.participation_threshold)
  on conflict do nothing;
end $$;

-- A group's own participation reward is paid at the group's value and type.
CREATE OR REPLACE FUNCTION public.challenge_prize_standings_internal(p_challenge uuid)
 RETURNS TABLE(slot text, label text, creator_id uuid, creator_name text, photo_url text, entries integer, reached_at timestamp with time zone, board_rank integer, status text, reward_type text, prize text, amount numeric, currency text, seat integer, points integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ch    record;
  v_award jsonb;
  v_basis text;
begin
  select * into v_ch from public.challenges where id = p_challenge;
  if v_ch is null then return; end if;
  v_basis := coalesce(v_ch.participation_basis, 'entries');

  -- PARTICIPATION
  return query
  with per_creator as (
    select s.creator_id as cid,
           gm.group_id as gid,
           count(*)::int as n,
           array_agg(s.submitted_at order by s.submitted_at, s.id) as times,
           round(coalesce((
             select sum(a.points) from public.point_awards a
              where a.challenge_id = p_challenge and a.creator_id = s.creator_id
           ), 0))::int as pts
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
           (nullif(btrim(coalesce(g.participation_prize, '')), '') is not null) as own_part,
           g.participation_amount as gamount,
           g.participation_reward_type as gtype,
           jsonb_array_length(coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb)) as places,
           r.rank as brank,
           pr.name as pname, pr.photo_url as pphoto,
           coalesce(pr.is_test, false) as is_test
      from per_creator pc
      left join public.challenge_groups g on g.id = pc.gid
      left join public.results r on r.challenge_id = p_challenge and r.creator_id = pc.cid
      join public.profiles pr on pr.id = pc.cid
  ),
  -- BY VIDEOS OR BY POINTS (241). On a points basis the threshold is a
  -- points total, and "first" is the moment the creator was first seen at or
  -- over it (`challenge_participation_marks`); a creator who has reached it but
  -- whose moment was never recorded counts from now, behind everyone who was.
  qualified as (
    select b.*,
           case when v_basis = 'points'
                then coalesce((select m.reached_at from public.challenge_participation_marks m
                                where m.challenge_id = p_challenge and m.creator_id = b.cid
                                  and m.threshold = b.threshold), now())
                else b.times[b.threshold] end as at,
           (b.brank is not null and b.brank <= b.places) as won_place
      from boarded b
     where b.threshold is not null and coalesce(b.ptext, '') <> ''
       and case when v_basis = 'points' then b.pts >= b.threshold else b.n >= b.threshold end
  ),
  ordered as (
    select q.*,
           case
             when q.is_test then null
             when v_ch.participation_scope = 'outside_prizes' and q.won_place then null
             else row_number() over (
               partition by (q.is_test or (v_ch.participation_scope = 'outside_prizes' and q.won_place))
               order by q.at, q.brank nulls last, q.cid)
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
         -- A group with its own reward is paid at ITS value and type (307), not the challenge's.
         case when o.own_part then coalesce(o.gtype, public.prize_kind_of(o.ptext))
              else coalesce(v_ch.participation_reward_type, public.prize_kind_of(o.ptext)) end,
         o.ptext,
         case when o.own_part then coalesce(o.gamount, public.prize_amount_of(o.ptext))
              else coalesce(v_ch.participation_amount, public.prize_amount_of(o.ptext)) end,
         public.prize_currency_of(o.ptext, o.cur),
         o.seat::int,
         o.pts
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
             max(s.submitted_at) as last_at,
             round(coalesce((
               select sum(a.points) from public.point_awards a
                where a.challenge_id = p_challenge and a.creator_id = s.creator_id
             ), 0))::int as pts
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
           e.pos::int,
           e.pts
      from eligible e
     where e.pos <= 3
     order by e.pos;
  end loop;
end $function$;
